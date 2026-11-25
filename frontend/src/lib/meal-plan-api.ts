import { unwrapApiResult } from './api-result';
import { apiClient } from './api-client';
import type { MealPlanResponse, RecipePage, RecipeSummary, SlotChange } from './meal-plan';

/**
 * Plan de una semana. La API lo crea vacío si todavía no existe, así que abrir una semana
 * nueva nunca devuelve 404.
 */
export async function fetchMealPlan(
  householdId: string,
  weekStart: string,
): Promise<MealPlanResponse> {
  const result = await apiClient.GET('/api/households/{householdId}/meal-plans/{weekStart}', {
    params: { path: { householdId, weekStart } },
  });

  return unwrapApiResult<MealPlanResponse>(result, 'No se pudo cargar el plan de la semana');
}

/** Asigna, actualiza las raciones o quita (`recipeId: null`) la receta de un hueco. */
export async function saveMealPlanSlot(
  householdId: string,
  weekStart: string,
  change: SlotChange,
): Promise<MealPlanResponse> {
  const body =
    change.recipeId === null
      ? { day: change.day, meal: change.meal }
      : {
          day: change.day,
          meal: change.meal,
          recipeId: change.recipeId,
          ...(change.servings === undefined ? {} : { servings: change.servings }),
        };

  const result = await apiClient.PUT('/api/households/{householdId}/meal-plans/{weekStart}/slots', {
    params: { path: { householdId, weekStart } },
    body: body as any,
  });

  return unwrapApiResult<MealPlanResponse>(result, 'No se pudo guardar el hueco del plan');
}

/** Busca recetas del hogar para el selector; sin texto devuelve las más recientes. */
export async function searchRecipes(
  householdId: string,
  query: string,
  limit = 20,
): Promise<RecipeSummary[]> {
  const result = await apiClient.GET('/api/households/{householdId}/recipes', {
    // @ts-ignore
    params: {
      path: { householdId },
      query: { limit, ...(query.trim() === '' ? {} : { q: query.trim() }) } as any,
    },
  });

  const page = await unwrapApiResult<RecipePage>(result, 'No se pudieron buscar recetas');

  return page.items;
}
