import 'server-only';

import { unwrapApiResult } from '@/lib/api-result';
import type { ShoppingListResponse } from '@/lib/shopping';
import { apiFetch } from './api';

/**
 * Lista de la compra de la semana para el render del servidor.
 *
 * Se usa `generate` porque es el único endpoint de lectura: reconstruye los ítems `plan` y
 * conserva los manuales y el estado marcado. Abrir la semana nunca deja la lista vacía si el
 * plan tiene recetas.
 */
export async function loadShoppingList(
  householdId: string,
  weekStart: string,
): Promise<ShoppingListResponse> {
  const result = await apiFetch.POST(
    '/api/households/{householdId}/shopping-lists/{weekStart}/generate',
    { params: { path: { householdId, weekStart } } },
  );

  return unwrapApiResult<ShoppingListResponse>(result, 'No se pudo cargar la lista de la compra');
}
