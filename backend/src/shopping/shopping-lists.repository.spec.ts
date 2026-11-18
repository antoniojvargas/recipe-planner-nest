import 'reflect-metadata';
import { Types, type Model } from 'mongoose';
import { mockMongooseQuery } from '../../test/support/mongoose-query.js';
import type { ShoppingList } from './shopping-list.schema.js';
import { ShoppingListsRepository } from './shopping-lists.repository.js';

function createModelMock() {
  const mocks = { findOne: vi.fn(), findOneAndUpdate: vi.fn() };

  return { model: mocks as unknown as Model<ShoppingList>, mocks };
}

describe('ShoppingListsRepository', () => {
  const householdId = new Types.ObjectId().toString();
  const weekStart = new Date('2026-11-09T00:00:00.000Z');
  const list = { householdId, weekStart, items: [] } as unknown as ShoppingList;

  it('busca la lista de la semana filtrando por hogar y con lean', async () => {
    const { model, mocks } = createModelMock();
    const repository = new ShoppingListsRepository(model);
    const query = mockMongooseQuery(list);
    mocks.findOne.mockReturnValue(query);

    await expect(repository.findByWeek(householdId, weekStart)).resolves.toBe(list);
    expect(mocks.findOne).toHaveBeenCalledWith({ householdId, weekStart });
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('reemplaza los ítems y crea la lista si no existe', async () => {
    const { model, mocks } = createModelMock();
    const repository = new ShoppingListsRepository(model);
    const query = mockMongooseQuery(list);
    mocks.findOneAndUpdate.mockReturnValue(query);
    const items = [{ name: 'Arroz', quantity: 400, unit: 'g' as const }];

    await repository.replaceItems(householdId, weekStart, items);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { householdId, weekStart },
      { $set: { items }, $setOnInsert: { householdId, weekStart } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
    );
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('actualiza el ítem en su sitio con el operador posicional', async () => {
    const { model, mocks } = createModelMock();
    const repository = new ShoppingListsRepository(model);
    const itemId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const query = mockMongooseQuery(list);
    mocks.findOneAndUpdate.mockReturnValue(query);

    await repository.updateItem(householdId, weekStart, itemId, {
      checked: true,
      checkedBy: userId,
    });

    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { householdId, weekStart, 'items._id': itemId },
      { $set: { 'items.$.checked': true, 'items.$.checkedBy': userId } },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('desmarca el ítem y borra quién lo había marcado', async () => {
    const { model, mocks } = createModelMock();
    const repository = new ShoppingListsRepository(model);
    const itemId = new Types.ObjectId();
    const query = mockMongooseQuery(list);
    mocks.findOneAndUpdate.mockReturnValue(query);

    await repository.updateItem(householdId, weekStart, itemId, { checked: false });

    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { householdId, weekStart, 'items._id': itemId },
      { $set: { 'items.$.checked': false }, $unset: { 'items.$.checkedBy': '' } },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('no actualiza nada si no llega ningún campo', async () => {
    const { model, mocks } = createModelMock();
    const repository = new ShoppingListsRepository(model);

    await expect(
      repository.updateItem(householdId, weekStart, new Types.ObjectId(), {}),
    ).resolves.toBeNull();
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
