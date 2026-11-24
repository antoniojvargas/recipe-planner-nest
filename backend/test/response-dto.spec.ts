import './setup-env.js';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { RefreshSessionsRepository } from '../src/auth/refresh-sessions.repository.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import { ImportsRepository } from '../src/imports/imports.repository.js';
import { MealPlansRepository } from '../src/meal-plans/meal-plans.repository.js';
import { PantryRepository } from '../src/pantry/pantry.repository.js';
import { RecipesRepository } from '../src/recipes/recipes.repository.js';
import { ShoppingListsService } from '../src/shopping/shopping-lists.service.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { createInfraFakes, withFakeInfra } from './support/fake-infra.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryRecipesRepository } from './support/in-memory-recipes.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'response-dto-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;
const WEEK = '2026-11-16';
const FORBIDDEN_KEYS = ['__v', 'passwordHash'];

/** Comprueba recursiveamente que ningún campo interno de Mongo llega al cuerpo de la respuesta. */
function expectNoInternalFields(value: unknown, path = 'body'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectNoInternalFields(item, `${path}[${index}]`));
    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    expect(FORBIDDEN_KEYS.includes(key), `${path}.${key} es un campo interno`).toBe(false);
    expectNoInternalFields(child, `${path}.${key}`);
  }
}

function cookieValue(cookies: string[], name: string): string | undefined {
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));

  return cookie?.split(';')[0]?.slice(name.length + 1);
}

/**
 * H5: la serialización es una lista blanca, no un reflejo del documento.
 *
 * Los dobles devuelven documentos con `__v` (y el usuario con `passwordHash`) para que la
 * prueba falle en cuanto un controlador o servicio devuelva un objeto sin pasar por el DTO.
 */
describe('DTOs de respuesta', () => {
  let app: NestFastifyApplication;
  let users: InMemoryUsersRepository;
  let households: InMemoryHouseholdsRepository;
  let recipes: InMemoryRecipesRepository;
  let token: string;
  let householdId: string;

  beforeAll(async () => {
    users = new InMemoryUsersRepository();
    households = new InMemoryHouseholdsRepository();
    recipes = new InMemoryRecipesRepository();

    const now = new Date();
    const pantry = {
      findByHousehold: vi.fn(async () => [
        {
          _id: new Types.ObjectId(),
          householdId: new Types.ObjectId(),
          name: 'arroz',
          quantity: 1,
          unit: 'kg',
          createdAt: now,
          updatedAt: now,
          __v: 7,
        },
      ]),
    };
    const mealPlans = {
      upsertEmpty: vi.fn(async () => ({
        _id: new Types.ObjectId(),
        householdId: new Types.ObjectId(),
        weekStart: new Date(`${WEEK}T00:00:00.000Z`),
        slots: [],
        createdAt: now,
        updatedAt: now,
        __v: 7,
      })),
    };
    const shopping = {
      generate: vi.fn(async () => ({
        _id: new Types.ObjectId(),
        householdId: new Types.ObjectId(),
        weekStart: new Date(`${WEEK}T00:00:00.000Z`),
        items: [],
        version: 1,
        __v: 7,
      })),
    };
    const imports = {
      createOrFind: vi.fn(async () => ({
        created: true,
        job: {
          _id: new Types.ObjectId(),
          householdId: new Types.ObjectId(),
          url: 'https://recetas.example.com/paella',
          status: 'pending',
          createdAt: now,
          __v: 7,
        },
      })),
    };

    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({ imports: [AppModule] }),
      createInfraFakes(),
    )
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(HouseholdsRepository)
      .useValue(households)
      .overrideProvider(RefreshSessionsRepository)
      .useValue(new InMemoryRefreshSessionsRepository())
      .overrideProvider(RecipesRepository)
      .useValue(recipes)
      .overrideProvider(PantryRepository)
      .useValue(pantry)
      .overrideProvider(MealPlansRepository)
      .useValue(mealPlans)
      .overrideProvider(ShoppingListsService)
      .useValue(shopping)
      .overrideProvider(ImportsRepository)
      .useValue(imports)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email: 'response-dto@example.com', password: 'Correcta123', displayName: 'Prueba' })
      .expect(201);

    const setCookie: unknown = response.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? (setCookie as string[]) : [];
    const accessToken = cookieValue(cookies, 'access_token');
    const household = households.households.at(-1);

    if (accessToken === undefined || household === undefined) {
      throw new Error('El registro debe devolver la sesión y crear el hogar');
    }

    token = accessToken;
    householdId = household._id.toString();

    // Los repositorios reales devuelven el campo de versión; los dobles lo imitan aquí.
    Object.assign(users.users[0], { __v: 7 });
    Object.assign(household, { __v: 7 });
  });

  afterAll(async () => {
    await app.close();
  });

  function authedCookies(): string[] {
    return [CSRF_COOKIE, `access_token=${token}`];
  }

  it('auth: register y me no exponen passwordHash ni __v', async () => {
    const me = await request(app.getHttpServer() as App)
      .get('/api/auth/me')
      .set('Cookie', authedCookies())
      .expect(200);

    expectNoInternalFields(me.body);
    expect(me.body.user.email).toBe('response-dto@example.com');
  });

  it('households: la respuesta del hogar no expone __v', async () => {
    const response = await request(app.getHttpServer() as App)
      .get(`/api/households/${householdId}`)
      .set('Cookie', authedCookies())
      .expect(200);

    expectNoInternalFields(response.body);
  });

  it('recipes: la respuesta de recetas no expone __v', async () => {
    const recipe = await recipes.create({
      householdId: new Types.ObjectId(householdId),
      createdBy: new Types.ObjectId(users.users[0]._id),
      title: 'Paella',
      servings: 4,
    });
    Object.assign(recipe, { __v: 7 });

    const list = await request(app.getHttpServer() as App)
      .get(`/api/households/${householdId}/recipes`)
      .set('Cookie', authedCookies())
      .expect(200);
    expectNoInternalFields(list.body);

    const detail = await request(app.getHttpServer() as App)
      .get(`/api/households/${householdId}/recipes/${recipe._id.toString()}`)
      .set('Cookie', authedCookies())
      .expect(200);
    expectNoInternalFields(detail.body);
  });

  it('pantry: la respuesta de la despensa no expone __v', async () => {
    const response = await request(app.getHttpServer() as App)
      .get(`/api/households/${householdId}/pantry`)
      .set('Cookie', authedCookies())
      .expect(200);

    expectNoInternalFields(response.body);
  });

  it('meal-plans: la respuesta del plan no expone __v', async () => {
    const response = await request(app.getHttpServer() as App)
      .get(`/api/households/${householdId}/meal-plans/${WEEK}`)
      .set('Cookie', authedCookies())
      .expect(200);

    expectNoInternalFields(response.body);
  });

  it('shopping-lists: la respuesta de la lista no expone __v', async () => {
    const response = await request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/shopping-lists/${WEEK}/generate`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies())
      .send({})
      .expect(200);

    expectNoInternalFields(response.body);
  });

  it('imports: la respuesta del trabajo no expone __v', async () => {
    const response = await request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/imports`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies())
      .send({ url: 'https://recetas.example.com/paella' })
      .expect(202);

    expectNoInternalFields(response.body);
  });
});
