import { expect, test, type APIRequestContext } from '@playwright/test';

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000';
const origin = 'http://localhost:3001';
const csrfToken = 'e2e-csrf-token';

function csrfHeaders(): Record<string, string> {
  return {
    Origin: origin,
    'X-CSRF-Token': csrfToken,
    Cookie: `csrf_token=${csrfToken}`,
  };
}

async function registerUser(
  request: APIRequestContext,
  email: string,
): Promise<{ userId: string }> {
  const response = await request.post(`${apiURL}/api/auth/register`, {
    headers: {
      ...csrfHeaders(),
      'Content-Type': 'application/json',
    },
    data: {
      email,
      password: 'Recetas123!',
      displayName: 'Ana',
    },
  });

  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as { user: { id: string } };
  return { userId: body.user.id };
}

async function getHouseholdId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${apiURL}/api/households`, {
    headers: { Cookie: `csrf_token=${csrfToken}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const households = (await response.json()) as Array<{ id: string }>;
  expect(households.length).toBeGreaterThan(0);
  return households[0].id;
}

test('importa una receta desde un fixture JSON-LD servido en la red E2E', async ({ page }) => {
  const request = page.context().request;
  const uniqueEmail = `import+${Date.now()}@example.com`;

  await registerUser(request, uniqueEmail);
  const householdId = await getHouseholdId(request);

  const importResponse = await request.post(`${apiURL}/api/households/${householdId}/imports`, {
    headers: {
      ...csrfHeaders(),
      'Content-Type': 'application/json',
    },
    data: { url: 'http://fixtures/recipe.html' },
  });

  expect(importResponse.status(), await importResponse.text()).toBe(202);
  const importJob = (await importResponse.json()) as {
    id: string;
    status: string;
    url: string;
  };
  expect(importJob.status).toBe('pending');
  expect(importJob.url).toBe('http://fixtures/recipe.html');

  await expect
    .poll(
      async () => {
        const response = await request.get(`${apiURL}/api/households/${householdId}/recipes`, {
          headers: { Cookie: `csrf_token=${csrfToken}` },
        });
        if (!response.ok()) {
          return null;
        }
        const body = (await response.json()) as {
          items: Array<{ title: string }>;
        };
        return (
          body.items.find((recipe) => recipe.title === 'Tortilla de patatas importada') ?? null
        );
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .not.toBeNull();

  const recipesResponse = await request.get(`${apiURL}/api/households/${householdId}/recipes`, {
    headers: { Cookie: `csrf_token=${csrfToken}` },
  });
  expect(recipesResponse.ok(), await recipesResponse.text()).toBeTruthy();
  const recipes = (await recipesResponse.json()) as {
    items: Array<{
      title: string;
      servings: number;
      ingredients: Array<{ name: string; quantity: number; unit: string }>;
      steps: Array<{ text: string }>;
      source?: { url?: string };
    }>;
  };

  const imported = recipes.items.find((recipe) => recipe.title === 'Tortilla de patatas importada');
  expect(imported).toBeTruthy();
  expect(imported?.servings).toBe(4);
  expect(imported?.source?.url).toBe('http://fixtures/recipe.html');
  expect(
    imported?.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes('patata')),
  ).toBeTruthy();
  expect(imported?.steps.length).toBeGreaterThan(0);
});
