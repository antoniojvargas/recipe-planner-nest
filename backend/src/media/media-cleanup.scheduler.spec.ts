import type { Queue } from 'bullmq';
import { MediaCleanupScheduler } from './media-cleanup.scheduler.js';
import {
  MEDIA_CLEANUP_JOB,
  MEDIA_CLEANUP_PATTERN,
  MEDIA_CLEANUP_SCHEDULER_ID,
  MEDIA_QUEUE_NAME,
  type MediaJobData,
} from './media.queue.js';

describe('MediaCleanupScheduler', () => {
  it('registra el barrido de huérfanos como trabajo repetible de la cola de medios', async () => {
    const upsertJobScheduler = vi.fn().mockResolvedValue({});
    const scheduler = new MediaCleanupScheduler({
      upsertJobScheduler,
    } as unknown as Queue<MediaJobData>);

    await scheduler.onModuleInit();

    expect(MEDIA_QUEUE_NAME).toBe('media');
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      MEDIA_CLEANUP_SCHEDULER_ID,
      { pattern: MEDIA_CLEANUP_PATTERN },
      expect.objectContaining({
        name: MEDIA_CLEANUP_JOB,
        opts: expect.objectContaining({ attempts: 3 }),
      }),
    );
  });
});
