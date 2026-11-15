import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeGateway } from './realtime.gateway.js';

/**
 * Gateway Socket.IO del namespace `/realtime` y su publicador de eventos.
 *
 * Importa `AuthModule` para reutilizar `AuthTokensService`: el handshake valida el mismo JWT
 * que el guard HTTP, sin duplicar el secreto ni la lógica de verificación.
 */
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
