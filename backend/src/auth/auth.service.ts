import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@recipe-planner/contracts';
import type { ClientSession } from 'mongoose';
import { PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/exceptions/app.exception.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import type { User, UserDocument } from '../users/user.schema.js';
import { AUTH_CLOCK, type AuthClock } from './auth.clock.js';
import { AuthTokensService, hashRefreshToken } from './auth-tokens.service.js';
import {
  EXPIRED_SESSION_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  INVALID_SESSION_MESSAGE,
  REFRESH_ROTATION_GRACE_MS,
} from './auth.constants.js';
import type {
  AuthResponse,
  AuthSession,
  IssuedSession,
  LoginInput,
  RegisterInput,
} from './auth.types.js';
import { PasswordHasher } from './password.hasher.js';
import type { RefreshSession } from './refresh-session.schema.js';
import { RefreshSessionsRepository } from './refresh-sessions.repository.js';

/** Resultado de la transacción de rotación, antes de traducirlo a error HTTP. */
type RotationResult =
  | { status: 'rotated'; tokens: IssuedSession }
  | { status: 'reused'; userId: string; familyId: string }
  | { status: 'expired' }
  | { status: 'invalid' };

/**
 * Registro, login, refresh y cierre de sesión.
 *
 * Registro y login abren una sesión nueva: familia de refresh recién creada, refresh token
 * opaco guardado como hash y access token JWT. El login no distingue entre email inexistente
 * y contraseña incorrecta: mismo mensaje, mismo estado y una sola verificación argon2 en los
 * dos caminos (real o contra el hash de relleno).
 *
 * El refresh consume y emite dentro de una transacción. Un token presentado dentro de la
 * ventana de gracia (dos pestañas que refrescan a la vez) recibe un sucesor nuevo de la misma
 * familia; pasada la ventana, la reutilización revoca la familia entera.
 *
 * El logout no necesita el refresh token: el access token lleva `fid`, la familia a la que
 * pertenece, y así se revoca aunque la cookie de refresh no llegue a `/api/auth/logout`.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly households: HouseholdsRepository,
    private readonly refreshSessions: RefreshSessionsRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AuthTokensService,
    private readonly logger: PinoLogger,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {
    this.logger.setContext(AuthService.name);
  }

  async register(input: RegisterInput): Promise<AuthSession> {
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    });

    await this.households.create({
      name: `Hogar de ${user.displayName}`,
      members: [
        {
          userId: user._id,
          role: 'owner',
          joinedAt: this.clock.now(),
        },
      ],
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

  /** Canjea el refresh token por un par nuevo; el anterior queda marcado como usado. */
  async refresh(rawRefreshToken: string | undefined): Promise<IssuedSession> {
    const result = await this.rotate(rawRefreshToken);

    switch (result.status) {
      case 'rotated':
        return result.tokens;
      case 'reused':
        this.logger.warn(
          { userId: result.userId, familyId: result.familyId },
          'Refresh token reutilizado: familia revocada',
        );
        throw this.invalidSession();
      case 'expired':
        throw this.expiredSession();
      case 'invalid':
        throw this.invalidSession();
    }
  }

  /** Revoca la familia a la que pertenece el access token presentado. */
  async logout(accessToken: string | undefined): Promise<void> {
    const { familyId } = await this.requireSession(accessToken);

    await this.refreshSessions.revokeFamily(familyId, this.clock.now());
  }

  /** Revoca todas las familias abiertas del usuario, en todos sus dispositivos. */
  async logoutAll(accessToken: string | undefined): Promise<void> {
    const { userId } = await this.requireSession(accessToken);

    await this.refreshSessions.revokeAllForUser(userId, this.clock.now());
  }

  /** Perfil público del usuario autenticado. */
  async me(userId: string): Promise<AuthResponse> {
    const user = await this.users.findById(userId);

    if (user === null) {
      throw this.invalidSession();
    }

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
      },
    };
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

  private async rotate(rawRefreshToken: string | undefined): Promise<RotationResult> {
    if (rawRefreshToken === undefined || rawRefreshToken === '') {
      return { status: 'invalid' };
    }

    const tokenHash = hashRefreshToken(rawRefreshToken);
    const now = this.clock.now();

    return this.refreshSessions.withTransaction(async (session) => {
      // Una sola escritura decide quién canjea el token. Si no encuentra la fila, la
      // siguiente lectura solo sirve para saber si se usó, se revocó o caducó.
      const claimed = await this.refreshSessions.claimForRotation(tokenHash, now, session);

      if (claimed === null) {
        return this.classifyFailedClaim(tokenHash, now, session);
      }

      return this.issueSuccessor(claimed.userId.toString(), claimed.familyId, session);
    });
  }

  /**
   * Emite el siguiente eslabón de la familia y su access token. Lo usan la rotación normal y
   * la ventana de gracia: en ambos casos el resultado es un par nuevo dentro de la misma familia.
   */
  private async issueSuccessor(
    userId: string,
    familyId: string,
    session: ClientSession,
  ): Promise<RotationResult> {
    const next = this.tokens.createRefreshToken();
    const accessToken = await this.tokens.createAccessToken(userId, familyId);

    // Mismo `familyId`: el eslabón nuevo pertenece a la sesión original.
    await this.refreshSessions.create(
      {
        familyId,
        userId,
        tokenHash: next.tokenHash,
        expiresAt: next.expiresAt,
      },
      session,
    );

    return {
      status: 'rotated',
      tokens: {
        accessToken,
        refreshToken: next.token,
        refreshTokenExpiresAt: next.expiresAt,
      },
    };
  }

  /**
   * Un token ya canjeado dentro de la ventana de gracia no es un robo: la otra pestaña llegó
   * tarde a una carrera legítima. Se emite otro sucesor en la misma familia en lugar de revocar.
   */
  private reissueSuccessor(
    existing: RefreshSession,
    session: ClientSession,
  ): Promise<RotationResult> {
    return this.issueSuccessor(existing.userId.toString(), existing.familyId, session);
  }

  private async classifyFailedClaim(
    tokenHash: string,
    now: Date,
    session: ClientSession,
  ): Promise<RotationResult> {
    const existing = await this.refreshSessions.findByTokenHash(tokenHash, session);

    if (existing === null) {
      return { status: 'invalid' };
    }

    // Una fila revocada gana a una usada: tras un logout conserva las dos marcas y el replay
    // no debe reabrir la familia ni emitir credenciales nuevas.
    if (existing.revokedAt !== null) {
      return { status: 'invalid' };
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      return { status: 'expired' };
    }

    if (existing.usedAt !== null) {
      const elapsedMs = now.getTime() - existing.usedAt.getTime();

      if (elapsedMs < REFRESH_ROTATION_GRACE_MS) {
        return this.reissueSuccessor(existing, session);
      }

      // Fuera de la ventana sí es reutilización: se revoca la familia entera. El callback
      // termina sin lanzar para que la transacción confirme la revocación.
      await this.refreshSessions.revokeFamily(existing.familyId, now, session);

      return {
        status: 'reused',
        userId: existing.userId.toString(),
        familyId: existing.familyId,
      };
    }

    // El filtro atómico no debería fallar con una fila viva; si pasa, no se canjea.
    return { status: 'invalid' };
  }

  /**
   * Identifica al dueño del access token. Un token caducado se distingue del inválido para
   * que el cliente intente refrescar antes de rendirse.
   */
  private async requireSession(
    accessToken: string | undefined,
  ): Promise<{ userId: string; familyId: string }> {
    const verification = await this.tokens.verifyAccessToken(accessToken);

    switch (verification.status) {
      case 'valid':
        return { userId: verification.userId, familyId: verification.familyId };
      case 'expired':
        throw this.expiredSession();
      case 'invalid':
        throw this.invalidSession();
    }
  }

  private expiredSession(): AppException {
    return new AppException({
      status: HttpStatus.UNAUTHORIZED,
      code: ERROR_CODES.TOKEN_EXPIRED,
      message: EXPIRED_SESSION_MESSAGE,
    });
  }

  private invalidSession(): AppException {
    return new AppException({
      status: HttpStatus.UNAUTHORIZED,
      code: ERROR_CODES.UNAUTHORIZED,
      message: INVALID_SESSION_MESSAGE,
    });
  }
}
