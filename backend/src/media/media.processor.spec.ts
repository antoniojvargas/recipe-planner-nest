import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type ListObjectsV2CommandOutput,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import type { StorageConfig } from '../config/index.js';
import type { RecipesRepository } from '../recipes/recipes.repository.js';
import { ORPHAN_RETENTION_MS } from './media.constants.js';
import {
  DELETE_IMAGE_JOB,
  imageObjectKeys,
  MEDIA_CLEANUP_JOB,
  THUMBNAIL_JOB,
  THUMBNAIL_WIDTHS,
  thumbnailKey,
  type CleanupOrphansJobData,
  type MediaJobData,
} from './media.queue.js';
import { MediaProcessor } from './media.processor.js';

const config = { bucket: 'recipes' } as StorageConfig;
const householdId = 'abc';
const recipeId = 'def';
const key = `households/${householdId}/receta.png`;

function jobOf(name: string, data: MediaJobData): Job<MediaJobData> {
  return { name, data } as unknown as Job<MediaJobData>;
}

function thumbnailJob(): Job<MediaJobData> {
  return jobOf(THUMBNAIL_JOB, { householdId, recipeId, key });
}

function deletionJob(keys = imageObjectKeys(key)): Job<MediaJobData> {
  return jobOf(DELETE_IMAGE_JOB, { householdId, recipeId, keys });
}

function processorWith(send: ReturnType<typeof vi.fn>, referenced: string[] = []): MediaProcessor {
  const recipes = {
    findReferencedImageKeys: vi.fn().mockResolvedValue(new Set(referenced)),
  } as unknown as RecipesRepository;

  return new MediaProcessor({ send } as unknown as S3Client, config, recipes);
}

async function sourcePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
}

function bodyOf(bytes: Buffer) {
  return { Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(bytes)) } };
}

function puts(send: ReturnType<typeof vi.fn>): PutObjectCommand[] {
  return send.mock.calls
    .map(([command]) => command as unknown)
    .filter((command): command is PutObjectCommand => command instanceof PutObjectCommand);
}

function cleanupJob(): Job<MediaJobData> {
  return jobOf(MEDIA_CLEANUP_JOB, {} as CleanupOrphansJobData);
}

/** Página de `ListObjectsV2` con las claves y fechas indicadas. */
function listed(objects: { key: string; lastModified: Date }[]): ListObjectsV2CommandOutput {
  return {
    $metadata: {},
    Contents: objects.map(({ key: objectKey, lastModified }) => ({
      Key: objectKey,
      LastModified: lastModified,
    })),
  };
}

/** Cliente S3 que devuelve una página de listado por llamada y acepta los borrados. */
function s3ForPages(
  pages: ListObjectsV2CommandOutput[],
  onlyPrefix?: string,
): ReturnType<typeof vi.fn> {
  const remaining = [...pages];

  return vi.fn().mockImplementation((command: unknown) => {
    if (command instanceof ListObjectsV2Command) {
      if (onlyPrefix !== undefined && command.input.Prefix !== onlyPrefix) {
        return Promise.resolve({ Contents: [] });
      }

      return Promise.resolve(remaining.shift() ?? { Contents: [] });
    }

    return Promise.resolve({ Deleted: [], Errors: [] });
  });
}

function deletedKeys(send: ReturnType<typeof vi.fn>): string[] {
  return send.mock.calls
    .map(([command]) => command as unknown)
    .filter((command): command is DeleteObjectsCommand => command instanceof DeleteObjectsCommand)
    .flatMap(
      (command) => command.input.Delete?.Objects?.flatMap((object) => object.Key ?? []) ?? [],
    );
}

describe('MediaProcessor', () => {
  describe('media.thumbnail', () => {
    it('descarga el original y sube las variantes WebP de 320 y 960 px', async () => {
      const send = vi.fn();
      send.mockResolvedValueOnce(bodyOf(await sourcePng(1200, 800))).mockResolvedValue({});

      await processorWith(send).process(thumbnailJob());

      expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);

      const uploaded = puts(send);

      expect(uploaded).toHaveLength(THUMBNAIL_WIDTHS.length);

      for (const [index, width] of THUMBNAIL_WIDTHS.entries()) {
        const command = uploaded[index];

        expect(command.input.Key).toBe(thumbnailKey(key, width));
        expect(command.input.ContentType).toBe('image/webp');

        const output = await sharp(command.input.Body as Buffer).metadata();

        expect(output.format).toBe('webp');
        expect(output.width).toBe(width);
      }
    });

    it('no amplía una imagen más pequeña que la variante', async () => {
      const send = vi.fn();
      send.mockResolvedValueOnce(bodyOf(await sourcePng(200, 100))).mockResolvedValue({});

      await processorWith(send).process(thumbnailJob());

      for (const command of puts(send)) {
        const output = await sharp(command.input.Body as Buffer).metadata();

        expect(output.width).toBe(200);
        expect(output.height).toBe(100);
      }
    });
  });

  describe('media.delete', () => {
    it('borra en una sola petición el original y sus variantes', async () => {
      const send = vi.fn().mockResolvedValue({ Deleted: [], Errors: [] });

      await processorWith(send).process(deletionJob());

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectsCommand);

      const command = send.mock.calls[0]?.[0] as DeleteObjectsCommand;

      expect(command.input.Bucket).toBe('recipes');
      expect(command.input.Delete?.Objects?.map((object) => object.Key)).toEqual(
        imageObjectKeys(key),
      );
      expect(command.input.Delete?.Quiet).toBe(true);
    });

    it('no toca el bucket si alguna clave es de otro hogar', async () => {
      const send = vi.fn();
      const foreign = 'households/otro-hogar/receta.png';

      await expect(
        processorWith(send).process(deletionJob([...imageObjectKeys(key), foreign])),
      ).rejects.toThrow('claves de otro hogar');
      expect(send).not.toHaveBeenCalled();
    });

    it('falla para que BullMQ reintente si S3 devuelve errores', async () => {
      const send = vi.fn().mockResolvedValue({
        Deleted: [],
        Errors: [{ Key: key, Message: 'AccessDenied' }],
      });

      await expect(processorWith(send).process(deletionJob())).rejects.toThrow(
        `No se pudo borrar ${key}: AccessDenied`,
      );
    });
  });

  it('ignora trabajos con otro nombre', async () => {
    const send = vi.fn();

    await processorWith(send).process(jobOf('otro.trabajo', { householdId, recipeId, key }));

    expect(send).not.toHaveBeenCalled();
  });

  describe('media.cleanup-orphans', () => {
    const now = new Date('2026-11-25T12:00:00.000Z');
    const stale = new Date(now.getTime() - ORPHAN_RETENTION_MS - 60_000);
    const fresh = new Date(now.getTime() - ORPHAN_RETENTION_MS + 60_000);

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('borra el objeto de una URL prefirmada usada y nunca confirmada', async () => {
      const orphan = `pending/${householdId}/0f0f-uso-sin-confirmar.png`;
      const send = s3ForPages([listed([{ key: orphan, lastModified: stale }])], 'pending/');

      await processorWith(send).process(cleanupJob());

      expect(deletedKeys(send)).toEqual([orphan]);
    });

    it('borra un objeto del prefijo definitivo que ninguna receta referencia', async () => {
      const orphan = `households/${householdId}/sin-receta.png`;
      const send = s3ForPages([listed([{ key: orphan, lastModified: stale }])], 'households/');

      await processorWith(send).process(cleanupJob());

      expect(deletedKeys(send)).toEqual([orphan]);
    });

    it('conserva el original y sus variantes si una receta los referencia', async () => {
      const referenced = `households/${householdId}/con-receta.png`;
      const send = s3ForPages(
        [
          listed([
            { key: referenced, lastModified: stale },
            { key: thumbnailKey(referenced, 320), lastModified: stale },
          ]),
        ],
        'households/',
      );

      await processorWith(send, [referenced]).process(cleanupJob());

      expect(deletedKeys(send)).toEqual([]);
    });

    it('no borra objetos que aún no superan las 24 h', async () => {
      const send = s3ForPages([
        listed([
          { key: `pending/${householdId}/recien-subida.png`, lastModified: fresh },
          { key: `households/${householdId}/recien-confirmada.png`, lastModified: fresh },
        ]),
      ]);

      await processorWith(send).process(cleanupJob());

      expect(deletedKeys(send)).toEqual([]);
    });

    it('recorre todas las páginas del prefijo con el token de continuación', async () => {
      const first = `pending/${householdId}/primera.png`;
      const second = `pending/${householdId}/segunda.png`;
      const send = s3ForPages(
        [
          {
            ...listed([{ key: first, lastModified: stale }]),
            IsTruncated: true,
            NextContinuationToken: 'pagina-2',
          },
          listed([{ key: second, lastModified: stale }]),
        ],
        'pending/',
      );

      await processorWith(send).process(cleanupJob());

      const listings = send.mock.calls
        .map(([command]) => command as unknown)
        .filter(
          (command): command is ListObjectsV2Command =>
            command instanceof ListObjectsV2Command && command.input.Prefix === 'pending/',
        );

      expect(listings.map((command) => command.input.ContinuationToken)).toEqual([
        undefined,
        'pagina-2',
      ]);
      expect(deletedKeys(send)).toEqual(expect.arrayContaining([first, second]));
    });

    it('borra el original huérfano y las miniaturas que generó', async () => {
      const orphan = `households/${householdId}/huerfana.png`;
      const send = s3ForPages(
        [
          listed(
            imageObjectKeys(orphan).map((objectKey) => ({ key: objectKey, lastModified: stale })),
          ),
        ],
        'households/',
      );

      await processorWith(send).process(cleanupJob());

      expect(deletedKeys(send)).toEqual(expect.arrayContaining(imageObjectKeys(orphan)));
    });

    it('no toca claves fuera de los prefijos gestionados', async () => {
      const foreign = 'otros/ajenos.png';
      const send = s3ForPages([listed([{ key: foreign, lastModified: stale }])]);

      await processorWith(send).process(cleanupJob());

      expect(deletedKeys(send)).toEqual([]);
    });

    it('falla para que BullMQ reintente si S3 devuelve errores', async () => {
      const orphan = `households/${householdId}/sin-receta.png`;
      const send = s3ForPages([listed([{ key: orphan, lastModified: stale }])], 'households/');

      send.mockImplementation((command: unknown) => {
        if (command instanceof ListObjectsV2Command) {
          return Promise.resolve(
            command.input.Prefix === 'households/'
              ? listed([{ key: orphan, lastModified: stale }])
              : { Contents: [] },
          );
        }

        return Promise.resolve({ Deleted: [], Errors: [{ Key: orphan, Message: 'AccessDenied' }] });
      });

      await expect(processorWith(send).process(cleanupJob())).rejects.toThrow(
        `No se pudo borrar ${orphan}: AccessDenied`,
      );
    });
  });
});
