import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import { storageConfig, type StorageConfig } from '../config/index.js';
import { RecipesRepository } from '../recipes/recipes.repository.js';
import { S3_CLIENT } from '../storage/storage.module.js';
import { householdMediaPrefix, ORPHAN_RETENTION_MS } from './media.constants.js';
import {
  DELETE_IMAGE_JOB,
  MANAGED_MEDIA_PREFIXES,
  MEDIA_CLEANUP_JOB,
  MEDIA_QUEUE_NAME,
  originalKeysForBase,
  THUMBNAIL_JOB,
  THUMBNAIL_WIDTHS,
  thumbnailKey,
  variantBaseKey,
  type DeleteImageJobData,
  type MediaJobData,
  type ThumbnailJobData,
} from './media.queue.js';

/**
 * Trabajos pesados de medios: miniaturas, borrado de objetos y barrido de huérfanos.
 *
 * Corre en el proceso `worker`, no en la API: descargar, redimensionar, subir o borrar no debe
 * ocupar el bucle que atiende peticiones. Los trabajos son idempotentes, así que un reintento
 * tras un fallo parcial no deja objetos duplicados ni falla por claves ya borradas.
 */
@Processor(MEDIA_QUEUE_NAME)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(storageConfig.KEY) private readonly config: StorageConfig,
    private readonly recipes: RecipesRepository,
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
      case MEDIA_CLEANUP_JOB:
        await this.cleanupOrphans();
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

  /**
   * Borra los objetos que ninguna receta referencia y que llevan más de 24 h en el bucket.
   *
   * Cubre el hueco de la subida prefirmada que se usó pero nunca se confirmó: la clave existe
   * en el bucket y no aparece en Mongo, así que nada la borraría al eliminar una receta. El
   * listado va por prefijo y por páginas (`ListObjectsV2` devuelve como mucho 1000 claves), y
   * solo se tocan las raíces gestionadas de medios.
   *
   * Antes de borrar se consulta Mongo en lote: si la consulta falla, el trabajo falla y BullMQ
   * lo reintenta sin haber borrado nada. La regla de ciclo de vida del bucket es la red de
   * seguridad para las subidas pendientes que este barrido no llegue a ver.
   */
  private async cleanupOrphans(): Promise<void> {
    const cutoff = new Date(Date.now() - ORPHAN_RETENTION_MS);
    let deleted = 0;

    for (const prefix of MANAGED_MEDIA_PREFIXES) {
      let token: string | undefined;

      do {
        const page = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: prefix,
            ...(token === undefined ? {} : { ContinuationToken: token }),
          }),
        );

        const stale = (page.Contents ?? []).flatMap((object) =>
          object.Key !== undefined &&
          object.LastModified !== undefined &&
          object.LastModified < cutoff &&
          MANAGED_MEDIA_PREFIXES.some((managed) => object.Key?.startsWith(managed) === true)
            ? [object.Key]
            : [],
        );

        deleted += await this.deleteOrphans(stale);
        token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
      } while (token !== undefined);
    }

    this.logger.log(`Barrido de medios: ${String(deleted)} objetos huérfanos borrados`);
  }

  /** Borra de una página las claves cuyo original no está en ninguna receta. */
  private async deleteOrphans(keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    // Una variante no dice qué extensión tenía su original, así que se prueban las del
    // catálogo. Las claves que no son variantes se consultan tal cual.
    const candidates = new Set<string>();

    for (const key of keys) {
      const base = variantBaseKey(key);

      if (base === undefined) {
        candidates.add(key);
      } else {
        for (const original of originalKeysForBase(base)) {
          candidates.add(original);
        }
      }
    }

    const referenced = new Set<string>();

    for (const original of await this.recipes.findReferencedImageKeys([...candidates])) {
      referenced.add(original);

      for (const width of THUMBNAIL_WIDTHS) {
        referenced.add(thumbnailKey(original, width));
      }
    }

    const orphans = keys.filter((key) => !referenced.has(key));

    if (orphans.length === 0) {
      return 0;
    }

    const result = await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.config.bucket,
        Delete: { Objects: orphans.map((Key) => ({ Key })), Quiet: true },
      }),
    );

    for (const error of result.Errors ?? []) {
      throw new Error(
        `No se pudo borrar ${error.Key ?? 'un objeto'}: ${error.Message ?? 'error de S3'}`,
      );
    }

    return orphans.length;
  }
}
