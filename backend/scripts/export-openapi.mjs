import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { getConnectionToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppModule } from '../dist/app.module.js';
import { IMPORTS_QUEUE_NAME } from '../dist/imports/imports.queue.js';
import { MEDIA_QUEUE_NAME } from '../dist/media/media.queue.js';
import { REDIS_CLIENT } from '../dist/redis/redis.module.js';
import { S3_CLIENT } from '../dist/storage/storage.module.js';

function createInfraFakes() {
  const models = {};
  return {
    mongo: {
      readyState: 1,
      models,
      model: (name) => (models[name] ??= { modelName: name }),
      db: { command: async () => ({ ok: 1 }) },
      close: async () => {},
    },
    redis: {
      status: 'ready',
      ping: async () => 'PONG',
      quit: async () => 'OK',
      disconnect: () => {},
    },
    storage: { send: async () => ({}) },
    mediaQueue: { add: async () => ({ id: 'test-job' }) },
    importsQueue: { add: async () => ({ id: 'test-job' }) },
  };
}

function withFakeInfra(builder, fakes) {
  return builder
    .overrideProvider(getConnectionToken())
    .useValue(fakes.mongo)
    .overrideProvider(REDIS_CLIENT)
    .useValue(fakes.redis)
    .overrideProvider(S3_CLIENT)
    .useValue(fakes.storage)
    .overrideProvider(getQueueToken(MEDIA_QUEUE_NAME))
    .useValue(fakes.mediaQueue)
    .overrideProvider(getQueueToken(IMPORTS_QUEUE_NAME))
    .useValue(fakes.importsQueue);
}

const testEnvironment = {
  MONGO_URL: 'mongodb://localhost:27017/recipes-test?replicaSet=rs0',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'recipes-test',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
  JWT_ACCESS_SECRET: 'test-access-secret-with-32-characters-minimum',
  JWT_REFRESH_SECRET: 'test-refresh-secret-with-32-characters-minimum',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Recipe Planner <no-reply@recipe-planner.test>',
  APP_ENV: 'test',
  LOG_LEVEL: 'error',
  FRONTEND_URL: 'http://localhost:3001',
  API_INTERNAL_URL: 'http://localhost:3000',
};

for (const [name, value] of Object.entries(testEnvironment)) {
  if (process.env[name] === undefined || process.env[name] === '') {
    process.env[name] = value;
  }
}

async function main() {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.APP_ENV = process.env.APP_ENV ?? 'test';

  const fakes = createInfraFakes();
  const moduleFixture = await withFakeInfra(
    Test.createTestingModule({ imports: [AppModule] }),
    fakes,
  ).compile();

  const app = moduleFixture.createNestApplication(new FastifyAdapter(), {
    logger: false,
  });

  // Solo se necesita la app inicializada para que Swagger pueda inspeccionar los metadatos.
  await app.init();

  const documentBuilder = new DocumentBuilder()
    .setTitle('Recipe Planner API')
    .setDescription('API para el planificador de recetas')
    .setVersion('1.0')
    .addServer(process.env.PUBLIC_URL ?? 'http://localhost:3000', 'Servidor de la API')
    .addSecurity('cookie', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
    })
    .addSecurity('bearer', {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    .addSecurityRequirements('cookie')
    .addSecurityRequirements('bearer')
    .addTag('auth', 'Autenticación y sesiones')
    .addTag('households', 'Gestión de hogares')
    .addTag('recipes', 'Recetas y planes')
    .addTag('shopping', 'Listas de la compra')
    .addTag('imports', 'Importaciones')
    .addTag('media', 'Media y thumbnails')
    .addTag('health', 'Health checks')
    .build();

  const document = SwaggerModule.createDocument(app, documentBuilder);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outputPath = path.resolve(scriptDir, '../../packages/contracts/openapi.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2) + '\n');
  console.log(`OpenAPI document exported to ${outputPath}`);

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
