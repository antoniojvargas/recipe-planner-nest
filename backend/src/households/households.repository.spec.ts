import 'reflect-metadata';
import { Types, type Model } from 'mongoose';
import { mockMongooseQuery } from '../../test/support/mongoose-query.js';
import type { Household } from './household.schema.js';
import { HouseholdsRepository } from './households.repository.js';

function createModelMock() {
  const mocks = {
    create: vi.fn(),
    findById: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  };

  return { model: mocks as unknown as Model<Household>, mocks };
}

describe('HouseholdsRepository', () => {
  const householdId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const household = { name: 'Casa', members: [] } as unknown as Household;

  it('crea un hogar con sus membresías', async () => {
    const { model, mocks } = createModelMock();
    const repository = new HouseholdsRepository(model);
    const input = { name: 'Casa', members: [] };
    mocks.create.mockResolvedValue(household);

    await expect(repository.create(input)).resolves.toBe(household);
    expect(mocks.create).toHaveBeenCalledWith(input);
  });

  it('busca por id con lean', async () => {
    const { model, mocks } = createModelMock();
    const repository = new HouseholdsRepository(model);
    const query = mockMongooseQuery(household);
    mocks.findById.mockReturnValue(query);

    await expect(repository.findById(householdId)).resolves.toBe(household);
    expect(mocks.findById).toHaveBeenCalledWith(householdId);
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('lista los hogares de un miembro y con lean', async () => {
    const { model, mocks } = createModelMock();
    const repository = new HouseholdsRepository(model);
    const query = mockMongooseQuery([household]);
    mocks.find.mockReturnValue(query);

    await expect(repository.findByMember(userId)).resolves.toEqual([household]);
    expect(mocks.find).toHaveBeenCalledWith({ 'members.userId': userId });
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('busca por hash del código de invitación y con lean', async () => {
    const { model, mocks } = createModelMock();
    const repository = new HouseholdsRepository(model);
    const query = mockMongooseQuery(household);
    mocks.findOne.mockReturnValue(query);

    await expect(repository.findByInviteCodeHash('hash')).resolves.toBe(household);
    expect(mocks.findOne).toHaveBeenCalledWith({ inviteCodeHash: 'hash' });
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('añade un miembro al hogar', async () => {
    const { model, mocks } = createModelMock();
    const repository = new HouseholdsRepository(model);
    const query = mockMongooseQuery(household);
    mocks.findByIdAndUpdate.mockReturnValue(query);
    const member = { userId: new Types.ObjectId(), role: 'member' as const, joinedAt: new Date() };

    await repository.addMember(householdId, member);
    expect(mocks.findByIdAndUpdate).toHaveBeenCalledWith(
      householdId,
      { $push: { members: member } },
      { returnDocument: 'after', runValidators: true },
    );
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('guarda el hash del código de invitación sin exponer el código', async () => {
    const { model, mocks } = createModelMock();
    const repository = new HouseholdsRepository(model);
    const query = mockMongooseQuery(household);
    mocks.findByIdAndUpdate.mockReturnValue(query);

    await repository.setInviteCodeHash(householdId, 'hash');
    expect(mocks.findByIdAndUpdate).toHaveBeenCalledWith(
      householdId,
      { $set: { inviteCodeHash: 'hash' } },
      { returnDocument: 'after', runValidators: true },
    );
    expect(query.lean).toHaveBeenCalledOnce();
  });
});
