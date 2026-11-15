import type { AddressInfo } from 'node:net';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ERROR_CODES } from '@recipe-planner/contracts';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuthTokensService } from '../src/auth/auth-tokens.service.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import { withFakeInfra } from './support/fake-infra.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';

const ALLOWED_ORIGIN = 'http://localhost:3001';

interface ConnectResult {
  connected: boolean;
  code?: string;
}

/**
 * Handshake real contra la app completa: el gateway, el middleware del namespace y el
 * verificador de tokens son los de producción; solo Mongo, Redis y S3 están doblados.
 * `HouseholdsRepository` se dobla porque el gateway consulta los hogares al conectar y el
 * modelo falso no sabe consultar.
 */
describe('Gateway /realtime (e2e)', () => {
  let app: NestFastifyApplication;
  let url: string;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture = await withFakeInfra(Test.createTestingModule({ imports: [AppModule] }))
      .overrideProvider(HouseholdsRepository)
      .useValue(new InMemoryHouseholdsRepository())
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${String(address.port)}`;
    accessToken = await app.get(AuthTokensService).createAccessToken('user-1', 'family-1');
  });

  afterAll(async () => {
    await app.close();
  });

  async function connect(headers: Record<string, string>): Promise<ConnectResult> {
    return new Promise((resolve) => {
      const client: Socket = io(`${url}/realtime`, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: headers,
      });

      const timer = setTimeout(() => {
        client.close();
        resolve({ connected: false, code: 'TIMEOUT' });
      }, 2_000);

      client.on('connect', () => {
        clearTimeout(timer);
        client.close();
        resolve({ connected: true });
      });
      client.on('connect_error', (error: Error & { data?: { code?: string } }) => {
        clearTimeout(timer);
        client.close();
        resolve({ connected: false, code: error.data?.code });
      });
    });
  }

  it('conecta con la cookie access_token y el Origin de FRONTEND_URL', async () => {
    await expect(
      connect({ origin: ALLOWED_ORIGIN, cookie: `theme=dark; access_token=${accessToken}` }),
    ).resolves.toEqual({ connected: true });
  });

  it('rechaza con UNAUTHORIZED un Origin distinto', async () => {
    await expect(
      connect({ origin: 'http://evil.example', cookie: `access_token=${accessToken}` }),
    ).resolves.toEqual({ connected: false, code: ERROR_CODES.UNAUTHORIZED });
  });

  it('rechaza con UNAUTHORIZED un handshake sin cookie', async () => {
    await expect(connect({ origin: ALLOWED_ORIGIN })).resolves.toEqual({
      connected: false,
      code: ERROR_CODES.UNAUTHORIZED,
    });
  });

  it('rechaza con UNAUTHORIZED un token que no verifica', async () => {
    await expect(
      connect({ origin: ALLOWED_ORIGIN, cookie: 'access_token=no-es-un-jwt' }),
    ).resolves.toEqual({ connected: false, code: ERROR_CODES.UNAUTHORIZED });
  });
});
