import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { RealtimeRoomsModule } from './realtime-rooms.module.js';
import { RealtimeGateway } from './realtime.gateway.js';

/**
 * Gateway Socket.IO del namespace `/realtime` y su publicador de eventos.
 *
 * Importa `AuthModule` para reutilizar `AuthTokensService` (el handshake valida el mismo JWT
 * que el guard HTTP) y `HouseholdsModule` para saber a qué salas unir cada socket. Las salas
 * viven en `RealtimeRoomsModule`, que `HouseholdsModule` también importa para actualizarlas
 * cuando cambia una membresía.
 */
@Module({
  imports: [AuthModule, HouseholdsModule, RealtimeRoomsModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
