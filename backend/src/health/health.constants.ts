/** Tiempo máximo que puede tardar cada dependencia en el health check. */
export const HEALTH_CHECK_TIMEOUT_MS = 2_000;

/** Claves con las que aparecen las dependencias en la respuesta de `/api/health`. */
export const HEALTH_KEYS = {
  mongo: 'mongo',
  redis: 'redis',
  storage: 'storage',
} as const;
