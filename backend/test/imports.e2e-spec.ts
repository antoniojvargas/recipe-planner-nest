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
import { IMPORT_RECIPE_JOB, importJobId } from './../src/imports/imports.queue.js';
import { ImportsRepository } from './../src/imports/imports.repository.js';
import type { ImportJobResponse } from './../src/imports/imports.types.js';
import { UsersRepository } from './../src/users/users.repository.js';
import { createInfraFakes, withFakeInfra } from './support/fake-infra.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryImportsRepository } from './support/in-memory-imports.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'imports-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;
const PASSWORD = 'Correcta123';
const RECIPE_URL = 'https://recetas.example.com/paella-valenciana';

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

describe('Imports (e2e)', () => {
  let app: NestFastifyApplication;
  let users: InMemoryUsersRepository;
  let households: InMemoryHouseholdsRepository;
  let imports: InMemoryImportsRepository;
  let refreshSessions: InMemoryRefreshSessionsRepository;

  const fakes = createInfraFakes();

  beforeAll(async () => {
    users = new InMemoryUsersRepository();
    households = new InMemoryHouseholdsRepository();
    imports = new InMemoryImportsRepository();
    refreshSessions = new InMemoryRefreshSessionsRepository();

    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({ imports: [AppModule] }),
      fakes,
    )
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(HouseholdsRepository)
      .useValue(households)
      .overrideProvider(ImportsRepository)
      .useValue(imports)
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
    imports.jobs.length = 0;
    refreshSessions.sessions.length = 0;
    fakes.importsQueue.add.mockClear();
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

  function importRecipe(
    accessToken: string | undefined,
    householdId: string,
    body: Record<string, unknown> = { url: RECIPE_URL },
  ) {
    return request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/imports`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(accessToken))
      .send(body);
  }

  it('crea el ImportJob, lo encola con reintentos y responde 202', async () => {
    const { accessToken, householdId } = await register();

    const response = await importRecipe(accessToken, householdId).expect(202);
    const body = response.body as ImportJobResponse;
    const job = imports.jobs[0];

    expect(body).toEqual({
      id: job._id.toString(),
      householdId,
      url: RECIPE_URL,
      status: 'pending',
      createdAt: expect.any(String) as unknown,
    });

    expect(job.url).toBe(RECIPE_URL);
    expect(job.createdBy.toString()).toBe(users.users[0]._id.toString());

    const jobId = importJobId(householdId, RECIPE_URL);

    expect(fakes.importsQueue.add).toHaveBeenCalledWith(
      IMPORT_RECIPE_JOB,
      { importId: body.id, householdId, url: RECIPE_URL },
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        jobId,
      }),
    );
    expect(jobId).toBe(importJobId(householdId, RECIPE_URL));
  });

  it('no duplica el trabajo ni el documento para la misma URL dentro de diez minutos', async () => {
    const { accessToken, householdId } = await register();

    const first = await importRecipe(accessToken, householdId).expect(202);
    const second = await importRecipe(accessToken, householdId).expect(202);

    expect((first.body as ImportJobResponse).id).toBe((second.body as ImportJobResponse).id);
    expect(imports.jobs).toHaveLength(1);
    expect(fakes.importsQueue.add).toHaveBeenCalledTimes(2);

    const jobIds = fakes.importsQueue.add.mock.calls.map(
      ([, , options]) => (options as { jobId: string }).jobId,
    );

    expect(jobIds).toEqual([jobIds[0], jobIds[0]]);
  });

  it('trata como trabajos distintos la misma URL en hogares distintos', async () => {
    const first = await register('ana@example.com', 'Ana');
    const second = await register('luis@example.com', 'Luis');

    await importRecipe(first.accessToken, first.householdId).expect(202);
    await importRecipe(second.accessToken, second.householdId).expect(202);

    expect(imports.jobs).toHaveLength(2);
    expect(imports.jobs[0]?.jobId).not.toBe(imports.jobs[1]?.jobId);
  });

  it('rechaza una URL que no es http o https', async () => {
    const { accessToken, householdId } = await register();

    for (const url of ['no-es-una-url', 'ftp://recetas.example.com/paella']) {
      const response = await importRecipe(accessToken, householdId, { url }).expect(400);

      expect((response.body as ErrorResponse).error.details[0]?.field).toBe('url');
    }

    expect(imports.jobs).toHaveLength(0);
    expect(fakes.importsQueue.add).not.toHaveBeenCalled();
  });

  it('un usuario de otro hogar recibe 404 y no crea ni encola nada', async () => {
    const owner = await register('ana@example.com', 'Ana');
    const intruder = await register('luis@example.com', 'Luis');

    const response = await importRecipe(intruder.accessToken, owner.householdId).expect(404);

    expect((response.body as ErrorResponse).error.code).toBe('NOT_FOUND');
    expect(imports.jobs).toHaveLength(0);
    expect(fakes.importsQueue.add).not.toHaveBeenCalled();
  });

  it('exige autenticación', async () => {
    const { householdId } = await register();

    await importRecipe(undefined, householdId).expect(401);
    expect(fakes.importsQueue.add).not.toHaveBeenCalled();
  });
});
