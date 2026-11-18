// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { PlanBoard } from '@/app/(app)/plan/[weekStart]/plan-board';
import type { MealPlanResponse, RecipeSummary } from '@/lib/meal-plan';

const { fetchMealPlanMock, saveMealPlanSlotMock } = vi.hoisted(() => ({
  fetchMealPlanMock: vi.fn(),
  saveMealPlanSlotMock: vi.fn(),
}));

vi.mock('@/lib/meal-plan-api', () => ({
  fetchMealPlan: fetchMealPlanMock,
  saveMealPlanSlot: saveMealPlanSlotMock,
}));

// `next/link` necesita el router de la app; en la prueba basta con un ancla normal.
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

const recipes: Record<string, RecipeSummary> = {
  r1: { id: 'r1', title: 'Arroz con pollo', servings: 4 },
  r2: { id: 'r2', title: 'Sopa de verduras', servings: 2 },
};

const plan: MealPlanResponse = {
  householdId,
  weekStart,
  slots: [
    { day: 0, meal: 'lunch', recipeId: 'r1', servings: 4 },
    { day: 3, meal: 'dinner', recipeId: 'r2', servings: 2 },
    // Una receta borrada sigue en un plan antiguo: la cuadrícula la pinta sin título.
    { day: 6, meal: 'breakfast', recipeId: 'borrada', servings: 1 },
  ],
};

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PlanBoard
        householdId={householdId}
        weekStart={weekStart}
        initialPlan={plan}
        initialRecipes={Object.values(recipes)}
        initialRecipesById={recipes}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMealPlanMock.mockResolvedValue(plan);
  saveMealPlanSlotMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('PlanBoard: cuadrícula', () => {
  it('pinta los siete días por las tres comidas', () => {
    renderBoard();

    const table = screen.getByRole('table');

    // Una columna por día más la esquina de comidas, y una fila por comida.
    expect(within(table).getAllByRole('columnheader')).toHaveLength(8);
    expect(within(table).getAllByRole('rowheader')).toHaveLength(3);
    expect(within(table).getAllByRole('cell')).toHaveLength(21);

    const dayHeaders = within(table)
      .getAllByRole('columnheader')
      .slice(1)
      .map((header) => header.textContent);

    expect(dayHeaders).toHaveLength(7);
    expect(dayHeaders[0]).toContain('16');
    expect(dayHeaders[6]).toContain('22');
  });

  it('coloca cada receta en su día y comida', () => {
    renderBoard();

    const table = screen.getByRole('table');
    const mealRows = within(table).getAllByRole('row').slice(1);

    const lunchCells = within(mealRows[1]).getAllByRole('cell');
    const dinnerCells = within(mealRows[2]).getAllByRole('cell');

    expect(within(lunchCells[0]).getByRole('link', { name: 'Arroz con pollo' })).toBeTruthy();
    const servings = within(lunchCells[0]).getByRole('textbox', { name: /Raciones del Lunes/ });

    expect((servings as HTMLInputElement).value).toBe('4');

    // El martes a la comida está vacío.
    expect(
      within(lunchCells[1]).getByRole('button', {
        name: /Añadir receta al Martes en comida/,
      }),
    ).toBeTruthy();

    expect(within(dinnerCells[3]).getByRole('link', { name: 'Sopa de verduras' })).toBeTruthy();
  });

  it('muestra un hueco sin título cuando la receta ya no existe', () => {
    renderBoard();

    const table = screen.getByRole('table');
    const breakfastCells = within(within(table).getAllByRole('row')[1]).getAllByRole('cell');

    expect(
      within(breakfastCells[6]).getByRole('link', { name: 'Receta no disponible' }),
    ).toBeTruthy();
    expect(
      within(breakfastCells[6]).getByText('La receta ya no existe; puedes quitarla del plan.'),
    ).toBeTruthy();
  });
});
