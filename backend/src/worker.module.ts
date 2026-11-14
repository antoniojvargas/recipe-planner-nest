import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { appConfig, databaseConfig, type AppConfig, type DatabaseConfig } from './config/index.js';
import { configModule } from './config/config.module.js';
import { createLoggerOptions } from './config/logger.config.js';
import { MEDIA_QUEUE_NAME } from './media/media.queue.js';
import { ThumbnailProcessor } from './media/thumbnail.processor.js';
import { bullMqConnection } from './queues/bullmq.connection.js';
import { StorageModule } from './storage/storage.module.js';

/**
 * Proceso de trabajos en segundo plano.
 *
 * No levanta HTTP: solo carga configuración, logging, storage y la cola de medios, y deja que
 * `@nestjs/bullmq` arranque un `Worker` por cada `@Processor`. Es el mismo código que la API,
 * desplegado con `node dist/worker.js`.
 */
@Module({
  imports: [
    configModule,
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => createLoggerOptions(config),
    }),
    StorageModule,
    BullModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: DatabaseConfig) => ({
        connection: bullMqConnection(config.redisUrl),
      }),
    }),
    BullModule.registerQueue({ name: MEDIA_QUEUE_NAME }),
  ],
  providers: [ThumbnailProcessor],
})
export class WorkerModule {}
