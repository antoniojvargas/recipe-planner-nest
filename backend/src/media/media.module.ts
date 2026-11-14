import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HouseholdsModule } from '../households/households.module.js';
import { MediaController } from './media.controller.js';
import { MEDIA_QUEUE_NAME } from './media.queue.js';
import { MediaService } from './media.service.js';

/**
 * URLs prefirmadas de MinIO, confirmación de subidas y encolado de miniaturas.
 *
 * El cliente de S3 llega del `StorageModule` global; el procesador de las miniaturas vive en
 * `WorkerModule`, para que solo el proceso `worker` las genere.
 */
@Module({
  imports: [HouseholdsModule, BullModule.registerQueue({ name: MEDIA_QUEUE_NAME })],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
