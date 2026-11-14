import { S3Client } from '@aws-sdk/client-s3';
import type { StorageConfig } from '../config/index.js';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto.js';
import {
  ALLOWED_IMAGE_TYPES,
  type AllowedImageType,
  IMAGE_EXTENSIONS,
  UPLOAD_URL_TTL_SECONDS,
} from './media.constants.js';
import { MediaService } from './media.service.js';

interface PostPolicy {
  expiration: string;
  conditions: unknown[];
}

const config = {
  bucket: 'recipes',
  publicEndpoint: 'http://localhost:9000',
} as StorageConfig;

function createService(): MediaService {
  const client = new S3Client({
    endpoint: config.publicEndpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
  });

  return new MediaService(client, config);
}

function policyOf(fields: Record<string, string>): PostPolicy {
  return JSON.parse(Buffer.from(fields.Policy, 'base64').toString('utf8')) as PostPolicy;
}

function dto(contentType: AllowedImageType, size: number): CreateUploadUrlDto {
  return { contentType, size };
}

describe('MediaService', () => {
  const householdId = '64b7f9c2a1e4d3c2b1a09999';

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
