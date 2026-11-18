/**
 * Tipos y operaciones del plan semanal que comparten el servidor y el navegador.
 *
 * El contrato OpenAPI todavía no describe el cuerpo del plan, así que estos tipos reflejan la
 * respuesta de `MealPlansController` y se usan para castear lo que devuelve `openapi-fetch`.
 */

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;

export type Meal = (typeof MEALS)[number];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
};

export const DAY_NAMES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

/** Hueco del plan tal como lo devuelve la API (sin `_id`: se identifica por día y comida). */
export interface MealPlanSlot {
  day: number;
  meal: Meal;
  recipeId: string;
  servings: number;
}

export interface MealPlanResponse {
  _id?: string;
  householdId: string;
  weekStart: string;
  slots: MealPlanSlot[];
  createdAt?: string;
  updatedAt?: string;
}

/** Datos mínimos de una receta para pintar un hueco y el selector. */
export interface RecipeSummary {
  id: string;
  title: string;
  servings: number;
  image?: { smallUrl?: string } | null;
}

/** Página del recetario que devuelve `GET …/recipes`. */
export interface RecipePage {
  items: RecipeSummary[];
  nextCursor: string | null;
}

/** Cambio que se envía a `PUT …/meal-plans/:weekStart/slots`. */
export interface SlotChange {
  day: number;
  meal: Meal;
  /** `null` quita la receta del hueco. */
  recipeId: string | null;
  servings?: number;
}

export function slotKey(day: number, meal: Meal): string {
  return `${String(day)}:${meal}`;
}

/** Índice por `day:meal` para pintar la cuadrícula sin recorrer el array en cada celda. */
export function indexSlots(slots: readonly MealPlanSlot[]): Map<string, MealPlanSlot> {
  return new Map(slots.map((slot) => [slotKey(slot.day, slot.meal), slot]));
}

/**
 * Estado de los huecos tras un cambio, con la misma semántica que la API: asignar reemplaza o
 * añade y `recipeId: null` elimina el hueco. Se usa tanto en el optimismo del cliente como en
 * las pruebas de la cuadrícula.
 */
export function applySlotChange(
  slots: readonly MealPlanSlot[],
  change: SlotChange,
): MealPlanSlot[] {
  const withoutTarget = slots.filter(
    (slot) => !(slot.day === change.day && slot.meal === change.meal),
  );

  if (change.recipeId === null) {
    return withoutTarget;
  }

  const previous = slots.find((slot) => slot.day === change.day && slot.meal === change.meal);

  return [
    ...withoutTarget,
    {
      day: change.day,
      meal: change.meal,
      recipeId: change.recipeId,
      servings: change.servings ?? previous?.servings ?? 1,
    },
  ].sort(
    (left, right) => left.day - right.day || MEALS.indexOf(left.meal) - MEALS.indexOf(right.meal),
  );
}

/** Recetas referenciadas por el plan, sin repetir, para pedirlas al servidor. */
export function referencedRecipeIds(slots: readonly MealPlanSlot[]): string[] {
  return [...new Set(slots.map((slot) => slot.recipeId))];
}

/** Índice de recetas por id para resolver títulos e imágenes de los huecos. */
export function recipesById(recipes: readonly RecipeSummary[]): Record<string, RecipeSummary> {
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}

export function isMeal(value: string): value is Meal {
  return (MEALS as readonly string[]).includes(value);
}
