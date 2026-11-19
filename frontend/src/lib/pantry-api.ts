import { unwrapApiResult } from './api-result';
import { apiClient } from './api-client';
import type { PantryItem } from './pantry';

/**
 * Despensa de un hogar.
 *
 * El `upsert` es por nombre: añadir un producto que ya existe actualiza su cantidad y unidad.
 * Por eso la edición en línea reutiliza el mismo endpoint sin cambiar el nombre.
 */
export async function fetchPantry(householdId: string): Promise<PantryItem[]> {
  const result = await apiClient.GET('/api/households/{householdId}/pantry', {
    params: { path: { householdId } },
  });

  return unwrapApiResult<PantryItem[]>(result, 'No se pudo cargar la despensa');
}

export async function upsertPantryItem(householdId: string, item: PantryItem): Promise<PantryItem> {
  const result = await apiClient.POST('/api/households/{householdId}/pantry', {
    params: { path: { householdId } },
    body: { name: item.name, quantity: item.quantity, unit: item.unit } as any,
  });
  const saved = await unwrapApiResult<PantryItem | null>(
    result,
    'No se pudo guardar el artículo de la despensa',
  );

  if (saved === null) {
    throw new Error('La API no devolvió el artículo guardado');
  }

  return saved;
}

/** Quita un artículo por nombre; la API responde `false` si ya no existía. */
export async function deletePantryItem(householdId: string, name: string): Promise<boolean> {
  const result = await apiClient.DELETE('/api/households/{householdId}/pantry/{name}', {
    params: { path: { householdId, name } },
  });

  return unwrapApiResult<boolean>(result, 'No se pudo quitar el artículo de la despensa');
}
