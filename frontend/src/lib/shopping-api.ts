import { unwrapApiResult } from './api-result';
import { apiClient } from './api-client';
import type { ShoppingListResponse } from './shopping';

/**
 * Lista de la compra de una semana.
 *
 * La API solo expone `POST …/generate` para leerla: regenera los ítems del plan desde el plan
 * y la despensa, conservando los manuales y el estado de lo ya marcado. Es idempotente y por
 * eso se usa también como carga inicial.
 */
export async function generateShoppingList(
  householdId: string,
  weekStart: string,
): Promise<ShoppingListResponse> {
  const result = await apiClient.POST(
    '/api/households/{householdId}/shopping-lists/{weekStart}/generate',
    { params: { path: { householdId, weekStart } } },
  );

  return unwrapApiResult<ShoppingListResponse>(result, 'No se pudo cargar la lista de la compra');
}

/** Marca o desmarca un ítem; la API devuelve la lista completa ya actualizada. */
export async function setShoppingItemChecked(
  householdId: string,
  weekStart: string,
  itemId: string,
  checked: boolean,
): Promise<ShoppingListResponse> {
  const result = await apiClient.PATCH(
    '/api/households/{householdId}/shopping-lists/{weekStart}/items/{itemId}',
    {
      params: { path: { householdId, weekStart, itemId } },
      body: { checked } as any,
    },
  );

  return unwrapApiResult<ShoppingListResponse>(result, 'No se pudo actualizar el ítem');
}
