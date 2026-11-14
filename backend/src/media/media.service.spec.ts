import { HeadObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import type { Queue } from 'bullmq';
import sharp from 'sharp';
import type { StorageConfig } from '../config/index.js';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto.js';
import {
  ALLOWED_IMAGE_TYPES,
  type AllowedImageType,
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  UPLOAD_URL_TTL_SECONDS,
} from './media.constants.js';
import { MEDIA_QUEUE_NAME, THUMBNAIL_JOB, type ThumbnailJobData } from './media.queue.js';
import { MediaService } from './media.service.js';

interface PostPolicy {
  expiration: string;
  conditions: unknown[];
}

interface ServiceDoubles {
  service: MediaService;
  internal: { send: ReturnType<typeof vi.fn> };
  queue: { add: ReturnType<typeof vi.fn> };
}

const config = {
  bucket: 'recipes',
  publicEndpoint: 'http://localhost:9000',
} as StorageConfig;

function createDoubles(): ServiceDoubles {
  const publicS3 = new S3Client({
    endpoint: config.publicEndpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
  });
  const internal = { send: vi.fn() };
  const queue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };

  const service = new MediaService(
    publicS3,
    internal as unknown as S3Client,
    config,
    queue as unknown as Queue<ThumbnailJobData>,
  );

  return { service, internal, queue };
}

function createService(): MediaService {
  return createDoubles().service;
}

function policyOf(fields: Record<string, string>): PostPolicy {
  return JSON.parse(Buffer.from(fields.Policy, 'base64').toString('utf8')) as PostPolicy;
}

function dto(contentType: AllowedImageType, size: number): CreateUploadUrlDto {
  return { contentType, size };
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
}

/** Respuesta de `GetObject` con el cuerpo ya en memoria. */
function objectBody(bytes: Buffer): { Body: { transformToByteArray: () => Promise<Uint8Array> } } {
  return { Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(bytes)) } };
}

function notFoundError(): S3ServiceException {
  return new S3ServiceException({
    name: 'NotFound',
    $fault: 'client',
    $metadata: { httpStatusCode: 404 },
    message: 'Not Found',
  });
}

describe('MediaService', () => {
  const householdId = '64b7f9c2a1e4d3c2b1a09999';
  const key = `households/${householdId}/foto.png`;

  describe('createUploadUrl', () => {
    it('firma un POST bajo el prefijo del hogar con el host público y el bucket', async () => {
      const service = createService();

      const result = await service.createUploadUrl(householdId, dto('image/jpeg', 1024));

      expect(result.url).toBe('http://localhost:9000/recipes');
      expect(result.key).toMatch(new RegExp(`^households/${householdId}/[0-9a-f-]{36}\\.jpg$`));
      expect(result.fields.key).toBe(result.key);
      expect(result.fields['Content-Type']).toBe('image/jpeg');
      expect(result.fields['X-Amz-Signature']).toMatch(/^[0-9a-f]{64}$/);
    });

    it('usa la extensión del catálogo para cada tipo permitido', async () => {
      const service = createService();

      for (const contentType of ALLOWED_IMAGE_TYPES) {
        const result = await service.createUploadUrl(householdId, dto(contentType, 2048));

        expect(result.key.endsWith(`.${IMAGE_EXTENSIONS[contentType]}`)).toBe(true);
        expect(result.fields['Content-Type']).toBe(contentType);
      }
    });

    it('limita el POST al tipo y al tamaño declarado', async () => {
      const service = createService();
      const size = 3 * 1024 * 1024;

      const result = await service.createUploadUrl(householdId, dto('image/webp', size));
      const policy = policyOf(result.fields);

      expect(policy.conditions).toEqual(
        expect.arrayContaining([
          ['eq', '$Content-Type', 'image/webp'],
          ['content-length-range', 1, size],
        ]),
      );
    });

    it('caduca a los cinco minutos', async () => {
      const before = Date.now();
      const service = createService();

      const result = await service.createUploadUrl(householdId, dto('image/png', 1));
      const expiresInMs = result.expiresAt.getTime() - before;

      expect(expiresInMs).toBeGreaterThanOrEqual(UPLOAD_URL_TTL_SECONDS * 1_000 - 1_000);
      expect(expiresInMs).toBeLessThanOrEqual(UPLOAD_URL_TTL_SECONDS * 1_000 + 1_000);
    });

    it('genera una clave distinta en cada petición', async () => {
      const service = createService();

      const first = await service.createUploadUrl(householdId, dto('image/png', 1));
      const second = await service.createUploadUrl(householdId, dto('image/png', 1));

      expect(first.key).not.toBe(second.key);
    });
  });

  describe('inspectImage', () => {
    it('rechaza una clave que no está bajo el prefijo del hogar', async () => {
      const { service, internal } = createDoubles();

      await expect(
        service.inspectImage(householdId, 'households/otro-hogar/foto.png'),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [
          { field: 'key', message: `La clave debe empezar por households/${householdId}/` },
        ],
      });
      expect(internal.send).not.toHaveBeenCalled();
    });

    it('devuelve 404 cuando HeadObject no encuentra el objeto', async () => {
      const { service, internal } = createDoubles();
      internal.send.mockRejectedValueOnce(notFoundError());

      await expect(service.inspectImage(householdId, key)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'La imagen no existe',
      });
    });

    it('rechaza objetos de más de 5 MiB sin descargarlos', async () => {
      const { service, internal } = createDoubles();
      internal.send.mockResolvedValueOnce({ ContentLength: MAX_IMAGE_BYTES + 1 });

      await expect(service.inspectImage(householdId, key)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'key', message: 'La imagen no puede superar los 5 MiB' }],
      });
      expect(internal.send).toHaveBeenCalledTimes(1);
    });

    it('rechaza tipos que no son imagen', async () => {
      const { service, internal } = createDoubles();
      internal.send.mockResolvedValueOnce({ ContentLength: 10, ContentType: 'image/gif' });

      await expect(service.inspectImage(householdId, key)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      expect(internal.send).toHaveBeenCalledTimes(1);
    });

    it('rechaza un objeto que sharp no puede leer', async () => {
      const { service, internal } = createDoubles();
      internal.send
        .mockResolvedValueOnce({ ContentLength: 12, ContentType: 'image/png' })
        .mockResolvedValueOnce(objectBody(Buffer.from('no soy una imagen')));

      await expect(service.inspectImage(householdId, key)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'key', message: 'El objeto no es una imagen válida' }],
      });
    });

    it('devuelve la clave, el tamaño y las dimensiones reales', async () => {
      const { service, internal } = createDoubles();
      const bytes = await png(1200, 800);
      internal.send
        .mockResolvedValueOnce({ ContentLength: bytes.length, ContentType: 'image/png' })
        .mockResolvedValueOnce(objectBody(bytes));

      const image = await service.inspectImage(householdId, key);

      expect(image).toEqual({
        key,
        width: 1200,
        height: 800,
        size: bytes.length,
      });
      expect(internal.send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
    });
  });

  describe('enqueueThumbnail', () => {
    it('encola media.thumbnail con reintentos y limpieza de la cola', async () => {
      const { service, queue } = createDoubles();
      const data: ThumbnailJobData = { householdId, recipeId: 'recipe-1', key };

      await service.enqueueThumbnail(data);

      expect(queue.add).toHaveBeenCalledWith(THUMBNAIL_JOB, data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800 },
      });
      expect(MEDIA_QUEUE_NAME).toBe('media');
    });
  });
});
