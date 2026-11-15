import type { SocketEventName, SocketEventPayload } from '@recipe-planner/contracts';

/**
 * Token del publicador de eventos de Socket.IO.
 *
 * Los servicios de dominio emiten a través de esta interfaz y no conocen el transporte: en la
 * API el evento sale por el namespace del gateway y en el worker por el emisor de Redis.
 */
export const REALTIME_PUBLISHER = Symbol('REALTIME_PUBLISHER');

/**
 * Publica un evento del catálogo de `packages/contracts` en la sala del hogar del payload.
 *
 * Es síncrono y no lanza: la escritura que originó el evento ya está confirmada y un fallo al
 * notificar no puede deshacerla ni devolver un error al cliente.
 */
export interface RealtimePublisher {
  publish<E extends SocketEventName>(event: E, payload: SocketEventPayload<E>): void;
}
