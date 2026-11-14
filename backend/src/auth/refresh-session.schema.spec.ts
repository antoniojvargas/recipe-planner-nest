import 'reflect-metadata';
import mongoose, { Types } from 'mongoose';
import { RefreshSession, RefreshSessionSchema } from './refresh-session.schema.js';

describe('RefreshSessionSchema', () => {
  const connection = mongoose.createConnection();
  const RefreshSessionModel = connection.model(RefreshSession.name, RefreshSessionSchema);

  const validSession = {
    familyId: '6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c',
    userId: new Types.ObjectId(),
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date('2026-12-13T00:00:00.000Z'),
  };

  afterAll(async () => {
    await connection.close();
  });

  it('valida una sesión con familia, usuario, hash y caducidad', async () => {
    const session = new RefreshSessionModel(validSession);

    await expect(session.validate()).resolves.toBeUndefined();
    expect(session.usedAt).toBeNull();
    expect(session.revokedAt).toBeNull();
  });

  it('exige familyId, userId, tokenHash y expiresAt', async () => {
    const error = await new RefreshSessionModel({})
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(Object.keys(error?.errors ?? {})).toEqual(
      expect.arrayContaining(['familyId', 'userId', 'tokenHash', 'expiresAt']),
    );
  });

  it('declara el índice único del hash', () => {
    expect(RefreshSessionSchema.indexes()).toContainEqual([
      { tokenHash: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it('declara el índice de familia y el TTL de limpieza', () => {
    const indexes = RefreshSessionSchema.indexes();

    expect(indexes).toContainEqual([{ familyId: 1 }, {}]);
    expect(indexes).toContainEqual([
      { expiresAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 0 }),
    ]);
  });
});
