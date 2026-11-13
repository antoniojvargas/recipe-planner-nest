import 'reflect-metadata';
import mongoose, { Types } from 'mongoose';
import {
  Recipe,
  RecipeImageSchema,
  RecipeIngredientSchema,
  RecipeSchema,
  RecipeSourceSchema,
  RecipeStepSchema,
} from './recipe.schema.js';

describe('RecipeSchema', () => {
  const connection = mongoose.createConnection();
  const RecipeModel = connection.model(Recipe.name, RecipeSchema);
  const householdId = new Types.ObjectId();
  const createdBy = new Types.ObjectId();

  const validRecipe = {
    householdId,
    title: 'Paella valenciana',
    servings: 4,
    ingredients: [
      { name: 'Arroz', quantity: 400, unit: 'g' },
      { name: 'Azafrán', quantity: 1, unit: 'pinch', note: 'tostado' },
    ],
    steps: [{ text: 'Sofríe la verdura.' }, { text: 'Añade el arroz y el caldo.' }],
    createdBy,
  };

  afterAll(async () => {
    await connection.close();
  });

  it('valida una receta completa con ingredientes, pasos, imagen y origen', async () => {
    const recipe = new RecipeModel({
      ...validRecipe,
      description: 'La de siempre',
      prepMinutes: 20,
      cookMinutes: 40,
      tags: ['  Valenciana ', 'ARROZ'],
      image: { key: 'recipes/paella.jpg', width: 1200, height: 800 },
      source: { url: 'https://example.com/paella', importedAt: new Date('2026-02-01') },
    });

    await expect(recipe.validate()).resolves.toBeUndefined();
    expect(recipe.tags).toEqual(['valenciana', 'arroz']);
    expect(recipe.ingredients[1]).toMatchObject({ name: 'Azafrán', quantity: 1, unit: 'pinch' });
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.image).toMatchObject({ key: 'recipes/paella.jpg', width: 1200, height: 800 });
  });

  it('aplica los valores por defecto de minutos, etiquetas y listas', async () => {
    const recipe = new RecipeModel(validRecipe);

    await expect(recipe.validate()).resolves.toBeUndefined();
    expect(recipe.prepMinutes).toBe(0);
    expect(recipe.cookMinutes).toBe(0);
    expect(recipe.tags).toEqual([]);
    expect(recipe.ingredients).toHaveLength(2);
  });

  it('exige hogar, título, raciones, autor y contenido de cada ingrediente y paso', async () => {
    const error = await new RecipeModel({
      ingredients: [{}],
      steps: [{}],
    })
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(Object.keys(error?.errors ?? {})).toEqual(
      expect.arrayContaining([
        'householdId',
        'title',
        'servings',
        'createdBy',
        'ingredients.0.name',
        'ingredients.0.quantity',
        'ingredients.0.unit',
        'steps.0.text',
      ]),
    );
  });

  it('rechaza cantidades negativas y unidades fuera del catálogo', async () => {
    const error = await new RecipeModel({
      ...validRecipe,
      ingredients: [{ name: 'Harina', quantity: -1, unit: 'oz' }],
    })
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(error?.errors['ingredients.0.quantity']).toBeDefined();
    expect(error?.errors['ingredients.0.unit']).toBeDefined();
  });

  it('no crea subdocumentos con identidad propia', () => {
    expect(RecipeIngredientSchema.options._id).toBe(false);
    expect(RecipeStepSchema.options._id).toBe(false);
    expect(RecipeImageSchema.options._id).toBe(false);
    expect(RecipeSourceSchema.options._id).toBe(false);
  });

  it('referencia el hogar y el autor', () => {
    expect(RecipeSchema.path('householdId').options.ref).toBe('Household');
    expect(RecipeSchema.path('createdBy').options.ref).toBe('User');
  });

  it('declara el índice de texto con pesos', () => {
    expect(RecipeSchema.indexes()).toContainEqual([
      { title: 'text', tags: 'text', 'ingredients.name': 'text' },
      expect.objectContaining({
        name: 'recipe_text',
        weights: { title: 10, tags: 5, 'ingredients.name': 3 },
        default_language: 'spanish',
      }),
    ]);
  });

  it('declara el índice del recetario por hogar y fecha', () => {
    expect(RecipeSchema.indexes()).toContainEqual([
      { householdId: 1, updatedAt: -1 },
      expect.anything(),
    ]);
  });
});
