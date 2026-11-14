import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { appConfig, type AppConfig } from '../config/index.js';
import { AuthService } from './auth.service.js';
import { REFRESH_TOKEN_COOKIE } from './auth.constants.js';
import type { AuthResponse, IssuedSession } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { setSessionCookies } from './session-cookies.js';

/**
 * Rutas de sesión. Solo validan el cuerpo, delegan en `AuthService` y publican las cookies;
 * ningún token se devuelve en el cuerpo.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {}

  /** Crea la cuenta y deja la sesión abierta en las mismas cookies que el login. */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const session = await this.authService.register(dto);
    this.writeSessionCookies(reply, session);

    return { user: session.user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const session = await this.authService.login(dto);
    this.writeSessionCookies(reply, session);

    return { user: session.user };
  }

  /**
   * Rota el refresh token y devuelve solo cookies nuevas. El token llega en la cookie con
   * `Path=/api/auth/refresh`; cualquier otro endpoint de la API no la recibe.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const tokens = await this.authService.refresh(request.cookies[REFRESH_TOKEN_COOKIE]);
    this.writeSessionCookies(reply, tokens);
  }

  private writeSessionCookies(
    reply: FastifyReply,
    session: Pick<IssuedSession, 'accessToken' | 'refreshToken'>,
  ): void {
    setSessionCookies(reply, session, { secure: this.config.env === 'production' });
  }
}
