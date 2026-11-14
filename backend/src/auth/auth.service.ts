import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@recipe-planner/contracts';
import { AppException } from '../common/exceptions/app.exception.js';
import { UsersRepository } from '../users/users.repository.js';
import type { User, UserDocument } from '../users/user.schema.js';
import { AuthTokensService } from './auth-tokens.service.js';
import { INVALID_CREDENTIALS_MESSAGE } from './auth.constants.js';
import type { AuthSession, LoginInput, RegisterInput } from './auth.types.js';
import { PasswordHasher } from './password.hasher.js';
import { RefreshSessionsRepository } from './refresh-sessions.repository.js';

/**
 * Registro y login.
 *
 * Ambos abren una sesión nueva: familia de refresh recién creada, refresh token opaco
 * guardado como hash y access token JWT. El login no distingue entre email inexistente y
 * contraseña incorrecta: mismo mensaje, mismo estado y una sola verificación argon2 en los
 * dos caminos (real o contra el hash de relleno).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly refreshSessions: RefreshSessionsRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AuthTokensService,
  ) {}

  async register(input: RegisterInput): Promise<AuthSession> {
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    });

    return this.openSession(user);
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await this.users.findByEmailWithPassword(input.email);

    // El `await` del else no es decorativo: verifica contra el hash de relleno para que el
    // email inexistente cueste lo mismo que una contraseña incorrecta.
    const passwordMatches = user?.passwordHash
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);

    if (!user || !passwordMatches) {
      throw new AppException({
        status: HttpStatus.UNAUTHORIZED,
        code: ERROR_CODES.UNAUTHORIZED,
        message: INVALID_CREDENTIALS_MESSAGE,
      });
    }

    return this.openSession(user);
  }

  private async openSession(user: User | UserDocument): Promise<AuthSession> {
    const familyId = randomUUID();
    const refreshToken = this.tokens.createRefreshToken();
    const accessToken = await this.tokens.createAccessToken(user._id.toString(), familyId);

    await this.refreshSessions.create({
      familyId,
      userId: user._id.toString(),
      tokenHash: refreshToken.tokenHash,
      expiresAt: refreshToken.expiresAt,
    });

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
      },
      accessToken,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }
}
