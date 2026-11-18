import { describe, expect, it } from 'vitest';
import {
  applySlotChange,
  indexSlots,
  MEALS,
  referencedRecipeIds,
  recipesById,
  type MealPlanSlot,
} from './meal-plan';

const slots: MealPlanSlot[] = [
  { day: 0, meal: 'lunch', recipeId: 'a', servings: 4 },
  { day: 0, meal: 'dinner', recipeId: 'b', servings: 2 },
  { day: 2, meal: 'breakfast', recipeId: 'a', servings: 3 },
];

describe('applySlotChange', () => {
  it('añade un hueco vacío con las raciones indicadas', () => {
    const result = applySlotChange(slots, {
      day: 1,
      meal: 'breakfast',
      recipeId: 'c',
      servings: 2,
    });

    expect(result).toHaveLength(4);
    expect(result).toContainEqual({ day: 1, meal: 'breakfast', recipeId: 'c', servings: 2 });
  });

  it('mantiene el orden por día y comida', () => {
    const result = applySlotChange(slots, {
      day: 1,
      meal: 'breakfast',
      recipeId: 'c',
      servings: 2,
    });

    expect(result.map((slot) => `${String(slot.day)}:${slot.meal}`)).toEqual([
      '0:lunch',
      '0:dinner',
      '1:breakfast',
      '2:breakfast',
    ]);
  });

  it('reemplaza la receta del mismo hueco sin duplicarlo', () => {
    const result = applySlotChange(slots, { day: 0, meal: 'lunch', recipeId: 'c', servings: 5 });

    expect(result).toHaveLength(3);
    expect(result.find((slot) => slot.day === 0 && slot.meal === 'lunch')).toEqual({
      day: 0,
      meal: 'lunch',
      recipeId: 'c',
      servings: 5,
    });
  });

  it('conserva las raciones si el cambio solo trae la receta', () => {
    const result = applySlotChange(slots, { day: 0, meal: 'lunch', recipeId: 'c' });

    expect(result.find((slot) => slot.day === 0 && slot.meal === 'lunch')).toMatchObject({
      recipeId: 'c',
      servings: 4,
    });
  });

  it('quita el hueco con recipeId null', () => {
    const result = applySlotChange(slots, { day: 0, meal: 'dinner', recipeId: null });

    expect(result).toHaveLength(2);
    expect(result.some((slot) => slot.day === 0 && slot.meal === 'dinner')).toBe(false);
  });

  it('no toca nada si se quita un hueco que ya estaba vacío', () => {
    expect(applySlotChange(slots, { day: 6, meal: 'lunch', recipeId: null })).toHaveLength(3);
  });
});

describe('indexSlots', () => {
  it('indexa por día y comida', () => {
    const index = indexSlots(slots);

    expect(index.get('0:lunch')?.recipeId).toBe('a');
    expect(index.get('2:breakfast')?.servings).toBe(3);
  });
});

describe('referencedRecipeIds', () => {
  it('deduplica las recetas del plan', () => {
    expect(referencedRecipeIds(slots).sort()).toEqual(['a', 'b']);
  });
});

describe('recipesById', () => {
  it('indexa las recetas por id', () => {
    const index = recipesById([
      { id: 'a', title: 'Arroz', servings: 4 },
      { id: 'b', title: 'Sopa', servings: 2 },
    ]);

    expect(index.a.title).toBe('Arroz');
    expect(index.b.servings).toBe(2);
  });
});

describe('MEALS', () => {
  it('sigue el orden del día que espera la API', () => {
    expect(MEALS).toEqual(['breakfast', 'lunch', 'dinner']);
  });
});
