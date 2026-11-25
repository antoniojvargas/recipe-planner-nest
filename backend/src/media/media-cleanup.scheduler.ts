import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  MEDIA_CLEANUP_JOB,
  MEDIA_CLEANUP_PATTERN,
  MEDIA_CLEANUP_SCHEDULER_ID,
  MEDIA_JOB_OPTIONS,
  MEDIA_QUEUE_NAME,
  type MediaJobData,
} from './media.queue.js';

/**
 * Registra el barrido de huérfanos como trabajo repetible de BullMQ.
 *
 * Vive en el proceso `worker`, junto al procesador que lo consume. `upsertJobScheduler` usa un
 * id fijo: arrancar otra réplica (o reiniciar) actualiza el calendario en lugar de duplicar el
 * trabajo, así que no hace falta coordinación entre instancias.
 */
@Injectable()
export class MediaCleanupScheduler implements OnModuleInit {
  constructor(@InjectQueue(MEDIA_QUEUE_NAME) private readonly jobs: Queue<MediaJobData>) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.upsertJobScheduler(
      MEDIA_CLEANUP_SCHEDULER_ID,
      { pattern: MEDIA_CLEANUP_PATTERN },
      { name: MEDIA_CLEANUP_JOB, data: {}, opts: MEDIA_JOB_OPTIONS },
    );
  }
}
