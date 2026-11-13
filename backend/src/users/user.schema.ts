import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'users' })
export class User {
  /**
   * Correo de acceso. Se guarda en minúsculas y sin espacios: el índice único solo
   * protege de duplicados si todos los caminos de escritura normalizan igual.
   */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  /** Hash de la contraseña (nunca se guarda la contraseña en claro). */
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  displayName: string;

  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);
