/**
 * Orden de cierre al apagar la API: primero lo que deja de aceptar trabajo nuevo
 * (sockets y colas) y al final las conexiones que comparten todos los módulos.
 *
 * Los módulos que se añadan en fases posteriores (Socket.IO, BullMQ) deben registrar sus
 * tareas con estas constantes en lugar de implementar `onApplicationShutdown` por su cuenta.
 */
export const SHUTDOWN_ORDER = {
  realtime: 10,
  queues: 20,
  redis: 30,
  mongo: 40,
} as const;
