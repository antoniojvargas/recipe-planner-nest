import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema.js';
import { UsersRepository } from './users.repository.js';

/**
 * Perfil del usuario autenticado (`displayName`, email) y su relación con los hogares.
 *
 * Exporta `MongooseModule` para que `auth` y los repositorios de otros módulos puedan
 * inyectar el modelo `User` sin volver a registrarlo.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersRepository],
  exports: [MongooseModule, UsersRepository],
})
export class UsersModule {}
