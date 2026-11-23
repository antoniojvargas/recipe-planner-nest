import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ImportsProcessor } from '../imports/imports.processor.js';
import { MediaProcessor } from '../media/media.processor.js';
import { SHUTDOWN_ORDER } from '../shutdown/shutdown.constants.js';
import { ShutdownService } from '../shutdown/shutdown.service.js';

/**
 * Cierra los workers de BullMQ dentro de la secuencia ordenada de apagado.
 *
 * `@nestjs/bullmq` ya llama a `worker.close()` en `onModuleDestroy`, que espera a los
 * trabajos en curso. Registrarlo también aquí —`close()` es idempotente— garantiza que
 * ese cierre termine antes de que `ShutdownService` corte Redis y Mongo: si Redis se
 * fuera primero, un trabajo que aún publica su resultado no podría reconectar.
 */
@Injectable()
export class WorkersShutdown implements OnModuleInit {
  constructor(
    private readonly media: MediaProcessor,
    private readonly imports: ImportsProcessor,
    private readonly shutdown: ShutdownService,
  ) {}

  onModuleInit(): void {
    this.shutdown.register({
      name: 'BullMQ workers',
      order: SHUTDOWN_ORDER.queues,
      // Se accede al worker aquí y no en `onModuleInit` porque lo crea BullMQ al
      // inicializar los `@Processor`, después de este hook.
      close: async () => {
        await Promise.all([this.media.worker.close(), this.imports.worker.close()]);
      },
    });
  }
}
