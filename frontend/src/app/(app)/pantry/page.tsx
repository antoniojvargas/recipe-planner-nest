import { requireHousehold } from '@/server/households';
import { loadPantry } from '@/server/pantry-data';
import { PantryBoard } from './pantry-board';

// Datos de la sesión: nunca se sirven desde una caché compartida entre usuarios.
export const dynamic = 'force-dynamic';

/**
 * Despensa del hogar.
 *
 * La lista se carga en el servidor para que la primera pintura ya tenga contenido; el Client
 * Component se queda con el alta rápida, la edición en línea y la caché de TanStack Query.
 */
export default async function PantryPage() {
  const household = await requireHousehold();
  const items = await loadPantry(household.id);

  return (
    <section className="mx-auto max-w-3xl p-4 sm:p-6">
      <PantryBoard householdId={household.id} initialItems={items} />
    </section>
  );
}
