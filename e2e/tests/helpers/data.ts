import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type BrowserContext } from '@playwright/test';

export const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000';
export const csrfToken = 'e2e-csrf-token';

export function currentWeekStart(now = new Date()): string {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return monday.toISOString().slice(0, 10);
}

export async function authedHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const cookies = (await request.storageState()).cookies;
  const jar = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  jar.set('csrf_token', csrfToken);

  return {
    Origin: 'http://localhost:3001',
    'X-CSRF-Token': csrfToken,
    Cookie: [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
  };
}

/** Añade la cookie de CSRF que el frontend necesita para las peticiones autenticadas. */
export async function addCsrfCookie(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: 'csrf_token',
      value: csrfToken,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
}

/** Prepara un hogar con una receta en el plan y su lista de la compra generada. */
export async function prepareData(
  request: APIRequestContext,
): Promise<{ householdId: string; recipeId: string; weekStart: string }> {
  const registered = await request.post(`${apiURL}/api/auth/register`, {
    headers: { ...(await authedHeaders(request)), 'Content-Type': 'application/json' },
    data: { email: `e2e+${randomUUID()}@example.com`, password: 'Recetas123!', displayName: 'Ana' },
  });
  expect(registered.status(), await registered.text()).toBe(201);

  const households = await request.get(`${apiURL}/api/households`, {
    headers: await authedHeaders(request),
  });
  const [household] = (await households.json()) as Array<{ id: string }>;

  const created = await request.post(`${apiURL}/api/households/${household.id}/recipes`, {
    headers: { ...(await authedHeaders(request)), 'Content-Type': 'application/json' },
    data: {
      title: 'Tortilla de patatas',
      description: 'Clásica tortilla con patatas',
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 20,
      tags: ['comida'],
      ingredients: [
        { name: 'Patata', quantity: 200, unit: 'g' },
        { name: 'Huevo', quantity: 4, unit: 'unit' },
      ],
      steps: [{ text: 'Freír las patatas.' }, { text: 'Batir los huevos.' }, { text: 'Cuajar.' }],
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id: recipeId } = (await created.json()) as { id: string };

  const weekStart = currentWeekStart();
  // El GET crea el plan vacío; el PUT de slots exige que ya exista.
  const emptyPlan = await request.get(
    `${apiURL}/api/households/${household.id}/meal-plans/${weekStart}`,
    { headers: await authedHeaders(request) },
  );
  expect(emptyPlan.status(), await emptyPlan.text()).toBe(200);

  const slot = await request.put(
    `${apiURL}/api/households/${household.id}/meal-plans/${weekStart}/slots`,
    {
      headers: { ...(await authedHeaders(request)), 'Content-Type': 'application/json' },
      data: { day: 0, meal: 'lunch', recipeId, servings: 4 },
    },
  );
  expect(slot.status(), await slot.text()).toBe(200);

  const list = await request.post(
    `${apiURL}/api/households/${household.id}/shopping-lists/${weekStart}/generate`,
    { headers: await authedHeaders(request) },
  );
  expect(list.status(), await list.text()).toBe(200);

  return { householdId: household.id, recipeId, weekStart };
}
