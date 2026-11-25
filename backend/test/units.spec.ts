import { readFileSync } from 'node:fs';
import {
  IncompatibleUnitsError,
  add,
  normalize,
  scale,
  type BaseUnit,
  type Measurement,
  type Unit,
  type UnitDimension,
} from '@recipe-planner/contracts';

/**
 * Casos compartidos con el frontend en `packages/contracts/units-cases.json`.
 *
 * El archivo es la fuente de verdad de la normalización, la suma y el escalado: si backend y
 * frontend calculan distinto, estos tests y los del frontend fallan a la vez.
 */
interface NormalizeCase {
  description: string;
  quantity: number;
  unit: Unit;
  quantityBase: number;
  baseUnit: BaseUnit;
  dimension: UnitDimension;
}

interface AddCase {
  description: string;
  left: Measurement;
  right: Measurement;
  quantityBase: number;
  baseUnit: BaseUnit;
  dimension: UnitDimension;
}

interface IncompatibleCase {
  description: string;
  left: Measurement;
  right: Measurement;
  message: string;
}

interface ScaleCase {
  description: string;
  quantity: number;
  factor: number;
  quantityScaled: number;
}

interface UnitCases {
  normalize: NormalizeCase[];
  add: AddCase[];
  incompatible: IncompatibleCase[];
  scale: ScaleCase[];
}

const cases = JSON.parse(
  readFileSync(new URL('../../packages/contracts/units-cases.json', import.meta.url), 'utf8'),
) as UnitCases;

describe('casos de unidades compartidos', () => {
  it('el archivo mantiene los 40 casos', () => {
    const total =
      cases.normalize.length + cases.add.length + cases.incompatible.length + cases.scale.length;

    expect(total).toBe(40);
  });
});

describe('normalize', () => {
  it.each(cases.normalize)(
    '$description',
    ({ quantity, unit, quantityBase, baseUnit, dimension }) => {
      expect(normalize(quantity, unit)).toEqual({
        quantity: quantityBase,
        unit: baseUnit,
        dimension,
      });
    },
  );
});

describe('add', () => {
  it.each(cases.add)('$description', ({ left, right, quantityBase, baseUnit, dimension }) => {
    expect(add(left, right)).toEqual({ quantity: quantityBase, unit: baseUnit, dimension });
  });

  it.each(cases.incompatible)('rechaza $description', ({ left, right, message }) => {
    expect(() => add(left, right)).toThrow(IncompatibleUnitsError);
    expect(() => add(left, right)).toThrow(message);
  });
});

describe('scale', () => {
  it.each(cases.scale)('$description', ({ quantity, factor, quantityScaled }) => {
    expect(scale(quantity, factor)).toBe(quantityScaled);
  });
});
