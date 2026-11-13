import 'reflect-metadata';
import { Type } from 'class-transformer';
import { IsInt, IsArray, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import type { ArgumentMetadata } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception.js';
import { createValidationPipe, toDetails } from './validation.pipe.js';

class IngredientDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

class CreateRecipeDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  servings!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngredientDto)
  ingredients!: IngredientDto[];
}

const bodyMetadata: ArgumentMetadata = { type: 'body', metatype: CreateRecipeDto };

async function expectAppException(fn: () => Promise<unknown>): Promise<AppException> {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);

    return error as AppException;
  }

  throw new Error('Se esperaba una AppException');
}

describe('createValidationPipe', () => {
  it('deja pasar un cuerpo válido y transforma los tipos', async () => {
    const pipe = createValidationPipe();

    const result = (await pipe.transform(
      { name: 'Paella', servings: '4', ingredients: [{ name: 'Arroz', quantity: '500' }] },
      bodyMetadata,
    )) as CreateRecipeDto;

    expect(result).toBeInstanceOf(CreateRecipeDto);
    expect(result.servings).toBe(4);
    expect(result.ingredients[0]).toBeInstanceOf(IngredientDto);
    expect(result.ingredients[0].quantity).toBe(500);
  });

  it('rechaza una propiedad que no está en el DTO', async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform({ name: 'Paella', servings: 4, ingredients: [], sobra: true }, bodyMetadata),
    );

    expect(exception.getStatus()).toBe(400);
    expect(exception.code).toBe('VALIDATION_ERROR');
    expect(exception.details).toEqual([
      { field: 'sobra', message: 'property sobra should not exist' },
    ]);
  });

  it('informa de todas las propiedades que fallan a la vez', async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform({ name: 'Pa', servings: 0, ingredients: [] }, bodyMetadata),
    );

    expect(exception.details.map((detail) => detail.field)).toEqual(['name', 'servings']);
  });

  it('usa la ruta del campo en los errores anidados', async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() =>
      pipe.transform(
        { name: 'Paella', servings: 4, ingredients: [{ name: 'Arroz', quantity: 0 }] },
        bodyMetadata,
      ),
    );

    expect(exception.details).toEqual([
      { field: 'ingredients.0.quantity', message: 'quantity must not be less than 1' },
    ]);
  });

  it('mensaje del sobre y detalles en el formato del contrato', async () => {
    const pipe = createValidationPipe();

    const exception = await expectAppException(() => pipe.transform({}, bodyMetadata));

    expect(exception.message).toBe('Hay errores de validación en la petición');
    expect(exception.details.length).toBeGreaterThan(0);
    expect(exception.details.every((detail) => detail.field !== '')).toBe(true);
  });
});

describe('toDetails', () => {
  it('aplana hijos y se queda con el primer mensaje de cada propiedad', () => {
    expect(
      toDetails([
        {
          property: 'recipe',
          constraints: { isObject: 'recipe must be an object', other: 'otro mensaje' },
          children: [{ property: 'unit', constraints: { isEnum: 'unit must be a valid enum' } }],
        },
      ]),
    ).toEqual([
      { field: 'recipe', message: 'recipe must be an object' },
      { field: 'recipe.unit', message: 'unit must be a valid enum' },
    ]);
  });

  it('no inventa detalles para propiedades sin restricciones propias', () => {
    expect(toDetails([{ property: 'ingredients', children: [] }])).toEqual([]);
  });
});
