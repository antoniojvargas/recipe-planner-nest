import 'reflect-metadata';
import { Controller, Get, Req, Res } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { withFakeInfra } from './support/fake-infra.js';

const FRONTEND_ORIGIN = process.env.FRONTEND_URL ?? 'http://localhost:3001';

/** Controlador de prueba para comprobar los plugins HTTP sin depender de rutas de dominio. */
@Controller('probe')
class HttpProbeController {
  @Get('cookies')
  readCookies(@Req() request: FastifyRequest): Record<string, string> {
    return request.cookies as Record<string, string>;
  }

  @Get('set-cookie')
  writeCookie(@Res({ passthrough: true }) reply: FastifyReply): { ok: boolean } {
    reply.setCookie('session', 'abc123', { httpOnly: true, sameSite: 'lax', path: '/' });

    return { ok: true };
  }
}

describe('HTTP: CORS, cabeceras y cookies (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({
        imports: [AppModule],
        controllers: [HttpProbeController],
      }),
    ).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('CORS', () => {
    it('solo permite el origen de FRONTEND_URL y envía credenciales', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/probe/cookies')
        .set('Origin', FRONTEND_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(FRONTEND_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('no devuelve cabeceras CORS para otro origen', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/probe/cookies')
        .set('Origin', 'https://evil.example')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('responde el preflight con los métodos y cabeceras permitidos', async () => {
      const response = await request(app.getHttpServer() as App)
        .options('/api/probe/cookies')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(FRONTEND_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers'].toLowerCase()).toContain(
        'content-type',
      );
      expect(response.headers['access-control-max-age']).toBe('43200');
    });
  });

  describe('Helmet', () => {
    it('aplica una CSP que no permite cargar nada', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];

      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("form-action 'none'");
      expect(csp).not.toContain("'self'");
    });

    it('añade las cabeceras de seguridad de Helmet', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
    });
  });

  describe('cookies', () => {
    it('parsea las cookies entrantes', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/probe/cookies')
        .set('Cookie', 'a=1; b=2')
        .expect(200);

      expect(response.body).toEqual({ a: '1', b: '2' });
    });

    it('permite escribir cookies httpOnly', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/probe/set-cookie')
        .expect(200);

      const setCookie = response.headers['set-cookie'] as unknown as string[];

      expect(setCookie[0]).toContain('session=abc123');
      expect(setCookie[0]).toContain('Path=/');
      expect(setCookie[0]).toContain('HttpOnly');
      expect(setCookie[0]).toContain('SameSite=Lax');
    });
  });
});
