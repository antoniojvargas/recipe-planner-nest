import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000';
const origin = 'http://localhost:3001';
const csrfToken = 'e2e-csrf-token';

function currentWeekStart(now = new Date()): string {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return monday.toISOString().slice(0, 10);
}

async function cookieHeader(request: APIRequestContext): Promise<string> {
  const cookies = (await request.storageState()).cookies;
  const jar = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  jar.set('csrf_token', csrfToken);
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function authedHeaders(
  request: APIRequestContext,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  return {
    Origin: origin,
    'X-CSRF-Token': csrfToken,
    Cookie: await cookieHeader(request),
    ...extra,
  };
}

async function registerUser(
  request: APIRequestContext,
  email: string,
  displayName: string,
): Promise<{ userId: string }> {
  const response = await request.post(`${apiURL}/api/auth/register`, {
    headers: await authedHeaders(request, { 'Content-Type': 'application/json' }),
    data: {
      email,
      password: 'Recetas123!',
      displayName,
    },
  });

  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as { user: { id: string } };
  return { userId: body.user.id };
}

async function getHouseholds(
  request: APIRequestContext,
): Promise<Array<{ id: string; name: string }>> {
  const response = await request.get(`${apiURL}/api/households`, {
    headers: await authedHeaders(request),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as Array<{ id: string; name: string }>;
}

async function createInvite(request: APIRequestContext, householdId: string): Promise<string> {
  const response = await request.post(`${apiURL}/api/households/${householdId}/invite`, {
    headers: await authedHeaders(request, { 'Content-Type': 'application/json' }),
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as { code: string };
  return body.code;
}

async function joinHousehold(request: APIRequestContext, code: string): Promise<string> {
  const response = await request.post(`${apiURL}/api/households/join`, {
    headers: await authedHeaders(request, { 'Content-Type': 'application/json' }),
    data: { code },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function leaveHousehold(request: APIRequestContext, householdId: string): Promise<void> {
  const response = await request.post(`${apiURL}/api/households/${householdId}/leave`, {
    headers: await authedHeaders(request, { 'Content-Type': 'application/json' }),
  });
  expect(response.status(), await response.text()).toBe(204);
}

async function seedShoppingList(
  request: APIRequestContext,
  householdId: string,
  weekStart: string,
): Promise<string> {
  const create = await request.post(`${apiURL}/api/households/${householdId}/recipes`, {
    headers: await authedHeaders(request, { 'Content-Type': 'application/json' }),
    data: {
      title: 'Ensalada compartida',
      servings: 2,
      ingredients: [{ name: 'Lechuga', quantity: 1, unit: 'unit' }],
    },
  });
  expect(create.status(), await create.text()).toBe(201);
  const recipe = (await create.json()) as { id: string };

  const slot = await request.put(
    `${apiURL}/api/households/${householdId}/meal-plans/${weekStart}/slots`,
    {
      headers: await authedHeaders(request, { 'Content-Type': 'application/json' }),
      data: { day: 0, meal: 'lunch', recipeId: recipe.id, servings: 2 },
    },
  );
  expect(slot.ok(), await slot.text()).toBeTruthy();

  const generated = await request.post(
    `${apiURL}/api/households/${householdId}/shopping-lists/${weekStart}/generate`,
    {
      headers: await authedHeaders(request, { 'Content-Type': 'application/json' }),
    },
  );
  expect(generated.ok(), await generated.text()).toBeTruthy();

  return recipe.id;
}

async function newAuthenticatedPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test('dos miembros del mismo hogar ven el marcado en tiempo real sin recargar', async ({
  browser,
}) => {
  const weekStart = currentWeekStart();
  const runId = Date.now();

  const inviterPage = await newAuthenticatedPage(browser);
  const joinerPage = await newAuthenticatedPage(browser);
  const inviter = inviterPage.context().request;
  const joiner = joinerPage.context().request;

  try {
    await registerUser(inviter, `invitador+${runId}@example.com`, 'Ana');
    const inviterHouseholds = await getHouseholds(inviter);
    const sharedHouseholdId = inviterHouseholds[0]?.id;
    expect(sharedHouseholdId).toBeTruthy();

    await seedShoppingList(inviter, sharedHouseholdId!, weekStart);
    const inviteCode = await createInvite(inviter, sharedHouseholdId!);

    await registerUser(joiner, `invitado+${runId}@example.com`, 'Luis');
    const joinerInitialHouseholds = await getHouseholds(joiner);
    const ownHouseholdId = joinerInitialHouseholds[0]?.id;
    expect(ownHouseholdId).toBeTruthy();

    // Luis se une al hogar de Ana (el que invita).
    await joinHousehold(joiner, inviteCode);

    // Para que la UI de Luis (que usa el primer hogar) apunte al hogar compartido,
    // Ana se une temporalmente al hogar propio de Luis y Luis lo abandona.
    const ownInviteCode = await createInvite(joiner, ownHouseholdId!);
    await joinHousehold(inviter, ownInviteCode);
    await leaveHousehold(joiner, ownHouseholdId!);

    const joinerHouseholdsAfter = await getHouseholds(joiner);
    expect(joinerHouseholdsAfter).toHaveLength(1);
    expect(joinerHouseholdsAfter[0]?.id).toBe(sharedHouseholdId);

    await inviterPage.goto(`/shopping/${weekStart}`);
    await joinerPage.goto(`/shopping/${weekStart}`);

    const inviterItem = inviterPage.getByRole('button', { name: /lechuga/i }).first();
    const joinerItem = joinerPage.getByRole('button', { name: /lechuga/i }).first();

    await expect(inviterItem).toBeVisible({ timeout: 15_000 });
    await expect(joinerItem).toBeVisible({ timeout: 15_000 });
    await expect(joinerItem).toHaveAttribute('aria-pressed', 'false');

    await inviterItem.click();

    await expect(inviterItem).toHaveAttribute('aria-pressed', 'true');
    await expect(joinerItem).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect(joinerItem).toContainText(/Marcado por/i, { timeout: 15_000 });
  } finally {
    await inviterPage.context().close();
    await joinerPage.context().close();
  }
});
