import 'reflect-metadata';
import { Types, type Model } from 'mongoose';
import { mockMongooseQuery } from '../../test/support/mongoose-query.js';
import type { Recipe } from './recipe.schema.js';
import { RecipesRepository } from './recipes.repository.js';

function createModelMock() {
  const mocks = {
    create: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
  };

  return { model: mocks as unknown as Model<Recipe>, mocks };
}

describe('RecipesRepository', () => {
  const householdId = new Types.ObjectId().toString();
  const recipeId = new Types.ObjectId().toString();
  const recipe = { title: 'Paella' } as Recipe;

  it('crea una receta con el hogar del input', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RecipesRepository(model);
    const input = {
      householdId: new Types.ObjectId(),
      title: 'Paella',
      servings: 4,
      createdBy: new Types.ObjectId(),
    };
    mocks.create.mockResolvedValue(recipe);

    await expect(repository.create(input)).resolves.toBe(recipe);
    expect(mocks.create).toHaveBeenCalledWith(input);
  });

  it('busca por id filtrando por hogar y con lean', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RecipesRepository(model);
    const query = mockMongooseQuery(recipe);
    mocks.findOne.mockReturnValue(query);

    await expect(repository.findById(householdId, recipeId)).resolves.toBe(recipe);
    expect(mocks.findOne).toHaveBeenCalledWith({ householdId, _id: recipeId });
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('lista el recetario del hogar por fecha y con lean', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RecipesRepository(model);
    const query = mockMongooseQuery([recipe]);
    mocks.find.mockReturnValue(query);

    await expect(repository.findByHousehold(householdId, { limit: 10, skip: 5 })).resolves.toEqual([
      recipe,
    ]);
    expect(mocks.find).toHaveBeenCalledWith({ householdId });
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(query.skip).toHaveBeenCalledWith(5);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('actualiza solo una receta del hogar', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RecipesRepository(model);
    const query = mockMongooseQuery(recipe);
    mocks.findOneAndUpdate.mockReturnValue(query);

    await repository.updateById(householdId, recipeId, { $set: { title: 'Arroz' } });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { householdId, _id: recipeId },
      { $set: { title: 'Arroz' } },
      { returnDocument: 'after', runValidators: true },
    );
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('borra solo una receta del hogar', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RecipesRepository(model);
    mocks.deleteOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    });

    await expect(repository.deleteById(householdId, recipeId)).resolves.toBe(true);
    expect(mocks.deleteOne).toHaveBeenCalledWith({ householdId, _id: recipeId });
  });
});
