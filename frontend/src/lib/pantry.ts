import type { Unit } from '@recipe-planner/contracts';

/**
 * Artículo de la despensa.
 *
 * El nombre es la identidad: la API hace `upsert` por nombre normalizado, así que editar
 * cantidad o unidad no crea otro artículo. `_id` llega de la API pero no se usa como clave.
 */
export interface PantryItem {
  _id?: string;
  name: string;
  quantity: number;
  unit: Unit;
}

export function pantryQueryKey(householdId: string) {
  return ['pantry', householdId] as const;
}

/** Misma normalización que usa el repositorio: sin espacios sobrantes y en minúsculas. */
export function normalizePantryName(name: string): string {
  return name.trim().toLowerCase();
}

/** Nombre para mostrar: la API guarda en minúsculas, la interfaz pone la inicial en mayúscula. */
export function displayPantryName(name: string): string {
  return name.length === 0 ? name : `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/** Orden alfabético en español, para que los acentos no se vayan al final. */
export function sortPantryItems(items: readonly PantryItem[]): PantryItem[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

/** Aplica la respuesta de un `upsert`: reemplaza por nombre normalizado o añade y ordena. */
export function mergePantryItem(
  items: readonly PantryItem[],
  item: PantryItem,
): PantryItem[] {
  const name = normalizePantryName(item.name);
  const exists = items.some((entry) => normalizePantryName(entry.name) === name);
  const next = exists
    ? items.map((entry) => (normalizePantryName(entry.name) === name ? item : entry))
    : [...items, item];

  return sortPantryItems(next);
}

/** Quita un artículo por nombre normalizado. */
export function removePantryItem(items: readonly PantryItem[], name: string): PantryItem[] {
  const normalized = normalizePantryName(name);

  return items.filter((entry) => normalizePantryName(entry.name) !== normalized);
}

/**
 * Convierte lo escrito en el campo de cantidad.
 *
 * Acepta coma decimal (teclados en español) y devuelve `null` si no es un número no negativo;
 * el formulario muestra el error y no llama a la API.
 */
export function parseQuantityInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');

  if (normalized === '') {
    return null;
  }

  const quantity = Number(normalized);

  return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
}
