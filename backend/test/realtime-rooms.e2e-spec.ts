import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { WebSocketGateway } from '@nestjs/websockets';
import { REALTIME_NAMESPACE, type ErrorResponse } from '@recipe-planner/contracts';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Namespace } from 'socket.io';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuthTokensService } from '../src/auth/auth-tokens.service.js';
import { RefreshSessionsRepository } from '../src/auth/refresh-sessions.repository.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { withFakeInfra } from './support/fake-infra.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'realtime-rooms-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;
const PASSWORD = 'Correcta123';

/**
 * El gateway real, con acceso al namespace para inspeccionar las salas desde el test. Se
 * declara como gateway otra vez porque la metadata no se hereda al comprobar los providers.
 */
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

function authedCookies(accessToken: string | undefined): string[] {
  return [CSRF_COOKIE, ...(accessToken !== undefined ? [`access_token=${accessToken}`] : [])];
}

describe('Salas de /realtime (e2e)', () => {
  let app: NestFastifyApplication;
  let users: InMemoryUsersRepository;
  let households: InMemoryHouseholdsRepository;
  let refreshSessions: InMemoryRefreshSessionsRepository;
  let gateway: CapturingGateway;
  let url: string;
  let clients: Socket[];

  beforeAll(async () => {
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
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${String(address.port)}`;
    gateway = app.get<CapturingGateway>(RealtimeGateway);
  });

  beforeEach(() => {
    users.users.length = 0;
    households.households.length = 0;
    refreshSessions.sessions.length = 0;
    clients = [];
  });

  afterEach(() => {
    for (const client of clients) {
      client.close();
    }
  });

  afterAll(async () => {
    await app.close();
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

  async function userIdOf(token: string): Promise<string> {
    const verification = await app.get(AuthTokensService).verifyAccessToken(token);

    if (verification.status !== 'valid') {
      throw new Error('El token de prueba no es válido');
    }

    return verification.userId;
  }

  async function connect(token: string): Promise<Socket> {
    const client: Socket = io(`${url}/realtime`, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { origin: ORIGIN, cookie: `access_token=${token}` },
    });
    clients.push(client);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('timeout al conectar'));
      }, 2_000);

      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    // `handleConnection` corre después de que el cliente reciba CONNECT: espera a que el
    // servidor haya unido el socket a su sala privada antes de seguir.
    await waitForRoom(client, `user:${await userIdOf(token)}`);

    return client;
  }

  async function waitForRoom(client: Socket, room: string): Promise<void> {
    await vi.waitFor(
      () => {
        expect(roomsOf(client).has(room)).toBe(true);
      },
      { timeout: 3_000 },
    );
  }

  function roomsOf(client: Socket): Set<string> {
    const socketId = client.id;

    if (socketId === undefined) {
      throw new Error('El cliente no está conectado');
    }

    const socket = gateway.namespace?.sockets.get(socketId);

    if (socket === undefined) {
      throw new Error('El servidor no conoce el socket del cliente');
    }

    return socket.rooms;
  }

  /** Ids de todos los hogares en memoria, en orden de creación. */
  function allHouseholdIds(): string[] {
    return households.households.map((household) => household._id.toString());
  }

  async function invite(householdId: string, token: string): Promise<string> {
    const response = await request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/invite`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(token))
      .expect(201);

    return (response.body as { code: string }).code;
  }

  async function join(code: string, token: string): Promise<void> {
    await request(app.getHttpServer() as App)
      .post('/api/households/join')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(token))
      .send({ code })
      .expect(200);
  }

  it('al conectar, el socket entra en su sala privada y en la de todos sus hogares', async () => {
    const token = await register('ana@example.com', 'Ana');
    const userId = await userIdOf(token);

    const client = await connect(token);

    expect(roomsOf(client).has(`user:${userId}`)).toBe(true);
    for (const householdId of allHouseholdIds()) {
      await waitForRoom(client, `household:${householdId}`);
    }
  });

  it('al unirse a un hogar, entran en su sala todos los sockets abiertos del usuario', async () => {
    const anaToken = await register('ana@example.com', 'Ana');
    const beaToken = await register('bea@example.com', 'Bea');
    const [householdId] = allHouseholdIds();

    const code = await invite(householdId, anaToken);
    const first = await connect(beaToken);
    const second = await connect(beaToken);

    expect(roomsOf(first).has(`household:${householdId}`)).toBe(false);
    expect(roomsOf(second).has(`household:${householdId}`)).toBe(false);

    await join(code, beaToken);

    await waitForRoom(first, `household:${householdId}`);
    await waitForRoom(second, `household:${householdId}`);
  });

  it('al salir de un hogar, sus sockets salen de la sala y conservan la de su propio hogar', async () => {
    const anaToken = await register('ana@example.com', 'Ana');
    const beaToken = await register('bea@example.com', 'Bea');
    const [anaHouseholdId, beaOwnHouseholdId] = allHouseholdIds();

    const code = await invite(anaHouseholdId, anaToken);
    await join(code, beaToken);

    const first = await connect(beaToken);
    const second = await connect(beaToken);

    await waitForRoom(first, `household:${anaHouseholdId}`);

    await request(app.getHttpServer() as App)
      .post(`/api/households/${anaHouseholdId}/leave`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(beaToken))
      .expect(204);

    expect(roomsOf(first).has(`household:${anaHouseholdId}`)).toBe(false);
    expect(roomsOf(second).has(`household:${anaHouseholdId}`)).toBe(false);

    expect(roomsOf(first).has(`household:${beaOwnHouseholdId}`)).toBe(true);
  });

  it('si el propietario sale, el miembro más antiguo pasa a ser propietario', async () => {
    const anaToken = await register('ana@example.com', 'Ana');
    const beaToken = await register('bea@example.com', 'Bea');
    const [householdId] = allHouseholdIds();

    const code = await invite(householdId, anaToken);
    await join(code, beaToken);

    const anaSocket = await connect(anaToken);
    expect(roomsOf(anaSocket).has(`household:${householdId}`)).toBe(true);

    await request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/leave`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(anaToken))
      .expect(204);

    expect(roomsOf(anaSocket).has(`household:${householdId}`)).toBe(false);

    const household = households.households.find((item) => item._id.toString() === householdId);
    const members = household?.members ?? [];
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('owner');
  });

  it('el último miembro no puede salir del hogar', async () => {
    const token = await register('ana@example.com', 'Ana');
    const [householdId] = allHouseholdIds();

    const response = await request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/leave`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(token))
      .expect(409);

    expect((response.body as ErrorResponse).error.code).toBe('CONFLICT');
  });
});
