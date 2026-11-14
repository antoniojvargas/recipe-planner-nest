import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import type { StorageConfig } from '../config/index.js';
import {
  DELETE_IMAGE_JOB,
  imageObjectKeys,
  THUMBNAIL_JOB,
  THUMBNAIL_WIDTHS,
  thumbnailKey,
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

function processorWith(send: ReturnType<typeof vi.fn>): MediaProcessor {
  return new MediaProcessor({ send } as unknown as S3Client, config);
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
});
