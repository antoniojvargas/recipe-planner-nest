import { UNITS, type Unit, type UnitDimension } from '@recipe-planner/contracts';
import { IncompatibleUnitsError, add, normalize, type BaseUnit } from './units.js';

describe('catálogo de unidades', () => {
  it.each<{ unit: Unit; dimension: UnitDimension; factor: number }>([
    { unit: 'g', dimension: 'mass', factor: 1 },
    { unit: 'kg', dimension: 'mass', factor: 1000 },
    { unit: 'ml', dimension: 'volume', factor: 1 },
    { unit: 'l', dimension: 'volume', factor: 1000 },
    { unit: 'tsp', dimension: 'volume', factor: 5 },
    { unit: 'tbsp', dimension: 'volume', factor: 15 },
    { unit: 'cup', dimension: 'volume', factor: 240 },
    { unit: 'unit', dimension: 'count', factor: 1 },
    { unit: 'pinch', dimension: 'count', factor: 1 },
  ])('define $unit como $dimension con factor $factor', ({ unit, dimension, factor }) => {
    expect(UNITS[unit]).toEqual({ dimension, factor });
  });
});

describe('normalize', () => {
  it.each<{
    quantity: number;
    unit: Unit;
    expected: number;
    baseUnit: BaseUnit;
    dimension: UnitDimension;
  }>([
    { quantity: 1, unit: 'g', expected: 1, baseUnit: 'g', dimension: 'mass' },
    { quantity: 2.5, unit: 'kg', expected: 2500, baseUnit: 'g', dimension: 'mass' },
    { quantity: 750, unit: 'ml', expected: 750, baseUnit: 'ml', dimension: 'volume' },
    { quantity: 1.5, unit: 'l', expected: 1500, baseUnit: 'ml', dimension: 'volume' },
    { quantity: 2, unit: 'tsp', expected: 10, baseUnit: 'ml', dimension: 'volume' },
    { quantity: 3, unit: 'tbsp', expected: 45, baseUnit: 'ml', dimension: 'volume' },
    { quantity: 2, unit: 'cup', expected: 480, baseUnit: 'ml', dimension: 'volume' },
    { quantity: 4, unit: 'unit', expected: 4, baseUnit: 'unit', dimension: 'count' },
    { quantity: 2, unit: 'pinch', expected: 2, baseUnit: 'unit', dimension: 'count' },
    { quantity: 0, unit: 'kg', expected: 0, baseUnit: 'g', dimension: 'mass' },
  ])(
    'convierte $quantity $unit a $expected $baseUnit',
    ({ quantity, unit, expected, baseUnit, dimension }) => {
      expect(normalize(quantity, unit)).toEqual({ quantity: expected, unit: baseUnit, dimension });
    },
  );
});

describe('add', () => {
  it.each<{
    left: { quantity: number; unit: Unit };
    right: { quantity: number; unit: Unit };
    total: number;
    baseUnit: BaseUnit;
  }>([
    {
      left: { quantity: 1, unit: 'kg' },
      right: { quantity: 500, unit: 'g' },
      total: 1500,
      baseUnit: 'g',
    },
    {
      left: { quantity: 200, unit: 'g' },
      right: { quantity: 300, unit: 'g' },
      total: 500,
      baseUnit: 'g',
    },
    {
      left: { quantity: 2, unit: 'cup' },
      right: { quantity: 100, unit: 'ml' },
      total: 580,
      baseUnit: 'ml',
    },
    {
      left: { quantity: 0.5, unit: 'l' },
      right: { quantity: 2, unit: 'tbsp' },
      total: 530,
      baseUnit: 'ml',
    },
    {
      left: { quantity: 3, unit: 'unit' },
      right: { quantity: 2, unit: 'pinch' },
      total: 5,
      baseUnit: 'unit',
    },
  ])(
    'suma $left.quantity $left.unit + $right.quantity $right.unit = $total $baseUnit',
    ({ left, right, total, baseUnit }) => {
      expect(add(left, right)).toMatchObject({ quantity: total, unit: baseUnit });
    },
  );

  it.each<{ left: { quantity: number; unit: Unit }; right: { quantity: number; unit: Unit } }>([
    { left: { quantity: 1, unit: 'g' }, right: { quantity: 1, unit: 'ml' } },
    { left: { quantity: 1, unit: 'l' }, right: { quantity: 1, unit: 'unit' } },
    { left: { quantity: 1, unit: 'pinch' }, right: { quantity: 1, unit: 'kg' } },
  ])('rechaza sumar $left.unit con $right.unit', ({ left, right }) => {
    expect(() => add(left, right)).toThrow(IncompatibleUnitsError);
  });

  it('explica por qué no se pueden sumar dimensiones distintas', () => {
    expect(() => add({ quantity: 1, unit: 'kg' }, { quantity: 1, unit: 'l' })).toThrow(
      'No se pueden sumar kg y l: son dimensiones distintas',
    );
  });
});
