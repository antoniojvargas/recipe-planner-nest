import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { StorageConfig } from '../config/index.js';
import { StorageHealthIndicator } from './storage.health.js';

const config = { bucket: 'recipes' } as StorageConfig;

function indicatorWith(send: ReturnType<typeof vi.fn>): StorageHealthIndicator {
  const client = { send } as unknown as S3Client;

  return new StorageHealthIndicator(client, config, new HealthIndicatorService());
}

describe('StorageHealthIndicator', () => {
  it('marca el almacenamiento como up cuando HeadBucket responde', async () => {
    const send = vi.fn().mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

    const result = await indicatorWith(send).check('storage', 1_000);

    expect(result.storage.status).toBe('up');
    expect(send).toHaveBeenCalledOnce();

    const command = send.mock.calls[0][0] as unknown;

    expect(command).toBeInstanceOf(HeadBucketCommand);
    expect((command as HeadBucketCommand).input).toEqual({ Bucket: 'recipes' });
  });

  it('marca el almacenamiento como down con el mensaje del error', async () => {
    const send = vi.fn().mockRejectedValue(new Error('The specified bucket does not exist'));

    const result = await indicatorWith(send).check('storage', 1_000);

    expect(result.storage).toMatchObject({
      status: 'down',
      message: 'The specified bucket does not exist',
    });
  });

  it('marca el almacenamiento como down cuando supera el timeout', async () => {
    const hanging = vi.fn().mockImplementation(() => new Promise(() => undefined));

    const result = await indicatorWith(hanging).check('storage', 10);

    expect(result.storage.status).toBe('down');
    expect(result.storage.message).toBe('timeout of 10ms exceeded');
  });
});
