import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/** Identidad que el `JwtAuthGuard` deja en la petición tras verificar el access token. */
export interface AuthenticatedUser {
  id: string;
  familyId: string;
}

/**
 * Extrae el usuario autenticado de la petición. Solo está disponible en rutas protegidas por
 * `JwtAuthGuard` (todas salvo las marcadas con `@Public()`).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: AuthenticatedUser }>();

    return request.user;
  },
);
