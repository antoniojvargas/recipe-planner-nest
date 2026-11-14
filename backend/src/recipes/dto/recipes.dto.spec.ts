import 'reflect-metadata';
import type { ArgumentMetadata } from '@nestjs/common';
import { UNITS_LIST } from '@recipe-planner/contracts';
import { AppException } from '../../common/exceptions/app.exception.js';
import { createValidationPipe } from '../../common/pipes/validation.pipe.js';
import { CreateRecipeDto } from './create-recipe.dto.js';
import { RECIPE_LIMITS } from './recipe-limits.js';
import { RecipeIngredientDto } from './recipe-ingredient.dto.js';
import { RecipeStepDto } from './recipe-step.dto.js';
import { UpdateRecipeDto } from './update-recipe.dto.js';

const createMetadata: ArgumentMetadata = { type: 'body', metatype: CreateRecipeDto };
const updateMetadata: ArgumentMetadata = { type: 'body', metatype: UpdateRecipeDto };

const validBody = {
  title: '  Paella valenciana ',
  description: 'La de siempre',
  servings: '4',
  prepMinutes: '20',
  tags: [' Valenciana ', 'ARROZ'],
  ingredients: [
    { name: ' Arroz ', quantity: '400', unit: 'g' },
    { name: 'Azafrán', quantity: 1, unit: 'pinch', note: 'tostado' },
  ],
  steps: [{ text: ' Sofríe la verdura. ' }, { text: 'Añade el arroz y el caldo.' }],
};

async function expectAppException(fn: () => Promise<unknown>): Promise<AppException> {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);

    return error as AppException;
  }

  throw new Error('Se esperaba una AppException');
}

const ingredients = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    name: `Ingrediente ${String(index)}`,
    quantity: 1,
    unit: 'g',
  }));

const steps = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ text: `Paso ${String(index)}` }));

describe('CreateRecipeDto', () => {
  it('acepta una receta completa y transforma tipos, textos y etiquetas', async () => {
    const pipe = createValidationPipe();

    const dto = (await pipe.transform(validBody, createMetadata)) as CreateRecipeDto;

    expect(dto).toBeInstanceOf(CreateRecipeDto);
    expect(dto.title).toBe('Paella valenciana');
    expect(dto.servings).toBe(4);
    expect(dto.prepMinutes).toBe(20);
    expect(dto.tags).toEqual(['valenciana', 'arroz']);
    expect(dto.ingredients?.[0]).toBeInstanceOf(RecipeIngredientDto);
    expect(dto.ingredients?.[0]).toMatchObject({ name: 'Arroz', quantity: 400, unit: 'g' });
    expect(dto.steps?.[0]).toBeInstanceOf(RecipeStepDto);
    expect(dto.steps?.[0].text).toBe('Sofríe la verdura.');
  });

  it(`acepta justo ${String(RECIPE_LIMITS.ingredients)} ingredientes y ${String(RECIPE_LIMITS.steps)} pasos`, async () => {
    const pipe = createValidationPipe();

    await expect(
      pipe.transform(
        {
          title: 'Menú largo',
          servings: 1,
          ingredients: ingredients(RECIPE_LIMITS.ingredients),
          steps: steps(RECIPE_LIMITS.steps),
        },
        createMetadata,
      ),
    ).resolves.toBeInstanceOf(CreateRecipeDto);
  });

  it(`rechaza más de ${String(RECIPE_LIMITS.ingredients)} ingredientes`, async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform(
        {
          title: 'Menú eterno',
          servings: 1,
          ingredients: ingredients(RECIPE_LIMITS.ingredients + 1),
        },
        createMetadata,
      ),
    );

    expect(exception.details).toEqual([
      {
        field: 'ingredients',
        message: `No se pueden añadir más de ${String(RECIPE_LIMITS.ingredients)} ingredientes`,
      },
    ]);
  });

  it(`rechaza más de ${String(RECIPE_LIMITS.steps)} pasos`, async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform(
        { title: 'Interminable', servings: 1, steps: steps(RECIPE_LIMITS.steps + 1) },
        createMetadata,
      ),
    );

    expect(exception.details).toEqual([
      {
        field: 'steps',
        message: `No se pueden añadir más de ${String(RECIPE_LIMITS.steps)} pasos`,
      },
    ]);
  });

  it('rechaza una unidad que no está en el catálogo de contracts', async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform(
        {
          title: 'Bizcocho',
          servings: 8,
          ingredients: [{ name: 'Harina', quantity: 1, unit: 'oz' }],
        },
        createMetadata,
      ),
    );

    expect(exception.details).toEqual([
      {
        field: 'ingredients.0.unit',
        message: `La unidad debe ser una del catálogo: ${UNITS_LIST.join(', ')}`,
      },
    ]);
  });

  it('acepta todas las unidades del catálogo', async () => {
    const pipe = createValidationPipe();

    await expect(
      pipe.transform(
        {
          title: 'Catálogo completo',
          servings: 1,
          ingredients: UNITS_LIST.map((unit) => ({ name: 'Ingrediente', quantity: 1, unit })),
        },
        createMetadata,
      ),
    ).resolves.toBeInstanceOf(CreateRecipeDto);
  });

  it('valida los ingredientes anidados y no solo el array', async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform(
        {
          title: 'Bizcocho',
          servings: 8,
          ingredients: [{ name: '', quantity: -1, unit: 'g', sobra: true }],
        },
        createMetadata,
      ),
    );

    const fields = exception.details.map((detail) => detail.field);

    expect(fields).toHaveLength(3);
    expect(fields).toEqual(
      expect.arrayContaining([
        'ingredients.0.name',
        'ingredients.0.quantity',
        'ingredients.0.sobra',
      ]),
    );
  });

  it('valida los pasos anidados', async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform(
        { title: 'Bizcocho', servings: 8, steps: [{ text: '   ' }, {}] },
        createMetadata,
      ),
    );

    expect(exception.details.map((detail) => detail.field)).toEqual([
      'steps.0.text',
      'steps.1.text',
    ]);
  });

  it('exige título y raciones válidas', async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform({ title: '   ', servings: 0 }, createMetadata),
    );

    expect(exception.details.map((detail) => detail.field)).toEqual(['title', 'servings']);
  });
});

describe('UpdateRecipeDto', () => {
  it('acepta un parche parcial', async () => {
    const pipe = createValidationPipe();

    const dto = (await pipe.transform(
      { title: '  Nueva paella ' },
      updateMetadata,
    )) as UpdateRecipeDto;

    expect(dto).toBeInstanceOf(UpdateRecipeDto);
    expect(dto.title).toBe('Nueva paella');
    expect(dto.ingredients).toBeUndefined();
  });

  it('aplica los mismos límites de ingredientes y pasos', async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform(
        {
          ingredients: ingredients(RECIPE_LIMITS.ingredients + 1),
          steps: steps(RECIPE_LIMITS.steps + 1),
        },
        updateMetadata,
      ),
    );

    expect(exception.details.map((detail) => detail.field)).toEqual(['ingredients', 'steps']);
  });

  it('valida la unidad también al editar', async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform(
        { ingredients: [{ name: 'Harina', quantity: 1, unit: 'lb' }] },
        updateMetadata,
      ),
    );

    expect(exception.details[0]?.field).toBe('ingredients.0.unit');
  });
});
