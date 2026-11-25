/**
 * Unidades de medida compartidas por la API y el frontend.
 *
 * Cada unidad declara su dimensión y su factor hacia la unidad base de esa dimensión
 * (masa → gramo, volumen → mililitro, cantidad → unidad). El catálogo y las operaciones puras
 * —normalizar, sumar y escalar— viven aquí para que el servidor, el worker y la web calculen
 * igual. Nada de esto toca base de datos, red ni el reloj.
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

/**
 * Unidad base de cada dimensión: masa → gramo, volumen → mililitro, cantidad → unidad.
 * Es la unidad en la que se expresan los totales, para no arrastrar conversiones.
 */
export const BASE_UNITS = {
  mass: 'g',
  volume: 'ml',
  count: 'unit',
} as const satisfies Record<UnitDimension, Unit>;

export type BaseUnit = (typeof BASE_UNITS)[UnitDimension];

/** Medida tal como llega de una receta o de la despensa. */
export interface Measurement {
  readonly quantity: number;
  readonly unit: Unit;
}

/** Medida convertida a la unidad base de su dimensión. */
export interface NormalizedMeasurement {
  readonly quantity: number;
  readonly unit: BaseUnit;
  readonly dimension: UnitDimension;
}

/** Error de programación: `add` solo puede sumar medidas de la misma dimensión. */
export class IncompatibleUnitsError extends Error {
  constructor(
    readonly left: Unit,
    readonly right: Unit,
  ) {
    super(`No se pueden sumar ${left} y ${right}: son dimensiones distintas`);
    this.name = 'IncompatibleUnitsError';
  }
}

/**
 * Convierte una cantidad a la unidad base de su dimensión.
 *
 * `normalize(1, 'kg')` devuelve `{ quantity: 1000, unit: 'g', dimension: 'mass' }`.
 * Así, sumar después es sumar números y no mezclar gramos con mililitros.
 */
export function normalize(quantity: number, unit: Unit): NormalizedMeasurement {
  const { dimension, factor } = UNITS[unit];

  return {
    quantity: quantity * factor,
    unit: BASE_UNITS[dimension],
    dimension,
  };
}

/**
 * Suma dos medidas y devuelve el total en la unidad base.
 *
 * Solo acepta medidas de la misma dimensión (`g` con `kg`, `tsp` con `l`); una masa con un
 * volumen es un error de programación y lanza `IncompatibleUnitsError` en vez de devolver un
 * número sin sentido. `2 cup + 100 ml` son `580 ml`; `1 kg + 500 g` son `1500 g`.
 */
export function add(left: Measurement, right: Measurement): NormalizedMeasurement {
  const a = normalize(left.quantity, left.unit);
  const b = normalize(right.quantity, right.unit);

  if (a.dimension !== b.dimension) {
    throw new IncompatibleUnitsError(left.unit, right.unit);
  }

  return { quantity: a.quantity + b.quantity, unit: a.unit, dimension: a.dimension };
}

/**
 * Escala una cantidad por un factor de raciones y redondea a `decimals` decimales.
 *
 * `scale(200, 1.5)` devuelve `300`; `scale(10, 0.75)` devuelve `7.5`. La unidad no cambia: el
 * factor solo reparte la misma medida entre más o menos comensales.
 */
export function scale(quantity: number, factor: number, decimals = 1): number {
  const multiplier = 10 ** decimals;

  return Math.round(quantity * factor * multiplier) / multiplier;
}
