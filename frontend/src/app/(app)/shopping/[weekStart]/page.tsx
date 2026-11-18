import { redirect } from 'next/navigation';
import { currentWeekStart, isWeekStartString } from '@/lib/week';
import { requireHousehold } from '@/server/households';
import { loadShoppingList } from '@/server/shopping-data';
import { ShoppingList } from './shopping-list';

/**
 * Lista de la compra del hogar para una semana.
 *
 * La lista se carga en el servidor (el endpoint de lectura regenera los ítems del plan) y el
 * Client Component se queda con el marcado optimista y la caché de TanStack Query.
 */
export default async function ShoppingListPage({
  params,
}: Readonly<{
  params: Promise<{ weekStart: string }>;
}>) {
  const { weekStart: requested } = await params;
  const weekStart = isWeekStartString(requested) ? requested : currentWeekStart();

  if (weekStart !== requested) {
    redirect(`/shopping/${weekStart}`);
  }

  const household = await requireHousehold();
  const list = await loadShoppingList(household.id, weekStart);

  return (
    <section className="mx-auto max-w-3xl p-4 sm:p-6">
      <ShoppingList householdId={household.id} weekStart={weekStart} initialList={list} />
    </section>
  );
}
