import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import {
  exposeRequestId,
  requestIdAdapterOptions,
  REQUEST_ID_HEADER,
} from './../src/config/request-id.js';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(requestIdAdapterOptions()),
    );
    exposeRequestId(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer() as App)
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('reutiliza y devuelve el X-Request-Id', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/')
      .set(REQUEST_ID_HEADER, 'e2e-request-id')
      .expect(200);

    expect(response.headers[REQUEST_ID_HEADER]).toBe('e2e-request-id');
  });

  it('genera un X-Request-Id cuando no llega en la petición', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/')
      .expect(200);

    expect(response.headers[REQUEST_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  afterEach(async () => {
    await app.close();
  });
});
