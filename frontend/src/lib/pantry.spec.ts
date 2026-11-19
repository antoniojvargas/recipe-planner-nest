import { describe, expect, it } from 'vitest';
import type { Unit } from '@recipe-planner/contracts';
import {
  displayPantryName,
  mergePantryItem,
  normalizePantryName,
  parseQuantityInput,
  removePantryItem,
  sortPantryItems,
  type PantryItem,
} from './pantry';

function item(name: string, quantity = 1, unit: Unit = 'unit'): PantryItem {
  return { name, quantity, unit };
}

describe('normalizePantryName', () => {
  it('quita espacios sobrantes y pasa a minúsculas, como el repositorio', () => {
    expect(normalizePantryName('  Arroz Bomba ')).toBe('arroz bomba');
  });
});

describe('displayPantryName', () => {
  it('pone la inicial en mayúscula sin tocar el resto', () => {
    expect(displayPantryName('arroz bomba')).toBe('Arroz bomba');
    expect(displayPantryName('leche')).toBe('Leche');
  });

  it('deja igual una cadena vacía', () => {
    expect(displayPantryName('')).toBe('');
  });
});

describe('sortPantryItems', () => {
  it('ordena alfabéticamente en español sin mutar la entrada', () => {
    const input = [item('zanahoria'), item('Ázúcar'), item('arroz'), item('leche')];

    expect(sortPantryItems(input).map((entry) => entry.name)).toEqual([
      'arroz',
      'Ázúcar',
      'leche',
      'zanahoria',
    ]);
    expect(input.map((entry) => entry.name)).toEqual(['zanahoria', 'Ázúcar', 'arroz', 'leche']);
  });
});

describe('mergePantryItem', () => {
  it('reemplaza el artículo existente comparando por nombre normalizado', () => {
    const merged = mergePantryItem(
      [item('arroz', 1, 'kg'), item('leche', 2, 'l')],
      item(' Arroz ', 500, 'g'),
    );

    expect(merged).toEqual([{ name: ' Arroz ', quantity: 500, unit: 'g' }, item('leche', 2, 'l')]);
  });

  it('añade el artículo nuevo en orden', () => {
    const merged = mergePantryItem([item('leche'), item('zanahoria')], item('arroz'));

    expect(merged.map((entry) => entry.name)).toEqual(['arroz', 'leche', 'zanahoria']);
  });
});

describe('removePantryItem', () => {
  it('quita por nombre normalizado', () => {
    const remaining = removePantryItem([item('arroz'), item('leche')], ' Arroz ');

    expect(remaining.map((entry) => entry.name)).toEqual(['leche']);
  });

  it('no toca la lista si el nombre no está', () => {
    const items = [item('arroz')];

    expect(removePantryItem(items, 'pan')).toEqual(items);
  });
});

describe('parseQuantityInput', () => {
  it.each([
    ['2', 2],
    ['1,5', 1.5],
    [' 250 ', 250],
    ['0', 0],
    ['0,25', 0.25],
  ])('acepta «%s»', (value, expected) => {
    expect(parseQuantityInput(value)).toBe(expected);
  });

  it.each(['', '  ', 'mucho', '-1', '1,2,3', 'Infinity'])('rechaza «%s»', (value) => {
    expect(parseQuantityInput(value)).toBeNull();
  });
});
