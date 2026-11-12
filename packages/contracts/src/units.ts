/**
 * Unidades de medida compartidas por la API y el frontend.
 *
 * Cada unidad declara su dimensión y su factor hacia la unidad base de esa dimensión
 * (masa → gramo, volumen → mililitro, cantidad → unidad). Solo se pueden sumar o convertir
 * unidades de la misma dimensión; esa operación vive en el servidor, aquí solo está el catálogo.
 */

export const UNIT_DIMENSIONS = ['mass', 'volume', 'count'] as const;

export type UnitDimension = (typeof UNIT_DIMENSIONS)[number];

export interface UnitDefinition {
  /** Dimensión a la que pertenece la unidad. */
  readonly dimension: UnitDimension;
  /** Cuántas unidades base contiene una unidad de esta medida. */
  readonly factor: number;
}

export const UNITS = {
  g: { dimension: 'mass', factor: 1 },
  kg: { dimension: 'mass', factor: 1_000 },
  ml: { dimension: 'volume', factor: 1 },
  l: { dimension: 'volume', factor: 1_000 },
  tsp: { dimension: 'volume', factor: 5 },
  tbsp: { dimension: 'volume', factor: 15 },
  cup: { dimension: 'volume', factor: 240 },
  unit: { dimension: 'count', factor: 1 },
  pinch: { dimension: 'count', factor: 1 },
} as const satisfies Record<string, UnitDefinition>;

export type Unit = keyof typeof UNITS;

export const UNITS_LIST = Object.keys(UNITS) as Unit[];

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && Object.hasOwn(UNITS, value);
}

export function unitsOfDimension(dimension: UnitDimension): Unit[] {
  return UNITS_LIST.filter((unit) => UNITS[unit].dimension === dimension);
}
