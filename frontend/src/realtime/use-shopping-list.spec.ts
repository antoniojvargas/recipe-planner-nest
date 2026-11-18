import { QueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS } from '@recipe-planner/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shoppingListQueryKey } from '@/lib/shopping-cache';
import type { ShoppingListResponse } from '@/lib/shopping';
import { subscribeToShoppingList } from './use-shopping-list';
import type { RealtimeSocket } from './socket';

type Listener = (payload?: never) => void;

class FakeSocket {
  connected = false;
  readonly listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? [];

    listeners.push(listener);
    this.listeners.set(event, listeners);

    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((registered) => registered !== listener),
    );

    return this;
  }

  fire(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (value?: unknown) => void)(payload);
    }
  }

  count(event: string): number {
    return (this.listeners.get(event) ?? []).length;
  }
}

const householdId = 'household-1';
const weekStart = '2026-11-16';

function initialList(): ShoppingListResponse {
  return {
    householdId,
    weekStart,
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
        quantity: 2,
        unit: 'l',
        checked: false,
        source: 'plan',
      },
    ],
  };
}

function itemUpdated(overrides: Record<string, unknown> = {}) {
  return {
    householdId,
    weekStart,
    itemId: 'item-1',
    checked: true,
    checkedBy: { userId: 'user-2', displayName: 'Bea' },
    quantity: 1.5,
    unit: 'kg',
    version: 4,
    ...overrides,
  };
}

describe('subscribeToShoppingList', () => {
  let fake: FakeSocket;
  let socket: RealtimeSocket;
  let queryClient: QueryClient;

  beforeEach(() => {
    fake = new FakeSocket();
    socket = fake as unknown as RealtimeSocket;
    queryClient = new QueryClient();
    queryClient.setQueryData(shoppingListQueryKey(householdId, weekStart), initialList());
  });

  function subscribe(): () => void {
    return subscribeToShoppingList({ socket, queryClient, householdId, weekStart });
  }

  it('aplica shopping.item.updated a la lista en caché', () => {
    subscribe();

    fake.fire(SOCKET_EVENTS.shoppingItemUpdated, itemUpdated());

    const list = queryClient.getQueryData<ShoppingListResponse>(
      shoppingListQueryKey(householdId, weekStart),
    );

    expect(list?.version).toBe(4);
    expect(list?.items[0]).toMatchObject({
      checked: true,
      checkedBy: 'user-2',
      checkedByName: 'Bea',
      quantity: 1.5,
      unit: 'kg',
    });
    expect(list?.items[1]?.checked).toBe(false);
  });

  it('limpia la autoría cuando el ítem se desmarca', () => {
    subscribe();

    fake.fire(SOCKET_EVENTS.shoppingItemUpdated, itemUpdated({ checked: false, checkedBy: null }));

    const list = queryClient.getQueryData<ShoppingListResponse>(
      shoppingListQueryKey(householdId, weekStart),
    );

    expect(list?.items[0]).toMatchObject({ checked: false, checkedBy: null, checkedByName: null });
  });

  it('ignora eventos de otra semana u hogar', () => {
    subscribe();

    fake.fire(SOCKET_EVENTS.shoppingItemUpdated, itemUpdated({ weekStart: '2026-11-23' }));
    fake.fire(SOCKET_EVENTS.shoppingItemUpdated, itemUpdated({ householdId: 'other' }));

    const list = queryClient.getQueryData<ShoppingListResponse>(
      shoppingListQueryKey(householdId, weekStart),
    );

    expect(list?.items[0]?.checked).toBe(false);
    expect(list?.version).toBe(3);
  });

  it('ignora eventos con una versión anterior a la caché', () => {
    subscribe();

    fake.fire(SOCKET_EVENTS.shoppingItemUpdated, itemUpdated({ version: 2 }));

    const list = queryClient.getQueryData<ShoppingListResponse>(
      shoppingListQueryKey(householdId, weekStart),
    );

    expect(list?.items[0]?.checked).toBe(false);
    expect(list?.version).toBe(3);
  });

  it('invalida la lista cuando se regenera la misma semana', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    subscribe();

    fake.fire(SOCKET_EVENTS.shoppingListRegenerated, {
      householdId,
      weekStart: '2026-11-23',
      version: 5,
    });
    expect(invalidate).not.toHaveBeenCalled();

    fake.fire(SOCKET_EVENTS.shoppingListRegenerated, { householdId, weekStart, version: 5 });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: shoppingListQueryKey(householdId, weekStart),
    });
  });

  it('no invalida en la conexión inicial y sí al reconectar', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    subscribe();

    fake.fire('connect');
    expect(invalidate).not.toHaveBeenCalled();

    fake.fire('connect');
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('no crea una lista si la caché todavía está vacía', () => {
    queryClient.removeQueries({ queryKey: shoppingListQueryKey(householdId, weekStart) });
    subscribe();

    fake.fire(SOCKET_EVENTS.shoppingItemUpdated, itemUpdated());

    expect(queryClient.getQueryData(shoppingListQueryKey(householdId, weekStart))).toBeUndefined();
  });

  it('deja intactos los ítems cuando el evento es de un artículo que ya no está', () => {
    subscribe();

    fake.fire(SOCKET_EVENTS.shoppingItemUpdated, itemUpdated({ itemId: 'item-borrado' }));

    const list = queryClient.getQueryData<ShoppingListResponse>(
      shoppingListQueryKey(householdId, weekStart),
    );

    expect(list?.items).toEqual(initialList().items);
    expect(list?.version).toBe(4);
  });

  it('quita los listeners al desuscribirse', () => {
    const unsubscribe = subscribe();

    expect(fake.count(SOCKET_EVENTS.shoppingItemUpdated)).toBe(1);
    expect(fake.count(SOCKET_EVENTS.shoppingListRegenerated)).toBe(1);
    expect(fake.count('connect')).toBe(1);

    unsubscribe();

    expect(fake.count(SOCKET_EVENTS.shoppingItemUpdated)).toBe(0);
    expect(fake.count(SOCKET_EVENTS.shoppingListRegenerated)).toBe(0);
    expect(fake.count('connect')).toBe(0);
  });
});
