import { redirect } from 'next/navigation';
import { currentWeekStart, isWeekStartString } from '@/lib/week';
import { requireHousehold } from '@/server/households';
import { loadPlanPageData } from '@/server/plan-data';
import { PlanBoard } from './plan-board';

// Datos de la sesión: nunca se sirven desde una caché compartida entre usuarios.
export const dynamic = 'force-dynamic';

/**
 * Plan semanal del hogar.
 *
 * La URL solo lleva la semana (`/plan/2026-11-16`). El hogar se resuelve en el servidor con la
 * sesión, igual que hace el resto de la app mientras no exista un selector de hogar.
 */
export default async function PlanPage({
  params,
}: Readonly<{
  params: Promise<{ weekStart: string }>;
}>) {
  const { weekStart: requested } = await params;
  const weekStart = isWeekStartString(requested) ? requested : currentWeekStart();

  // Una fecha que no sea lunes la rechazaría la API: se corrige a la semana real antes de leer.
  if (weekStart !== requested) {
    redirect(`/plan/${weekStart}`);
  }

  const household = await requireHousehold();
  const { plan, recipes, recipesById } = await loadPlanPageData(household.id, weekStart);

  return (
    <section className="mx-auto max-w-7xl p-4 sm:p-6">
      <PlanBoard
        householdId={household.id}
        weekStart={weekStart}
        initialPlan={plan}
        initialRecipes={recipes}
        initialRecipesById={recipesById}
      />
    </section>
  );
}
