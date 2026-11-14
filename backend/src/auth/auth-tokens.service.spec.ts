import { decodeJwt, jwtVerify, SignJWT } from 'jose';
import type { AuthConfig } from '../config/index.js';
import { AuthTokensService, hashRefreshToken } from './auth-tokens.service.js';
import { REFRESH_TOKEN_TTL_MS } from './auth.constants.js';

const CONFIG: AuthConfig = {
  accessSecret: 'test-access-secret-with-32-characters-minimum',
  refreshSecret: 'test-refresh-secret-with-32-characters-minimum',
  accessTokenTtl: '15m',
  refreshTokenTtl: '30d',
};

describe('AuthTokensService', () => {
  const service = new AuthTokensService(CONFIG);

  it('firma un JWT HS256 con sub, familia y 15 minutos de vida', async () => {
    const token = await service.createAccessToken(
      '507f1f77bcf86cd799439011',
      '6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c',
    );
    const claims = decodeJwt(token);

    expect(claims.sub).toBe('507f1f77bcf86cd799439011');
    expect(claims.fid).toBe('6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c');
    expect(claims.iat).toBeTypeOf('number');
    expect(claims.exp).toBeTypeOf('number');
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(15 * 60);

    await expect(
      jwtVerify(token, new TextEncoder().encode(CONFIG.accessSecret)),
    ).resolves.toBeDefined();
  });

  describe('verifyAccessToken', () => {
    const userId = '507f1f77bcf86cd799439011';
    const familyId = '6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c';
    const key = new TextEncoder().encode(CONFIG.accessSecret);

    it('devuelve el usuario y la familia de un token válido', async () => {
      const token = await service.createAccessToken(userId, familyId);

      await expect(service.verifyAccessToken(token)).resolves.toEqual({
        status: 'valid',
        userId,
        familyId,
      });
    });

    it('distingue un token caducado de uno inválido', async () => {
      const expired = await new SignJWT({ fid: familyId })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setExpirationTime(Math.floor(Date.now() / 1_000) - 60)
        .sign(key);

      await expect(service.verifyAccessToken(expired)).resolves.toEqual({ status: 'expired' });
    });

    it('rechaza un token con otra firma, sin claims o ausente', async () => {
      const foreign = await new SignJWT({ fid: familyId })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setExpirationTime('15m')
        .sign(new TextEncoder().encode('otro-secreto-de-al-menos-32-caracteres'));

      const withoutFamily = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setExpirationTime('15m')
        .sign(key);

      for (const token of [foreign, withoutFamily, undefined, '']) {
        await expect(service.verifyAccessToken(token)).resolves.toEqual({ status: 'invalid' });
      }
    });
  });

  it('genera un refresh opaco de 256 bits y guarda solo su hash', () => {
    const refresh = service.createRefreshToken();

    expect(refresh.token).toHaveLength(43);
    expect(refresh.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(refresh.tokenHash).toHaveLength(64);
    expect(refresh.tokenHash).toBe(hashRefreshToken(refresh.token));
    expect(refresh.tokenHash).not.toContain(refresh.token);
    expect(refresh.expiresAt.getTime()).toBeGreaterThanOrEqual(
      Date.now() + REFRESH_TOKEN_TTL_MS - 1_000,
    );
  });

  it('cada refresh es distinto', () => {
    const first = service.createRefreshToken();
    const second = service.createRefreshToken();

    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });
});
