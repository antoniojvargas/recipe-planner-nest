import 'reflect-metadata';
import type { ClientSession, Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { mockMongooseQuery } from '../../test/support/mongoose-query.js';
import type { RefreshSession } from './refresh-session.schema.js';
import { RefreshSessionsRepository } from './refresh-sessions.repository.js';

function createModelMock() {
  const mocks = {
    create: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateMany: vi.fn(),
  };

  return { model: mocks as unknown as Model<RefreshSession>, mocks };
}

function createConnectionMock() {
  const session = {
    withTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
  const startSession = vi.fn().mockResolvedValue(session);

  return { connection: { startSession } as unknown as Connection, startSession, session };
}

const SESSION = {} as ClientSession;
const NOW = new Date('2026-11-13T12:00:00.000Z');

describe('RefreshSessionsRepository', () => {
  it('crea la fila con el hash y la familia recibidos', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RefreshSessionsRepository(model, createConnectionMock().connection);
    const input = {
      familyId: '6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c',
      userId: new Types.ObjectId().toString(),
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date('2026-12-13T00:00:00.000Z'),
    };
    const created = { ...input, usedAt: null, revokedAt: null };
    mocks.create.mockResolvedValue(created);

    await expect(repository.create(input)).resolves.toBe(created);
    expect(mocks.create).toHaveBeenCalledWith(input);
  });

  it('crea dentro de la transacción con la forma de array que exige Mongo', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RefreshSessionsRepository(model, createConnectionMock().connection);
    const input = {
      familyId: '6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c',
      userId: new Types.ObjectId().toString(),
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date('2026-12-13T00:00:00.000Z'),
    };
    const created = { ...input, usedAt: null, revokedAt: null };
    mocks.create.mockResolvedValue([created]);

    await expect(repository.create(input, SESSION)).resolves.toBe(created);
    expect(mocks.create).toHaveBeenCalledWith([input], { session: SESSION });
  });

  it('consume el token con un filtro que exige que siga vivo, sin usar y sin revocar', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RefreshSessionsRepository(model, createConnectionMock().connection);
    const claimed = { familyId: 'familia', usedAt: NOW };
    const query = mockMongooseQuery(claimed);
    mocks.findOneAndUpdate.mockReturnValue(query);

    await expect(repository.claimForRotation('hash', NOW, SESSION)).resolves.toBe(claimed);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { tokenHash: 'hash', usedAt: null, revokedAt: null, expiresAt: { $gt: NOW } },
      { $set: { usedAt: NOW } },
      { session: SESSION, returnDocument: 'after' },
    );
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('lee por hash dentro de la transacción para clasificar el fallo', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RefreshSessionsRepository(model, createConnectionMock().connection);
    const session = { familyId: 'familia' };
    const query = mockMongooseQuery(session);
    mocks.findOne.mockReturnValue(query);

    await expect(repository.findByTokenHash('hash', SESSION)).resolves.toBe(session);
    expect(mocks.findOne).toHaveBeenCalledWith({ tokenHash: 'hash' });
    expect(query.session).toHaveBeenCalledWith(SESSION);
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('revoca solo los eslabones vivos de la familia dentro de la transacción', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RefreshSessionsRepository(model, createConnectionMock().connection);
    const query = mockMongooseQuery({});
    mocks.updateMany.mockReturnValue(query);

    await repository.revokeFamily('familia', NOW, SESSION);

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { familyId: 'familia', revokedAt: null },
      { $set: { revokedAt: NOW } },
    );
    expect(query.session).toHaveBeenCalledWith(SESSION);
    expect(query.exec).toHaveBeenCalledOnce();
  });

  it('revoca la familia sin transacción cuando la llama el logout', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RefreshSessionsRepository(model, createConnectionMock().connection);
    const query = mockMongooseQuery({});
    mocks.updateMany.mockReturnValue(query);

    await repository.revokeFamily('familia', NOW);

    expect(query.session).not.toHaveBeenCalled();
    expect(query.exec).toHaveBeenCalledOnce();
  });

  it('revoca todas las familias vivas del usuario', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RefreshSessionsRepository(model, createConnectionMock().connection);
    const query = mockMongooseQuery({});
    mocks.updateMany.mockReturnValue(query);
    const userId = new Types.ObjectId().toString();

    await repository.revokeAllForUser(userId, NOW);

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { userId, revokedAt: null },
      { $set: { revokedAt: NOW } },
    );
    expect(query.exec).toHaveBeenCalledOnce();
  });

  it('abre una sesión de Mongo, ejecuta el trabajo y la cierra siempre', async () => {
    const { model } = createModelMock();
    const { connection, startSession, session } = createConnectionMock();
    const repository = new RefreshSessionsRepository(model, connection);

    const work = vi.fn().mockResolvedValue('resultado');
    await expect(repository.withTransaction(work)).resolves.toBe('resultado');

    expect(startSession).toHaveBeenCalledOnce();
    expect(work).toHaveBeenCalledWith(session);
    expect(session.endSession).toHaveBeenCalledOnce();

    work.mockRejectedValueOnce(new Error('fallo'));
    await expect(repository.withTransaction(work)).rejects.toThrow('fallo');
    expect(session.endSession).toHaveBeenCalledTimes(2);
  });
});
