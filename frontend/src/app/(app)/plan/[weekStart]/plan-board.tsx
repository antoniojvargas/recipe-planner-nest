'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  applySlotChange,
  DAY_NAMES,
  indexSlots,
  MEALS,
  MEAL_LABELS,
  slotKey,
  type Meal,
  type MealPlanResponse,
  type MealPlanSlot,
  type RecipeSummary,
  type SlotChange,
} from '@/lib/meal-plan';
import { fetchMealPlan, saveMealPlanSlot } from '@/lib/meal-plan-api';
import {
  currentWeekStart,
  formatWeekRange,
  shiftWeek,
  todayIso,
  weekDays,
  type WeekStart,
} from '@/lib/week';
import { RecipePicker } from './recipe-picker';

interface PlanBoardProps {
  householdId: string;
  /** Zona IANA del hogar, para saber qué día es hoy y cuál es la semana actual. */
  timeZone: string;
  weekStart: WeekStart;
  initialPlan: MealPlanResponse;
  initialRecipes: RecipeSummary[];
  initialRecipesById: Record<string, RecipeSummary>;
}

interface PickerTarget {
  day: number;
  meal: Meal;
}

function planQueryKey(householdId: string, weekStart: WeekStart) {
  return ['meal-plan', householdId, weekStart] as const;
}

/**
 * Cuadrícula días × comidas del plan semanal.
 *
 * En pantallas grandes se pinta como tabla (días en columnas, comidas en filas); en móvil,
 * cada día es una tarjeta con sus tres comidas. Las dos vistas comparten `SlotCell`, así que
 * asignar, cambiar raciones y quitar funciona igual en ambas.
 */
export function PlanBoard({
  householdId,
  timeZone,
  weekStart,
  initialPlan,
  initialRecipes,
  initialRecipesById,
}: PlanBoardProps) {
  const queryClient = useQueryClient();
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickedRecipes, setPickedRecipes] = useState<Record<string, RecipeSummary>>({});
  const [error, setError] = useState<string | null>(null);

  const queryKey = planQueryKey(householdId, weekStart);
  const planQuery = useQuery({
    queryKey,
    queryFn: () => fetchMealPlan(householdId, weekStart),
    initialData: initialPlan,
  });

  const slotMutation = useMutation({
    mutationFn: (change: SlotChange) => saveMealPlanSlot(householdId, weekStart, change),
    onMutate: async (change) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<MealPlanResponse>(queryKey);

      queryClient.setQueryData<MealPlanResponse>(queryKey, (plan) =>
        plan === undefined ? plan : { ...plan, slots: applySlotChange(plan.slots, change) },
      );

      return { previous };
    },
    onError: (mutationError, _change, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }

      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'No se pudo guardar el cambio en el plan',
      );
    },
    onSuccess: (plan) => {
      queryClient.setQueryData(queryKey, plan);
    },
  });

  const slots = indexSlots(planQuery.data.slots);
  const recipes = { ...initialRecipesById, ...pickedRecipes };
  const days = weekDays(weekStart);
  const thisWeek = currentWeekStart(new Date(), timeZone);
  const today = todayIso(new Date(), timeZone);

  function handleSelect(recipe: RecipeSummary): void {
    if (pickerTarget === null) {
      return;
    }

    setPickedRecipes((current) => ({ ...current, [recipe.id]: recipe }));
    slotMutation.mutate({
      day: pickerTarget.day,
      meal: pickerTarget.meal,
      recipeId: recipe.id,
      servings: recipe.servings,
    });
    setPickerTarget(null);
  }

  return (
    <div>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-pepper-500">
            Plan semanal
          </p>
          <h1 className="font-serif text-2xl text-pepper-900 sm:text-3xl">
            {formatWeekRange(weekStart)}
          </h1>
        </div>

        <nav className="flex items-center gap-2" aria-label="Navegación entre semanas">
          <Link
            href={`/plan/${shiftWeek(weekStart, -1)}`}
            aria-label="Semana anterior"
            className="inline-flex min-h-11 items-center rounded-lg border border-flour-400 px-3 text-sm text-pepper-600 hover:bg-flour-100"
          >
            ←
          </Link>
          <Link
            href={`/plan/${thisWeek}`}
            aria-current={weekStart === thisWeek ? 'page' : undefined}
            className="inline-flex min-h-11 items-center rounded-lg border border-flour-400 px-3 text-sm font-medium text-pepper-600 hover:bg-flour-100 aria-[current=page]:border-basil-500 aria-[current=page]:bg-basil-50 aria-[current=page]:text-basil-700"
          >
            Esta semana
          </Link>
          <Link
            href={`/plan/${shiftWeek(weekStart, 1)}`}
            aria-label="Semana siguiente"
            className="inline-flex min-h-11 items-center rounded-lg border border-flour-400 px-3 text-sm text-pepper-600 hover:bg-flour-100"
          >
            →
          </Link>
        </nav>
      </header>

      {error !== null && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-tomato-300 bg-tomato-50 px-3 py-2 text-sm text-tomato-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
            }}
            className="font-medium underline"
          >
            Descartar
          </button>
        </div>
      )}

      {planQuery.isFetching && (
        <p className="mb-3 text-xs text-pepper-500" aria-live="polite">
          Actualizando el plan…
        </p>
      )}

      {/* Cuadrícula: días en columnas y comidas en filas. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[64rem] table-fixed border-separate border-spacing-2">
          <caption className="sr-only">Plan de comidas de la semana</caption>
          <thead>
            <tr>
              <th scope="col" className="w-24">
                <span className="sr-only">Comida</span>
              </th>
              {days.map((day) => (
                <th key={day.index} scope="col" className="pb-1 text-center">
                  <span className="block text-xs uppercase tracking-wide text-pepper-500">
                    {day.weekday}
                  </span>
                  <span
                    className={`block text-lg font-medium ${
                      day.date === today ? 'text-basil-600' : 'text-pepper-700'
                    }`}
                  >
                    {day.dayOfMonth}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEALS.map((meal) => (
              <tr key={meal}>
                <th
                  scope="row"
                  className="pt-3 text-left align-top text-sm font-medium text-pepper-500"
                >
                  {MEAL_LABELS[meal]}
                </th>
                {days.map((day) => {
                  const slot = slots.get(slotKey(day.index, meal));

                  return (
                    <td key={day.index} className="p-0 align-top">
                      <SlotCell
                        day={day.index}
                        meal={meal}
                        slot={slot}
                        recipe={slot === undefined ? undefined : recipes[slot.recipeId]}
                        pending={slotMutation.isPending}
                        onPick={() => {
                          setPickerTarget({ day: day.index, meal });
                        }}
                        onRemove={() => {
                          slotMutation.mutate({
                            day: day.index,
                            meal,
                            recipeId: null,
                          });
                        }}
                        onServingsChange={(servings) => {
                          if (slot === undefined) {
                            return;
                          }

                          slotMutation.mutate({
                            day: slot.day,
                            meal: slot.meal,
                            recipeId: slot.recipeId,
                            servings,
                          });
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: una tarjeta por día con sus comidas. */}
      <div className="space-y-4 lg:hidden">
        {days.map((day) => (
          <section
            key={day.index}
            aria-labelledby={`plan-day-${String(day.index)}`}
            className="rounded-2xl border border-flour-300 bg-white p-4 shadow-sm"
          >
            <h2
              id={`plan-day-${String(day.index)}`}
              className="mb-3 flex items-baseline justify-between font-serif text-lg text-pepper-800"
            >
              {DAY_NAMES[day.index]}
              <span
                className={`text-sm ${
                  day.date === today ? 'font-medium text-basil-600' : 'text-pepper-500'
                }`}
              >
                {day.dayOfMonth} {day.month}
              </span>
            </h2>

            <div className="space-y-3">
              {MEALS.map((meal) => {
                const slot = slots.get(slotKey(day.index, meal));

                return (
                  <div key={meal} className="flex items-start gap-3">
                    <span className="w-20 shrink-0 pt-2 text-xs font-medium uppercase tracking-wide text-pepper-500">
                      {MEAL_LABELS[meal]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <SlotCell
                        compact
                        day={day.index}
                        meal={meal}
                        slot={slot}
                        recipe={slot === undefined ? undefined : recipes[slot.recipeId]}
                        pending={slotMutation.isPending}
                        onPick={() => {
                          setPickerTarget({ day: day.index, meal });
                        }}
                        onRemove={() => {
                          slotMutation.mutate({ day: day.index, meal, recipeId: null });
                        }}
                        onServingsChange={(servings) => {
                          if (slot === undefined) {
                            return;
                          }

                          slotMutation.mutate({
                            day: slot.day,
                            meal: slot.meal,
                            recipeId: slot.recipeId,
                            servings,
                          });
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {pickerTarget !== null && (
        <RecipePicker
          householdId={householdId}
          dayLabel={DAY_NAMES[pickerTarget.day]}
          mealLabel={MEAL_LABELS[pickerTarget.meal]}
          initialRecipes={initialRecipes}
          onSelect={handleSelect}
          onClose={() => {
            setPickerTarget(null);
          }}
        />
      )}
    </div>
  );
}

interface SlotCellProps {
  day: number;
  meal: Meal;
  slot: MealPlanSlot | undefined;
  recipe: RecipeSummary | undefined;
  pending: boolean;
  compact?: boolean;
  onPick: () => void;
  onRemove: () => void;
  onServingsChange: (servings: number) => void;
}

/** Hueco de la cuadrícula: receta asignada con sus raciones o botón para añadirla. */
function SlotCell({
  day,
  meal,
  slot,
  recipe,
  pending,
  compact = false,
  onPick,
  onRemove,
  onServingsChange,
}: SlotCellProps) {
  const context = `${DAY_NAMES[day]} en ${MEAL_LABELS[meal].toLowerCase()}`;
  const minHeight = compact ? 'min-h-fit' : 'min-h-32';

  if (slot === undefined) {
    return (
      <button
        type="button"
        onClick={onPick}
        aria-label={`Añadir receta al ${context}`}
        className={`flex h-full w-full ${minHeight} flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-flour-400 bg-flour-50/60 px-3 py-4 text-sm text-pepper-500 transition-colors hover:border-basil-300 hover:bg-basil-50 hover:text-basil-700`}
      >
        <span aria-hidden className="text-lg leading-none">
          +
        </span>
        Añadir receta
      </button>
    );
  }

  return (
    <div
      className={`flex h-full ${minHeight} flex-col justify-between gap-2 rounded-xl border border-flour-300 bg-white p-3 shadow-sm ${
        pending ? 'opacity-70' : ''
      }`}
    >
      <div className="min-w-0">
        <Link
          href={`/recipes/${slot.recipeId}`}
          className="inline-flex min-h-11 items-center line-clamp-3 text-sm font-medium text-pepper-800 hover:text-basil-700 hover:underline"
        >
          {recipe?.title ?? 'Receta no disponible'}
        </Link>
        {recipe === undefined && (
          <p className="mt-1 text-xs text-tomato-600">
            La receta ya no existe; puedes quitarla del plan.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ServingsStepper value={slot.servings} context={context} onChange={onServingsChange} />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPick}
            aria-label={`Cambiar la receta del ${context}`}
            className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-pepper-500 hover:bg-flour-100 hover:text-pepper-800"
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar la receta del ${context}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-base text-pepper-500 hover:bg-tomato-50 hover:text-tomato-600"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

interface ServingsStepperProps {
  value: number;
  context: string;
  onChange: (servings: number) => void;
}

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 99;

function clampServings(value: number): number {
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, value));
}

/**
 * Raciones del hueco. Se pueden escribir o ajustar con +/−; el cambio se guarda al salir del
 * campo o con Enter, no en cada tecla, para no mandar una petición por dígito.
 */
function ServingsStepper({ value, context, onChange }: ServingsStepperProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit(raw: string): void {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isNaN(parsed) || parsed < MIN_SERVINGS ? value : clampServings(parsed);

    setDraft(String(next));

    if (next !== value) {
      onChange(next);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          onChange(clampServings(value - 1));
        }}
        disabled={value <= MIN_SERVINGS}
        aria-label={`Reducir raciones del ${context}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-flour-300 text-base text-pepper-500 hover:bg-flour-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={(event) => {
          commit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        aria-label={`Raciones del ${context}`}
        className="h-11 w-11 rounded-md border border-flour-300 text-center text-sm text-pepper-800 focus:border-basil-500 focus:outline-none focus:ring-1 focus:ring-basil-500"
      />
      <button
        type="button"
        onClick={() => {
          onChange(clampServings(value + 1));
        }}
        disabled={value >= MAX_SERVINGS}
        aria-label={`Aumentar raciones del ${context}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-flour-300 text-base text-pepper-500 hover:bg-flour-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
      <span className="text-xs text-pepper-500">rac.</span>
    </div>
  );
}
