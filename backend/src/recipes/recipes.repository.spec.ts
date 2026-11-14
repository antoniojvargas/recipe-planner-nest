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
    aggregate: vi.fn(),
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

  it('pagina el recetario por updatedAt y _id con el cursor', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RecipesRepository(model);
    const query = mockMongooseQuery([recipe]);
    const cursor = { updatedAt: new Date('2026-02-01T10:00:00Z'), id: new Types.ObjectId() };
    mocks.find.mockReturnValue(query);

    await repository.findPage(householdId, { limit: 20, tags: ['arroz'], cursor });

    expect(mocks.find).toHaveBeenCalledWith({
      householdId,
      tags: { $all: ['arroz'] },
      $or: [
        { updatedAt: { $lt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
      ],
    });
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1, _id: -1 });
    expect(query.limit).toHaveBeenCalledWith(20);
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('omite las etiquetas y el cursor cuando no hay filtros', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RecipesRepository(model);
    const query = mockMongooseQuery([recipe]);
    mocks.find.mockReturnValue(query);

    await repository.findPage(householdId, { limit: 10 });

    expect(mocks.find).toHaveBeenCalledWith({ householdId });
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1, _id: -1 });
  });

  it('busca con $text, calcula textScore y pagina por relevancia', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RecipesRepository(model);
    const cursor = {
      updatedAt: new Date('2026-02-01T10:00:00Z'),
      id: new Types.ObjectId(),
      score: 2.5,
    };
    const aggregate = { exec: vi.fn().mockResolvedValue([recipe]) };
    mocks.aggregate.mockReturnValue(aggregate);

    await repository.searchPage(householdId, { q: 'paella', limit: 5, tags: ['arroz'], cursor });

    const pipeline = mocks.aggregate.mock.calls[0]?.[0] as unknown[];

    expect(pipeline[0]).toEqual({
      $match: { householdId, $text: { $search: 'paella' }, tags: { $all: ['arroz'] } },
    });
    expect(pipeline[1]).toEqual({ $addFields: { score: { $meta: 'textScore' } } });
    expect(pipeline[2]).toEqual({
      $match: {
        $expr: {
          $or: [
            { $lt: ['$score', 2.5] },
            { $and: [{ $eq: ['$score', 2.5] }, { $lt: ['$updatedAt', cursor.updatedAt] }] },
            {
              $and: [
                { $eq: ['$score', 2.5] },
                { $eq: ['$updatedAt', cursor.updatedAt] },
                { $lt: ['$_id', cursor.id] },
              ],
            },
          ],
        },
      },
    });
    expect(pipeline[3]).toEqual({ $sort: { score: -1, updatedAt: -1, _id: -1 } });
    expect(pipeline[4]).toEqual({ $limit: 5 });
    expect(aggregate.exec).toHaveBeenCalledOnce();
  });

  it('busca sin cursor solo con el match de texto y el orden por relevancia', async () => {
    const { model, mocks } = createModelMock();
    const repository = new RecipesRepository(model);
    mocks.aggregate.mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });

    await repository.searchPage(householdId, { q: 'paella', limit: 5 });

    expect(mocks.aggregate).toHaveBeenCalledWith([
      { $match: { householdId, $text: { $search: 'paella' } } },
      { $addFields: { score: { $meta: 'textScore' } } },
      { $sort: { score: -1, updatedAt: -1, _id: -1 } },
      { $limit: 5 },
    ]);
  });
});
