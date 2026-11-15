import { Module } from '@nestjs/common';
import { RealtimeRoomsService } from './realtime-rooms.service.js';

/**
 * Salas de Socket.IO, sin dependencias de ningún módulo de dominio.
 *
 * Vive aparte de `RealtimeModule` para que `HouseholdsModule` pueda pedir la actualización de
 * salas al unirse o salir de un hogar sin crear un ciclo: `RealtimeModule` importa
 * `HouseholdsModule` para resolver los hogares del usuario al conectar.
 */
@Module({
  providers: [RealtimeRoomsService],
  exports: [RealtimeRoomsService],
})
export class RealtimeRoomsModule {}
