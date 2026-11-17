import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CSRF_COOKIE, CSRF_COOKIE_MAX_AGE_SECONDS } from './csrf.constants.js';

export interface CsrfCookieOptions {
  secure: boolean;
}

/** Genera un token aleatorio para el patrón double submit. */
export function createCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Escribe la cookie CSRF legible por el cliente (no `httpOnly`). */
export function setCsrfCookie(
  reply: FastifyReply,
  token: string,
  { secure }: CsrfCookieOptions,
): void {
  reply.setCookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    // `Path=/` para que el middleware de Next pueda firmar el refresh de una navegación.
    path: '/',
    maxAge: CSRF_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Garantiza que la respuesta emita una cookie CSRF si la petición no traía una. */
export function ensureCsrfCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  options: CsrfCookieOptions,
): string {
  const existing = request.cookies[CSRF_COOKIE];

  if (typeof existing === 'string' && existing.length > 0) {
    return existing;
  }

  const token = createCsrfToken();
  setCsrfCookie(reply, token, options);

  return token;
}
