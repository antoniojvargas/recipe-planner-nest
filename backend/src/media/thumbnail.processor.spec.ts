import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import type { StorageConfig } from '../config/index.js';
import { THUMBNAIL_JOB, THUMBNAIL_WIDTHS, thumbnailKey } from './media.queue.js';
import { ThumbnailProcessor } from './thumbnail.processor.js';

const config = { bucket: 'recipes' } as StorageConfig;
const key = 'households/abc/receta.png';

function jobOf(name = THUMBNAIL_JOB): Job<{ householdId: string; recipeId: string; key: string }> {
  return {
    name,
    data: { householdId: 'abc', recipeId: 'def', key },
  } as unknown as Job<{ householdId: string; recipeId: string; key: string }>;
}

function processorWith(send: ReturnType<typeof vi.fn>): ThumbnailProcessor {
  return new ThumbnailProcessor({ send } as unknown as S3Client, config);
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

describe('ThumbnailProcessor', () => {
  it('descarga el original y sube las variantes WebP de 320 y 960 px', async () => {
    const send = vi.fn();
    send.mockResolvedValueOnce(bodyOf(await sourcePng(1200, 800))).mockResolvedValue({});

    await processorWith(send).process(jobOf());

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

    await processorWith(send).process(jobOf());

    for (const command of puts(send)) {
      const output = await sharp(command.input.Body as Buffer).metadata();

      expect(output.width).toBe(200);
      expect(output.height).toBe(100);
    }
  });

  it('ignora trabajos con otro nombre', async () => {
    const send = vi.fn();

    await processorWith(send).process(jobOf('otro.trabajo'));

    expect(send).not.toHaveBeenCalled();
  });
});
