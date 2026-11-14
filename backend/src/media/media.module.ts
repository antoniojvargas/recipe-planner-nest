import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

/**
 * URLs prefirmadas de MinIO, confirmación de subidas y generación de miniaturas.
 *
 * El cliente de S3 llega del `StorageModule` global; aquí solo se firma.
 */
@Module({
  imports: [HouseholdsModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
