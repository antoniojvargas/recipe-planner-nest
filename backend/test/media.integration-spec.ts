import { randomUUID } from 'node:crypto';
import {
  CreateBucketCommand,
  GetObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { MinioContainer, type StartedMinioContainer } from '@testcontainers/minio';
import type { Job, Queue } from 'bullmq';
import sharp from 'sharp';
import type { StorageConfig } from '../src/config/index.js';
import type { AllowedImageType } from '../src/media/media.constants.js';
import { THUMBNAIL_JOB, thumbnailKey, type MediaJobData } from '../src/media/media.queue.js';
import { MediaProcessor } from '../src/media/media.processor.js';
import { MediaService } from '../src/media/media.service.js';

const BUCKET = 'recipes-integration';
const USERNAME = 'minioadmin';
const PASSWORD = 'minioadmin';
// Imagen de MinIO por defecto. `minio/minio` ya no está disponible en Docker Hub, así que se
// usa la de Chainguard; se puede cambiar sin tocar el test con `MINIO_IMAGE`.
const IMAGE = process.env.MINIO_IMAGE ?? 'chainguard/minio:latest';

let container: StartedMinioContainer;
let client: S3Client;
let config: StorageConfig;
let media: MediaService;
let processor: MediaProcessor;
let initialized = false;

/** Un hogar distinto por test: las claves nunca colisionan entre casos. */
function newHousehold(): string {
  return randomUUID().replaceAll('-', '').slice(0, 24);
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
}

interface UploadOptions {
  householdId: string;
  contentType: AllowedImageType;
  bytes: Buffer;
  /** Tamaño que se declara en la política; por defecto, el real. */
  declaredSize?: number;
  /** Tipo que se envía en el formulario, para probar que la política lo exige. */
  sentContentType?: string;
}

/** Sube un fichero como lo haría el navegador: `POST` multipart a la URL prefirmada. */
async function upload({
  householdId,
  contentType,
  bytes,
  declaredSize,
  sentContentType,
}: UploadOptions) {
  const { url, fields, key } = await media.createUploadUrl(householdId, {
    contentType,
    size: declaredSize ?? bytes.length,
  });

  const form = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }

  if (sentContentType !== undefined) {
    form.set('Content-Type', sentContentType);
  }

  form.append('file', new Blob([new Uint8Array(bytes)]), 'foto.png');

  const response = await fetch(url, { method: 'POST', body: form });

  return { response, key };
}

function bodyOf(object: GetObjectCommandOutput): Promise<Buffer> {
  if (object.Body === undefined) {
    throw new Error('El objeto no tiene cuerpo');
  }

  return object.Body.transformToByteArray().then((bytes) => Buffer.from(bytes));
}

describe('Media con MinIO real (integración)', () => {
  beforeAll(async () => {
    container = await new MinioContainer(IMAGE)
      .withUsername(USERNAME)
      .withPassword(PASSWORD)
      // La imagen de Chainguard corre sin privilegios y no trae `/data`; con un tmpfs el
      // servidor puede escribir sin depender de los permisos de la imagen.
      .withTmpFs({ '/data': 'rw' })
      .start();
    initialized = true;

    const endpoint = container.getConnectionUrl();

    config = {
      endpoint,
      publicEndpoint: endpoint,
      bucket: BUCKET,
      accessKey: container.getUsername(),
      secretKey: container.getPassword(),
    };

    client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    });

    await client.send(new CreateBucketCommand({ Bucket: BUCKET }));

    const jobs = { add: vi.fn().mockResolvedValue({ id: 'test-job' }) };
    media = new MediaService(client, client, config, jobs as unknown as Queue<MediaJobData>);
    processor = new MediaProcessor(client, config);
  });

  afterAll(async () => {
    if (!initialized) {
      return;
    }

    client.destroy();
    await container.stop();
  });

  it('sube un PNG con la URL prefirmada, lo mide y lo sirve por GET', async () => {
    const householdId = newHousehold();
    const bytes = await png(1200, 800);

    const { response, key } = await upload({
      householdId,
      contentType: 'image/png',
      bytes,
    });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(204);

    const image = await media.inspectImage(householdId, key);

    expect(image).toEqual({ key, width: 1200, height: 800, size: bytes.length });

    const urls = await media.signImageUrls(key);
    const served = await fetch(urls.originalUrl);

    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer())).toEqual(bytes);
  });

  it('rechaza una subida mayor que el tamaño declarado', async () => {
    const bytes = await png(512, 512);

    const { response } = await upload({
      householdId: newHousehold(),
      contentType: 'image/png',
      bytes,
      declaredSize: 100,
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });

  it('rechaza un contenido de tipo distinto al declarado', async () => {
    const { response } = await upload({
      householdId: newHousehold(),
      contentType: 'image/png',
      bytes: await png(64, 64),
      sentContentType: 'image/gif',
    });

    expect(response.ok).toBe(false);
    expect([400, 403]).toContain(response.status);
  });

  it('rechaza la clave de un objeto de otro hogar', async () => {
    const owner = newHousehold();
    const intruder = newHousehold();
    const { response, key } = await upload({
      householdId: owner,
      contentType: 'image/png',
      bytes: await png(64, 64),
    });

    expect(response.ok).toBe(true);

    await expect(media.inspectImage(intruder, key)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'key', message: `La clave debe empezar por households/${intruder}/` }],
    });
  });

  it('genera las miniaturas WebP de 320 y 960 px con el worker', async () => {
    const householdId = newHousehold();
    const recipeId = randomUUID();
    const { response, key } = await upload({
      householdId,
      contentType: 'image/png',
      bytes: await png(1200, 800),
    });

    expect(response.ok).toBe(true);
    await media.inspectImage(householdId, key);

    await processor.process({
      name: THUMBNAIL_JOB,
      data: { householdId, recipeId, key },
    } as unknown as Job<MediaJobData>);

    for (const [width, height] of [
      [320, 213],
      [960, 640],
    ] as const) {
      const object = await client.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: thumbnailKey(key, width) }),
      );
      const variant = await bodyOf(object);
      const metadata = await sharp(variant).metadata();

      expect(object.ContentType).toBe('image/webp');
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(width);
      expect(metadata.height).toBe(height);
    }
  });
});
