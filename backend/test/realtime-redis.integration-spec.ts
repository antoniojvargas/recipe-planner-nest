import './setup-env.js';
import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { WebSocketGateway } from '@nestjs/websockets';
import {
  REALTIME_NAMESPACE,
  SOCKET_EVENTS,
  type ImportFinishedPayload,
} from '@recipe-planner/contracts';
import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';
import { Types } from 'mongoose';
import type { Namespace } from 'socket.io';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuthTokensService } from '../src/auth/auth-tokens.service.js';
import { RefreshSessionsRepository } from '../src/auth/refresh-sessions.repository.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import { REALTIME_REDIS_KEY, registerRealtimeAdapter } from '../src/realtime/redis-io.adapter.js';
import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';
import { householdRoom } from '../src/realtime/rooms.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { withFakeInfra } from './support/fake-infra.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'realtime-redis-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;
const PASSWORD = 'Correcta123';

/** El gateway real, con acceso al namespace para esperar a que el socket entre en su sala. */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
class CapturingGateway extends RealtimeGateway {
  namespace?: Namespace;

  override afterInit(server: Namespace): void {
    super.afterInit(server);
    this.namespace = server;
  }
}

function responseCookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as unknown;

  if (Array.isArray(header)) {
    return header as string[];
  }

  return typeof header === 'string' ? [header] : [];
}

function cookieValue(cookies: string[], name: string): string | undefined {
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));

  if (cookie === undefined) {
    return undefined;
  }

  const [pair] = cookie.split(';');

  return pair.slice(name.length + 1);
}

/**
 * Un evento del proceso `worker` tiene que cruzar Redis para llegar a un socket atendido por
 * la API. El adaptador y el emisor son los reales; solo Mongo y el resto de la infraestructura
 * están doblados. Redis corre en un contenedor para probar el canal Pub/Sub de verdad.
 */
describe('Eventos del worker por Redis (integración)', () => {
  let container: StartedTestContainer;
  let redis: Redis;
  let app: NestFastifyApplication;
  let users: InMemoryUsersRepository;
  let households: InMemoryHouseholdsRepository;
  let refreshSessions: InMemoryRefreshSessionsRepository;
  let gateway: CapturingGateway;
  let url: string;
  let client: Socket | undefined;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const redisUrl = `redis://${container.getHost()}:${String(container.getMappedPort(6379))}`;

    // `configModule` lee el entorno al compilar el módulo, así que la URL tiene que estar
    // puesta antes de crear la app. El adaptador abre sus propias conexiones a esta misma URL.
    process.env.REDIS_URL = redisUrl;

    users = new InMemoryUsersRepository();
    households = new InMemoryHouseholdsRepository();
    refreshSessions = new InMemoryRefreshSessionsRepository();

    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(HouseholdsRepository)
      .useValue(households)
      .overrideProvider(RefreshSessionsRepository)
      .useValue(refreshSessions)
      .overrideProvider(RealtimeGateway)
      .useClass(CapturingGateway)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);

    // Igual que `main.ts`: el adaptador tiene que estar puesto antes de crear el servidor de
    // Socket.IO, o los sockets se quedarían en el adaptador local de una sola réplica.
    const adapter = registerRealtimeAdapter(app);

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');
    await adapter.ready();

    const address = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${String(address.port)}`;
    gateway = app.get<CapturingGateway>(RealtimeGateway);

    redis = new Redis(redisUrl);
    await redis.ping();
  });

  afterAll(async () => {
    client?.close();
    await redis.quit();
    await app.close();
    await container.stop();
  });

  async function register(email: string, displayName: string): Promise<string> {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email, password: PASSWORD, displayName })
      .expect(201);

    const token = cookieValue(responseCookies(response), 'access_token');

    if (token === undefined) {
      throw new Error('El registro no devolvió access_token');
    }

    return token;
  }

  async function connect(token: string): Promise<Socket> {
    const socket: Socket = io(`${url}/realtime`, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { origin: ORIGIN, cookie: `access_token=${token}` },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('timeout al conectar'));
      }, 2_000);

      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    return socket;
  }

  it('un evento emitido por el worker con el emisor de Redis llega al cliente', async () => {
    const token = await register('ana@example.com', 'Ana');
    const verification = await app.get(AuthTokensService).verifyAccessToken(token);

    if (verification.status !== 'valid') {
      throw new Error('El token de prueba no es válido');
    }

    const household = (await households.findByMember(verification.userId)).at(0);

    if (household === undefined) {
      throw new Error('El usuario no tiene hogar');
    }

    const householdId = household._id.toString();

    const socket = await connect(token);
    client = socket;

    // `handleConnection` une el socket a la sala después del CONNECT del cliente.
    await vi.waitFor(
      () => {
        const socketId = socket.id;

        if (socketId === undefined) {
          throw new Error('El cliente no está conectado');
        }

        const serverSocket = gateway.namespace?.sockets.get(socketId);

        if (serverSocket === undefined) {
          throw new Error('El servidor no conoce el socket del cliente');
        }

        expect(serverSocket.rooms.has(householdRoom(householdId))).toBe(true);
      },
      { timeout: 3_000 },
    );

    const payload: ImportFinishedPayload = {
      householdId,
      importId: new Types.ObjectId().toString(),
      recipeId: new Types.ObjectId().toString(),
    };
    const received = new Promise<ImportFinishedPayload>((resolve) => {
      socket.once(SOCKET_EVENTS.importFinished, resolve);
    });

    // Exactamente lo que hace el proceso `worker`: publicar en el mismo canal y namespace que
    // escucha el adaptador de la API, sin servir sockets.
    new Emitter(redis, { key: REALTIME_REDIS_KEY })
      .of(REALTIME_NAMESPACE)
      .to(householdRoom(householdId))
      .emit(SOCKET_EVENTS.importFinished, payload);

    await expect(received).resolves.toEqual(payload);
  });
});
