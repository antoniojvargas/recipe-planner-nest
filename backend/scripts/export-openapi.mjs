import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exportEnvironment = {
  MONGO_URL: 'mongodb://localhost:27017/recipes-export?replicaSet=rs0',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'recipes-export',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
  JWT_ACCESS_SECRET: 'test-access-secret-with-32-characters-minimum',
  JWT_REFRESH_SECRET: 'test-refresh-secret-with-32-characters-minimum',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Recipe Planner <no-reply@recipe-planner.test>',
  APP_ENV: 'development',
  LOG_LEVEL: 'error',
  FRONTEND_URL: 'http://localhost:3001',
  API_INTERNAL_URL: 'http://localhost:3000',
};

for (const [name, value] of Object.entries(exportEnvironment)) {
  if (process.env[name] === undefined || process.env[name] === '') {
    process.env[name] = value;
  }
}

process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';
process.env.APP_ENV = process.env.APP_ENV ?? 'development';

function createInfraFakes() {
  const models = {};
  return {
    mongo: {
      readyState: 1,
      models,
      model: (name) => (models[name] ??= { modelName: name }),
      db: { command: async () => ({ ok: 1 }) },
      close: async () => {
        /* noop */
      },
    },
    redis: {
      status: 'ready',
      ping: async () => 'PONG',
      quit: async () => 'OK',
      disconnect: () => {
        /* noop */
      },
    },
    storage: { send: async () => ({}) },
    mediaQueue: { add: async () => ({ id: 'test-job' }) },
    importsQueue: { add: async () => ({ id: 'test-job' }) },
  };
}

function withFakeInfra(builder, fakes, tokens) {
  const {
    getConnectionToken,
    REDIS_CLIENT,
    S3_CLIENT,
    getQueueToken,
    MEDIA_QUEUE_NAME,
    IMPORTS_QUEUE_NAME,
  } = tokens;
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

async function main() {
  const [{ Test }, { FastifyAdapter }, { DocumentBuilder, SwaggerModule }, mongoose, bullmq] =
    await Promise.all([
      import('@nestjs/testing'),
      import('@nestjs/platform-fastify'),
      import('@nestjs/swagger'),
      import('@nestjs/mongoose'),
      import('@nestjs/bullmq'),
    ]);

  const [
    { AppModule },
    { REDIS_CLIENT },
    { S3_CLIENT },
    { IMPORTS_QUEUE_NAME },
    { MEDIA_QUEUE_NAME },
    { configureApp },
  ] = await Promise.all([
    import('../dist/app.module.js'),
    import('../dist/redis/redis.module.js'),
    import('../dist/storage/storage.module.js'),
    import('../dist/imports/imports.queue.js'),
    import('../dist/media/media.queue.js'),
    import('../dist/app.setup.js'),
  ]);

  const fakes = createInfraFakes();
  const moduleFixture = await withFakeInfra(
    Test.createTestingModule({ imports: [AppModule] }),
    fakes,
    {
      getConnectionToken: mongoose.getConnectionToken,
      REDIS_CLIENT,
      S3_CLIENT,
      getQueueToken: bullmq.getQueueToken,
      MEDIA_QUEUE_NAME,
      IMPORTS_QUEUE_NAME,
    },
  ).compile();

  const app = moduleFixture.createNestApplication(new FastifyAdapter(), {
    logger: false,
  });

  // Aplica el prefijo global `/api` y la configuración HTTP compartida para que el documento
  // OpenAPI refleje las rutas reales expuestas por la API.
  await configureApp(app);
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

  const prettierBin = path.resolve(scriptDir, '../../node_modules/.bin/prettier');
  if (existsSync(prettierBin)) {
    execFileSync(prettierBin, ['--write', outputPath], { stdio: 'inherit' });
  } else {
    execFileSync('npx', ['--no-install', 'prettier', '--write', outputPath], {
      cwd: path.resolve(scriptDir, '../..'),
      stdio: 'inherit',
    });
  }

  console.log(`OpenAPI document exported to ${outputPath}`);

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
