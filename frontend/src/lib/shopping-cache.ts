import type { ShoppingItemUpdatedPayload } from '@recipe-planner/contracts';
import type { ShoppingListResponse } from './shopping';

/**
 * Clave de la lista de la compra en TanStack Query.
 *
 * Incluye el hogar y la semana porque una pestaña puede visitar varias: los eventos de otra
 * semana no deben tocar la lista que se está mirando.
 */
export function shoppingListQueryKey(householdId: string, weekStart: string) {
  return ['shopping-list', householdId, weekStart] as const;
}

/**
 * Aplica `shopping.item.updated` a la lista en caché.
 *
 * El servidor manda el estado resultante completo (marcado, autoría, cantidad y unidad), así
 * que el cliente no deduce nada. Se ignoran los eventos con una versión anterior a la que ya
 * está en caché: tras una regeneración pueden llegar noticias viejas de camino.
 */
export function applyShoppingItemUpdate(
  list: ShoppingListResponse,
  payload: ShoppingItemUpdatedPayload,
): ShoppingListResponse {
  if (payload.version < list.version) {
    return list;
  }

  return {
    ...list,
    version: payload.version,
    items: list.items.map((item) =>
      item._id === payload.itemId
        ? {
            ...item,
            checked: payload.checked,
            checkedBy: payload.checkedBy?.userId ?? null,
            checkedByName: payload.checkedBy?.displayName ?? null,
            quantity: payload.quantity,
            unit: payload.unit,
          }
        : item,
    ),
  };
}
