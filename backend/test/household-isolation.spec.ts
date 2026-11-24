import 'reflect-metadata';
import './setup-env.js';

import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { HttpException } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { RefreshSessionsRepository } from '../src/auth/refresh-sessions.repository.js';
import { UsersRepository } from '../src/users/users.repository.js';
import type { StorageConfig } from '../src/config/index.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import type { SafeHttpClient } from '../src/imports/safe-http.client.js';
import { ImportsProcessor } from '../src/imports/imports.processor.js';
import { ImportsRepository } from '../src/imports/imports.repository.js';
import type { ImportJob } from '../src/imports/import-job.schema.js';
import { MediaProcessor } from '../src/media/media.processor.js';
import { THUMBNAIL_JOB, type MediaJobData } from '../src/media/media.queue.js';
import type { MediaService } from '../src/media/media.service.js';
import type { MealPlansRepository } from '../src/meal-plans/meal-plans.repository.js';
import { MealPlansService } from '../src/meal-plans/meal-plans.service.js';
import type { PantryItem } from '../src/pantry/pantry-item.schema.js';
import { PantryRepository } from '../src/pantry/pantry.repository.js';
import type { RecipesRepository } from '../src/recipes/recipes.repository.js';
import { RecipesService } from '../src/recipes/recipes.service.js';
import type { RealtimePublisher } from '../src/realtime/realtime-publisher.js';
import type { ShoppingListsRepository } from '../src/shopping/shopping-lists.repository.js';
import { ShoppingListsService } from '../src/shopping/shopping-lists.service.js';
import { createInfraFakes, withFakeInfra } from './support/fake-infra.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryRecipesRepository } from './support/in-memory-recipes.repository.js';
import { InMemoryRefreshSessionsRepository } from './support/in-memory-refresh-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';
import { mockMongooseQuery } from './support/mongoose-query.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'isolation-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;
const PASSWORD = 'Correcta123';
const WEEK = '2026-11-16';

const ownerId = new Types.ObjectId().toString();
const attackerId = new Types.ObjectId().toString();
const resourceId = new Types.ObjectId().toString();

function responseCookies(response: request.Response): string[] {
  const header: unknown = response.headers['set-cookie'];

  if (Array.isArray(header)) {
    return header as string[];
  }

  return typeof header === 'string' ? [header] : [];
}

function cookieValue(cookies: string[], name: string): string | undefined {
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));

  return cookie?.split(';')[0]?.slice(name.length + 1);
}

function authedCookies(token: string | undefined): string[] {
  return [CSRF_COOKIE, ...(token === undefined ? [] : [`access_token=${token}`])];
}

async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(404);
    return;
  }

  throw new Error('Se esperaba un 404 al acceder a un documento de otro hogar');
}

/**
 * Fase 3 (H4/H5): ningún recurso debe permitir leer o modificar un documento ajeno.
 *
 * Cada recurso tiene dos pruebas: la HTTP comprueba el guard de pertenencia en la ruta y la de
 * servicio comprueba que el `householdId` llega hasta la consulta. Una prueba en rojo indica
 * un sitio donde el aislamiento depende solo de la capa superior.
 */
describe('Aislamiento entre hogares', () => {
  describe('endpoints', () => {
    let app: NestFastifyApplication;
    let users: InMemoryUsersRepository;
    let households: InMemoryHouseholdsRepository;
    let sessions: InMemoryRefreshSessionsRepository;

    beforeAll(async () => {
      users = new InMemoryUsersRepository();
      households = new InMemoryHouseholdsRepository();
      sessions = new InMemoryRefreshSessionsRepository();

      const moduleFixture: TestingModule = await withFakeInfra(
        Test.createTestingModule({ imports: [AppModule] }),
        createInfraFakes(),
      )
        .overrideProvider(UsersRepository)
        .useValue(users)
        .overrideProvider(HouseholdsRepository)
        .useValue(households)
        .overrideProvider(RefreshSessionsRepository)
        .useValue(sessions)
        .compile();

      app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
      await configureApp(app);
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      await app.close();
    });

    async function register(email: string): Promise<{ token: string; householdId: string }> {
      const response = await request(app.getHttpServer() as App)
        .post('/api/auth/register')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', CSRF_COOKIE)
        .send({ email, password: PASSWORD, displayName: email.split('@')[0] })
        .expect(201);

      const household = households.households.at(-1);
      const token = cookieValue(responseCookies(response), 'access_token');

      if (household === undefined || token === undefined) {
        throw new Error('El registro debería crear un hogar y devolver la sesión');
      }

      return { token, householdId: household._id.toString() };
    }

    async function foreignRead(token: string, householdId: string, path: string): Promise<void> {
      await request(app.getHttpServer() as App)
        .get(`/api/households/${householdId}${path}`)
        .set('Cookie', authedCookies(token))
        .expect(404);
    }

    async function foreignWrite(
      method: 'post' | 'patch' | 'put' | 'delete',
      token: string,
      householdId: string,
      path: string,
      body: Record<string, unknown>,
    ): Promise<void> {
      await request(app.getHttpServer() as App)
        [method](`/api/households/${householdId}${path}`)
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', authedCookies(token))
        .send(body)
        .expect(404);
    }

    it('recipes: otro hogar no puede listar, leer ni modificar recetas', async () => {
      const victim = await register('isolation-recipes-victim@example.com');
      const attacker = await register('isolation-recipes-attacker@example.com');

      await foreignRead(attacker.token, victim.householdId, '/recipes');
      await foreignRead(attacker.token, victim.householdId, `/recipes/${resourceId}`);
      await foreignWrite('patch', attacker.token, victim.householdId, `/recipes/${resourceId}`, {
        title: 'Receta robada',
      });
      await foreignWrite(
        'put',
        attacker.token,
        victim.householdId,
        `/recipes/${resourceId}/image`,
        {
          key: `households/${attackerId}/otra.png`,
        },
      );
    });

    it('pantry: otro hogar no puede leer ni modificar la despensa', async () => {
      const victim = await register('isolation-pantry-victim@example.com');
      const attacker = await register('isolation-pantry-attacker@example.com');

      await foreignRead(attacker.token, victim.householdId, '/pantry');
      await foreignWrite('post', attacker.token, victim.householdId, '/pantry', {
        name: 'Arroz',
        quantity: 1,
        unit: 'kg',
      });
      await foreignWrite('delete', attacker.token, victim.householdId, '/pantry/Arroz', {});
    });

    it('meal-plans: otro hogar no puede leer ni modificar el plan', async () => {
      const victim = await register('isolation-plan-victim@example.com');
      const attacker = await register('isolation-plan-attacker@example.com');

      await foreignRead(attacker.token, victim.householdId, `/meal-plans/${WEEK}`);
      await foreignWrite('put', attacker.token, victim.householdId, `/meal-plans/${WEEK}/slots`, {
        day: 0,
        meal: 'lunch',
        recipeId: resourceId,
        servings: 2,
      });
    });

    it('shopping-lists: otro hogar no puede generar ni tocar la lista', async () => {
      const victim = await register('isolation-shopping-victim@example.com');
      const attacker = await register('isolation-shopping-attacker@example.com');

      await foreignWrite(
        'post',
        attacker.token,
        victim.householdId,
        `/shopping-lists/${WEEK}/generate`,
        {},
      );
      await foreignWrite(
        'patch',
        attacker.token,
        victim.householdId,
        `/shopping-lists/${WEEK}/items/${resourceId}`,
        {
          checked: true,
        },
      );
      await foreignWrite(
        'post',
        attacker.token,
        victim.householdId,
        `/shopping-lists/${WEEK}/items`,
        {
          name: 'Pan',
          quantity: 1,
          unit: 'ud',
        },
      );
    });

    it('imports: otro hogar no puede lanzar importaciones', async () => {
      const victim = await register('isolation-imports-victim@example.com');
      const attacker = await register('isolation-imports-attacker@example.com');

      await foreignWrite('post', attacker.token, victim.householdId, '/imports', {
        url: 'https://recetas.example.com/paella',
      });
    });

    it('media: otro hogar no puede pedir URLs de subida', async () => {
      const victim = await register('isolation-media-victim@example.com');
      const attacker = await register('isolation-media-attacker@example.com');

      await foreignWrite('post', attacker.token, victim.householdId, '/media/upload-url', {
        fileName: 'foto.png',
        contentType: 'image/png',
        size: 1024,
      });
    });
  });

  describe('servicios y repositorios', () => {
    function mediaDouble(): MediaService {
      return {
        signImageUrls: vi.fn().mockResolvedValue({ originalUrl: '', thumbnailUrl: '' }),
        inspectImage: vi.fn(),
        enqueueThumbnail: vi.fn(),
        enqueueImageDeletion: vi.fn(),
      } as unknown as MediaService;
    }

    function publisherDouble(): RealtimePublisher {
      return { publish: vi.fn() } as unknown as RealtimePublisher;
    }

    it('recipes: el servicio no devuelve ni modifica una receta ajena', async () => {
      const repository = new InMemoryRecipesRepository();
      const service = new RecipesService(repository as unknown as RecipesRepository, mediaDouble());
      const recipe = await repository.create({
        householdId: new Types.ObjectId(ownerId),
        createdBy: new Types.ObjectId(ownerId),
        title: 'Paella del hogar A',
        servings: 4,
      });
      const recipeId = recipe._id.toString();

      await expectNotFound(service.findOne(attackerId, recipeId));
      await expectNotFound(service.update(attackerId, recipeId, { title: 'Robada' }));
      await expectNotFound(service.remove(attackerId, recipeId));
      await expect(
        service.list(attackerId, { limit: 10 }).then((page) => page.items),
      ).resolves.toEqual([]);

      expect((await repository.findById(ownerId, recipeId))?.title).toBe('Paella del hogar A');
    });

    it('pantry: el repositorio filtra lecturas, altas y borrados por hogar', async () => {
      const query = mockMongooseQuery<PantryItem[]>([]);
      const deleteQuery = mockMongooseQuery({ deletedCount: 0 });
      const find = vi.fn(() => query);
      const findOneAndUpdate = vi.fn(() => query);
      const deleteOne = vi.fn(() => deleteQuery);
      const model = { find, findOneAndUpdate, deleteOne } as unknown as Model<PantryItem>;
      const repository = new PantryRepository(model);

      await repository.findByHousehold(attackerId);
      await repository.upsert(attackerId, { name: 'Arroz', quantity: 1, unit: 'kg' });
      await repository.remove(attackerId, 'Arroz');

      expect(find).toHaveBeenCalledWith({ householdId: attackerId });
      expect(findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ householdId: attackerId, name: 'arroz' }),
        expect.anything(),
        expect.anything(),
      );
      expect(deleteOne).toHaveBeenCalledWith({ householdId: attackerId, name: 'arroz' });
    });

    it('meal-plans: el servicio no toca el plan de otro hogar ni usa sus recetas', async () => {
      const weekStart = new Date(`${WEEK}T00:00:00.000Z`);
      const plan = {
        _id: new Types.ObjectId(),
        householdId: new Types.ObjectId(ownerId),
        weekStart,
        slots: [],
      };
      const mealPlans = {
        // A propósito devuelve el plan ajeno: el servicio debe desconfiar incluso del repositorio.
        findByWeek: vi.fn(async () => plan),
        upsertEmpty: vi.fn(async (householdId: string) => (householdId === ownerId ? plan : null)),
        replaceSlots: vi.fn(),
      };
      const recipes = { findById: vi.fn().mockResolvedValue(null) };
      const service = new MealPlansService(
        mealPlans as unknown as MealPlansRepository,
        recipes as unknown as RecipesRepository,
        publisherDouble(),
      );

      await expect(
        service.updateSlots(attackerId, weekStart, {
          day: 0,
          meal: 'lunch',
          recipeId: resourceId,
        }),
      ).rejects.toThrow(/no existe/);
      expect(recipes.findById).toHaveBeenCalledWith(attackerId, resourceId);
      expect(mealPlans.replaceSlots).not.toHaveBeenCalled();
    });

    it('shopping-lists: otro hogar no puede marcar ni añadir ítems en la lista ajena', async () => {
      const weekStart = new Date(`${WEEK}T00:00:00.000Z`);
      const itemId = new Types.ObjectId();
      const victimList = {
        _id: new Types.ObjectId(),
        householdId: new Types.ObjectId(ownerId),
        weekStart,
        version: 1,
        items: [
          {
            _id: itemId,
            name: 'Arroz',
            quantity: 1,
            unit: 'kg',
            source: 'plan',
            checked: false,
          },
        ],
      };
      const lists = [victimList];
      const repository = {
        findByWeek: vi.fn(
          async (householdId: string, week: Date) =>
            lists.find(
              (list) =>
                list.householdId.toString() === householdId &&
                list.weekStart.toISOString() === week.toISOString(),
            ) ?? null,
        ),
        updateItem: vi.fn().mockResolvedValue(null),
        addManualItem: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          householdId: new Types.ObjectId(attackerId),
          weekStart,
          version: 1,
          items: [],
        }),
      } as unknown as ShoppingListsRepository;
      const service = new ShoppingListsService(
        repository,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        publisherDouble(),
      );

      await expectNotFound(service.updateItem(attackerId, weekStart, itemId, { checked: true }));
      await service.addManualItem(attackerId, weekStart, {
        name: 'Pan',
        quantity: 1,
        unit: 'kg',
        source: 'manual',
        checked: false,
      });

      expect(victimList.items).toHaveLength(1);
      expect(victimList.items[0]?.checked).toBe(false);
    });

    it('imports: el repositorio y el worker no cruzan hogares', async () => {
      const query = mockMongooseQuery<ImportJob | null>(null);
      const existing = { _id: new Types.ObjectId(resourceId) } as ImportJob;
      const findById = vi.fn(() => query);
      const findOne = vi.fn(() => mockMongooseQuery<ImportJob | null>(existing));
      const findOneAndUpdate = vi.fn(() => query);
      const findByIdAndUpdate = vi.fn(() => query);
      const model = {
        findById,
        findOne,
        findOneAndUpdate,
        findByIdAndUpdate,
        create: vi.fn().mockRejectedValue({ code: 11000 }),
      } as unknown as Model<ImportJob>;
      const repository = new ImportsRepository(model);

      await repository.findById(resourceId);
      await repository.markProcessing(resourceId);
      await repository.markCompleted(resourceId, resourceId);
      await repository.markFailed(resourceId, 'IMPORT_FAILED', 'falló');
      await repository.createOrFind({
        householdId: attackerId,
        createdBy: attackerId,
        url: 'https://recetas.example.com/paella',
        jobId: 'job-otro-hogar',
      });

      // Las cinco consultas deben identificar el documento por hogar, no solo por `_id`.
      expect
        .soft(findById)
        .toHaveBeenCalledWith(
          expect.objectContaining({ _id: resourceId, householdId: attackerId }),
        );
      expect
        .soft(findOneAndUpdate)
        .toHaveBeenCalledWith(
          expect.objectContaining({ _id: resourceId, householdId: attackerId }),
          expect.anything(),
          expect.anything(),
        );
      expect
        .soft(findOne)
        .toHaveBeenCalledWith(
          expect.objectContaining({ jobId: 'job-otro-hogar', householdId: attackerId }),
        );
      expect.soft(findByIdAndUpdate).not.toHaveBeenCalled();

      // El worker recibe el hogar en el trabajo: debe contrastarlo con el del registro.
      const imported = {
        _id: new Types.ObjectId(resourceId),
        householdId: new Types.ObjectId(ownerId),
        createdBy: new Types.ObjectId(ownerId),
        url: 'https://recetas.example.com/paella',
        status: 'pending',
        jobId: 'job-ajeno',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const imports = {
        markProcessing: vi.fn().mockResolvedValue(imported),
        findById: vi.fn().mockResolvedValue(imported),
        markCompleted: vi.fn().mockResolvedValue(imported),
        markFailed: vi.fn().mockResolvedValue(imported),
      };
      const recipes = { create: vi.fn().mockResolvedValue({ _id: new Types.ObjectId() }) };
      const http = {
        get: vi.fn().mockResolvedValue({ body: Buffer.from('<html><body></body></html>') }),
      };
      const publisher = publisherDouble();
      const processor = new ImportsProcessor(
        imports as unknown as ImportsRepository,
        recipes as unknown as RecipesRepository,
        http as unknown as SafeHttpClient,
        publisher,
      );

      let rejectedCrossHousehold = false;

      try {
        await processor.process({
          data: { importId: resourceId, householdId: attackerId, url: imported.url },
          attemptsMade: 0,
          opts: { attempts: 1 },
        } as unknown as Job<never>);
      } catch (error) {
        rejectedCrossHousehold = /otro hogar/.test((error as Error).message);
      }

      expect.soft(rejectedCrossHousehold).toBe(true);
      expect.soft(recipes.create).not.toHaveBeenCalled();
    });

    it('media: el worker rechaza una clave que no pertenece al hogar del trabajo', async () => {
      const original = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#ffffff' },
      })
        .png()
        .toBuffer();
      const send = vi.fn().mockResolvedValueOnce({
        Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(original)) },
      });
      const processor = new MediaProcessor(
        { send } as unknown as S3Client,
        { bucket: 'recipes-test' } as StorageConfig,
      );

      await expect(
        processor.process({
          name: THUMBNAIL_JOB,
          data: {
            householdId: attackerId,
            recipeId: resourceId,
            key: `households/${ownerId}/receta.png`,
          },
        } as unknown as Job<MediaJobData>),
      ).rejects.toThrow(/otro hogar/);
      expect(send).not.toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });
  });
});
