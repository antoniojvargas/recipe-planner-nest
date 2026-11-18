import { describe, expect, it } from 'vitest';
import {
  aisleForItem,
  checkerName,
  formatQuantity,
  groupByAisle,
  type ShoppingItem,
} from './shopping';

function item(name: string, overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    _id: name,
    name,
    quantity: 1,
    unit: 'unit',
    checked: false,
    source: 'plan',
    ...overrides,
  };
}

describe('aisleForItem', () => {
  it.each([
    ['Tomates', 'produce'],
    ['Limón', 'produce'],
    ['Pechuga de pollo', 'butcher'],
    ['Jamón serrano', 'butcher'],
    ['Leche entera', 'dairy'],
    ['Huevos camperos', 'dairy'],
    ['Pan de molde', 'bakery'],
    ['Arroz bomba', 'pantry'],
    ['Azúcar moreno', 'pantry'],
    ['Agua mineral', 'drinks'],
    ['Detergente', 'household'],
    ['Chicle', 'other'],
  ])('clasifica «%s» en %s', (name, expected) => {
    expect(aisleForItem(name)).toBe(expected);
  });

  it('gana la palabra clave más específica', () => {
    expect(aisleForItem('Tomate frito')).toBe('pantry');
    expect(aisleForItem('Salsa de tomate')).toBe('produce');
    expect(aisleForItem('Anillas de calamar')).toBe('butcher');
  });

  it('ignora mayúsculas y acentos', () => {
    expect(aisleForItem('  ZANAHORIA ')).toBe('produce');
    expect(aisleForItem('Plátano')).toBe('produce');
  });
});

describe('groupByAisle', () => {
  it('agrupa en orden de tienda y ordena por nombre dentro del pasillo', () => {
    const groups = groupByAisle([
      item('Leche'),
      item('Zanahoria'),
      item('Tomate'),
      item('Arroz'),
      item('Pan'),
    ]);

    expect(groups.map((group) => group.id)).toEqual(['produce', 'dairy', 'bakery', 'pantry']);
    expect(groups[0]?.items.map((entry) => entry.name)).toEqual(['Tomate', 'Zanahoria']);
  });

  it('omite los pasillos vacíos', () => {
    const groups = groupByAisle([item('Arroz')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Despensa');
  });

  it('devuelve una lista vacía si no hay ítems', () => {
    expect(groupByAisle([])).toEqual([]);
  });
});

describe('formatQuantity', () => {
  it('usa coma decimal y la abreviatura de la unidad', () => {
    expect(formatQuantity(1.5, 'kg')).toBe('1,5 kg');
    expect(formatQuantity(3, 'unit')).toBe('3 ud');
    expect(formatQuantity(2, 'tbsp')).toBe('2 cda');
    expect(formatQuantity(0.5, 'tsp')).toBe('0,5 cdta');
  });
});

describe('checkerName', () => {
  const names = { 'user-1': 'Ana', 'user-2': 'Bea' };

  it('resuelve el nombre por id con el mapa de miembros', () => {
    expect(checkerName(item('Arroz', { checked: true, checkedBy: 'user-2' }), names)).toBe('Bea');
  });

  it('prefiere el nombre del evento si el miembro ya no está en el hogar', () => {
    expect(
      checkerName(
        item('Arroz', { checked: true, checkedBy: 'user-9', checkedByName: 'Carla' }),
        names,
      ),
    ).toBe('Carla');
  });

  it('devuelve null si no hay autoría conocida o el ítem está desmarcado', () => {
    expect(checkerName(item('Arroz', { checked: true, checkedBy: 'user-9' }), names)).toBeNull();
    expect(checkerName(item('Arroz', { checked: false, checkedBy: 'user-2' }), names)).toBeNull();
  });
});
