import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { ErrorResponse } from '@recipe-planner/contracts';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { RefreshSessionsRepository } from './../src/auth/refresh-sessions.repository.js';
import { UsersRepository } from './../src/users/users.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';
import { withFakeInfra } from './support/fake-infra.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'integration-csrf-token';
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

function cookieHeader(...pairs: [string, string | undefined][]): string[] {
  return [
    CSRF_COOKIE,
    ...pairs
      .filter((pair): pair is [string, string] => pair[1] !== undefined)
      .map(([name, value]) => `${name}=${value}`),
  ];
}

describe('Auth (integración)', () => {
  let app: NestFastifyApplication;
  let users: InMemoryUsersRepository;
  let refreshSessions: InMemoryRefreshSessionsRepository;

  beforeAll(async () => {
    users = new InMemoryUsersRepository();
    refreshSessions = new InMemoryRefreshSessionsRepository();

    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(UsersRepository)
      .useValue(users)
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
    refreshSessions.sessions.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  async function register(email = 'ana@example.com') {
    return request(app.getHttpServer() as App)
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email, password: PASSWORD, displayName: 'Ana' })
      .expect(201);
  }

  it('login abre una sesión y permite acceder al perfil', async () => {
    await register();

    const login = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email: 'ana@example.com', password: PASSWORD })
      .expect(200);

    const cookies = responseCookies(login);
    const access = cookieValue(cookies, 'access_token');
    const refresh = cookieValue(cookies, 'refresh_token');

    expect(access).toBeDefined();
    expect(refresh).toBeDefined();

    const me = await request(app.getHttpServer() as App)
      .get('/api/auth/me')
      .set('Cookie', cookieHeader(['access_token', access], ['refresh_token', refresh]))
      .expect(200);

    expect(me.body).toEqual({
      user: {
        id: users.users[0]?._id.toString(),
        email: 'ana@example.com',
        displayName: 'Ana',
      },
    });
  });

  it('refresh rota el token y emite cookies nuevas', async () => {
    const registered = await register();
    const oldRefresh = cookieValue(responseCookies(registered), 'refresh_token');

    const refreshed = await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', cookieHeader(['refresh_token', oldRefresh]))
      .expect(204);

    const newRefresh = cookieValue(responseCookies(refreshed), 'refresh_token');
    const newAccess = cookieValue(responseCookies(refreshed), 'access_token');

    expect(newRefresh).toBeDefined();
    expect(newRefresh).not.toBe(oldRefresh);
    expect(newAccess).toBeDefined();
    expect(refreshSessions.sessions).toHaveLength(2);
  });

  it('reutilizar un refresh token revoca la familia completa', async () => {
    const registered = await register();
    const firstRefresh = cookieValue(responseCookies(registered), 'refresh_token');

    const rotated = await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', cookieHeader(['refresh_token', firstRefresh]))
      .expect(204);

    const reused = await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', cookieHeader(['refresh_token', firstRefresh]))
      .expect(401);

    expect((reused.body as ErrorResponse).error.code).toBe('UNAUTHORIZED');
    expect(refreshSessions.sessions.every((session) => session.revokedAt !== null)).toBe(true);

    const latest = cookieValue(responseCookies(rotated), 'refresh_token');
    const afterReuse = await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', cookieHeader(['refresh_token', latest]))
      .expect(401);

    expect((afterReuse.body as ErrorResponse).error.code).toBe('UNAUTHORIZED');
  });

  it('dos refresh concurrentes con el mismo token no emiten dos sesiones válidas', async () => {
    const registered = await register();
    const token = cookieValue(responseCookies(registered), 'refresh_token');

    const [a, b] = await Promise.all([
      request(app.getHttpServer() as App)
        .post('/api/auth/refresh')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', cookieHeader(['refresh_token', token])),
      request(app.getHttpServer() as App)
        .post('/api/auth/refresh')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', cookieHeader(['refresh_token', token])),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([204, 401]);
    expect(refreshSessions.sessions.every((session) => session.revokedAt !== null)).toBe(true);
  });

  it('logout revoca la familia actual y el refresh deja de funcionar', async () => {
    const registered = await register();
    const access = cookieValue(responseCookies(registered), 'access_token');
    const refresh = cookieValue(responseCookies(registered), 'refresh_token');

    const logout = await request(app.getHttpServer() as App)
      .post('/api/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', cookieHeader(['access_token', access], ['refresh_token', refresh]))
      .expect(204);

    const cookies = responseCookies(logout);
    expect(cookieValue(cookies, 'access_token')).toBe('');
    expect(cookieValue(cookies, 'refresh_token')).toBe('');

    await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', cookieHeader(['refresh_token', refresh]))
      .expect(401);
  });

  it('rechaza el acceso con un access token caducado para que el cliente refresque', async () => {
    await register();
    const user = users.users[0];
    const familyId = refreshSessions.sessions[0]?.familyId;

    const expired = await new SignJWT({ fid: familyId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user._id.toString())
      .setExpirationTime(Math.floor(Date.now() / 1_000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));

    const response = await request(app.getHttpServer() as App)
      .get('/api/auth/me')
      .set('Cookie', cookieHeader(['access_token', expired]))
      .expect(401);

    expect((response.body as ErrorResponse).error).toEqual({
      code: 'TOKEN_EXPIRED',
      message: 'La sesión ha caducado',
      details: [],
    });
  });
});
