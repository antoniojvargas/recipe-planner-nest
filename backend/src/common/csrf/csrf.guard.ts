import { HttpStatus, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ERROR_CODES } from '@recipe-planner/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { appConfig, type AppConfig } from '../../config/index.js';
import { AppException } from '../exceptions/app.exception.js';
import { ensureCsrfCookie } from './csrf-cookie.js';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  CSRF_ORIGIN_MESSAGE,
  CSRF_TOKEN_MESSAGE,
  SAFE_METHODS,
} from './csrf.constants.js';

/**
 * Protege las mutaciones con dos capas:
 *
 * 1. **Origin**: el `Origin` debe coincidir con `FRONTEND_URL`, lo que bloquea envíos
 *    cross-site desde navegadores.
 * 2. **Double submit**: la cookie `csrf_token` (legible por JS) debe coincidir con la
 *    cabecera `X-CSRF-Token`. Un sitio atacante no puede leer la cookie de otro origen ni,
 *    por tanto, reproducir su valor en la cabecera.
 *
 * La segunda capa se añade porque el refresh token tiene vida larga (30 días): si en algún
 * contexto el navegador adjunta credenciales de forma inesperada o una comprobación de
 * origen resulta insuficiente, el atacante seguiría sin poder forjar la cabecera con el
 * valor de la cookie. Las peticiones seguras (GET/HEAD/OPTIONS) no modifican estado y se
 * omiten.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly frontendOrigin: string;
  private readonly secure: boolean;

  constructor(@Inject(appConfig.KEY) config: AppConfig) {
    this.frontendOrigin = config.frontendUrl.replace(/\/$/, '');
    this.secure = config.env === 'production';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    // Asegura que el cliente siempre reciba un token para poder firmar sus mutaciones.
    ensureCsrfCookie(request, reply, { secure: this.secure });

    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    this.assertAllowedOrigin(request);
    this.assertMatchingToken(request);

    return true;
  }

  private assertAllowedOrigin(request: FastifyRequest): void {
    const origin = request.headers.origin;

    if (typeof origin !== 'string' || origin !== this.frontendOrigin) {
      throw new AppException({
        status: HttpStatus.FORBIDDEN,
        code: ERROR_CODES.FORBIDDEN,
        message: CSRF_ORIGIN_MESSAGE,
      });
    }
  }

  private assertMatchingToken(request: FastifyRequest): void {
    const cookieToken = request.cookies[CSRF_COOKIE];
    const headerToken = request.headers[CSRF_HEADER];
    const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken;

    if (
      typeof cookieToken !== 'string' ||
      cookieToken.length === 0 ||
      typeof headerValue !== 'string' ||
      headerValue.length === 0 ||
      cookieToken !== headerValue
    ) {
      throw new AppException({
        status: HttpStatus.FORBIDDEN,
        code: ERROR_CODES.FORBIDDEN,
        message: CSRF_TOKEN_MESSAGE,
      });
    }
  }
}
