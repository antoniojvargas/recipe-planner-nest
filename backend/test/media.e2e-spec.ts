import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { ErrorResponse } from '@recipe-planner/contracts';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { RefreshSessionsRepository } from './../src/auth/refresh-sessions.repository.js';
import { HouseholdsRepository } from './../src/households/households.repository.js';
import { MAX_IMAGE_BYTES } from './../src/media/media.constants.js';
import { UsersRepository } from './../src/users/users.repository.js';
import { withFakeInfra } from './support/fake-infra.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'media-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;
const PASSWORD = 'Correcta123';

interface UploadUrlBody {
  key: string;
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
}

interface PostPolicy {
  expiration: string;
  conditions: unknown[];
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

function policyOf(fields: Record<string, string>): PostPolicy {
  return JSON.parse(Buffer.from(fields.Policy, 'base64').toString('utf8')) as PostPolicy;
}

describe('Media (e2e)', () => {
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

  async function register(email = 'ana@example.com', displayName = 'Ana') {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email, password: PASSWORD, displayName })
      .expect(201);

    const household = households.households.at(-1);

    if (household === undefined) {
      throw new Error('El registro debería crear un hogar');
    }

    return {
      accessToken: cookieValue(responseCookies(response), 'access_token'),
      householdId: household._id.toString(),
    };
  }

  function requestUploadUrl(
    accessToken: string | undefined,
    householdId: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/media/upload-url`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(accessToken))
      .send(body);
  }

  it('devuelve una URL prefirmada de POST bajo el prefijo del hogar', async () => {
    const { accessToken, householdId } = await register();
    const size = 2 * 1024 * 1024;

    const response = await requestUploadUrl(accessToken, householdId, {
      contentType: 'image/png',
      size,
    }).expect(201);

    const body = response.body as UploadUrlBody;

    expect(body.url).toBe('http://localhost:9000/recipes-test');
    expect(body.key).toMatch(new RegExp(`^pending/${householdId}/[0-9a-f-]{36}\\.png$`));
    expect(body.fields.key).toBe(body.key);
    expect(body.fields['Content-Type']).toBe('image/png');
    expect(body.fields['X-Amz-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    expect(policyOf(body.fields).conditions).toEqual(
      expect.arrayContaining([
        ['eq', '$Content-Type', 'image/png'],
        ['content-length-range', 1, size],
      ]),
    );
  });

  it('rechaza tipos fuera del catálogo y tamaños fuera de rango', async () => {
    const { accessToken, householdId } = await register();

    const badType = await requestUploadUrl(accessToken, householdId, {
      contentType: 'image/gif',
      size: 1024,
    }).expect(400);
    expect((badType.body as ErrorResponse).error.details[0]?.field).toBe('contentType');

    const tooBig = await requestUploadUrl(accessToken, householdId, {
      contentType: 'image/jpeg',
      size: MAX_IMAGE_BYTES + 1,
    }).expect(400);
    expect((tooBig.body as ErrorResponse).error.details).toEqual([
      { field: 'size', message: 'La imagen no puede superar los 5 MiB' },
    ]);

    const empty = await requestUploadUrl(accessToken, householdId, {
      contentType: 'image/webp',
      size: 0,
    }).expect(400);
    expect((empty.body as ErrorResponse).error.details[0]?.field).toBe('size');
  });

  it('un usuario de otro hogar recibe 404 y no obtiene ninguna URL', async () => {
    const ana = await register('ana@example.com', 'Ana');
    const bea = await register('bea@example.com', 'Bea');

    const response = await requestUploadUrl(bea.accessToken, ana.householdId, {
      contentType: 'image/jpeg',
      size: 1024,
    }).expect(404);

    expect((response.body as ErrorResponse).error).toEqual({
      code: 'NOT_FOUND',
      message: 'Hogar no encontrado',
      details: [],
    });
  });
});
