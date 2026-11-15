import { Module } from '@nestjs/common';
import { RealtimePublisherService } from './realtime-publisher.service.js';
import { REALTIME_PUBLISHER } from './realtime-publisher.js';

/**
 * Publicador de eventos de Socket.IO, sin dependencias de módulos de dominio.
 *
 * Lo importan `RealtimeModule` (para que el gateway entregue su namespace), los módulos que
 * emiten eventos y `WorkerModule` (donde no hay gateway y se publica por Redis). Al ser un
 * único módulo compartido, todos reciben la misma instancia.
 */
@Module({
  providers: [
    RealtimePublisherService,
    { provide: REALTIME_PUBLISHER, useExisting: RealtimePublisherService },
  ],
  exports: [RealtimePublisherService, REALTIME_PUBLISHER],
})
export class RealtimePublisherModule {}
