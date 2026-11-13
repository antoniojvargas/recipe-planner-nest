import { UNITS, type Unit, type UnitDimension } from '@recipe-planner/contracts';

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
  quantity: number;
  unit: Unit;
}

/** Medida convertida a la unidad base de su dimensión. */
export interface NormalizedMeasurement {
  quantity: number;
  unit: BaseUnit;
  dimension: UnitDimension;
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
