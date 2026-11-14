import 'reflect-metadata';
import mongoose from 'mongoose';
import { User, UserSchema } from './user.schema.js';

describe('UserSchema', () => {
  const connection = mongoose.createConnection();
  const UserModel = connection.model(User.name, UserSchema);

  afterAll(async () => {
    await connection.close();
  });

  it('normaliza el email a minúsculas y sin espacios', async () => {
    const user = new UserModel({
      email: '  Ana.Perez@Example.COM ',
      passwordHash: 'hash',
      displayName: 'Ana',
    });

    await expect(user.validate()).resolves.toBeUndefined();
    expect(user.email).toBe('ana.perez@example.com');
  });

  it('exige email, passwordHash y displayName', async () => {
    const error = await new UserModel({})
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(Object.keys(error?.errors ?? {})).toEqual(
      expect.arrayContaining(['email', 'passwordHash', 'displayName']),
    );
  });

  it('declara el índice único sobre email', () => {
    expect(UserSchema.indexes()).toContainEqual([
      { email: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it('oculta passwordHash en las consultas por defecto', () => {
    expect(UserSchema.path('passwordHash').options.select).toBe(false);
  });
});
