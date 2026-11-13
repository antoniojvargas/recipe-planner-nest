import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { createInfraFakes, withFakeInfra, type InfraFakes } from './fake-infra.js';

/** Crea la app real con Mongo, Redis y S3 sustituidos por dobles. */
export async function createTestApp(
  fakes: InfraFakes = createInfraFakes(),
): Promise<NestFastifyApplication> {
  const moduleRef = await withFakeInfra(
    Test.createTestingModule({ imports: [AppModule] }),
    fakes,
  ).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}
