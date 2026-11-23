import { ImportsProcessor } from '../imports/imports.processor.js';
import { MediaProcessor } from '../media/media.processor.js';
import { SHUTDOWN_ORDER } from '../shutdown/shutdown.constants.js';
import { ShutdownService } from '../shutdown/shutdown.service.js';
import { WorkersShutdown } from './workers-shutdown.js';

describe('WorkersShutdown', () => {
  it('cierra los workers en el orden de colas, antes de Redis y Mongo', async () => {
    const shutdown = new ShutdownService();
    const register = vi.spyOn(shutdown, 'register');
    const sequence: string[] = [];

    const media = {
      worker: { close: vi.fn(async () => void sequence.push('media')) },
    } as unknown as MediaProcessor;
    const imports = {
      worker: { close: vi.fn(async () => void sequence.push('imports')) },
    } as unknown as ImportsProcessor;

    shutdown.register({
      name: 'Redis',
      order: SHUTDOWN_ORDER.redis,
      close: () => void sequence.push('redis'),
    });
    shutdown.register({
      name: 'MongoDB',
      order: SHUTDOWN_ORDER.mongo,
      close: () => void sequence.push('mongo'),
    });

    new WorkersShutdown(media, imports, shutdown).onModuleInit();

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'BullMQ workers', order: SHUTDOWN_ORDER.queues }),
    );

    await shutdown.onApplicationShutdown('SIGTERM');

    expect(media.worker.close).toHaveBeenCalledOnce();
    expect(imports.worker.close).toHaveBeenCalledOnce();
    expect(sequence).toEqual(['media', 'imports', 'redis', 'mongo']);
  });

  it('espera a los trabajos en curso antes de cerrar Redis', async () => {
    const shutdown = new ShutdownService();
    const redisClose = vi.fn();
    let finishJob: (() => void) | undefined;

    const media = {
      worker: {
        close: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              finishJob = resolve;
            }),
        ),
      },
    } as unknown as MediaProcessor;
    const imports = {
      worker: { close: vi.fn(async () => undefined) },
    } as unknown as ImportsProcessor;

    shutdown.register({ name: 'Redis', order: SHUTDOWN_ORDER.redis, close: redisClose });
    new WorkersShutdown(media, imports, shutdown).onModuleInit();

    const shuttingDown = shutdown.onApplicationShutdown('SIGTERM');
    expect(redisClose).not.toHaveBeenCalled();

    finishJob?.();
    await shuttingDown;

    expect(redisClose).toHaveBeenCalledOnce();
  });
});
