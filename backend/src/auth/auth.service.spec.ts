import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersRepository } from '../users/users.repository.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { AuthService } from './auth.service.js';
import { AuthTokensService } from './auth-tokens.service.js';
import { INVALID_CREDENTIALS_MESSAGE } from './auth.constants.js';
import { PasswordHasher } from './password.hasher.js';
import { RefreshSessionsRepository } from './refresh-sessions.repository.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function createService() {
  const users = {
    create: vi.fn(),
    findByEmailWithPassword: vi.fn(),
  };
  const refreshSessions = { create: vi.fn().mockResolvedValue({}) };
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
  };

  const service = new AuthService(
    users as unknown as UsersRepository,
    refreshSessions as unknown as RefreshSessionsRepository,
    passwords as unknown as PasswordHasher,
    tokens as unknown as AuthTokensService,
  );

  return { service, users, refreshSessions, passwords, tokens };
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
});
