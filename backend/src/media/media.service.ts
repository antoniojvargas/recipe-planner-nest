import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
  type HeadObjectCommandOutput,
  type S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ERROR_CODES } from '@recipe-planner/contracts';
import type { Queue } from 'bullmq';
import sharp from 'sharp';
import { AppException } from '../common/exceptions/app.exception.js';
import { toResponseDto } from '../common/response.js';
import { storageConfig, type StorageConfig } from '../config/index.js';
import { S3_CLIENT, S3_PUBLIC_CLIENT } from '../storage/storage.module.js';
import type { CreateUploadUrlDto } from './dto/create-upload-url.dto.js';
import {
  householdMediaPrefix,
  IMAGE_EXTENSIONS,
  IMAGE_URL_TTL_SECONDS,
  isAllowedImageType,
  MAX_IMAGE_BYTES,
  UPLOAD_URL_TTL_SECONDS,
} from './media.constants.js';
import {
  DELETE_IMAGE_JOB,
  imageObjectKeys,
  MEDIA_QUEUE_NAME,
  THUMBNAIL_JOB,
  type MediaJobData,
  type ThumbnailJobData,
} from './media.queue.js';
import { UploadUrlResponse, type SignedImageUrls, type UploadedImage } from './media.types.js';

/** Opciones comunes de los trabajos de medios: reintentos y limpieza de la cola. */
const MEDIA_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
} as const;

function invalidImage(message: string): AppException {
  return new AppException({
    status: HttpStatus.BAD_REQUEST,
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'La imagen no es válida',
    details: [{ field: 'key', message }],
  });
}

/**
 * Medios de una receta: firma de subidas, comprobación del objeto ya subido y encolado de las
 * miniaturas.
 *
 * La API nunca recibe el fichero. El navegador sube con una política de `POST` de corta
 * duración atada al tipo, al tamaño declarado y a una clave aleatoria dentro del prefijo del
 * hogar; aquí solo se comprueba lo que quedó en el bucket y se encola el trabajo pesado.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject(S3_PUBLIC_CLIENT) private readonly publicS3: S3Client,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(storageConfig.KEY) private readonly config: StorageConfig,
    @InjectQueue(MEDIA_QUEUE_NAME) private readonly jobs: Queue<MediaJobData>,
  ) {}

  async createUploadUrl(householdId: string, dto: CreateUploadUrlDto): Promise<UploadUrlResponse> {
    const key = `${householdMediaPrefix(householdId)}${randomUUID()}.${IMAGE_EXTENSIONS[dto.contentType]}`;
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1_000);

    const { url, fields } = await createPresignedPost(this.publicS3, {
      Bucket: this.config.bucket,
      Key: key,
      Expires: UPLOAD_URL_TTL_SECONDS,
      Fields: { 'Content-Type': dto.contentType },
      Conditions: [
        ['eq', '$Content-Type', dto.contentType],
        // Ni un byte de más: el tamaño declarado es también el techo de la subida.
        ['content-length-range', 1, dto.size],
      ],
    });

    return toResponseDto(UploadUrlResponse, { key, url, fields, expiresAt });
  }

  /**
   * Comprueba con `HeadObject` que el objeto existe, es del hogar y cabe en el límite, y lee
   * sus dimensiones reales para poder guardarlas en la receta. El cuerpo se descarga una sola
   * vez y como mucho son 5 MiB: `sharp` solo necesita la cabecera, pero leer el objeto entero
   * simplifica el flujo y evita streams a medio cerrar.
   */
  async inspectImage(householdId: string, key: string): Promise<UploadedImage> {
    const prefix = householdMediaPrefix(householdId);

    if (!key.startsWith(prefix)) {
      throw invalidImage(`La clave debe empezar por ${prefix}`);
    }

    let head: HeadObjectCommandOutput;

    try {
      head = await this.s3.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        throw new AppException({
          status: HttpStatus.NOT_FOUND,
          code: ERROR_CODES.NOT_FOUND,
          message: 'La imagen no existe',
        });
      }

      throw error;
    }

    const size = head.ContentLength ?? 0;

    if (size <= 0) {
      throw invalidImage('La imagen está vacía');
    }

    if (size > MAX_IMAGE_BYTES) {
      throw invalidImage('La imagen no puede superar los 5 MiB');
    }

    if (head.ContentType !== undefined && !isAllowedImageType(head.ContentType)) {
      throw invalidImage('El objeto no es una imagen JPEG, PNG o WebP');
    }

    const object = await this.s3.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    const body = object.Body;

    if (body === undefined) {
      throw invalidImage('La imagen no se pudo leer');
    }

    let width: number;
    let height: number;

    try {
      const bytes = await body.transformToByteArray();
      ({ width, height } = await sharp(Buffer.from(bytes)).metadata());
    } catch {
      throw invalidImage('El objeto no es una imagen válida');
    }

    return { key, width, height, size };
  }

  /**
   * Firma una URL de `GET` para el original y cada variante WebP.
   *
   * Se llama cada vez que se serializa una receta: las URLs duran cinco minutos y nunca se
   * guardan en Mongo, así que un enlace filtrado deja de servir enseguida. Firmar es local y
   * barato; no hay ninguna petición al bucket.
   */
  async signImageUrls(key: string): Promise<SignedImageUrls> {
    const [originalUrl, smallUrl, largeUrl] = await Promise.all(
      imageObjectKeys(key).map((objectKey) =>
        getSignedUrl(
          this.publicS3,
          new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
          { expiresIn: IMAGE_URL_TTL_SECONDS },
        ),
      ),
    );

    return { originalUrl, smallUrl, largeUrl };
  }

  /** Encola la generación de las variantes WebP de 320 y 960 px. */
  async enqueueThumbnail(data: ThumbnailJobData): Promise<void> {
    await this.jobs.add(THUMBNAIL_JOB, data, MEDIA_JOB_OPTIONS);
  }

  /**
   * Encola el borrado del original y sus variantes.
   *
   * El trabajo corre en el worker para no retrasar la respuesta. Es idempotente (borrar una
   * clave que ya no existe también responde bien), así que un reintento no falla.
   */
  async enqueueImageDeletion(householdId: string, recipeId: string, key: string): Promise<void> {
    const prefix = householdMediaPrefix(householdId);

    if (!key.startsWith(prefix)) {
      throw new Error('La imagen a borrar no pertenece al hogar');
    }

    await this.jobs.add(
      DELETE_IMAGE_JOB,
      { householdId, recipeId, keys: imageObjectKeys(key) },
      MEDIA_JOB_OPTIONS,
    );
  }
}
