import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import { storageConfig, type StorageConfig } from '../config/index.js';
import { S3_CLIENT } from '../storage/storage.module.js';
import { householdMediaPrefix } from './media.constants.js';
import {
  DELETE_IMAGE_JOB,
  MEDIA_QUEUE_NAME,
  THUMBNAIL_JOB,
  THUMBNAIL_WIDTHS,
  thumbnailKey,
  type DeleteImageJobData,
  type MediaJobData,
  type ThumbnailJobData,
} from './media.queue.js';

/**
 * Trabajos pesados de medios: miniaturas y borrado de objetos.
 *
 * Corre en el proceso `worker`, no en la API: descargar, redimensionar, subir o borrar no debe
 * ocupar el bucle que atiende peticiones. Los dos trabajos son idempotentes, así que un
 * reintento tras un fallo parcial no deja objetos duplicados ni falla por claves ya borradas.
 */
@Processor(MEDIA_QUEUE_NAME)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(storageConfig.KEY) private readonly config: StorageConfig,
  ) {
    super();
  }

  async process(job: Job<MediaJobData>): Promise<void> {
    switch (job.name) {
      case THUMBNAIL_JOB:
        await this.createThumbnails(job.data as ThumbnailJobData);
        return;
      case DELETE_IMAGE_JOB:
        await this.deleteImages(job.data as DeleteImageJobData);
        return;
      default:
        return;
    }
  }

  private async createThumbnails({ householdId, recipeId, key }: ThumbnailJobData): Promise<void> {
    const prefix = householdMediaPrefix(householdId);

    if (!key.startsWith(prefix)) {
      throw new Error(`La imagen de la receta ${recipeId} pertenece a otro hogar`);
    }

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

  /**
   * Borra en una sola petición el original y sus variantes.
   *
   * Antes de tocar el bucket se comprueba que todas las claves están bajo el prefijo del
   * hogar del trabajo: un dato corrupto en Mongo no puede borrar objetos de otro hogar.
   */
  private async deleteImages({ householdId, recipeId, keys }: DeleteImageJobData): Promise<void> {
    const prefix = householdMediaPrefix(householdId);
    const objects = keys.map((Key) => ({ Key }));

    if (!keys.every((key) => key.startsWith(prefix))) {
      throw new Error(`El borrado de la receta ${recipeId} incluye claves de otro hogar`);
    }

    if (objects.length === 0) {
      return;
    }

    const result = await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.config.bucket,
        Delete: { Objects: objects, Quiet: true },
      }),
    );

    for (const error of result.Errors ?? []) {
      throw new Error(
        `No se pudo borrar ${error.Key ?? 'un objeto'}: ${error.Message ?? 'error de S3'}`,
      );
    }

    this.logger.log(`Borrados ${String(objects.length)} objetos de la receta ${recipeId}`);
  }
}
