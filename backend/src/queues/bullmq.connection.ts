import type { ConnectionOptions } from 'bullmq';

/**
 * Traduce `REDIS_URL` a las opciones que espera BullMQ.
 *
 * BullMQ no acepta la URL como cadena: necesita host, puerto y credenciales por separado.
 * `maxRetriesPerRequest: null` es obligatorio para los workers, porque bloquean esperando
 * trabajos y ioredis abortaría la espera con el valor por defecto.
 */
export function bullMqConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const database = url.pathname.replace(/^\//, '');

  return {
    host: url.hostname,
    port: url.port === '' ? 6379 : Number(url.port),
    ...(url.username === '' ? {} : { username: decodeURIComponent(url.username) }),
    ...(url.password === '' ? {} : { password: decodeURIComponent(url.password) }),
    ...(database === '' ? {} : { db: Number(database) }),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
