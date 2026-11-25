import 'reflect-metadata';
import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { SignJWT } from 'jose';
import type { PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { RefreshSessionsRepository } from '../src/auth/refresh-sessions.repository.js';
import { MealPlansRepository } from '../src/meal-plans/meal-plans.repository.js';
import { PantryRepository } from '../src/pantry/pantry.repository.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import { RecipesRepository } from '../src/recipes/recipes.repository.js';
import { ImportsRepository } from '../src/imports/imports.repository.js';
import { ShoppingListsRepository } from '../src/shopping/shopping-lists.repository.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { createInfraFakes, withFakeInfra, type InfraFakes } from './support/fake-infra.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryImportsRepository } from './support/in-memory-imports.repository.js';
import { InMemoryMealPlansRepository } from './support/in-memory-meal-plans.repository.js';
import { InMemoryPantryRepository } from './support/in-memory-pantry.repository.js';
import { InMemoryRecipesRepository } from './support/in-memory-recipes.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryShoppingListsRepository } from './support/in-memory-shopping-lists.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

/**
 * Caracterización de la API: el JSON exacto de cada endpoint tal como se comporta hoy.
 *
 * Son snapshots, no especificaciones. Cualquier cambio en una respuesta (un campo nuevo, un
 * mensaje distinto, otro código de error) rompe un snapshot y obliga a decidir a conciencia si
 * el cambio es el deseado. Sirven de red antes de refactorizar: si el snapshot no cambia, el
 * contrato observable se mantiene.
 *
 * Lo que se normaliza antes de comparar es solo lo que no puede ser determinista entre dos
 * ejecuciones: identificadores (se aliasan por orden de aparición), instantes, códigos de
 * invitación, UUIDs y firmas de URLs prefirmadas. Todo lo demás es literal.
 */

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'characterization-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;
const PASSWORD = 'Correcta123';
const WEEK_START = '2026-11-09T00:00:00.000Z';
const WEEK_START_PARAM = encodeURIComponent(WEEK_START);

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 800;

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;
const OBJECT_ID_IN_TEXT = /[0-9a-f]{24}/g;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const INVITE_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/;
const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const ABSOLUTE_URL_PATTERN = /^https?:\/\//;

/** Campos de una firma S3 cuyo valor cambia en cada ejecución (depende de la hora). */
const PRESIGNED_FIELDS = new Set(['policy', 'x-amz-credential', 'x-amz-date', 'x-amz-signature']);

/** Tiempos medidos por el health check: cambian en cada ejecución. */
const TIMING_FIELDS = new Set(['responsetime']);

interface Normalizer {
  value: (input: unknown) => unknown;
  reset: () => void;
}

function createNormalizer(): Normalizer {
  const ids = new Map<string, string>();

  function alias(id: string): string {
    const existing = ids.get(id);

    if (existing !== undefined) {
      return existing;
    }

    const alias = `<id:${String(ids.size + 1)}>`;
    ids.set(id, alias);

    return alias;
  }

  function normalizePath(value: string): string {
    return value
      .replace(UUID_IN_TEXT, '<uuid>')
      .replace(OBJECT_ID_IN_TEXT, (match) => alias(match));
  }

  function normalizeUrl(value: string): string {
    const [path = '', query] = value.split('?');
    const normalizedPath = normalizePath(path);

    if (query === undefined) {
      return normalizedPath;
    }

    const params = [...new URLSearchParams(query)].map(([name, paramValue]) =>
      PRESIGNED_FIELDS.has(name.toLowerCase()) ? `${name}=<presign>` : `${name}=${paramValue}`,
    );

    return `${normalizedPath}?${params.join('&')}`;
  }

  function normalizeString(value: string): string {
    if (value === WEEK_START) {
      return '<weekStart>';
    }

    if (OBJECT_ID_PATTERN.test(value)) {
      return alias(value);
    }

    if (ISO_TIMESTAMP_PATTERN.test(value)) {
      return '<timestamp>';
    }

    if (INVITE_CODE_PATTERN.test(value)) {
      return '<invite-code>';
    }

    if (ABSOLUTE_URL_PATTERN.test(value)) {
      return normalizeUrl(value);
    }

    // Claves de objetos como `pending/<id>/<uuid>.png`: el identificador y el UUID se aliasan
    // igual que si viajaran sueltos, para que el snapshot muestre la forma de la clave.
    return normalizePath(value);
  }

  function normalizeValue(input: unknown, key?: string): unknown {
    if (typeof input === 'number' && key !== undefined && TIMING_FIELDS.has(key.toLowerCase())) {
      return '<ms>';
    }

    if (typeof input === 'string') {
      return key !== undefined && PRESIGNED_FIELDS.has(key.toLowerCase())
        ? '<presign>'
        : normalizeString(input);
    }

    if (Array.isArray(input)) {
      return input.map((item) => normalizeValue(item));
    }

    if (input !== null && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input).map(([entryKey, entryValue]) => [
          entryKey,
          normalizeValue(entryValue, entryKey),
        ]),
      );
    }

    return input;
  }

  return {
    value: (input: unknown) => normalizeValue(input),
    reset: () => ids.clear(),
  };
}

const normalizer = createNormalizer();

/** Estado + cuerpo exacto de una respuesta, listo para `toMatchSnapshot`. */
function observable(response: request.Response): unknown {
  return { status: response.status, body: normalizer.value(response.body) };
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

describe('Caracterización de la API', () => {
  let app: NestFastifyApplication;
  let users: InMemoryUsersRepository;
  let households: InMemoryHouseholdsRepository;
  let recipes: InMemoryRecipesRepository;
  let refreshSessions: InMemoryRefreshSessionsRepository;
  let mealPlans: InMemoryMealPlansRepository;
  let shoppingLists: InMemoryShoppingListsRepository;
  let pantry: InMemoryPantryRepository;
  let imports: InMemoryImportsRepository;
  let png: Buffer;

  /** Sesión de Ana, creada antes de cada test para que cada snapshot sea independiente. */
  let anaToken: string;
  let anaRefreshToken: string;
  let anaUserId: string;
  let householdId: string;

  const sendMock = vi.fn((command: unknown) => {
    if (command instanceof HeadObjectCommand) {
      return Promise.resolve({ ContentLength: png.length, ContentType: 'image/png' });
    }

    if (command instanceof GetObjectCommand) {
      return Promise.resolve({
        Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(png)) },
      });
    }

    return Promise.resolve({});
  });

  const fakes: InfraFakes = createInfraFakes({ send: sendMock });

  /** El publicador de Socket.IO escribe en Redis; el doble solo necesita aceptar el evento. */
  Object.assign(fakes.redis, { publish: () => Promise.resolve(0) });

  beforeAll(async () => {
    png = await sharp({
      create: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    users = new InMemoryUsersRepository();
    households = new InMemoryHouseholdsRepository();
    recipes = new InMemoryRecipesRepository();
    refreshSessions = new InMemoryRefreshSessionsRepository();
    mealPlans = new InMemoryMealPlansRepository();
    shoppingLists = new InMemoryShoppingListsRepository();
    pantry = new InMemoryPantryRepository();
    imports = new InMemoryImportsRepository();

    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({ imports: [AppModule] }),
      fakes,
    )
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(HouseholdsRepository)
      .useValue(households)
      .overrideProvider(RecipesRepository)
      .useValue(recipes)
      .overrideProvider(RefreshSessionsRepository)
      .useValue(refreshSessions)
      .overrideProvider(MealPlansRepository)
      .useValue(mealPlans)
      .overrideProvider(ShoppingListsRepository)
      .useValue(shoppingLists)
      .overrideProvider(PantryRepository)
      .useValue(pantry)
      .overrideProvider(ImportsRepository)
      .useValue(imports)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    users.users.length = 0;
    households.households.length = 0;
    recipes.recipes.length = 0;
    refreshSessions.sessions.length = 0;
    mealPlans.plans.length = 0;
    shoppingLists.lists.length = 0;
    pantry.items.length = 0;
    imports.jobs.length = 0;
    fakes.mediaQueue.add.mockClear();
    fakes.importsQueue.add.mockClear();
    normalizer.reset();

    const registered = await register('ana@example.com', 'Ana');
    anaToken = registered.accessToken;
    anaRefreshToken = registered.refreshToken;
    anaUserId = registered.userId;
    householdId = households.households[0]?._id.toString() ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  function server(): App {
    return app.getHttpServer() as App;
  }

  /** Petición autenticada con la sesión de Ana y el doble CSRF que exige la app. */
  function authed(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) {
    const call = request(server())
      [method](path)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', [CSRF_COOKIE, `access_token=${anaToken}`]);

    return call;
  }

  async function register(
    email: string,
    displayName: string,
  ): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
    const response = await request(server())
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email, password: PASSWORD, displayName })
      .expect(201);

    const cookies = responseCookies(response);
    const accessToken = cookieValue(cookies, 'access_token') ?? '';
    const refreshToken = cookieValue(cookies, 'refresh_token') ?? '';
    const body = response.body as { user: { id: string } };

    return { accessToken, refreshToken, userId: body.user.id };
  }

  async function createRecipe(token: string = anaToken): Promise<string> {
    const response = await request(server())
      .post(`/api/households/${householdId}/recipes`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', [CSRF_COOKIE, `access_token=${token}`])
      .send({
        title: 'Tortilla de patatas',
        servings: 4,
        prepMinutes: 15,
        cookMinutes: 30,
        tags: ['Clásica', 'huevo'],
        ingredients: [
          { name: 'Patata', quantity: 600, unit: 'g' },
          { name: 'Huevo', quantity: 6, unit: 'unit' },
        ],
        steps: [{ text: 'Pela y corta las patatas.' }, { text: 'Cuaja el huevo y da la vuelta.' }],
      })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  describe('raíz y salud', () => {
    it('GET /api', async () => {
      const response = await request(server()).get('/api').expect(200);

      expect(response.text).toMatchSnapshot();
    });

    it('GET /api/health', async () => {
      const response = await request(server()).get('/api/health').expect(200);

      expect(observable(response)).toMatchSnapshot();
    });
  });

  describe('sesión', () => {
    it('POST /api/auth/register', async () => {
      const response = await request(server())
        .post('/api/auth/register')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', CSRF_COOKIE)
        .send({ email: 'luis@example.com', password: PASSWORD, displayName: 'Luis' })
        .expect(201);

      expect(observable(response)).toMatchSnapshot();
    });

    it('POST /api/auth/login', async () => {
      const response = await request(server())
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', CSRF_COOKIE)
        .send({ email: 'ana@example.com', password: PASSWORD })
        .expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('POST /api/auth/refresh', async () => {
      const response = await request(server())
        .post('/api/auth/refresh')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, `refresh_token=${anaRefreshToken}`])
        .expect(204);

      expect(observable(response)).toMatchSnapshot();
    });

    it('POST /api/auth/logout', async () => {
      const response = await authed('post', '/api/auth/logout').expect(204);

      expect(observable(response)).toMatchSnapshot();
    });

    it('POST /api/auth/logout-all', async () => {
      const response = await authed('post', '/api/auth/logout-all').expect(204);

      expect(observable(response)).toMatchSnapshot();
    });

    it('GET /api/auth/me', async () => {
      const response = await authed('get', '/api/auth/me').expect(200);

      expect(observable(response)).toMatchSnapshot();
    });
  });

  describe('hogares', () => {
    it('POST /api/households', async () => {
      const response = await authed('post', '/api/households')
        .send({ name: 'Casa de playa', timeZone: 'Europe/Madrid' })
        .expect(201);

      expect(observable(response)).toMatchSnapshot();
    });

    it('GET /api/households', async () => {
      await authed('post', '/api/households').send({ name: 'Casa de playa' }).expect(201);

      const response = await authed('get', '/api/households').expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('POST /api/households/{id}/invite', async () => {
      const response = await authed('post', `/api/households/${householdId}/invite`).expect(201);

      expect(observable(response)).toMatchSnapshot();
    });

    it('POST /api/households/join', async () => {
      const invite = await authed('post', `/api/households/${householdId}/invite`).expect(201);
      const code = (invite.body as { code: string }).code;
      const luis = await register('luis@example.com', 'Luis');

      const response = await request(server())
        .post('/api/households/join')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, `access_token=${luis.accessToken}`])
        .send({ code })
        .expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('POST /api/households/{id}/leave', async () => {
      const invite = await authed('post', `/api/households/${householdId}/invite`).expect(201);
      const luis = await register('luis@example.com', 'Luis');
      await request(server())
        .post('/api/households/join')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, `access_token=${luis.accessToken}`])
        .send({ code: (invite.body as { code: string }).code })
        .expect(200);

      const response = await request(server())
        .post(`/api/households/${householdId}/leave`)
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, `access_token=${luis.accessToken}`])
        .expect(204);

      expect(observable(response)).toMatchSnapshot();
    });

    it('GET /api/households/{id}', async () => {
      const response = await authed('get', `/api/households/${householdId}`).expect(200);

      expect(observable(response)).toMatchSnapshot();
    });
  });

  describe('recetario', () => {
    it('POST /api/households/{householdId}/recipes', async () => {
      const response = await authed('post', `/api/households/${householdId}/recipes`)
        .send({
          title: 'Tortilla de patatas',
          servings: 4,
          prepMinutes: 15,
          cookMinutes: 30,
          tags: ['Clásica', 'huevo'],
          ingredients: [
            { name: 'Patata', quantity: 600, unit: 'g' },
            { name: 'Huevo', quantity: 6, unit: 'unit', note: 'grandes' },
          ],
          steps: [{ text: 'Pela y corta las patatas.' }],
        })
        .expect(201);

      expect(observable(response)).toMatchSnapshot();
    });

    it('GET /api/households/{householdId}/recipes', async () => {
      await createRecipe();

      const response = await authed('get', `/api/households/${householdId}/recipes`).expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('GET /api/households/{householdId}/recipes/{recipeId}', async () => {
      const recipeId = await createRecipe();

      const response = await authed(
        'get',
        `/api/households/${householdId}/recipes/${recipeId}`,
      ).expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('PATCH /api/households/{householdId}/recipes/{recipeId}', async () => {
      const recipeId = await createRecipe();

      const response = await authed('patch', `/api/households/${householdId}/recipes/${recipeId}`)
        .send({ servings: 6, tags: ['huevo', 'clásica'] })
        .expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('PUT /api/households/{householdId}/recipes/{recipeId}/image', async () => {
      const recipeId = await createRecipe();
      const upload = await authed('post', `/api/households/${householdId}/media/upload-url`)
        .send({ contentType: 'image/png', size: 2048 })
        .expect(201);
      const key = (upload.body as { key: string }).key;

      const response = await authed(
        'put',
        `/api/households/${householdId}/recipes/${recipeId}/image`,
      )
        .send({ key })
        .expect(200);

      // El doble de S3 acepta también la copia del prefijo pendiente al definitivo.
      expect(sendMock).toHaveBeenCalledWith(expect.any(CopyObjectCommand));
      expect(observable(response)).toMatchSnapshot();
    });

    it('DELETE /api/households/{householdId}/recipes/{recipeId}', async () => {
      const recipeId = await createRecipe();

      const response = await authed(
        'delete',
        `/api/households/${householdId}/recipes/${recipeId}`,
      ).expect(204);

      expect(observable(response)).toMatchSnapshot();
    });
  });

  describe('medios e importaciones', () => {
    it('POST /api/households/{householdId}/media/upload-url', async () => {
      const response = await authed('post', `/api/households/${householdId}/media/upload-url`)
        .send({ contentType: 'image/png', size: 2048 })
        .expect(201);

      expect(observable(response)).toMatchSnapshot();
    });

    it('POST /api/households/{householdId}/imports', async () => {
      const response = await authed('post', `/api/households/${householdId}/imports`)
        .send({ url: 'https://example.com/recetas/tortilla' })
        .expect(202);

      expect(observable(response)).toMatchSnapshot();
    });
  });

  describe('plan semanal', () => {
    it('GET /api/households/{householdId}/meal-plans/{weekStart}', async () => {
      const response = await authed(
        'get',
        `/api/households/${householdId}/meal-plans/${WEEK_START_PARAM}`,
      ).expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('PUT /api/households/{householdId}/meal-plans/{weekStart}/slots', async () => {
      const recipeId = await createRecipe();
      await authed('get', `/api/households/${householdId}/meal-plans/${WEEK_START_PARAM}`).expect(
        200,
      );

      const response = await authed(
        'put',
        `/api/households/${householdId}/meal-plans/${WEEK_START_PARAM}/slots`,
      )
        .send({ day: 0, meal: 'lunch', recipeId, servings: 2 })
        .expect(200);

      expect(observable(response)).toMatchSnapshot();
    });
  });

  describe('lista de la compra', () => {
    /** Deja un plan con una receta para que la lista tenga algo que generar. */
    async function planWeekWithRecipe(): Promise<string> {
      const recipeId = await createRecipe();
      await authed('get', `/api/households/${householdId}/meal-plans/${WEEK_START_PARAM}`).expect(
        200,
      );
      await authed('put', `/api/households/${householdId}/meal-plans/${WEEK_START_PARAM}/slots`)
        .send({ day: 0, meal: 'lunch', recipeId })
        .expect(200);

      return recipeId;
    }

    it('POST /api/households/{householdId}/shopping-lists/{weekStart}/generate', async () => {
      await planWeekWithRecipe();

      const response = await authed(
        'post',
        `/api/households/${householdId}/shopping-lists/${WEEK_START_PARAM}/generate`,
      ).expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('PATCH /api/households/{householdId}/shopping-lists/{weekStart}/items/{itemId}', async () => {
      await planWeekWithRecipe();
      const generated = await authed(
        'post',
        `/api/households/${householdId}/shopping-lists/${WEEK_START_PARAM}/generate`,
      ).expect(200);
      const itemId = (generated.body as { items: { _id: string }[] }).items[0]?._id ?? '';

      const response = await authed(
        'patch',
        `/api/households/${householdId}/shopping-lists/${WEEK_START_PARAM}/items/${itemId}`,
      )
        .send({ checked: true })
        .expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('POST /api/households/{householdId}/shopping-lists/{weekStart}/items', async () => {
      await authed(
        'post',
        `/api/households/${householdId}/shopping-lists/${WEEK_START_PARAM}/generate`,
      ).expect(200);

      const response = await authed(
        'post',
        `/api/households/${householdId}/shopping-lists/${WEEK_START_PARAM}/items`,
      )
        .send({ name: 'Leche', quantity: 1, unit: 'l' })
        .expect(200);

      expect(observable(response)).toMatchSnapshot();
    });
  });

  describe('despensa', () => {
    it('POST /api/households/{householdId}/pantry', async () => {
      const response = await authed('post', `/api/households/${householdId}/pantry`)
        .send({ name: 'Sal', quantity: 500, unit: 'g' })
        .expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('GET /api/households/{householdId}/pantry', async () => {
      await authed('post', `/api/households/${householdId}/pantry`)
        .send({ name: 'Sal', quantity: 500, unit: 'g' })
        .expect(200);
      await authed('post', `/api/households/${householdId}/pantry`)
        .send({ name: 'Aceite', quantity: 1, unit: 'l' })
        .expect(200);

      const response = await authed('get', `/api/households/${householdId}/pantry`).expect(200);

      expect(observable(response)).toMatchSnapshot();
    });

    it('DELETE /api/households/{householdId}/pantry/{name}', async () => {
      await authed('post', `/api/households/${householdId}/pantry`)
        .send({ name: 'Sal', quantity: 500, unit: 'g' })
        .expect(200);

      const response = await authed('delete', `/api/households/${householdId}/pantry/Sal`).expect(
        200,
      );

      expect(observable(response)).toMatchSnapshot();
    });
  });

  describe('sobre de error', () => {
    it('VALIDATION_ERROR: cuerpo inválido', async () => {
      const response = await request(server())
        .post('/api/auth/register')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', CSRF_COOKIE)
        .send({ email: 'no-es-un-email', password: 'corta', displayName: '' })
        .expect(400);

      expect(observable(response)).toMatchSnapshot();
    });

    it('VALIDATION_ERROR: identificador de hogar que no es un ObjectId', async () => {
      const response = await authed('get', '/api/households/no-es-un-id').expect(400);

      expect(observable(response)).toMatchSnapshot();
    });

    it('UNAUTHORIZED: sin cookie de sesión', async () => {
      const response = await request(server()).get('/api/auth/me').expect(401);

      expect(observable(response)).toMatchSnapshot();
    });

    it('TOKEN_EXPIRED: access token caducado', async () => {
      const expired = await new SignJWT({ fid: 'familia-caducada' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(anaUserId)
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3_600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET ?? ''));

      const response = await request(server())
        .get('/api/auth/me')
        .set('Cookie', `access_token=${expired}`)
        .expect(401);

      expect(observable(response)).toMatchSnapshot();
    });

    it('FORBIDDEN: origen que no es el del frontend', async () => {
      const response = await request(server())
        .post('/api/households')
        .set('Origin', 'http://evil.example')
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, `access_token=${anaToken}`])
        .send({ name: 'Casa' })
        .expect(403);

      expect(observable(response)).toMatchSnapshot();
    });

    it('FORBIDDEN: un miembro sin rol de propietario no invita', async () => {
      const invite = await authed('post', `/api/households/${householdId}/invite`).expect(201);
      const luis = await register('luis@example.com', 'Luis');
      await request(server())
        .post('/api/households/join')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, `access_token=${luis.accessToken}`])
        .send({ code: (invite.body as { code: string }).code })
        .expect(200);

      const response = await request(server())
        .post(`/api/households/${householdId}/invite`)
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, `access_token=${luis.accessToken}`])
        .expect(403);

      expect(observable(response)).toMatchSnapshot();
    });

    it('NOT_FOUND: hogar que no existe para el usuario', async () => {
      const response = await authed('get', '/api/households/0123456789abcdef01234567').expect(404);

      expect(observable(response)).toMatchSnapshot();
    });

    it('CONFLICT: el último miembro no puede salir del hogar', async () => {
      const response = await authed('post', `/api/households/${householdId}/leave`).expect(409);

      expect(observable(response)).toMatchSnapshot();
    });

    /**
     * `RATE_LIMITED` e `INTERNAL_ERROR` no tienen ruta que los produzca hoy: el throttler no
     * está registrado en la app y los fallos desconocidos no se pueden provocar con los dobles
     * de infraestructura. Se pasan por el filtro que serializa todas las respuestas de error,
     * que es donde vive la forma del sobre. `IMPORT_FAILED` no viaja en el sobre HTTP: es un
     * estado del trabajo de importación y el mensaje sale por Socket.IO.
     */
    describe('códigos que hoy no emite ninguna ruta', () => {
      function envelopeOf(exception: unknown): unknown {
        const reply = vi.fn();
        const adapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost;
        const logger = {
          setContext: vi.fn(),
          error: vi.fn(),
        } as unknown as PinoLogger;
        const host = {
          switchToHttp: () => ({ getResponse: () => ({}) }),
        } as unknown as ArgumentsHost;

        new AllExceptionsFilter(adapterHost, logger).catch(exception, host);

        return {
          status: reply.mock.calls[0]?.[2],
          body: normalizer.value(reply.mock.calls[0]?.[1]),
        };
      }

      it('RATE_LIMITED: 429 de un limitador de peticiones', () => {
        expect(
          envelopeOf(new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS)),
        ).toMatchSnapshot();
      });

      it('INTERNAL_ERROR: excepción inesperada', () => {
        expect(envelopeOf(new Error('fallo interno con detalles sensibles'))).toMatchSnapshot();
      });

      it('INTERNAL_ERROR: HttpException 5xx sin filtrar el mensaje interno', () => {
        expect(
          envelopeOf(new HttpException('El proveedor dijo: secreto', HttpStatus.BAD_GATEWAY)),
        ).toMatchSnapshot();
      });
    });
  });
});
