import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import { authConfig, type AuthConfig } from '../config/index.js';
import { REFRESH_TOKEN_BYTES, REFRESH_TOKEN_TTL_MS } from './auth.constants.js';

export interface IssuedRefreshToken {
  /** Token en claro: solo viaja en la cookie, nunca se guarda. */
  token: string;
  /** SHA-256 en hexadecimal: lo único que se persiste. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Emisión de las dos credenciales de sesión.
 *
 * El access token es un JWT HS256 firmado con `JWT_ACCESS_SECRET` que solo lleva `sub`,
 * `iat` y `exp`. El refresh token es opaco (256 bits aleatorios en base64url): su validez
 * la decide la fila de `refresh_sessions`, no una firma.
 */
@Injectable()
export class AuthTokensService {
  private readonly accessKey: Uint8Array;
  private readonly accessTokenTtl: string;

  constructor(@Inject(authConfig.KEY) config: AuthConfig) {
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

  createRefreshToken(): IssuedRefreshToken {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

    return {
      token,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    };
  }
}

/** Hash determinista que permite buscar la fila por igualdad, sin guardar el token. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
