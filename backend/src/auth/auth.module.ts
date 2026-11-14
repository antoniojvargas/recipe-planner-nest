import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthTokensService } from './auth-tokens.service.js';
import { PasswordHasher } from './password.hasher.js';
import { RefreshSession, RefreshSessionSchema } from './refresh-session.schema.js';
import { RefreshSessionsRepository } from './refresh-sessions.repository.js';

/**
 * Registro, login, refresh y logout. Es el único módulo que emite y rota tokens.
 *
 * Importa `UsersModule` para crear y buscar usuarios a través de su repositorio; nadie más
 * escribe la colección `users`.
 */
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: RefreshSession.name, schema: RefreshSessionSchema }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthTokensService, PasswordHasher, RefreshSessionsRepository],
})
export class AuthModule {}
