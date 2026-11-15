import { Injectable, Logger } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import type { RealtimeSocket } from './realtime.gateway.js';
import { householdRoom, userRoom } from './rooms.js';

/**
 * Mantiene las salas de los sockets al día.
 *
 * Al conectar, el gateway une el socket a `user:{id}` y a `household:{id}` de cada uno de sus
 * hogares. Cuando la membresía cambia, `onJoined`/`onLeft` actualizan **todas** las conexiones
 * abiertas de ese usuario: `namespace.in('user:id').socketsJoin(...)` funciona también con el
 * adaptador de Redis, así que alcanza a los sockets conectados a otras réplicas.
 *
 * Un fallo al actualizar salas no puede tumbar la escritura que ya se confirmó: se registra y
 * se sigue. El peor caso es que un socket tarde en ver el cambio hasta que se reconecte.
 */
@Injectable()
export class RealtimeRoomsService {
  private readonly logger = new Logger(RealtimeRoomsService.name);
  private server?: Namespace;

  /** El gateway entrega su namespace al inicializarse; sin él (worker, seed) no hay salas. */
  attach(server: Namespace): void {
    this.server = server;
  }

  /** Une el socket recién conectado a la sala privada de su usuario. */
  async joinUserChannel(socket: RealtimeSocket): Promise<void> {
    await socket.join(userRoom(socket.data.user.id));
  }

  /** Une los sockets abiertos del usuario a la sala del hogar al que acaba de entrar. */
  onJoined(userId: string, householdId: string): void {
    this.updateRooms(userId, householdRoom(householdId), 'socketsJoin');
  }

  /** Saca los sockets abiertos del usuario de la sala del hogar que acaba de abandonar. */
  onLeft(userId: string, householdId: string): void {
    this.updateRooms(userId, householdRoom(householdId), 'socketsLeave');
  }

  private updateRooms(userId: string, room: string, action: 'socketsJoin' | 'socketsLeave'): void {
    const server = this.server;

    if (server === undefined) {
      return;
    }

    try {
      server.in(userRoom(userId))[action](room);
    } catch (error) {
      this.logger.error(
        `No se pudieron actualizar las salas de ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
