import { getConnectionToken } from '@nestjs/mongoose';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { REDIS_CLIENT } from '../../src/redis/redis.module.js';
import { S3_CLIENT } from '../../src/storage/storage.module.js';

export interface InfraFakes {
  mongo: {
    readyState: number;
    db: { command: ReturnType<typeof vi.fn> };
    close: ReturnType<typeof vi.fn>;
  };
  redis: {
    status: string;
    ping: () => Promise<unknown>;
    quit: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  storage: { send: () => Promise<unknown> };
}

interface FakeOptions {
  mongoReadyState?: number;
  ping?: () => Promise<unknown>;
  send?: () => Promise<unknown>;
}

/**
 * Sustituye Mongo, Redis y S3 por dobles para los e2e que no prueban esas dependencias.
 *
 * Sin esto, cada `Test.createTestingModule({ imports: [AppModule] })` abriría una conexión
 * real, alargaría el test con el timeout de selección de servidor y dejaría reintentos vivos.
 */
export function createInfraFakes({
  mongoReadyState = 1,
  ping = () => Promise.resolve('PONG'),
  send = () => Promise.resolve({}),
}: FakeOptions = {}): InfraFakes {
  return {
    mongo: {
      readyState: mongoReadyState,
      db: { command: vi.fn().mockResolvedValue({ ok: 1 }) },
      close: vi.fn().mockResolvedValue(undefined),
    },
    redis: {
      status: 'ready',
      ping,
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn(),
    },
    storage: { send },
  };
}

/** Aplica los dobles de infraestructura a un builder de testing. */
export function withFakeInfra(
  builder: TestingModuleBuilder,
  fakes: InfraFakes = createInfraFakes(),
): TestingModuleBuilder {
  return builder
    .overrideProvider(getConnectionToken())
    .useValue(fakes.mongo)
    .overrideProvider(REDIS_CLIENT)
    .useValue(fakes.redis)
    .overrideProvider(S3_CLIENT)
    .useValue(fakes.storage);
}
