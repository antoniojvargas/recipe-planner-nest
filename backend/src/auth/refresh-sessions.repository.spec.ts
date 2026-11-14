import 'reflect-metadata';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { RefreshSession } from './refresh-session.schema.js';
import { RefreshSessionsRepository } from './refresh-sessions.repository.js';

function createModelMock() {
  const mocks = { create: vi.fn() };

  return { model: mocks as unknown as Model<RefreshSession>, mocks };
}

describe('RefreshSessionsRepository', () => {
  it('crea la fila con el hash y la familia recibidos', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RefreshSessionsRepository(model);
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
});
