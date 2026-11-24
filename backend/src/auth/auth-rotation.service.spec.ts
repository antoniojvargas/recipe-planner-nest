import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import type { PinoLogger } from 'nestjs-pino';
import { InMemoryRefreshSessionsRepository } from '../../test/support/in-memory-refresh-sessions.repository.js';
import { AppException } from '../common/exceptions/app.exception.js';
import type { HouseholdsRepository } from '../households/households.repository.js';
import type { UsersRepository } from '../users/users.repository.js';
import { AuthService } from './auth.service.js';
import type { AuthClock } from './auth.clock.js';
import { hashRefreshToken, type AuthTokensService } from './auth-tokens.service.js';
import {
  EXPIRED_SESSION_MESSAGE,
  INVALID_SESSION_MESSAGE,
  REFRESH_ROTATION_GRACE_MS,
} from './auth.constants.js';
import type { PasswordHasher } from './password.hasher.js';

const NOW = new Date('2026-11-13T12:00:00.000Z');

function fixedClock(at: Date = NOW): AuthClock & { at: Date } {
  return {
    at: new Date(at),
    now() {
      return new Date(this.at);
    },
  };
}

function createTokens(): AuthTokensService & { issued: string[] } {
  let counter = 0;
  const issued: string[] = [];

  return {
    issued,
    createAccessToken: vi.fn((userId: string, familyId: string) =>
      Promise.resolve(`access:${userId}:${familyId}:${String(++counter)}`),
    ),
    createRefreshToken: vi.fn(() => {
      const token = `refresh-${String(++counter)}`;
      issued.push(token);

      return {
        token,
        tokenHash: hashRefreshToken(token),
        expiresAt: new Date('2026-12-13T12:00:00.000Z'),
      };
    }),
    verifyAccessToken: vi.fn(),
  } as unknown as AuthTokensService & { issued: string[] };
}

function createRotationService(clock: AuthClock & { at: Date } = fixedClock()) {
  const refreshSessions = new InMemoryRefreshSessionsRepository();
  const tokens = createTokens();
  const logger = { setContext: vi.fn(), warn: vi.fn() };

  const service = new AuthService(
    {} as UsersRepository,
    {} as HouseholdsRepository,
    refreshSessions as unknown as ConstructorParameters<typeof AuthService>[2],
    {} as PasswordHasher,
    tokens,
    logger as unknown as PinoLogger,
    clock,
  );

  return { service, refreshSessions, tokens, clock, logger };
}

async function seedFamily(
  refreshSessions: InMemoryRefreshSessionsRepository,
  {
    familyId = 'family-1',
    userId = new Types.ObjectId(),
    token = 'refresh-seed',
    expiresAt = new Date('2026-12-13T12:00:00.000Z'),
  } = {},
) {
  await refreshSessions.create({
    familyId,
    userId: userId.toString(),
    tokenHash: hashRefreshToken(token),
    expiresAt,
  });

  return { familyId, userId, token };
}

async function captureError(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);

    return error as AppException;
  }

  throw new Error('Se esperaba un AppException');
}

describe('AuthService: rotación de refresh tokens', () => {
  it('rota el token: marca el anterior como usado y emite el siguiente en la misma familia', async () => {
    const { service, refreshSessions, clock } = createRotationService();
    const { familyId, userId, token } = await seedFamily(refreshSessions);

    const issued = await service.refresh(token);

    expect(issued.refreshToken).toBe('refresh-1');
    expect(issued.accessToken).toContain(userId.toString());
    expect(issued.accessToken).toContain(familyId);

    const previous = refreshSessions.sessions.find(
      (session) => session.tokenHash === hashRefreshToken(token),
    );
    expect(previous?.usedAt).toEqual(clock.at);
    expect(previous?.revokedAt).toBeNull();

    const next = refreshSessions.sessions.find(
      (session) => session.tokenHash === hashRefreshToken(issued.refreshToken),
    );
    expect(next?.familyId).toBe(familyId);
    expect(next?.userId.toString()).toBe(userId.toString());
    expect(next?.usedAt).toBeNull();
    expect(next?.revokedAt).toBeNull();
  });

  it('rechaza un refresh token caducado sin revocar la familia', async () => {
    const clock = fixedClock(new Date('2026-12-20T12:00:00.000Z'));
    const { service, refreshSessions } = createRotationService(clock);
    const { familyId, token } = await seedFamily(refreshSessions, {
      expiresAt: new Date('2026-12-10T12:00:00.000Z'),
    });

    const error = await captureError(service.refresh(token));

    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(error.message).toBe(EXPIRED_SESSION_MESSAGE);
    expect(refreshSessions.liveByFamily(familyId, clock.now())).toHaveLength(0);
    expect(refreshSessions.sessions[0]?.revokedAt).toBeNull();
  });

  it('si se reutiliza un token ya canjeado, revoca toda la familia y no emite credenciales', async () => {
    const clock = fixedClock();
    const { service, refreshSessions, logger } = createRotationService(clock);
    const { familyId, userId, token } = await seedFamily(refreshSessions);

    const first = await service.refresh(token);
    clock.at = new Date(clock.at.getTime() + REFRESH_ROTATION_GRACE_MS + 1);
    const error = await captureError(service.refresh(token));

    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe(INVALID_SESSION_MESSAGE);

    const sessions = refreshSessions.sessions.filter((session) => session.familyId === familyId);
    expect(
      sessions.every((session) => session.revokedAt?.getTime() === clock.now().getTime()),
    ).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      { userId: userId.toString(), familyId },
      'Refresh token reutilizado: familia revocada',
    );

    // El token emitido en la rotación legítima ya no puede usarse porque la familia está revocada.
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(AppException);
  });

  it('con dos refresh concurrentes del mismo token, ambas pestañas renuevan y la familia no se revoca', async () => {
    const { service, refreshSessions } = createRotationService();
    const { familyId, token } = await seedFamily(refreshSessions);

    // Dos pestañas presentan el mismo refresh token a la vez (misma familia).
    const results = await Promise.allSettled([service.refresh(token), service.refresh(token)]);
    const rejected = results.filter((result) => result.status === 'rejected');

    // Ninguna pestaña debe perder la sesión por una carrera legítima.
    expect(rejected).toHaveLength(0);

    const fulfilled = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    expect(fulfilled).toHaveLength(2);
    expect(fulfilled.every((issued) => issued.refreshToken !== '')).toBe(true);

    const sessions = refreshSessions.sessions.filter((session) => session.familyId === familyId);
    expect(sessions.every((session) => session.revokedAt === null)).toBe(true);
  });

  it('dentro de la ventana de gracia, repetir el token emite otro sucesor sin revocar', async () => {
    const clock = fixedClock();
    const { service, refreshSessions } = createRotationService(clock);
    const { familyId, token } = await seedFamily(refreshSessions);

    const first = await service.refresh(token);
    clock.at = new Date(clock.at.getTime() + REFRESH_ROTATION_GRACE_MS - 1);

    const second = await service.refresh(token);

    expect(second.refreshToken).not.toBe(first.refreshToken);

    const sessions = refreshSessions.sessions.filter((session) => session.familyId === familyId);
    expect(sessions.every((session) => session.revokedAt === null)).toBe(true);
    // El original quedó usado; los dos sucesores siguen vivos.
    expect(sessions.filter((session) => session.usedAt === null)).toHaveLength(2);
  });

  it('pasada la ventana de gracia, repetir el token revoca la familia', async () => {
    const clock = fixedClock();
    const { service, refreshSessions, logger } = createRotationService(clock);
    const { familyId, userId, token } = await seedFamily(refreshSessions);

    await service.refresh(token);
    clock.at = new Date(clock.at.getTime() + REFRESH_ROTATION_GRACE_MS + 1);

    const error = await captureError(service.refresh(token));

    expect(error.code).toBe('UNAUTHORIZED');
    expect(logger.warn).toHaveBeenCalledWith(
      { userId: userId.toString(), familyId },
      'Refresh token reutilizado: familia revocada',
    );

    const sessions = refreshSessions.sessions.filter((session) => session.familyId === familyId);
    expect(sessions.every((session) => session.revokedAt?.getTime() === clock.at.getTime())).toBe(
      true,
    );
  });

  it('un token usado no reabre la familia si ya se revocó', async () => {
    const clock = fixedClock();
    const { service, refreshSessions } = createRotationService(clock);
    const { familyId, token } = await seedFamily(refreshSessions);

    await service.refresh(token);
    await refreshSessions.revokeFamily(familyId, clock.now());

    const sessionsBefore = refreshSessions.sessions.length;
    const error = await captureError(service.refresh(token));

    expect(error.code).toBe('UNAUTHORIZED');
    expect(refreshSessions.sessions).toHaveLength(sessionsBefore);
  });

  it('logout revoca la familia usando el reloj inyectable', async () => {
    const clock = fixedClock(new Date('2026-11-13T15:00:00.000Z'));
    const { service, refreshSessions, tokens } = createRotationService(clock);
    const { familyId, token } = await seedFamily(refreshSessions);

    tokens.verifyAccessToken = vi.fn().mockResolvedValue({
      status: 'valid',
      userId: refreshSessions.sessions[0]?.userId.toString(),
      familyId,
    });

    await service.logout('access-token');

    expect(refreshSessions.sessions[0]?.revokedAt).toEqual(clock.at);
    await expect(service.refresh(token)).rejects.toBeInstanceOf(AppException);
  });
});
