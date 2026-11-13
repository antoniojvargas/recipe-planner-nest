import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import {
  exposeRequestId,
  requestIdAdapterOptions,
  REQUEST_ID_HEADER,
} from './../src/config/request-id.js';
import { withFakeInfra } from './support/fake-infra.js';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({ imports: [AppModule] }),
    ).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(requestIdAdapterOptions()),
    );
    exposeRequestId(app);
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer() as App)
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('reutiliza y devuelve el X-Request-Id', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api')
      .set(REQUEST_ID_HEADER, 'e2e-request-id')
      .expect(200);

    expect(response.headers[REQUEST_ID_HEADER]).toBe('e2e-request-id');
  });

  it('genera un X-Request-Id cuando no llega en la petición', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api')
      .expect(200);

    expect(response.headers[REQUEST_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  afterEach(async () => {
    await app.close();
  });
});
