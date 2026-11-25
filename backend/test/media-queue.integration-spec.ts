import './setup-env.js';
import 'reflect-metadata';
import type { S3Client } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { StorageConfig } from '../src/config/index.js';
import { MEDIA_QUEUE_NAME, THUMBNAIL_JOB, type MediaJobData } from '../src/media/media.queue.js';
import { MediaService } from '../src/media/media.service.js';

/**
 * La deduplicación por `jobId` la hace BullMQ en Redis, no el servicio: por eso este test usa
 * una cola real en un contenedor. Sin `Worker`, los trabajos se quedan en `waiting` y se puede
 * contar cuántos hay.
 */
describe('Cola de medios con Redis real (integración)', () => {
  let container: StartedTestContainer;
  let queue: Queue<MediaJobData>;
  let media: MediaService;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();

    queue = new Queue<MediaJobData>(MEDIA_QUEUE_NAME, {
      connection: {
        host: container.getHost(),
        port: container.getMappedPort(6379),
      },
    });

    media = new MediaService(
      {} as S3Client,
      {} as S3Client,
      { bucket: 'recipes' } as StorageConfig,
      queue,
    );
  });

  afterAll(async () => {
    if (queue !== undefined) {
      await queue.obliterate({ force: true });
      await queue.close();
    }

    await container?.stop();
  });

  it('encolar dos veces la misma imagen deja un solo trabajo', async () => {
    const data = { householdId: 'hogar', recipeId: 'receta', key: 'households/hogar/foto.png' };

    await media.enqueueThumbnail(data);
    await media.enqueueThumbnail(data);

    const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.name).toBe(THUMBNAIL_JOB);
    expect(jobs[0]?.data).toEqual(data);
  });

  it('dos imágenes distintas encolan un trabajo cada una', async () => {
    await queue.obliterate({ force: true });

    await media.enqueueThumbnail({
      householdId: 'hogar',
      recipeId: 'receta',
      key: 'households/hogar/primera.png',
    });
    await media.enqueueThumbnail({
      householdId: 'hogar',
      recipeId: 'receta',
      key: 'households/hogar/segunda.png',
    });

    const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'households/hogar/primera.png' }),
        expect.objectContaining({ key: 'households/hogar/segunda.png' }),
      ]),
    );
  });
});
