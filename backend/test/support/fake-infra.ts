import { getConnectionToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { IMPORTS_QUEUE_NAME } from '../../src/imports/imports.queue.js';
import { MEDIA_QUEUE_NAME } from '../../src/media/media.queue.js';
import { REDIS_CLIENT } from '../../src/redis/redis.module.js';
import { S3_CLIENT } from '../../src/storage/storage.module.js';

export interface InfraFakes {
  mongo: {
    readyState: number;
    models: Record<string, unknown>;
    model: (name: string) => unknown;
    db: { command: ReturnType<typeof vi.fn> };
    close: ReturnType<typeof vi.fn>;
  };
  redis: {
    status: string;
    ping: () => Promise<unknown>;
    quit: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  storage: { send: (command: unknown) => Promise<unknown> };
  mediaQueue: { add: ReturnType<typeof vi.fn> };
  importsQueue: { add: ReturnType<typeof vi.fn> };
}

interface FakeOptions {
  mongoReadyState?: number;
  ping?: () => Promise<unknown>;
  send?: (command: unknown) => Promise<unknown>;
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
  // `MongooseModule.forFeature` resuelve el modelo contra la conexión al instanciar el
  // provider. Los modelos falsos bastan para los e2e que no consultan; los que sí lo hacen
  // usan la base de datos de test real.
  const models: Record<string, unknown> = {};

  return {
    mongo: {
      readyState: mongoReadyState,
      models,
      model: (name: string) => (models[name] ??= { modelName: name }),
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
    mediaQueue: { add: vi.fn().mockResolvedValue({ id: 'test-job' }) },
    importsQueue: { add: vi.fn().mockResolvedValue({ id: 'test-job' }) },
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
    .useValue(fakes.storage)
    .overrideProvider(getQueueToken(MEDIA_QUEUE_NAME))
    .useValue(fakes.mediaQueue)
    .overrideProvider(getQueueToken(IMPORTS_QUEUE_NAME))
    .useValue(fakes.importsQueue);
}
