import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { RealtimeRoomsModule } from './realtime-rooms.module.js';
import { RealtimePublisherModule } from './realtime-publisher.module.js';
import { RealtimeGateway } from './realtime.gateway.js';

/**
 * Gateway Socket.IO del namespace `/realtime` y sus salas.
 *
 * Importa `AuthModule` para reutilizar `AuthTokensService` (el handshake valida el mismo JWT
 * que el guard HTTP) y `HouseholdsModule` para saber a qué salas unir cada socket. Las salas
 * viven en `RealtimeRoomsModule` y el publicador en `RealtimePublisherModule`, que el resto de
 * módulos importa sin arrastrar el gateway.
 */
@Module({
  imports: [AuthModule, HouseholdsModule, RealtimeRoomsModule, RealtimePublisherModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
