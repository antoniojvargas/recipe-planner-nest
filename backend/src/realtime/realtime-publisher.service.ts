import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  REALTIME_NAMESPACE,
  type SocketEventName,
  type SocketEventPayload,
} from '@recipe-planner/contracts';
import { Emitter } from '@socket.io/redis-emitter';
import type { Namespace } from 'socket.io';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis.module.js';
import type { RealtimePublisher } from './realtime-publisher.js';
import { REALTIME_REDIS_KEY } from './redis-io.adapter.js';
import { householdRoom } from './rooms.js';

/**
 * Implementación única para la API y el worker.
 *
 * - En la API, el gateway entrega su namespace en `attach` y el evento se emite a la sala
 *   `household:{id}`. Con el adaptador de Redis, eso alcanza a los sockets de todas las
 *   réplicas, no solo a los de este proceso.
 * - En el worker no hay gateway ni sockets: `publish` usa `@socket.io/redis-emitter` para
 *   publicar en el mismo canal y namespace que escucha el adaptador.
 *
 * El emisor de Redis ignora la promesa de `publish`; para que un Redis caído no deje una
 * promesa rechazada sin manejar, se le pasa un cliente cuyo `publish` ya captura el error.
 */
@Injectable()
export class RealtimePublisherService implements RealtimePublisher {
  private readonly logger = new Logger(RealtimePublisherService.name);
  private readonly emitter: Emitter;
  private server?: Namespace;

  constructor(@Inject(REDIS_CLIENT) redis: RedisClient) {
    const safeRedis = {
      publish: async (channel: string, message: string): Promise<number> => {
        try {
          return await redis.publish(channel, message);
        } catch (error) {
          this.logger.error(
            'No se pudo publicar el evento en Redis',
            error instanceof Error ? error.stack : String(error),
          );

          return 0;
        }
      },
    };

    this.emitter = new Emitter(safeRedis, { key: REALTIME_REDIS_KEY });
  }

  /** El gateway entrega su namespace al inicializarse; sin él se usa el emisor de Redis. */
  attach(server: Namespace): void {
    this.server = server;
  }

  publish<E extends SocketEventName>(event: E, payload: SocketEventPayload<E>): void {
    try {
      const room = householdRoom(payload.householdId);

      if (this.server !== undefined) {
        this.server.to(room).emit(event, payload);
        return;
      }

      this.emitter.of(REALTIME_NAMESPACE).to(room).emit(event, payload);
    } catch (error) {
      // La escritura ya está hecha. Se registra y se sigue: el peor caso es que ese socket
      // tarde en ver el cambio hasta que recargue o se reconecte.
      this.logger.error(
        `No se pudo emitir ${event}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
