import { Types } from 'mongoose';
import type { User } from '../../src/users/user.schema.js';
import type { CreateUserInput } from '../../src/users/users.repository.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type StoredUser = User & { passwordHash: string; _id: Types.ObjectId };

/** Repositorio de usuarios en memoria para pruebas de integración del flujo de auth. */
export class InMemoryUsersRepository {
  readonly users: StoredUser[] = [];

  create(input: CreateUserInput): StoredUser {
    const user = {
      _id: new Types.ObjectId(),
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      displayName: input.displayName,
    } as StoredUser;
    this.users.push(user);

    return user;
  }

  findById(userId: string): Promise<User | null> {
    const user = this.users.find((item) => item._id.toString() === userId);

    return Promise.resolve(user ?? null);
  }

  findByEmail(email: string): Promise<User | null> {
    const user = this.users.find((item) => item.email === normalizeEmail(email));

    return Promise.resolve(user ?? null);
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    const user = this.users.find((item) => item.email === normalizeEmail(email));

    return Promise.resolve(user ?? null);
  }
}
