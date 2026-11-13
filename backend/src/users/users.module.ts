import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema.js';

/**
 * Perfil del usuario autenticado (`displayName`, email) y su relación con los hogares.
 *
 * Exporta `MongooseModule` para que `auth` y los repositorios de otros módulos puedan
 * inyectar el modelo `User` sin volver a registrarlo.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  exports: [MongooseModule],
})
export class UsersModule {}
