import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module.js';
import { AUTH_CLOCK, systemAuthClock } from './auth.clock.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthTokensService } from './auth-tokens.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PasswordHasher } from './password.hasher.js';
import { RefreshSession, RefreshSessionSchema } from './refresh-session.schema.js';
import { RefreshSessionsRepository } from './refresh-sessions.repository.js';

/**
 * Registro, login, refresh, logout e identidad. Es el único módulo que emite y rota tokens.
 *
 * Importa `UsersModule` para crear y buscar usuarios a través de su repositorio; nadie más
 * escribe la colección `users`. Registra `JwtAuthGuard` como guard global: todas las rutas
 * exigen access token salvo las marcadas con `@Public()`.
 */
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: RefreshSession.name, schema: RefreshSessionSchema }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokensService,
    PasswordHasher,
    RefreshSessionsRepository,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
  ],
})
export class AuthModule {}
