import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { databaseConfig, type DatabaseConfig } from '../config/index.js';

/** Token del cliente compartido de Redis. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export type RedisClient = Redis;

const logger = new Logger('Redis');

/**
 * Cierra el cliente al apagar la app. `quit` espera a que se vacíen las respuestas
 * pendientes; si la conexión ya está caída, `disconnect` corta los reintentos.
 */
@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

/**
 * Cliente de Redis compartido (caché, colas, throttler y health check).
 *
 * - `lazyConnect` + `connect()` explícito: la conexión se abre en segundo plano sin bloquear
 *   el arranque.
 * - `enableOfflineQueue: false`: un comando con Redis caído falla al instante en lugar de
 *   esperar en una cola, que es justo lo que el health check necesita para responder 503.
 * - `retryStrategy` reintenta con un backoff acotado para que la API se recupere sola.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [databaseConfig.KEY],
      useFactory: (config: DatabaseConfig) => {
        const client = new Redis(config.redisUrl, {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          retryStrategy: (attempt: number) => Math.min(attempt * 500, 5_000),
        });

        // Sin listener, ioredis emite `error` sin manejar y tumba el proceso.
        client.on('error', (error: Error) => {
          logger.error(`Error de conexión con Redis: ${error.message}`);
        });

        void client.connect().catch(() => {
          // El reintento lo gestiona `retryStrategy`; el health check informa del estado.
        });

        return client;
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
