import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { ErrorResponse } from '@recipe-planner/contracts';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { HouseholdsRepository } from './../src/households/households.repository.js';
import type { HouseholdResponse } from './../src/households/households.types.js';
import { RefreshSessionsRepository } from './../src/auth/refresh-sessions.repository.js';
import { UsersRepository } from './../src/users/users.repository.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';
import { withFakeInfra } from './support/fake-infra.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'households-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;
const PASSWORD = 'Correcta123';

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

describe('Households (e2e)', () => {
  let app: NestFastifyApplication;
  let users: InMemoryUsersRepository;
  let households: InMemoryHouseholdsRepository;
  let refreshSessions: InMemoryRefreshSessionsRepository;

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
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    users.users.length = 0;
    households.households.length = 0;
    refreshSessions.sessions.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndGetAccessToken(email = 'ana@example.com', displayName = 'Ana') {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email, password: PASSWORD, displayName })
      .expect(201);

    return cookieValue(responseCookies(response), 'access_token');
  }

  it('al registrarse, el usuario recibe un hogar propio', async () => {
    await registerAndGetAccessToken('ana@example.com', 'Ana');

    expect(households.households).toHaveLength(1);
    expect(households.households[0]?.name).toBe('Hogar de Ana');
    expect(households.households[0]?.members).toHaveLength(1);
    expect(households.households[0]?.members[0]?.role).toBe('owner');
  });

  it('POST /api/households crea un hogar con el usuario como propietario', async () => {
    const accessToken = await registerAndGetAccessToken();

    const response = await request(app.getHttpServer() as App)
      .post('/api/households')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(accessToken))
      .send({ name: 'Casa de playa' })
      .expect(201);

    const body = response.body as HouseholdResponse;

    expect(body).toEqual(
      expect.objectContaining({
        name: 'Casa de playa',
        members: [
          expect.objectContaining({
            userId: users.users[0]?._id.toString(),
            role: 'owner',
          }),
        ],
      }),
    );
    expect(body.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('GET /api/households devuelve los hogares del usuario autenticado', async () => {
    const accessToken = await registerAndGetAccessToken();

    await request(app.getHttpServer() as App)
      .post('/api/households')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(accessToken))
      .send({ name: 'Casa de playa' })
      .expect(201);

    const response = await request(app.getHttpServer() as App)
      .get('/api/households')
      .set('Cookie', authedCookies(accessToken))
      .expect(200);

    const body = response.body as HouseholdResponse[];

    expect(body).toHaveLength(2);
    expect(body.map((household) => household.name).sort()).toEqual([
      'Casa de playa',
      'Hogar de Ana',
    ]);
  });

  it('GET /api/households/:id devuelve el hogar si el usuario es miembro', async () => {
    const accessToken = await registerAndGetAccessToken();
    const householdId = households.households[0]?._id.toString();

    const response = await request(app.getHttpServer() as App)
      .get(`/api/households/${householdId}`)
      .set('Cookie', authedCookies(accessToken))
      .expect(200);

    expect(response.body as HouseholdResponse).toEqual(
      expect.objectContaining({ id: householdId, name: 'Hogar de Ana' }),
    );
  });

  it('GET /api/households/:id responde 404 si el usuario no pertenece al hogar', async () => {
    await registerAndGetAccessToken('ana@example.com', 'Ana');
    const otherAccessToken = await registerAndGetAccessToken('bea@example.com', 'Bea');
    const anaHouseholdId = households.households[0]?._id.toString();

    const response = await request(app.getHttpServer() as App)
      .get(`/api/households/${anaHouseholdId}`)
      .set('Cookie', authedCookies(otherAccessToken))
      .expect(404);

    expect((response.body as ErrorResponse).error.code).toBe('NOT_FOUND');
  });

  it('GET /api/households/:id responde 400 si el id no es un ObjectId válido', async () => {
    const accessToken = await registerAndGetAccessToken();

    const response = await request(app.getHttpServer() as App)
      .get('/api/households/no-es-un-id')
      .set('Cookie', authedCookies(accessToken))
      .expect(400);

    expect((response.body as ErrorResponse).error.code).toBe('VALIDATION_ERROR');
  });
});
