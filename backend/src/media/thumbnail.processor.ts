import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import { storageConfig, type StorageConfig } from '../config/index.js';
import { S3_CLIENT } from '../storage/storage.module.js';
import {
  MEDIA_QUEUE_NAME,
  THUMBNAIL_JOB,
  THUMBNAIL_WIDTHS,
  thumbnailKey,
  type ThumbnailJobData,
} from './media.queue.js';

/**
 * Genera las variantes WebP de una imagen de receta.
 *
 * Corre en el proceso `worker`, no en la API: descargar, redimensionar y volver a subir una
 * imagen no debe ocupar el bucle que atiende peticiones. El trabajo es idempotente (sobrescribe
 * las mismas claves), así que un reintento tras un fallo parcial no deja objetos duplicados.
 */
@Processor(MEDIA_QUEUE_NAME)
export class ThumbnailProcessor extends WorkerHost {
  private readonly logger = new Logger(ThumbnailProcessor.name);

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(storageConfig.KEY) private readonly config: StorageConfig,
  ) {
    super();
  }

  async process(job: Job<ThumbnailJobData>): Promise<void> {
    if (job.name !== THUMBNAIL_JOB) {
      return;
    }

    const { key } = job.data;
    const object = await this.s3.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    const body = object.Body;

    if (body === undefined) {
      throw new Error(`La imagen ${key} no tiene cuerpo`);
    }

    const original = Buffer.from(await body.transformToByteArray());

    for (const width of THUMBNAIL_WIDTHS) {
      const variant = await sharp(original)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: thumbnailKey(key, width),
          Body: variant,
          ContentType: 'image/webp',
          CacheControl: 'private, max-age=31536000, immutable',
        }),
      );

      this.logger.log(`Miniatura de ${String(width)} px generada para ${key}`);
    }
  }
}
