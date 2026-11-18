// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { ShoppingList } from '@/app/(app)/shopping/[weekStart]/shopping-list';
import type { ShoppingListResponse } from '@/lib/shopping';

const { generateShoppingListMock, setShoppingItemCheckedMock } = vi.hoisted(() => ({
  generateShoppingListMock: vi.fn(),
  setShoppingItemCheckedMock: vi.fn(),
}));

vi.mock('@/lib/shopping-api', () => ({
  generateShoppingList: generateShoppingListMock,
  setShoppingItemChecked: setShoppingItemCheckedMock,
}));

// La conexión en vivo tiene su propia prueba con un socket falso; aquí solo estorba.
vi.mock('@/realtime/use-shopping-list', () => ({
  useShoppingListRealtime: vi.fn(),
}));

vi.mock('next/link', async () => {
  const { createElement } = await import('react');

  return {
    default: ({
      href,
      children,
      ...rest
    }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
      href: string;
      children: ReactNode;
    }) => createElement('a', { href, ...rest }, children),
  };
});

const householdId = 'household-1';
const weekStart = '2026-11-16';
const currentUserId = 'user-1';

function list(overrides: Partial<ShoppingListResponse> = {}): ShoppingListResponse {
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
    ...overrides,
  };
}

function renderList(initial = list()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ShoppingList
        householdId={householdId}
        weekStart={weekStart}
        initialList={initial}
        currentUserId={currentUserId}
        memberNames={{ [currentUserId]: 'Ana' }}
      />
    </QueryClientProvider>,
  );
}

function itemButton(name: RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

beforeEach(() => {
  generateShoppingListMock.mockReset();
  setShoppingItemCheckedMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ShoppingList: marcado optimista', () => {
  it('marca antes de que responda la API y revierte si la petición falla', async () => {
    const user = userEvent.setup();
    let rejectRequest: (error: Error) => void = () => undefined;
    const request = new Promise<ShoppingListResponse>((_resolve, reject) => {
      rejectRequest = reject;
    });

    setShoppingItemCheckedMock.mockReturnValue(request);

    renderList();

    const button = itemButton(/Arroz/);

    expect(button.getAttribute('aria-pressed')).toBe('false');

    await user.click(button);

    // La caché ya está actualizada aunque la API siga pensando.
    expect(itemButton(/Arroz/).getAttribute('aria-pressed')).toBe('true');
    expect(setShoppingItemCheckedMock).toHaveBeenCalledWith(householdId, weekStart, 'item-1', true);

    rejectRequest(new Error('La API no responde'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('La API no responde');
    });

    // `onError` restaura la lista anterior: el ítem vuelve a estar sin marcar.
    expect(itemButton(/Arroz/).getAttribute('aria-pressed')).toBe('false');
  });

  it('confirma con la lista del servidor y muestra quién lo marcó', async () => {
    const user = userEvent.setup();
    const checked = list({
      version: 4,
      items: [
        {
          _id: 'item-1',
          name: 'Arroz',
          quantity: 1,
          unit: 'kg',
          checked: true,
          checkedBy: currentUserId,
          checkedByName: 'Ana',
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
    });

    setShoppingItemCheckedMock.mockResolvedValue(checked);

    renderList();

    await user.click(itemButton(/Arroz/));

    await waitFor(() => {
      expect(screen.getByText('Lo marcaste tú')).toBeTruthy();
    });
    expect(itemButton(/Arroz/).getAttribute('aria-pressed')).toBe('true');
  });
});
