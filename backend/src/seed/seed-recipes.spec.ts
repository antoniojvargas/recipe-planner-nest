import { isUnit } from '@recipe-planner/contracts';
import { SEED_BREAKFAST_TITLES, SEED_MAIN_TITLES, SEED_RECIPES } from './seed-recipes.js';

describe('SEED_RECIPES', () => {
  it('tiene 25 recetas con títulos únicos', () => {
    const titles = SEED_RECIPES.map((recipe) => recipe.title);

    expect(SEED_RECIPES).toHaveLength(25);
    expect(new Set(titles).size).toBe(25);
  });

  it('cada receta tiene ingredientes y pasos con unidades del catálogo', () => {
    for (const recipe of SEED_RECIPES) {
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      expect(recipe.steps.length).toBeGreaterThan(0);
      expect(recipe.servings).toBeGreaterThanOrEqual(1);

      for (const ingredient of recipe.ingredients) {
        expect(isUnit(ingredient.unit)).toBe(true);
        expect(ingredient.quantity).toBeGreaterThan(0);
      }
    }
  });

  it('reparte las recetas entre desayunos y principales sin solaparse', () => {
    expect(SEED_BREAKFAST_TITLES).toHaveLength(6);
    expect(SEED_MAIN_TITLES).toHaveLength(19);
    expect(SEED_MAIN_TITLES.filter((title) => SEED_BREAKFAST_TITLES.includes(title))).toEqual([]);
  });
});
