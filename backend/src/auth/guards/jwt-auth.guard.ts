import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '@recipe-planner/contracts';
import type { FastifyRequest } from 'fastify';
import { AppException } from '../../common/exceptions/app.exception.js';
import {
  ACCESS_TOKEN_COOKIE,
  EXPIRED_SESSION_MESSAGE,
  INVALID_SESSION_MESSAGE,
} from '../auth.constants.js';
import { AuthTokensService } from '../auth-tokens.service.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * Guard global de autenticación. Lee la cookie `access_token`, la verifica y deja el
 * usuario en `request.user`.
 *
 * Un token caducado responde `401 TOKEN_EXPIRED` para que el cliente refresque y reintente;
 * cualquier otro caso (ausente, firma inválida, claims incompletos) responde `401
 * UNAUTHORIZED` sin distinguir el motivo. Las rutas marcadas con `@Public()` se omiten.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AuthTokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const verification = await this.tokens.verifyAccessToken(request.cookies[ACCESS_TOKEN_COOKIE]);

    switch (verification.status) {
      case 'valid':
        request.user = { id: verification.userId, familyId: verification.familyId };
        return true;
      case 'expired':
        throw new AppException({
          status: HttpStatus.UNAUTHORIZED,
          code: ERROR_CODES.TOKEN_EXPIRED,
          message: EXPIRED_SESSION_MESSAGE,
        });
      case 'invalid':
        throw new AppException({
          status: HttpStatus.UNAUTHORIZED,
          code: ERROR_CODES.UNAUTHORIZED,
          message: INVALID_SESSION_MESSAGE,
        });
    }
  }
}
