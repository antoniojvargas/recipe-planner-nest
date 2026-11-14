import 'reflect-metadata';
import { Types, type Model } from 'mongoose';
import { mockMongooseQuery } from '../../test/support/mongoose-query.js';
import type { MealPlan } from './meal-plan.schema.js';
import { MealPlansRepository } from './meal-plans.repository.js';

function createModelMock() {
  const mocks = { findOne: vi.fn(), findOneAndUpdate: vi.fn() };

  return { model: mocks as unknown as Model<MealPlan>, mocks };
}

describe('MealPlansRepository', () => {
  const householdId = new Types.ObjectId().toString();
  const weekStart = new Date('2026-11-09T00:00:00.000Z');
  const plan = { householdId, weekStart, slots: [] } as unknown as MealPlan;

  it('busca el plan de la semana filtrando por hogar y con lean', async () => {
    const { model, mocks } = createModelMock();
    const repository = new MealPlansRepository(model);
    const query = mockMongooseQuery(plan);
    mocks.findOne.mockReturnValue(query);

    await expect(repository.findByWeek(householdId, weekStart)).resolves.toBe(plan);
    expect(mocks.findOne).toHaveBeenCalledWith({ householdId, weekStart });
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('crea el plan vacío si no existe y no pisa uno existente', async () => {
    const { model, mocks } = createModelMock();
    const repository = new MealPlansRepository(model);
    const query = mockMongooseQuery(plan);
    mocks.findOneAndUpdate.mockReturnValue(query);

    await repository.upsertEmpty(householdId, weekStart);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { householdId, weekStart },
      { $setOnInsert: { householdId, weekStart, slots: [] } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
    );
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('reemplaza los huecos y crea el plan si no existe', async () => {
    const { model, mocks } = createModelMock();
    const repository = new MealPlansRepository(model);
    const query = mockMongooseQuery(plan);
    mocks.findOneAndUpdate.mockReturnValue(query);
    const slots = [{ day: 0, meal: 'lunch' as const, recipeId: new Types.ObjectId(), servings: 2 }];

    await repository.replaceSlots(householdId, weekStart, slots);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { householdId, weekStart },
      { $set: { slots }, $setOnInsert: { householdId, weekStart } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
    );
    expect(query.lean).toHaveBeenCalledOnce();
  });
});
