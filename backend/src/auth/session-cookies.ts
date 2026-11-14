import type { FastifyReply } from 'fastify';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_PATH,
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from './auth.constants.js';
import type { AuthSession } from './auth.types.js';

export interface SessionCookieOptions {
  /** `Secure` solo en producción: en desarrollo la API va por HTTP. */
  secure: boolean;
}

/**
 * Escribe las dos cookies de sesión. Es la única parte del módulo que conoce el transporte:
 * el servicio devuelve los tokens y el controlador los publica aquí.
 */
export function setSessionCookies(
  reply: FastifyReply,
  session: Pick<AuthSession, 'accessToken' | 'refreshToken'>,
  { secure }: SessionCookieOptions,
): void {
  reply.setCookie(ACCESS_TOKEN_COOKIE, session.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: ACCESS_TOKEN_COOKIE_PATH,
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });

  reply.setCookie(REFRESH_TOKEN_COOKIE, session.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
}
