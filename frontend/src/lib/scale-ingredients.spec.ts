import { readFileSync } from 'node:fs';
import { scale, type Unit } from '@recipe-planner/contracts';
import { describe, expect, it } from 'vitest';

/**
 * Casos compartidos con el backend en `packages/contracts/units-cases.json`.
 *
 * El escalado se calcula en `@recipe-planner/contracts`, no en este paquete: la web pinta el
 * resultado de la misma función que usa la API y la despensa.
 */
interface ScaleCase {
  description: string;
  quantity: number;
  factor: number;
  quantityScaled: number;
}

interface Ingredient {
  name: string;
  quantity: number;
  unit: Unit;
}

const cases = JSON.parse(
  readFileSync(new URL('../../../packages/contracts/units-cases.json', import.meta.url), 'utf8'),
) as { scale: ScaleCase[] };

function scaleIngredients(ingredients: Ingredient[], factor: number): Ingredient[] {
  return ingredients.map((ingredient) => ({
    ...ingredient,
    quantity: scale(ingredient.quantity, factor),
  }));
}

describe('scale', () => {
  it.each(cases.scale)('$description', ({ quantity, factor, quantityScaled }) => {
    expect(scale(quantity, factor)).toBe(quantityScaled);
  });
});

describe('scaleIngredients', () => {
  it('escala la cantidad de cada ingrediente sin cambiar la unidad', () => {
    const scaled = scaleIngredients(
      [
        { name: 'Arroz', quantity: 200, unit: 'g' },
        { name: 'Pollo', quantity: 300, unit: 'g' },
        { name: 'Verduras', quantity: 150, unit: 'g' },
      ],
      1.5,
    );

    expect(scaled).toEqual([
      { name: 'Arroz', quantity: 300, unit: 'g' },
      { name: 'Pollo', quantity: 450, unit: 'g' },
      { name: 'Verduras', quantity: 225, unit: 'g' },
    ]);
  });

  it('redondea a un decimal al reducir raciones', () => {
    const scaled = scaleIngredients([{ name: 'Sal', quantity: 10, unit: 'g' }], 0.75);

    expect(scaled).toEqual([{ name: 'Sal', quantity: 7.5, unit: 'g' }]);
  });
});
