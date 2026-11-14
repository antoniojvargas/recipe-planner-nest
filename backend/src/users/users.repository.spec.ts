import 'reflect-metadata';
import { Types, type Model } from 'mongoose';
import { mockMongooseQuery } from '../../test/support/mongoose-query.js';
import type { User } from './user.schema.js';
import { UsersRepository } from './users.repository.js';

function createModelMock() {
  const mocks = { create: vi.fn(), findById: vi.fn(), findOne: vi.fn() };

  return { model: mocks as unknown as Model<User>, mocks };
}

describe('UsersRepository', () => {
  const userId = new Types.ObjectId().toString();
  const user = { email: 'ana@example.com', displayName: 'Ana' } as User;

  it('crea un usuario', async () => {
    const { model, mocks } = createModelMock();
    const repository = new UsersRepository(model);
    const input = { email: 'ana@example.com', passwordHash: 'hash', displayName: 'Ana' };
    mocks.create.mockResolvedValue(user);

    await expect(repository.create(input)).resolves.toBe(user);
    expect(mocks.create).toHaveBeenCalledWith(input);
  });

  it('busca por id con lean', async () => {
    const { model, mocks } = createModelMock();
    const repository = new UsersRepository(model);
    const query = mockMongooseQuery(user);
    mocks.findById.mockReturnValue(query);

    await expect(repository.findById(userId)).resolves.toBe(user);
    expect(mocks.findById).toHaveBeenCalledWith(userId);
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('busca por email normalizado y sin el hash', async () => {
    const { model, mocks } = createModelMock();
    const repository = new UsersRepository(model);
    const query = mockMongooseQuery(user);
    mocks.findOne.mockReturnValue(query);

    await expect(repository.findByEmail('  Ana@Example.COM ')).resolves.toBe(user);
    expect(mocks.findOne).toHaveBeenCalledWith({ email: 'ana@example.com' });
    expect(query.select).not.toHaveBeenCalled();
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('trae el hash solo para el login', async () => {
    const { model, mocks } = createModelMock();
    const repository = new UsersRepository(model);
    const query = mockMongooseQuery(user);
    mocks.findOne.mockReturnValue(query);

    await repository.findByEmailWithPassword('ana@example.com');
    expect(mocks.findOne).toHaveBeenCalledWith({ email: 'ana@example.com' });
    expect(query.select).toHaveBeenCalledWith('+passwordHash');
    expect(query.lean).toHaveBeenCalledOnce();
  });
});
