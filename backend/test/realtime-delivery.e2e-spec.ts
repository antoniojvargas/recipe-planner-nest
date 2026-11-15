import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { WebSocketGateway } from '@nestjs/websockets';
import {
  REALTIME_NAMESPACE,
  SOCKET_EVENTS,
  type ShoppingItemUpdatedPayload,
} from '@recipe-planner/contracts';
import { Types } from 'mongoose';
import type { Namespace } from 'socket.io';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuthTokensService } from '../src/auth/auth-tokens.service.js';
import { RefreshSessionsRepository } from '../src/auth/refresh-sessions.repository.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';
import type { ShoppingList } from '../src/shopping/shopping-list.schema.js';
import type { ShoppingItemInput } from '../src/shopping/shopping-lists.repository.js';
import { ShoppingListsRepository } from '../src/shopping/shopping-lists.repository.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { withFakeInfra } from './support/fake-infra.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'realtime-delivery-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;
const PASSWORD = 'Correcta123';
const WEEK_START = new Date('2026-11-16T00:00:00.000Z');
const WEEK_PATH = '2026-11-16';

/**
 * El gateway real, con acceso al namespace para esperar a que el socket entre en las salas.
 * Se redeclara porque la metadata de `@WebSocketGateway` no se hereda.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
class CapturingGateway extends RealtimeGateway {
  namespace?: Namespace;

  override afterInit(server: Namespace): void {
    super.afterInit(server);
    this.namespace = server;
  }
}

/** Solo hace falta `updateItem`: el test marca un ítem ya sembrado en la lista. */
class InMemoryShoppingRepository {
  readonly lists: ShoppingList[] = [];

  updateItem(
    householdId: string,
    weekStart: Date,
    itemId: Types.ObjectId,
    updates: Partial<ShoppingItemInput>,
  ): Promise<ShoppingList | null> {
    const list = this.lists.find(
      (item) =>
        item.householdId.toString() === householdId &&
        item.weekStart.toISOString() === weekStart.toISOString(),
    );

    if (list === undefined) {
      return Promise.resolve(null);
    }

    const item = list.items.find((entry) => entry._id.toString() === itemId.toString());

    if (item === undefined) {
      return Promise.resolve(null);
    }

    if (updates.quantity !== undefined) {
      item.quantity = updates.quantity;
    }
    if (updates.checked !== undefined) {
      item.checked = updates.checked;
    }
    if (updates.checkedBy !== undefined) {
      item.checkedBy = updates.checkedBy;
    }

    list.version += 1;

    return Promise.resolve(list);
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

describe('Entrega de eventos de /realtime (e2e)', () => {
  let app: NestFastifyApplication;
  let users: InMemoryUsersRepository;
  let households: InMemoryHouseholdsRepository;
  let refreshSessions: InMemoryRefreshSessionsRepository;
  let shopping: InMemoryShoppingRepository;
  let gateway: CapturingGateway;
  let url: string;
  let clients: Socket[];

  beforeAll(async () => {
    users = new InMemoryUsersRepository();
    households = new InMemoryHouseholdsRepository();
    refreshSessions = new InMemoryRefreshSessionsRepository();
    shopping = new InMemoryShoppingRepository();

    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(HouseholdsRepository)
      .useValue(households)
      .overrideProvider(RefreshSessionsRepository)
      .useValue(refreshSessions)
      .overrideProvider(ShoppingListsRepository)
      .useValue(shopping)
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
    shopping.lists.length = 0;
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

  async function householdIdOf(token: string): Promise<string> {
    const userId = await userIdOf(token);
    const household = (await households.findByMember(userId)).at(0);

    if (household === undefined) {
      throw new Error('El usuario no tiene hogar');
    }

    return household._id.toString();
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

    // `handleConnection` corre después del CONNECT del cliente: hasta que el servidor no une
    // el socket a su sala de hogar, un evento emitido justo después se perdería.
    await waitForRoom(client, `household:${await householdIdOf(token)}`);

    return client;
  }

  async function waitForRoom(client: Socket, room: string): Promise<void> {
    await vi.waitFor(
      () => {
        const socketId = client.id;

        if (socketId === undefined) {
          throw new Error('El cliente no está conectado');
        }

        const socket = gateway.namespace?.sockets.get(socketId);

        if (socket === undefined) {
          throw new Error('El servidor no conoce el socket del cliente');
        }

        expect(socket.rooms.has(room)).toBe(true);
      },
      { timeout: 3_000 },
    );
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

  /** Lista con un único ítem pendiente, como si la hubiera generado el plan. */
  function seedList(householdId: string, itemId: Types.ObjectId): ShoppingList {
    const list = {
      _id: new Types.ObjectId(),
      householdId: new Types.ObjectId(householdId),
      weekStart: WEEK_START,
      items: [
        {
          _id: itemId,
          name: 'arroz',
          quantity: 1.5,
          unit: 'kg',
          checked: false,
          source: 'plan',
        },
      ],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ShoppingList;

    shopping.lists.push(list);

    return list;
  }

  function markItem(householdId: string, token: string, itemId: Types.ObjectId, userId: string) {
    return request(app.getHttpServer() as App)
      .patch(
        `/api/households/${householdId}/shopping-lists/${WEEK_PATH}/items/${itemId.toString()}`,
      )
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(token))
      .send({ checked: true, checkedBy: userId });
  }

  function nextItemUpdate(client: Socket): Promise<ShoppingItemUpdatedPayload> {
    return new Promise((resolve) => {
      client.once(SOCKET_EVENTS.shoppingItemUpdated, resolve);
    });
  }

  it('entrega al otro miembro el ítem marcado por uno de ellos', async () => {
    const anaToken = await register('ana@example.com', 'Ana');
    const beaToken = await register('bea@example.com', 'Bea');
    const householdId = await householdIdOf(anaToken);
    const anaId = await userIdOf(anaToken);

    await join(await invite(householdId, anaToken), beaToken);

    const itemId = new Types.ObjectId();
    seedList(householdId, itemId);

    const bea = await connect(beaToken);
    const received = nextItemUpdate(bea);

    await markItem(householdId, anaToken, itemId, anaId).expect(200);

    await expect(received).resolves.toEqual({
      householdId,
      weekStart: WEEK_PATH,
      itemId: itemId.toString(),
      checked: true,
      checkedBy: { userId: anaId, displayName: 'Ana' },
      quantity: 1.5,
      unit: 'kg',
      version: 2,
    });
  });

  it('no entrega el evento a un usuario de otro hogar', async () => {
    const anaToken = await register('ana@example.com', 'Ana');
    const beaToken = await register('bea@example.com', 'Bea');
    const carlaToken = await register('carla@example.com', 'Carla');
    const householdId = await householdIdOf(anaToken);
    const anaId = await userIdOf(anaToken);

    await join(await invite(householdId, anaToken), beaToken);

    const itemId = new Types.ObjectId();
    seedList(householdId, itemId);

    const bea = await connect(beaToken);
    const carla = await connect(carlaToken);
    const receivedByBea = nextItemUpdate(bea);
    const receivedByCarla: ShoppingItemUpdatedPayload[] = [];

    carla.on(SOCKET_EVENTS.shoppingItemUpdated, (payload: ShoppingItemUpdatedPayload) => {
      receivedByCarla.push(payload);
    });

    await markItem(householdId, anaToken, itemId, anaId).expect(200);

    await expect(receivedByBea).resolves.toMatchObject({ itemId: itemId.toString() });
    // Si el aislamiento fallara, el evento viajaría en la misma emisión que el de Bea; este
    // margen solo evita declarar la ausencia antes de que el paquete llegue al cliente.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receivedByCarla).toEqual([]);
  });
});
