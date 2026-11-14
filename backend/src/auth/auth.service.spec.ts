import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import type { PinoLogger } from 'nestjs-pino';
import { UsersRepository } from '../users/users.repository.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { systemAuthClock } from './auth.clock.js';
import { AuthService } from './auth.service.js';
import { AuthTokensService, hashRefreshToken } from './auth-tokens.service.js';
import {
  EXPIRED_SESSION_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  INVALID_SESSION_MESSAGE,
} from './auth.constants.js';
import { PasswordHasher } from './password.hasher.js';
import { RefreshSessionsRepository } from './refresh-sessions.repository.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TX_SESSION = { id: 'transaccion' };

function createService() {
  const users = {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmailWithPassword: vi.fn(),
  };
  const refreshSessions = {
    create: vi.fn().mockResolvedValue({}),
    claimForRotation: vi.fn(),
    findByTokenHash: vi.fn(),
    revokeFamily: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    withTransaction: vi.fn(async (work: (session: unknown) => Promise<unknown>) =>
      work(TX_SESSION),
    ),
  };
  const passwords = {
    hash: vi.fn().mockResolvedValue('$argon2id$hash'),
    verify: vi.fn(),
    verifyDummy: vi.fn().mockResolvedValue(false),
  };
  const tokens = {
    createAccessToken: vi.fn().mockResolvedValue('access.jwt'),
    createRefreshToken: vi.fn().mockReturnValue({
      token: 'opaque-refresh',
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date('2026-12-13T00:00:00.000Z'),
    }),
    verifyAccessToken: vi.fn(),
  };
  const logger = { setContext: vi.fn(), warn: vi.fn() };

  const service = new AuthService(
    users as unknown as UsersRepository,
    refreshSessions as unknown as RefreshSessionsRepository,
    passwords as unknown as PasswordHasher,
    tokens as unknown as AuthTokensService,
    logger as unknown as PinoLogger,
    systemAuthClock,
  );

  return { service, users, refreshSessions, passwords, tokens, logger };
}

function userFixture(passwordHash = '$argon2id$hash') {
  return {
    _id: new Types.ObjectId(),
    email: 'ana@example.com',
    displayName: 'Ana',
    passwordHash,
  };
}

async function captureError(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);

    return error as AppException;
  }

  throw new Error('Se esperaba un error de autenticación');
}

describe('AuthService', () => {
  it('registra el usuario con el hash de la contraseña y abre una familia nueva', async () => {
    const { service, users, refreshSessions, passwords, tokens } = createService();
    const user = userFixture();
    users.create.mockResolvedValue(user);

    const session = await service.register({
      email: 'ana@example.com',
      password: 'Correcta123',
      displayName: 'Ana',
    });

    expect(passwords.hash).toHaveBeenCalledWith('Correcta123');
    expect(users.create).toHaveBeenCalledWith({
      email: 'ana@example.com',
      passwordHash: '$argon2id$hash',
      displayName: 'Ana',
    });
    expect(refreshSessions.create).toHaveBeenCalledWith({
      familyId: expect.stringMatching(UUID_PATTERN) as string,
      userId: user._id.toString(),
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date('2026-12-13T00:00:00.000Z'),
    });
    expect(tokens.createAccessToken).toHaveBeenCalledWith(
      user._id.toString(),
      expect.stringMatching(UUID_PATTERN),
    );
    expect(session).toEqual({
      user: { id: user._id.toString(), email: 'ana@example.com', displayName: 'Ana' },
      accessToken: 'access.jwt',
      refreshToken: 'opaque-refresh',
      refreshTokenExpiresAt: new Date('2026-12-13T00:00:00.000Z'),
    });
  });

  it('inicia sesión con la contraseña correcta', async () => {
    const { service, users, refreshSessions, passwords } = createService();
    const user = userFixture();
    users.findByEmailWithPassword.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(true);

    const session = await service.login({ email: 'ana@example.com', password: 'Correcta123' });

    expect(passwords.verify).toHaveBeenCalledWith('$argon2id$hash', 'Correcta123');
    expect(passwords.verifyDummy).not.toHaveBeenCalled();
    expect(refreshSessions.create).toHaveBeenCalledOnce();
    expect(session.user.email).toBe('ana@example.com');
  });

  it('con email inexistente verifica el hash de relleno y responde igual que una contraseña incorrecta', async () => {
    const { service, users, passwords, refreshSessions } = createService();
    users.findByEmailWithPassword.mockResolvedValueOnce(null);
    const unknownEmailError = await captureError(
      service.login({ email: 'nadie@example.com', password: 'Correcta123' }),
    );

    expect(passwords.verifyDummy).toHaveBeenCalledWith('Correcta123');
    expect(passwords.verify).not.toHaveBeenCalled();

    users.findByEmailWithPassword.mockResolvedValueOnce(userFixture());
    passwords.verify.mockResolvedValueOnce(false);
    const wrongPasswordError = await captureError(
      service.login({ email: 'ana@example.com', password: 'Incorrecta123' }),
    );

    for (const error of [unknownEmailError, wrongPasswordError]) {
      expect(error).toBeInstanceOf(AppException);
      expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe(INVALID_CREDENTIALS_MESSAGE);
    }

    expect(refreshSessions.create).not.toHaveBeenCalled();
  });

  it('no emite tokens si la verificación falla', async () => {
    const { service, users, passwords, tokens } = createService();
    users.findByEmailWithPassword.mockResolvedValue(userFixture());
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: 'ana@example.com', password: 'Incorrecta123' }),
    ).rejects.toBeInstanceOf(AppException);
    expect(tokens.createAccessToken).not.toHaveBeenCalled();
  });

  describe('refresh', () => {
    const familyId = '6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c';
    const userId = new Types.ObjectId();

    it('consume el token y emite el siguiente eslabón dentro de la transacción', async () => {
      const { service, refreshSessions, tokens } = createService();
      refreshSessions.claimForRotation.mockResolvedValue({ familyId, userId });

      const tokensIssued = await service.refresh('token-viejo');

      expect(refreshSessions.withTransaction).toHaveBeenCalledOnce();
      expect(refreshSessions.claimForRotation).toHaveBeenCalledWith(
        hashRefreshToken('token-viejo'),
        expect.any(Date),
        TX_SESSION,
      );
      expect(tokens.createAccessToken).toHaveBeenCalledWith(userId.toString(), familyId);
      expect(refreshSessions.create).toHaveBeenCalledWith(
        {
          familyId,
          userId: userId.toString(),
          tokenHash: 'a'.repeat(64),
          expiresAt: new Date('2026-12-13T00:00:00.000Z'),
        },
        TX_SESSION,
      );
      expect(tokensIssued).toEqual({
        accessToken: 'access.jwt',
        refreshToken: 'opaque-refresh',
        refreshTokenExpiresAt: new Date('2026-12-13T00:00:00.000Z'),
      });
    });

    it('si el token ya se usó, revoca la familia y no emite nada', async () => {
      const { service, refreshSessions, tokens, logger } = createService();
      refreshSessions.claimForRotation.mockResolvedValue(null);
      refreshSessions.findByTokenHash.mockResolvedValue({
        familyId,
        userId,
        usedAt: new Date('2026-11-13T11:00:00.000Z'),
        revokedAt: null,
        expiresAt: new Date('2026-12-13T00:00:00.000Z'),
      });

      const error = await captureError(service.refresh('token-robado'));

      expect(refreshSessions.revokeFamily).toHaveBeenCalledWith(
        familyId,
        expect.any(Date),
        TX_SESSION,
      );
      expect(tokens.createAccessToken).not.toHaveBeenCalled();
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe(INVALID_SESSION_MESSAGE);
      expect(logger.warn).toHaveBeenCalledWith(
        { userId: userId.toString(), familyId },
        expect.stringContaining('familia revocada'),
      );
    });

    it('distingue un token caducado para que el cliente pueda volver a autenticarse', async () => {
      const { service, refreshSessions, tokens } = createService();
      refreshSessions.claimForRotation.mockResolvedValue(null);
      refreshSessions.findByTokenHash.mockResolvedValue({
        familyId,
        userId,
        usedAt: null,
        revokedAt: null,
        expiresAt: new Date('2026-11-12T00:00:00.000Z'),
      });

      const error = await captureError(service.refresh('token-caducado'));

      expect(error.code).toBe('TOKEN_EXPIRED');
      expect(error.message).toBe(EXPIRED_SESSION_MESSAGE);
      expect(refreshSessions.revokeFamily).not.toHaveBeenCalled();
      expect(tokens.createAccessToken).not.toHaveBeenCalled();
    });

    it('trata como inválidos un token desconocido y uno de una familia revocada', async () => {
      const { service, refreshSessions } = createService();
      refreshSessions.claimForRotation.mockResolvedValue(null);
      refreshSessions.findByTokenHash.mockResolvedValueOnce(null);

      const unknown = await captureError(service.refresh('no-existe'));

      refreshSessions.findByTokenHash.mockResolvedValueOnce({
        familyId,
        userId,
        usedAt: null,
        revokedAt: new Date('2026-11-13T10:00:00.000Z'),
        expiresAt: new Date('2026-12-13T00:00:00.000Z'),
      });
      const revoked = await captureError(service.refresh('revocado'));

      for (const error of [unknown, revoked]) {
        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.message).toBe(INVALID_SESSION_MESSAGE);
      }
      expect(refreshSessions.revokeFamily).not.toHaveBeenCalled();
    });

    it('rechaza sin abrir transacción si no hay cookie', async () => {
      const { service, refreshSessions } = createService();

      const error = await captureError(service.refresh(undefined));

      expect(error.code).toBe('UNAUTHORIZED');
      expect(refreshSessions.withTransaction).not.toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('devuelve el perfil público del usuario', async () => {
      const { service, users } = createService();
      const user = userFixture();
      users.findById.mockResolvedValue(user);

      await expect(service.me(user._id.toString())).resolves.toEqual({
        user: { id: user._id.toString(), email: 'ana@example.com', displayName: 'Ana' },
      });
      expect(users.findById).toHaveBeenCalledWith(user._id.toString());
    });

    it('rechaza si el usuario ya no existe', async () => {
      const { service, users } = createService();
      users.findById.mockResolvedValue(null);

      const error = await captureError(service.me(new Types.ObjectId().toString()));

      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe(INVALID_SESSION_MESSAGE);
    });
  });

  describe('logout', () => {
    const familyId = '6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c';
    const userId = new Types.ObjectId().toString();

    it('revoca solo la familia del access token', async () => {
      const { service, refreshSessions, tokens } = createService();
      tokens.verifyAccessToken.mockResolvedValue({ status: 'valid', userId, familyId });

      await service.logout('access.jwt');

      expect(tokens.verifyAccessToken).toHaveBeenCalledWith('access.jwt');
      expect(refreshSessions.revokeFamily).toHaveBeenCalledWith(familyId, expect.any(Date));
      expect(refreshSessions.revokeFamily).toHaveBeenCalledOnce();
      expect(refreshSessions.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('revoca todas las familias del usuario en logout-all', async () => {
      const { service, refreshSessions, tokens } = createService();
      tokens.verifyAccessToken.mockResolvedValue({ status: 'valid', userId, familyId });

      await service.logoutAll('access.jwt');

      expect(refreshSessions.revokeAllForUser).toHaveBeenCalledWith(userId, expect.any(Date));
      expect(refreshSessions.revokeAllForUser).toHaveBeenCalledOnce();
      expect(refreshSessions.revokeFamily).not.toHaveBeenCalled();
    });

    it('no revoca nada si falta el access token', async () => {
      const { service, refreshSessions, tokens } = createService();
      tokens.verifyAccessToken.mockResolvedValue({ status: 'invalid' });

      for (const operation of [service.logout(undefined), service.logoutAll(undefined)]) {
        const error = await captureError(operation);

        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.message).toBe(INVALID_SESSION_MESSAGE);
      }
      expect(refreshSessions.revokeFamily).not.toHaveBeenCalled();
      expect(refreshSessions.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('responde TOKEN_EXPIRED para que el cliente refresque y reintente', async () => {
      const { service, refreshSessions, tokens } = createService();
      tokens.verifyAccessToken.mockResolvedValue({ status: 'expired' });

      const error = await captureError(service.logout('access.caducado'));

      expect(error.code).toBe('TOKEN_EXPIRED');
      expect(error.message).toBe(EXPIRED_SESSION_MESSAGE);
      expect(refreshSessions.revokeFamily).not.toHaveBeenCalled();
    });
  });
});
