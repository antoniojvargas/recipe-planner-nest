import { describe, expect, it } from 'vitest';
import type { ShoppingItemUpdatedPayload } from '@recipe-planner/contracts';
import { applyShoppingItemUpdate, shoppingListQueryKey } from './shopping-cache';
import type { ShoppingListResponse } from './shopping';

const payload: ShoppingItemUpdatedPayload = {
  householdId: 'household-1',
  weekStart: '2026-11-16',
  itemId: 'item-1',
  checked: true,
  checkedBy: { userId: 'user-2', displayName: 'Bea' },
  quantity: 2,
  unit: 'kg',
  version: 4,
};

function list(overrides: Partial<ShoppingListResponse> = {}): ShoppingListResponse {
  return {
    householdId: 'household-1',
    weekStart: '2026-11-16',
    version: 3,
    items: [
      {
        _id: 'item-1',
        name: 'Arroz',
        quantity: 1,
        unit: 'kg',
        checked: false,
        source: 'plan',
      },
      {
        _id: 'item-2',
        name: 'Leche',
        quantity: 1,
        unit: 'l',
        checked: false,
        source: 'plan',
      },
    ],
    ...overrides,
  };
}

describe('shoppingListQueryKey', () => {
  it('separa la caché por hogar y semana', () => {
    expect(shoppingListQueryKey('household-1', '2026-11-16')).toEqual([
      'shopping-list',
      'household-1',
      '2026-11-16',
    ]);
  });
});

describe('applyShoppingItemUpdate', () => {
  it('actualiza el ítem y la versión sin tocar los demás', () => {
    const updated = applyShoppingItemUpdate(list(), payload);

    expect(updated.version).toBe(4);
    expect(updated.items[0]).toMatchObject({
      _id: 'item-1',
      checked: true,
      checkedBy: 'user-2',
      checkedByName: 'Bea',
      quantity: 2,
      unit: 'kg',
    });
    expect(updated.items[1]).toEqual(list().items[1]);
  });

  it('limpia la autoría al desmarcar', () => {
    const updated = applyShoppingItemUpdate(list(), {
      ...payload,
      checked: false,
      checkedBy: null,
    });

    expect(updated.items[0]).toMatchObject({
      checked: false,
      checkedBy: null,
      checkedByName: null,
    });
  });

  it('no retrocede ante un evento de una versión anterior', () => {
    const current = list({ version: 5 });

    expect(applyShoppingItemUpdate(current, payload)).toBe(current);
  });

  it('ignora un ítem que ya no está en la lista', () => {
    const updated = applyShoppingItemUpdate(list(), { ...payload, itemId: 'missing' });

    expect(updated.items).toEqual(list().items);
    expect(updated.version).toBe(4);
  });
});
