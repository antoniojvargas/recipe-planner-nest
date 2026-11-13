import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createInfraFakes } from './support/fake-infra.js';
import { createTestApp } from './support/test-app.js';

interface HealthBody {
  status: string;
  info: Record<string, { status: string }>;
  error: Record<string, { status: string; message?: string }>;
  details: Record<string, { status: string; message?: string }>;
}

describe('GET /api/health (e2e)', () => {
  let app: NestFastifyApplication;

  afterEach(async () => {
    await app.close();
  });

  it('responde 200 cuando Mongo, Redis y el almacenamiento están disponibles', async () => {
    app = await createTestApp();

    const response = await request(app.getHttpServer() as App)
      .get('/api/health')
      .expect(200);
    const body = response.body as HealthBody;

    expect(body.status).toBe('ok');
    expect(body.info).toMatchObject({
      mongo: { status: 'up' },
      redis: { status: 'up' },
      storage: { status: 'up' },
    });
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('responde 503 con el detalle cuando una dependencia está caída', async () => {
    app = await createTestApp(
      createInfraFakes({ ping: () => Promise.reject(new Error('Connection is closed.')) }),
    );

    const response = await request(app.getHttpServer() as App)
      .get('/api/health')
      .expect(503);
    const body = response.body as HealthBody;

    expect(body.status).toBe('error');
    expect(body.error.redis).toMatchObject({
      status: 'down',
      message: 'Connection is closed.',
    });
    expect(body.details.mongo.status).toBe('up');
    expect(body.details.storage.status).toBe('up');
  });

  it('responde 503 cuando una dependencia supera el timeout de 2 s', async () => {
    app = await createTestApp(createInfraFakes({ ping: () => new Promise(() => undefined) }));

    const startedAt = Date.now();
    const response = await request(app.getHttpServer() as App)
      .get('/api/health')
      .expect(503);
    const body = response.body as HealthBody;

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(2_000);
    expect(body.error.redis).toMatchObject({
      status: 'down',
      message: 'timeout of 2000ms exceeded',
    });
  });

  it('responde 503 cuando Mongo no está conectado', async () => {
    app = await createTestApp(createInfraFakes({ mongoReadyState: 0 }));

    const response = await request(app.getHttpServer() as App)
      .get('/api/health')
      .expect(503);
    const body = response.body as HealthBody;

    expect(body.error.mongo.status).toBe('down');
  });
});
