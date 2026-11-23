import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000';
const origin = 'http://localhost:3001';
const csrfToken = 'e2e-csrf-token';

function currentWeekStart(now = new Date()): string {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return monday.toISOString().slice(0, 10);
}

async function authedHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const cookies = (await request.storageState()).cookies;
  const jar = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  jar.set('csrf_token', csrfToken);

  return {
    Origin: origin,
    'X-CSRF-Token': csrfToken,
    Cookie: [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
  };
}

/** Prepara un hogar con una receta en el plan para que las cuatro vistas tengan contenido. */
async function prepareData(
  request: APIRequestContext,
): Promise<{ householdId: string; recipeId: string; weekStart: string }> {
  const registered = await request.post(`${apiURL}/api/auth/register`, {
    headers: { ...(await authedHeaders(request)), 'Content-Type': 'application/json' },
    data: { email: `axe+${Date.now()}@example.com`, password: 'Recetas123!', displayName: 'Ana' },
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
      ingredients: [{ name: 'Patata', quantity: 200, unit: 'g' }],
      steps: [{ text: 'Freír las patatas.' }],
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

interface ViolationSummary {
  view: string;
  id: string;
  impact: string;
  help: string;
  nodes: string[];
}

async function audit(page: Page, view: string, path: string): Promise<ViolationSummary[]> {
  // Socket.IO mantiene una conexión abierta, así que `networkidle` nunca llega.
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1_000);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();

  return results.violations.map((violation) => ({
    view,
    id: violation.id,
    impact: violation.impact ?? 'unknown',
    help: violation.help,
    nodes: violation.nodes.map(
      (node) => `${node.target.join(' ')} :: ${node.failureSummary ?? ''}`,
    ),
  }));
}

test('auditoría de accesibilidad: recetas, editor, plan y lista', async ({ page }) => {
  const request = page.context().request;
  const { recipeId, weekStart } = await prepareData(request);

  await page.context().addCookies([
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

  const violations: ViolationSummary[] = [];
  for (const [view, path] of [
    ['recetas', '/recipes'],
    ['editor', `/recipes/${recipeId}/editor`],
    ['plan', `/plan/${weekStart}`],
    ['lista', `/shopping/${weekStart}`],
  ]) {
    violations.push(...(await audit(page, view, path)));
  }

  if (violations.length > 0) {
    console.log(JSON.stringify(violations, null, 2));
  }

  expect(
    violations,
    `Violaciones de accesibilidad: ${violations.map((v) => `${v.view}/${v.id}`).join(', ')}`,
  ).toEqual([]);
});
