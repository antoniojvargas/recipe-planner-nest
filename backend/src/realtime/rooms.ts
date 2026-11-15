/**
 * Nombres de las salas de Socket.IO.
 *
 * Las salas no son un contrato con el frontend: los clientes no se unen a ellas, es el
 * servidor quien decide qué eventos recibe cada socket. Por eso viven en el backend y no en
 * `packages/contracts`.
 */

const HOUSEHOLD_ROOM_PREFIX = 'household:';
const USER_ROOM_PREFIX = 'user:';

/** Sala que agrupa a todos los clientes de un hogar; recibe sus eventos de dominio. */
export function householdRoom(householdId: string): string {
  return `${HOUSEHOLD_ROOM_PREFIX}${householdId}`;
}

/**
 * Sala privada de un usuario con todas sus conexiones abiertas, en cualquier réplica. Sirve
 * para actualizar sus salas cuando cambia de hogar sin recorrer los sockets uno a uno.
 */
export function userRoom(userId: string): string {
  return `${USER_ROOM_PREFIX}${userId}`;
}
