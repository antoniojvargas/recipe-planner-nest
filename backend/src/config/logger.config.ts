import type { Options } from 'pino-http';
import type { AppConfig } from './app.config.js';

export interface LoggerOptions {
  pinoHttp: Options;
}

/**
 * Opciones de `nestjs-pino` para la API.
 *
 * - En desarrollo se formatea con `pino-pretty`; en el resto se emite JSON de una línea,
 *   que es lo que consumen el colector de logs y Observe.
 * - `redact` tapa las cookies, el `Authorization` y el `Set-Cookie` antes de serializar:
 *   los tokens viven en cookies `httpOnly` y no deben aparecer en los logs.
 *
 * El `X-Request-Id` no se genera aquí: Fastify ya rellena `request.id` y `pino-http`
 * respeta ese id, así que la cabecera se resuelve en `request-id.ts`.
 */
export function createLoggerOptions(config: AppConfig): LoggerOptions {
  const isDevelopment = config.env === 'development';

  return {
    pinoHttp: {
      level: config.logLevel,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[Redacted]',
      },
      transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:mm:ss.l',
              colorize: true,
            },
          }
        : undefined,
    },
  };
}
