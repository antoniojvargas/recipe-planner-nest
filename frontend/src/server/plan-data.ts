import 'server-only';

import { unwrapApiResult } from '@/lib/api-result';
import {
  referencedRecipeIds,
  recipesById as indexRecipes,
  type MealPlanResponse,
  type RecipePage,
  type RecipeSummary,
} from '@/lib/meal-plan';
import { apiFetch } from './api';

export interface PlanPageData {
  plan: MealPlanResponse;
  /** Primeras recetas del hogar, para que el selector tenga resultados sin escribir nada. */
  recipes: RecipeSummary[];
  /** Recetas que referencia el plan, resueltas para pintar títulos e imágenes. */
  recipesById: Record<string, RecipeSummary>;
}

async function fetchRecipe(householdId: string, recipeId: string): Promise<RecipeSummary | null> {
  const result = await apiFetch.GET('/api/households/{householdId}/recipes/{recipeId}', {
    params: { path: { householdId, recipeId } },
  });

  // Una receta borrada puede seguir referenciada por un plan antiguo: el hueco se pinta sin
  // título en vez de tumbar la página entera.
  if (!result.response.ok) {
    return null;
  }

  return unwrapApiResult<RecipeSummary>(result, 'No se pudo cargar la receta del plan');
}

/**
 * Datos del plan para el render del servidor: el plan de la semana y las recetas que necesita
 * la cuadrícula (título e imagen) más las primeras del recetario para el selector.
 */
export async function loadPlanPageData(
  householdId: string,
  weekStart: string,
): Promise<PlanPageData> {
  const [planResult, recipesResult] = await Promise.all([
    apiFetch.GET('/api/households/{householdId}/meal-plans/{weekStart}', {
      params: { path: { householdId, weekStart } },
    }),
    apiFetch.GET('/api/households/{householdId}/recipes', {
      params: { path: { householdId }, query: { limit: 50 } },
    }),
  ]);

  const plan = await unwrapApiResult<MealPlanResponse>(
    planResult,
    'No se pudo cargar el plan de la semana',
  );
  const page = recipesResult.response.ok
    ? await unwrapApiResult<RecipePage>(recipesResult, 'No se pudieron cargar las recetas')
    : { items: [], nextCursor: null };
  const known = indexRecipes(page.items);
  const missing = referencedRecipeIds(plan.slots).filter((id) => !Object.hasOwn(known, id));
  const resolved = await Promise.all(missing.map((id) => fetchRecipe(householdId, id)));
  const recipes = [...page.items];

  for (const recipe of resolved) {
    if (recipe !== null && !recipes.some((item) => item.id === recipe.id)) {
      recipes.push(recipe);
    }
  }

  return { plan, recipes, recipesById: indexRecipes(recipes) };
}
