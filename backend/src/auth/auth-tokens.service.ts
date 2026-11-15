import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import { authConfig, type AuthConfig } from '../config/index.js';
import { AUTH_CLOCK, type AuthClock } from './auth.clock.js';
import { REFRESH_TOKEN_BYTES, REFRESH_TOKEN_TTL_MS } from './auth.constants.js';

export interface IssuedRefreshToken {
  /** Token en claro: solo viaja en la cookie, nunca se guarda. */
  token: string;
  /** SHA-256 en hexadecimal: lo único que se persiste. */
  tokenHash: string;
  expiresAt: Date;
}

/** Resultado de verificar un access token; el guard decide qué error HTTP corresponde. */
export type AccessTokenVerification =
  | {
      status: 'valid';
      userId: string;
      familyId: string;
      /** Instante de `exp`, para que el socket de larga duración se cierre al caducar. */
      expiresAt: Date;
    }
  | { status: 'expired' }
  | { status: 'invalid' };

/**
 * Emisión y verificación de las dos credenciales de sesión.
 *
 * El access token es un JWT HS256 firmado con `JWT_ACCESS_SECRET` que lleva `sub`, `fid`
 * (la familia de refresh), `iat` y `exp`. El refresh token es opaco (256 bits aleatorios en
 * base64url): su validez la decide la fila de `refresh_sessions`, no una firma.
 */
@Injectable()
export class AuthTokensService {
  private readonly accessKey: Uint8Array;
  private readonly accessTokenTtl: string;

  constructor(
    @Inject(authConfig.KEY) config: AuthConfig,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {
    this.accessKey = new TextEncoder().encode(config.accessSecret);
    this.accessTokenTtl = config.accessTokenTtl;
  }

  createAccessToken(userId: string, familyId: string): Promise<string> {
    return new SignJWT({ fid: familyId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(this.accessTokenTtl)
      .sign(this.accessKey);
  }

  /**
   * Verifica firma y caducidad. La distinción entre caducado e inválido importa: el
   * cliente solo intenta refrescar en el primer caso.
   */
  async verifyAccessToken(token: string | undefined): Promise<AccessTokenVerification> {
    if (token === undefined || token === '') {
      return { status: 'invalid' };
    }

    try {
      const { payload } = await jwtVerify(token, this.accessKey, { algorithms: ['HS256'] });

      if (
        typeof payload.sub !== 'string' ||
        typeof payload.fid !== 'string' ||
        typeof payload.exp !== 'number'
      ) {
        return { status: 'invalid' };
      }

      return {
        status: 'valid',
        userId: payload.sub,
        familyId: payload.fid,
        expiresAt: new Date(payload.exp * 1_000),
      };
    } catch (error) {
      return error instanceof errors.JWTExpired ? { status: 'expired' } : { status: 'invalid' };
    }
  }

  createRefreshToken(): IssuedRefreshToken {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

    return {
      token,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(this.clock.now().getTime() + REFRESH_TOKEN_TTL_MS),
    };
  }
}

/** Hash determinista que permite buscar la fila por igualdad, sin guardar el token. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
