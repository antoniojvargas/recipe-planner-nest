import 'server-only';

import { unwrapApiResult } from '@/lib/api-result';
import { apiFetch } from './api';

/** Lo que necesita pintar el detalle; el contrato aún no describe el cuerpo del 200. */
export interface RecipeDetail {
  id: string;
  title: string;
  description?: string;
  servings: number;
  ingredients: { name: string; quantity: number; unit: string; note?: string }[];
  steps: { text: string }[];
}

export async function loadRecipe(householdId: string, recipeId: string): Promise<RecipeDetail> {
  const result = await apiFetch.GET('/api/households/{householdId}/recipes/{recipeId}', {
    params: { path: { householdId, recipeId } },
  });

  return unwrapApiResult<RecipeDetail>(result, 'No se pudo cargar la receta');
}
