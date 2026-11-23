import 'reflect-metadata';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Public } from './../src/auth/decorators/public.decorator.js';
import { CADDY_NETWORK_CIDR, trustProxyOptions } from './../src/config/trust-proxy.js';
import { withFakeInfra } from './support/fake-infra.js';

/** IP del contenedor de Caddy dentro del bridge de compose (172.16.0.0/12). */
const CADDY_IP = '172.18.0.2';

/** Clientes de prueba (TEST-NET, RFC 5737). */
const CLIENT_A = '198.51.100.10';
const CLIENT_B = '198.51.100.11';
const CLIENT_C = '198.51.100.12';

/** Par externo: su `X-Forwarded-For` tiene que ignorarse. */
const OUTSIDER_IP = '8.8.8.8';

const LIMIT = 2;

@Public()
@Controller('probe')
class ThrottleProbeController {
  @Get('ip')
  readIp(@Req() request: FastifyRequest): { ip: string } {
    return { ip: request.ip };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: LIMIT, ttl: 60 } })
  @Get('limited')
  limited(): { ok: boolean } {
    return { ok: true };
  }
}

describe('Fastify trustProxy: el throttler usa la IP real (e2e)', () => {
  let app: NestFastifyApplication;
  let fastify: FastifyInstance;
  let previousTrustProxy: string | undefined;

  const hit = (remoteAddress: string, clientIp?: string) =>
    fastify.inject({
      method: 'GET',
      url: '/api/probe/limited',
      remoteAddress,
      headers: clientIp === undefined ? {} : { 'x-forwarded-for': clientIp },
    });

  beforeAll(async () => {
    previousTrustProxy = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = CADDY_NETWORK_CIDR;

    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({
        imports: [AppModule, ThrottlerModule.forRoot({ throttlers: [{ limit: LIMIT, ttl: 60 }] })],
        controllers: [ThrottleProbeController],
      }),
    ).compile();

    // Mismo adaptador que la API real: la IP que ve el throttler sale de aquí.
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ ...trustProxyOptions(), bodyLimit: 1_048_576 }),
    );
    await configureApp(app);
    await app.init();
    fastify = app.getHttpAdapter().getInstance();
    await fastify.ready();
  });

  afterAll(async () => {
    await app.close();

    if (previousTrustProxy === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = previousTrustProxy;
    }
  });

  it('toma la IP de X-Forwarded-For solo cuando el par es Caddy', async () => {
    const behindCaddy = await fastify.inject({
      method: 'GET',
      url: '/api/probe/ip',
      remoteAddress: CADDY_IP,
      headers: { 'x-forwarded-for': CLIENT_A },
    });
    expect(behindCaddy.json()).toEqual({ ip: CLIENT_A });

    const direct = await fastify.inject({
      method: 'GET',
      url: '/api/probe/ip',
      remoteAddress: OUTSIDER_IP,
      headers: { 'x-forwarded-for': CLIENT_A },
    });
    expect(direct.json()).toEqual({ ip: OUTSIDER_IP });
  });

  it('limita por la IP real y da cupo distinto a cada cliente detrás de Caddy', async () => {
    // CLIENT_A agota su cupo: las dos primeras pasan, la tercera devuelve 429.
    expect((await hit(CADDY_IP, CLIENT_A)).statusCode).toBe(200);
    expect((await hit(CADDY_IP, CLIENT_A)).statusCode).toBe(200);

    const blocked = await hit(CADDY_IP, CLIENT_A);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // CLIENT_B no comparte contador aunque llegue por el mismo Caddy.
    expect((await hit(CADDY_IP, CLIENT_B)).statusCode).toBe(200);
  });

  it('no deja falsificar la IP: un par externo no comparte el cupo del cliente', async () => {
    // El par externo cuenta por 8.8.8.8 aunque diga ser CLIENT_C.
    expect((await hit(OUTSIDER_IP, CLIENT_C)).statusCode).toBe(200);
    expect((await hit(OUTSIDER_IP, CLIENT_C)).statusCode).toBe(200);
    expect((await hit(OUTSIDER_IP, CLIENT_C)).statusCode).toBe(429);

    // El cupo de CLIENT_C sigue intacto: el X-Forwarded-For del exterior se ignoró.
    expect((await hit(CADDY_IP, CLIENT_C)).statusCode).toBe(200);
  });
});
