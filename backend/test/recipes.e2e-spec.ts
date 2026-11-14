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
import { RecipesRepository } from './../src/recipes/recipes.repository.js';
import type { RecipeListResponse, RecipeResponse } from './../src/recipes/recipes.types.js';
import { UsersRepository } from './../src/users/users.repository.js';
import { withFakeInfra } from './support/fake-infra.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryRecipesRepository } from './support/in-memory-recipes.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'recipes-csrf-token';
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

function recipeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Paella valenciana',
    description: 'La de siempre',
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 40,
    tags: ['Arroz', 'valenciana'],
    ingredients: [
      { name: 'Arroz', quantity: 400, unit: 'g' },
      { name: 'Azafrán', quantity: 1, unit: 'pinch', note: 'tostado' },
    ],
    steps: [{ text: 'Sofríe la verdura.' }, { text: 'Añade el arroz y el caldo.' }],
    ...overrides,
  };
}

describe('Recipes (e2e)', () => {
  let app: NestFastifyApplication;
  let users: InMemoryUsersRepository;
  let households: InMemoryHouseholdsRepository;
  let recipes: InMemoryRecipesRepository;
  let refreshSessions: InMemoryRefreshSessionsRepository;

  beforeAll(async () => {
    users = new InMemoryUsersRepository();
    households = new InMemoryHouseholdsRepository();
    recipes = new InMemoryRecipesRepository();
    refreshSessions = new InMemoryRefreshSessionsRepository();

    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(HouseholdsRepository)
      .useValue(households)
      .overrideProvider(RecipesRepository)
      .useValue(recipes)
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
    recipes.recipes.length = 0;
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

  function createRecipe(
    accessToken: string | undefined,
    householdId: string,
    body: Record<string, unknown> = recipeBody(),
  ) {
    return request(app.getHttpServer() as App)
      .post(`/api/households/${householdId}/recipes`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(accessToken))
      .send(body);
  }

  function listRecipes(accessToken: string | undefined, householdId: string, query = '') {
    return request(app.getHttpServer())
      .get(`/api/households/${householdId}/recipes${query}`)
      .set('Cookie', authedCookies(accessToken));
  }

  it('crea, lee, actualiza y borra una receta del hogar', async () => {
    const { accessToken, householdId } = await register();

    const created = await createRecipe(accessToken, householdId).expect(201);
    const body = created.body as RecipeResponse;

    expect(body).toEqual(
      expect.objectContaining({
        title: 'Paella valenciana',
        servings: 4,
        prepMinutes: 20,
        cookMinutes: 40,
        tags: ['arroz', 'valenciana'],
        householdId,
      }),
    );
    expect(body.id).toMatch(/^[0-9a-f]{24}$/);
    expect(body.ingredients[0]).toEqual({ name: 'Arroz', quantity: 400, unit: 'g' });
    expect(body.createdBy).toBe(users.users[0]?._id.toString());

    const list = await listRecipes(accessToken, householdId).expect(200);
    const page = list.body as RecipeListResponse;
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();

    const fetched = await request(app.getHttpServer() as App)
      .get(`/api/households/${householdId}/recipes/${body.id}`)
      .set('Cookie', authedCookies(accessToken))
      .expect(200);
    expect((fetched.body as RecipeResponse).id).toBe(body.id);

    const updated = await request(app.getHttpServer() as App)
      .patch(`/api/households/${householdId}/recipes/${body.id}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(accessToken))
      .send({ title: 'Paella de marisco', servings: 6 })
      .expect(200);

    expect(updated.body as RecipeResponse).toEqual(
      expect.objectContaining({
        id: body.id,
        title: 'Paella de marisco',
        servings: 6,
        description: 'La de siempre',
      }),
    );

    await request(app.getHttpServer() as App)
      .delete(`/api/households/${householdId}/recipes/${body.id}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', authedCookies(accessToken))
      .expect(204);

    await request(app.getHttpServer() as App)
      .get(`/api/households/${householdId}/recipes/${body.id}`)
      .set('Cookie', authedCookies(accessToken))
      .expect(404);
  });

  it('pagina por cursor de updatedAt y _id sin repetir ni saltarse recetas', async () => {
    const { accessToken, householdId } = await register();

    for (const title of ['Receta 1', 'Receta 2', 'Receta 3']) {
      await createRecipe(accessToken, householdId, recipeBody({ title })).expect(201);
    }

    // Fechas distintas para que el orden no dependa de los milisegundos del test.
    recipes.recipes.forEach((recipe, index) => {
      recipe.updatedAt = new Date(Date.UTC(2026, 2, index + 1, 10));
    });

    const first = await listRecipes(accessToken, householdId, '?limit=2').expect(200);
    const firstPage = first.body as RecipeListResponse;

    expect(firstPage.items.map((recipe) => recipe.title)).toEqual(['Receta 3', 'Receta 2']);
    expect(firstPage.nextCursor).not.toBeNull();

    const second = await listRecipes(
      accessToken,
      householdId,
      `?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
    ).expect(200);
    const secondPage = second.body as RecipeListResponse;

    expect(secondPage.items.map((recipe) => recipe.title)).toEqual(['Receta 1']);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('filtra por etiquetas exigiendo todas las indicadas', async () => {
    const { accessToken, householdId } = await register();

    await createRecipe(
      accessToken,
      householdId,
      recipeBody({ title: 'Tostadas', tags: ['desayuno', 'rapido'] }),
    ).expect(201);
    await createRecipe(
      accessToken,
      householdId,
      recipeBody({ title: 'Paella', tags: ['comida'] }),
    ).expect(201);

    const one = await listRecipes(accessToken, householdId, '?tags=desayuno').expect(200);
    expect((one.body as RecipeListResponse).items.map((recipe) => recipe.title)).toEqual([
      'Tostadas',
    ]);

    const both = await listRecipes(accessToken, householdId, '?tags=desayuno,rapido').expect(200);
    expect((both.body as RecipeListResponse).items).toHaveLength(1);

    const none = await listRecipes(accessToken, householdId, '?tags=desayuno,comida').expect(200);
    expect((none.body as RecipeListResponse).items).toHaveLength(0);
  });

  it('busca con ?q= y ordena por relevancia, también entre páginas', async () => {
    const { accessToken, householdId } = await register();

    await createRecipe(
      accessToken,
      householdId,
      recipeBody({
        title: 'Arroz con leche',
        tags: ['postre'],
        ingredients: [{ name: 'Arroz', quantity: 100, unit: 'g' }],
      }),
    ).expect(201);
    await createRecipe(
      accessToken,
      householdId,
      recipeBody({ title: 'Arroz blanco', tags: ['comida'], ingredients: [] }),
    ).expect(201);
    await createRecipe(
      accessToken,
      householdId,
      recipeBody({
        title: 'Tortilla',
        tags: ['comida'],
        ingredients: [{ name: 'Huevo', quantity: 4, unit: 'unit' }],
      }),
    ).expect(201);

    const search = await listRecipes(accessToken, householdId, '?q=arroz').expect(200);
    const page = search.body as RecipeListResponse;

    expect(page.items.map((recipe) => recipe.title)).toEqual(['Arroz con leche', 'Arroz blanco']);

    const first = await listRecipes(accessToken, householdId, '?q=arroz&limit=1').expect(200);
    const firstPage = first.body as RecipeListResponse;
    expect(firstPage.nextCursor).not.toBeNull();

    const second = await listRecipes(
      accessToken,
      householdId,
      `?q=arroz&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
    ).expect(200);
    expect((second.body as RecipeListResponse).items.map((recipe) => recipe.title)).toEqual([
      'Arroz blanco',
    ]);
  });

  it('valida el cuerpo, la unidad del catálogo y el cursor', async () => {
    const { accessToken, householdId } = await register();

    const tooMany = await createRecipe(
      accessToken,
      householdId,
      recipeBody({
        ingredients: Array.from({ length: 101 }, (_, index) => ({
          name: `Ingrediente ${String(index)}`,
          quantity: 1,
          unit: 'g',
        })),
      }),
    ).expect(400);
    expect((tooMany.body as ErrorResponse).error.details).toEqual([
      { field: 'ingredients', message: 'No se pueden añadir más de 100 ingredientes' },
    ]);

    const badUnit = await createRecipe(
      accessToken,
      householdId,
      recipeBody({ ingredients: [{ name: 'Harina', quantity: 1, unit: 'oz' }] }),
    ).expect(400);
    expect((badUnit.body as ErrorResponse).error.details[0]?.field).toBe('ingredients.0.unit');

    const badCursor = await listRecipes(accessToken, householdId, '?cursor=basura').expect(400);
    expect((badCursor.body as ErrorResponse).error.details[0]?.field).toBe('cursor');
  });

  it('un usuario de otro hogar recibe 404 en todas las rutas del recetario', async () => {
    const ana = await register('ana@example.com', 'Ana');
    const bea = await register('bea@example.com', 'Bea');

    const created = await createRecipe(ana.accessToken, ana.householdId).expect(201);
    const recipeId = (created.body as RecipeResponse).id;

    const list = await listRecipes(bea.accessToken, ana.householdId).expect(404);
    expect((list.body as ErrorResponse).error.code).toBe('NOT_FOUND');

    await request(app.getHttpServer() as App)
      .get(`/api/households/${ana.householdId}/recipes/${recipeId}`)
      .set('Cookie', authedCookies(bea.accessToken))
      .expect(404);

    await createRecipe(bea.accessToken, ana.householdId).expect(404);

    // Con su propio hogar, la receta de Ana tampoco existe: el filtro por hogar no se relaja.
    await request(app.getHttpServer() as App)
      .get(`/api/households/${bea.householdId}/recipes/${recipeId}`)
      .set('Cookie', authedCookies(bea.accessToken))
      .expect(404);
  });
});
