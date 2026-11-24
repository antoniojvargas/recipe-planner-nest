import crypto from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000';
const origin = 'http://localhost:3001';
const csrfToken = 'e2e-csrf-token';

function currentWeekStart(): string {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return monday.toISOString().slice(0, 10);
}

async function authedHeaders(
  request: APIRequestContext,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const cookies = (await request.storageState()).cookies;
  const jar = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  jar.set('csrf_token', csrfToken);

  return {
    Origin: origin,
    'X-CSRF-Token': csrfToken,
    Cookie: [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
    ...extra,
  };
}

async function register(context: BrowserContext, email: string): Promise<void> {
  const response = await context.request.post(`${apiURL}/api/auth/register`, {
    headers: await authedHeaders(context.request, { 'Content-Type': 'application/json' }),
    data: {
      email,
      password: 'Recetas123!',
      displayName: 'Ana',
    },
  });

  expect(response.status(), await response.text()).toBe(201);

  // El middleware de Next necesita el doble submit si decide renovar la sesión al cargar.
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

async function getHouseholdId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${apiURL}/api/households`, {
    headers: await authedHeaders(request),
  });

  expect(response.ok(), await response.text()).toBeTruthy();
  const households = (await response.json()) as Array<{ id: string }>;
  expect(households.length).toBeGreaterThan(0);

  return households[0].id;
}

async function createRecipe(
  request: APIRequestContext,
  householdId: string,
  title: string,
): Promise<void> {
  const response = await request.post(`${apiURL}/api/households/${householdId}/recipes`, {
    headers: await authedHeaders(request, { 'Content-Type': 'application/json' }),
    data: {
      title,
      description: `Receta privada de ${title}`,
      servings: 2,
      prepMinutes: 5,
      cookMinutes: 10,
      tags: ['comida'],
      ingredients: [{ name: 'Sal', quantity: 1, unit: 'g' }],
      steps: [{ text: 'Cocinar.' }],
    },
  });

  expect(response.status(), await response.text()).toBe(201);
}

interface IsolatedUser {
  page: Page;
  /** Título único de su receta: sirve como marcador para detectar fugas entre usuarios. */
  recipeTitle: string;
}

async function userWithRecipe(browser: Browser, label: string): Promise<IsolatedUser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const runId = crypto.randomUUID().slice(0, 8);

  await register(context, `${label}+${runId}@example.com`);
  const householdId = await getHouseholdId(context.request);
  const recipeTitle = `Receta de ${label} ${runId}`;
  await createRecipe(context.request, householdId, recipeTitle);

  return { page, recipeTitle };
}

test('dos usuarios cargan la misma página en paralelo sin ver datos del otro', async ({
  browser,
}) => {
  const weekStart = currentWeekStart();
  const [ana, beto] = await Promise.all([
    userWithRecipe(browser, 'ana'),
    userWithRecipe(browser, 'beto'),
  ]);

  // Misma URL y misma semana, en paralelo: si Next sirviera una respuesta cacheada por URL,
  // uno de los dos vería el recetario del otro.
  const [anaPicker, betoPicker] = await Promise.all(
    [ana, beto].map(async (user) => {
      await user.page.goto(`/plan/${weekStart}`);
      await expect(user.page.getByText('Plan semanal')).toBeVisible({ timeout: 15_000 });
      await user.page
        .getByRole('button', { name: /Añadir receta al Lunes en comida/i })
        .first()
        .click();

      const picker = user.page.getByRole('dialog', { name: /Elegir receta/i });
      await expect(picker).toBeVisible();

      return picker;
    }),
  );

  await expect(anaPicker.getByRole('button', { name: ana.recipeTitle })).toBeVisible();
  await expect(anaPicker.getByRole('button', { name: beto.recipeTitle })).toHaveCount(0);
  await expect(betoPicker.getByRole('button', { name: beto.recipeTitle })).toBeVisible();
  await expect(betoPicker.getByRole('button', { name: ana.recipeTitle })).toHaveCount(0);
});
