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
      .send({ name: 'Casa de playa', timeZone: 'America/Bogota' })
      .expect(201);

    const body = response.body as HouseholdResponse;

    expect(body).toEqual(
      expect.objectContaining({
        name: 'Casa de playa',
        timeZone: 'America/Bogota',
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

  it('POST /api/households rechaza una zona horaria que no es IANA', async () => {
    const accessToken = await registerAndGetAccessToken();

    const response = await request(app.getHttpServer() as App)
      .post('/api/households')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(accessToken))
      .send({ name: 'Casa de playa', timeZone: 'Zona/Inventada' })
      .expect(400);

    expect((response.body as ErrorResponse).error.code).toBe('VALIDATION_ERROR');
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
      expect.objectContaining({
        id: householdId,
        name: 'Hogar de Ana',
        members: [expect.objectContaining({ displayName: 'Ana', role: 'owner' })],
      }),
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

  it('POST /api/households/:id/invite crea un código de 8 caracteres válido 48h (solo owner)', async () => {
    const accessToken = await registerAndGetAccessToken();
    const householdId = households.households[0]?._id.toString();

    const response = await request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/invite`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(accessToken))
      .expect(201);

    const body = response.body as { code: string; expiresAt: string };

    expect(body.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    const expiresAt = new Date(body.expiresAt).getTime();
    const now = Date.now();
    expect(expiresAt).toBeGreaterThan(now + 47 * 60 * 60 * 1000);
    expect(expiresAt).toBeLessThan(now + 49 * 60 * 60 * 1000);
    expect(households.households[0]?.inviteCodeHash).toBeDefined();
    expect(households.households[0]?.inviteCodeHash).not.toBe(body.code);
  });

  it('POST /api/households/:id/invite responde 403 si es miembro pero no propietario', async () => {
    const ownerToken = await registerAndGetAccessToken('ana@example.com', 'Ana');
    const memberToken = await registerAndGetAccessToken('bea@example.com', 'Bea');
    const anaHouseholdId = households.households[0]?._id.toString();

    const invite = await request(app.getHttpServer() as App)
      .post(`/api/households/${anaHouseholdId}/invite`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(ownerToken))
      .expect(201);

    const code = (invite.body as { code: string }).code;
    await request(app.getHttpServer() as App)
      .post('/api/households/join')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(memberToken))
      .send({ code })
      .expect(200);

    const response = await request(app.getHttpServer() as App)
      .post(`/api/households/${anaHouseholdId}/invite`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(memberToken))
      .expect(403);

    expect((response.body as ErrorResponse).error.code).toBe('FORBIDDEN');
  });

  it('POST /api/households/join une al usuario con un código válido', async () => {
    const ownerToken = await registerAndGetAccessToken('ana@example.com', 'Ana');
    const guestToken = await registerAndGetAccessToken('bea@example.com', 'Bea');
    const householdId = households.households[0]?._id.toString();

    const invite = await request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/invite`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(ownerToken))
      .expect(201);

    const code = (invite.body as { code: string }).code;

    const joined = await request(app.getHttpServer() as App)
      .post('/api/households/join')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(guestToken))
      .send({ code: code.toLowerCase() })
      .expect(200);

    const body = joined.body as HouseholdResponse;
    expect(body.id).toBe(householdId);
    expect(body.members).toHaveLength(2);
    expect(body.members.some((member) => member.role === 'member')).toBe(true);
  });

  it('POST /api/households/join responde 409 si ya es miembro y 404 si el código caducó', async () => {
    const ownerToken = await registerAndGetAccessToken('ana@example.com', 'Ana');
    const guestToken = await registerAndGetAccessToken('bea@example.com', 'Bea');
    const householdId = households.households[0]?._id.toString();

    const invite = await request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/invite`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(ownerToken))
      .expect(201);

    const code = (invite.body as { code: string }).code;

    await request(app.getHttpServer() as App)
      .post('/api/households/join')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(guestToken))
      .send({ code })
      .expect(200);

    const conflict = await request(app.getHttpServer() as App)
      .post('/api/households/join')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(guestToken))
      .send({ code })
      .expect(409);
    expect((conflict.body as ErrorResponse).error.code).toBe('CONFLICT');

    const thirdToken = await registerAndGetAccessToken('carlos@example.com', 'Carlos');
    const stored = households.households.find((item) => item._id.toString() === householdId);
    if (stored !== undefined) {
      stored.inviteCodeExpiresAt = new Date(Date.now() - 60_000);
    }

    const expired = await request(app.getHttpServer() as App)
      .post('/api/households/join')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(thirdToken))
      .send({ code })
      .expect(404);
    expect((expired.body as ErrorResponse).error.code).toBe('NOT_FOUND');
  });

  describe('aislamiento entre hogares', () => {
    it('un usuario de otro hogar recibe 404 en cada ruta anidada bajo /api/households/:householdId/...', async () => {
      await registerAndGetAccessToken('ana@example.com', 'Ana');
      const outsiderToken = await registerAndGetAccessToken('bea@example.com', 'Bea');
      const anaHouseholdId = households.households[0]?._id.toString();

      const getHousehold = await request(app.getHttpServer() as App)
        .get(`/api/households/${anaHouseholdId}`)
        .set('Cookie', authedCookies(outsiderToken))
        .expect(404);

      expect((getHousehold.body as ErrorResponse).error).toEqual({
        code: 'NOT_FOUND',
        message: 'Hogar no encontrado',
        details: [],
      });

      const createInvite = await request(app.getHttpServer() as App)
        .post(`/api/households/${anaHouseholdId}/invite`)
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', authedCookies(outsiderToken))
        .expect(404);

      expect((createInvite.body as ErrorResponse).error).toEqual({
        code: 'NOT_FOUND',
        message: 'Hogar no encontrado',
        details: [],
      });
    });
  });
});
