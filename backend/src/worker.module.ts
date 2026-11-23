import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { appConfig, databaseConfig, type AppConfig, type DatabaseConfig } from './config/index.js';
import { configModule } from './config/config.module.js';
import { createLoggerOptions } from './config/logger.config.js';
import { DatabaseModule } from './database/database.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { ImportsProcessor } from './imports/imports.processor.js';
import { SafeHttpClient } from './imports/safe-http.client.js';
import { MEDIA_QUEUE_NAME } from './media/media.queue.js';
import { MediaProcessor } from './media/media.processor.js';
import { bullMqConnection } from './queues/bullmq.connection.js';
import { WorkersShutdown } from './queues/workers-shutdown.js';
import { RealtimePublisherModule } from './realtime/realtime-publisher.module.js';
import { RecipesModule } from './recipes/recipes.module.js';
import { RedisModule } from './redis/redis.module.js';
import { ShutdownModule } from './shutdown/shutdown.module.js';
import { StorageModule } from './storage/storage.module.js';

/**
 * Proceso de trabajos en segundo plano.
 *
 * No levanta HTTP: solo carga configuración, logging, Mongo, Redis, storage y las colas, y
 * deja que `@nestjs/bullmq` arranque un `Worker` por cada `@Processor`. Es el mismo código que
 * la API, desplegado con `node dist/worker.js`.
 *
 * `RealtimePublisherModule` se importa para que los trabajos publiquen por el emisor de Redis:
 * aquí no hay gateway y el evento tiene que llegar a los sockets que viven en las réplicas de
 * la API.
 */
@Module({
  imports: [
    configModule,
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => createLoggerOptions(config),
    }),
    ShutdownModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
    BullModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: DatabaseConfig) => ({
        connection: bullMqConnection(config.redisUrl),
      }),
    }),
    BullModule.registerQueue({ name: MEDIA_QUEUE_NAME }),
    ImportsModule,
    RecipesModule,
    RealtimePublisherModule,
  ],
  providers: [MediaProcessor, ImportsProcessor, SafeHttpClient, WorkersShutdown],
})
export class WorkerModule {}
