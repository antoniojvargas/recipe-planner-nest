import { test, expect, describe, beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb';
import { createContainer, type StartedTestContainer } from 'testcontainers';
import { AppModule } from '../src/app.module.js';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { configurationModule } from '../src/config/config.module.js';
import { validateEnvironment } from '../src/config/env.validation.js';
import 'reflect-metadata';

let mongoContainer: MongoMemoryServer | null = null;
let redisContainer: StartedTestContainer | null = null;
let app: NestFastifyApplication;

/**
 * Obtiene la URL de Mongo basándose en la variable de entorno.
 * Si TESTCONTAINERS_MONGO está definido, usa Testcontainers; si no, usa MongoMemoryServer.
 */
async function getMongoUrl(): Promise<string> {
  if (process.env.TESTCONTAINERS_MONGO) {
    // Usar Testcontainers con MongoDB
    if (!redisContainer) {
      redisContainer = await new 
        new startedTestContainer('mongo:7').start();
    }
    // Note: Esto es un ejemplo; en la práctica se usaría el contenedor de mongo-test
    // desde docker-compose.test.yml
    return `mongodb://localhost:27017/recipes-test?replicaSet=rs0`;
  }
  
  // Usar MongoMemoryServer para tests rápidos sin Docker
  if (!mongoContainer) {
    mongoContainer = new MongoMemoryServer({
      dbName: 'recipes-test',
    });
    await mongoContainer.start();
  }
  
  return mongoContainer.getUri();
}

/**
 * Obtiene la URL de Redis basándose en la variable de entorno.
 * Si TESTCONTAINERS_REDIS está definido, usa Testcontainers/docker-compose; 
 * si no, usa redis://localhost:6379.
 */
async function getRedisUrl(): Promise<string> {
  if (process.env.TESTCONTAINERS_REDIS) {
    // Usar Testcontainers con Redis
    if (!redisContainer) {
      redisContainer = await new 
        new startedTestContainer('redis:7-alpine').start();
    }
    const host = redisContainer.getHost();
    const port = redisContainer.getMappedPort(6379);
    return `redis://${host}:${port}`;
  }
  
  // Usar Redis local para tests rápidos
  return 'redis://localhost:6379';
}

/**
 * Configura la aplicación Nest para tests de integración.
 * Usa las URLs de Mongo y Redis según la configuración de entorno.
 */
export async function setupIntegrationApp(): Promise<{
  app: NestFastifyApplication;
  mongoUrl: string;
  redisUrl: string;
}> {
  const [mongoUrl, redisUrl] = await Promise.all([
    getMongoUrl(),
    getRedisUrl(),
  ]);

  // Establecer variables de entorno para que la app las lea
  process.env.MONGO_URL = mongoUrl;
  process.env.REDIS_URL = redisUrl;

  const moduleRef = await NestFactory.createTestingModule({
    imports: [AppModule],
  }).compile();

  const fastifyAdapter = new FastifyAdapter();
  app = moduleRef.createNestApplication<NestFastifyApplication>(fastifyAdapter);
  
  await configureApp(app);
  await app.init();

  return { app, mongoUrl, redisUrl };
}

/**
 * Detiene los contenedores y instancias de Mongo/Redis después de los tests.
 */
export async function teardownIntegrationApp(): Promise<void> {
  if (mongoContainer) {
    await mongoContainer.stop();
    mongoContainer = null;
  }
  
  if (redisContainer) {
    await redisContainer.stop();
    redisContainer = null;
  }
  
  if (app) {
    await app.close();
    app = null;
  }
}

/**
 * Obtiene el puerto disponible para los tests, respetando la configuración de workers de Vitest.
 * Cada worker ejecuta en un proceso separado, por lo que cada uno necesita su propio puerto.
 */
export function getTestPort(): number {
  // Vitest asigna un número de worker al entorno
  const workerIndex = (global as any).VITEST_WORKER_INDEX ?? 0;
  // Puerto base 3000 + índice del worker para evitar conflictos
  return 3000 + workerIndex;
}

export default {
  setupIntegrationApp,
  teardownIntegrationApp,
  getTestPort,
};