import 'server-only';

import { unwrapApiResult } from '@/lib/api-result';
import { sortPantryItems, type PantryItem } from '@/lib/pantry';
import { apiFetch } from './api';

/**
 * Despensa del hogar para el render del servidor.
 *
 * El orden se normaliza aquí para que el HTML inicial y las actualizaciones del cliente usen
 * el mismo criterio (alfabético en español).
 */
export async function loadPantry(householdId: string): Promise<PantryItem[]> {
  const result = await apiFetch.GET('/api/households/{householdId}/pantry', {
    params: { path: { householdId } },
  });
  const items = await unwrapApiResult<PantryItem[]>(result, 'No se pudo cargar la despensa');

  return sortPantryItems(items);
}
