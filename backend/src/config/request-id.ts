import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/** Cabecera con la que se correlacionan los logs de la API, el frontend y el proxy. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Reutiliza el `X-Request-Id` que llega (recortado) o genera uno nuevo.
 */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  if (typeof incoming === 'string') {
    const trimmed = incoming.trim();

    if (trimmed !== '') {
      return trimmed;
    }
  }

  return randomUUID();
}

/**
 * Opciones del adaptador Fastify. El id se genera en Fastify y no en `pino-http`
 * porque Fastify rellena `request.id` antes de que corra el middleware, y
 * `pino-http` respeta el id existente sin llamar a su propio `genReqId`.
 */
export function requestIdAdapterOptions(): {
  genReqId: (request: { headers: Record<string, string | string[] | undefined> }) => string;
} {
  return {
    genReqId: (request) => resolveRequestId(request.headers[REQUEST_ID_HEADER]),
  };
}

/** Devuelve el id en la respuesta para que el cliente pueda citarlo al reportar un error. */
export function exposeRequestId(app: NestFastifyApplication): void {
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      reply.header(REQUEST_ID_HEADER, request.id);
      done();
    });
}
