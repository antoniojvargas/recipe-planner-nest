import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { User, type UserDocument } from './user.schema.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

/** El índice único guarda el email en minúsculas. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Único punto de acceso a la colección `users`.
 *
 * Los usuarios están por encima de los hogares, así que este repositorio no filtra por
 * `householdId`: su clave es la identidad (email o `_id`). El resto de agregados sí lo hacen.
 * Las lecturas usan `lean()`.
 */
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  async create(input: CreateUserInput): Promise<UserDocument> {
    return this.userModel.create(input);
  }

  async findById(userId: string): Promise<User | null> {
    return this.userModel.findById(userId).lean<User>().exec();
  }

  /** Perfil público: no incluye el hash de la contraseña. */
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel
      .findOne({ email: normalizeEmail(email) })
      .lean<User>()
      .exec();
  }

  /** Solo para el login: trae el hash aunque el esquema lo oculte por defecto. */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userModel
      .findOne({ email: normalizeEmail(email) })
      .select('+passwordHash')
      .lean<User>()
      .exec();
  }
}
