import 'reflect-metadata';
import { Types, type Model } from 'mongoose';
import { mockMongooseQuery } from '../../test/support/mongoose-query.js';
import type { PantryItem } from './pantry-item.schema.js';
import { PantryRepository } from './pantry.repository.js';

function createModelMock() {
  const mocks = { find: vi.fn(), findOneAndUpdate: vi.fn(), deleteOne: vi.fn() };

  return { model: mocks as unknown as Model<PantryItem>, mocks };
}

describe('PantryRepository', () => {
  const householdId = new Types.ObjectId().toString();
  const item = { name: 'harina', quantity: 1, unit: 'kg' } as PantryItem;

  it('lista la despensa del hogar por nombre y con lean', async () => {
    const { model, mocks } = createModelMock();
    const repository = new PantryRepository(model);
    const query = mockMongooseQuery([item]);
    mocks.find.mockReturnValue(query);

    await expect(repository.findByHousehold(householdId)).resolves.toEqual([item]);
    expect(mocks.find).toHaveBeenCalledWith({ householdId });
    expect(query.sort).toHaveBeenCalledWith({ name: 1 });
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('normaliza el nombre al crear o actualizar un artículo', async () => {
    const { model, mocks } = createModelMock();
    const repository = new PantryRepository(model);
    const query = mockMongooseQuery(item);
    mocks.findOneAndUpdate.mockReturnValue(query);

    await repository.upsert(householdId, { name: '  Harina ', quantity: 2, unit: 'kg' });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { householdId, name: 'harina' },
      {
        $set: { quantity: 2, unit: 'kg' },
        $setOnInsert: { householdId, name: 'harina' },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
    );
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('borra con el nombre normalizado', async () => {
    const { model, mocks } = createModelMock();
    const repository = new PantryRepository(model);
    mocks.deleteOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 1 }) });

    await expect(repository.remove(householdId, '  HARINA ')).resolves.toBe(true);
    expect(mocks.deleteOne).toHaveBeenCalledWith({ householdId, name: 'harina' });
  });
});
