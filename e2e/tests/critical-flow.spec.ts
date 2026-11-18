import fs from 'node:fs';
import path from 'node:path';
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

async function createRecipeWithPhoto(
  request: APIRequestContext,
  householdId: string,
): Promise<{ recipeId: string; title: string }> {
  const title = 'Tortilla de patatas';

  const create = await request.post(`${apiURL}/api/households/${householdId}/recipes`, {
    headers: {
      ...csrfHeaders(),
      'Content-Type': 'application/json',
    },
    data: {
      title,
      description: 'Clásica tortilla con patatas',
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 20,
      tags: ['comida'],
      ingredients: [
        { name: 'Patata', quantity: 200, unit: 'g' },
        { name: 'Huevo', quantity: 2, unit: 'unit' },
      ],
      steps: [{ text: 'Freír las patatas.' }, { text: 'Cuajar con los huevos.' }],
    },
  });
  expect(create.status(), await create.text()).toBe(201);
  const recipe = (await create.json()) as { id: string };
  const recipeId = recipe.id;

  const photoPath = path.join(__dirname, 'fixtures', 'recipe-photo.jpg');
  const photo = fs.readFileSync(photoPath);

  const uploadUrlResponse = await request.post(
    `${apiURL}/api/households/${householdId}/media/upload-url`,
    {
      headers: {
        ...csrfHeaders(),
        'Content-Type': 'application/json',
      },
      data: { contentType: 'image/jpeg', size: photo.length },
    },
  );
  expect(uploadUrlResponse.status(), await uploadUrlResponse.text()).toBe(201);
  const upload = (await uploadUrlResponse.json()) as {
    key: string;
    url: string;
    fields: Record<string, string>;
  };

  const uploadResponse = await request.post(upload.url, {
    multipart: {
      ...upload.fields,
      file: {
        name: 'recipe-photo.jpg',
        mimeType: 'image/jpeg',
        buffer: photo,
      },
    },
  });
  expect(uploadResponse.ok(), await uploadResponse.text()).toBeTruthy();

  const confirm = await request.put(
    `${apiURL}/api/households/${householdId}/recipes/${recipeId}/image`,
    {
      headers: {
        ...csrfHeaders(),
        'Content-Type': 'application/json',
      },
      data: { key: upload.key },
    },
  );
  expect(confirm.ok(), await confirm.text()).toBeTruthy();

  return { recipeId, title };
}

async function addRecipeToSlot(
  page: Page,
  dayLabel: string,
  mealLabel: string,
  recipeTitle: string,
): Promise<void> {
  await page
    .getByRole('button', {
      name: new RegExp(`Añadir receta al ${dayLabel} en ${mealLabel}`, 'i'),
    })
    .first()
    .click();

  const dialog = page.getByRole('dialog', { name: /Elegir receta/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: new RegExp(recipeTitle, 'i') }).click();
  await expect(dialog).toBeHidden();
}

test('flujo crítico: registro, receta con foto, plan de dos días y lista agregada', async ({
  page,
}) => {
  const weekStart = currentWeekStart();
  const uniqueEmail = `ana+${Date.now()}@example.com`;
  const request = page.context().request;

  await registerUser(request, uniqueEmail);
  const householdId = await getHouseholdId(request);
  const { recipeId, title } = await createRecipeWithPhoto(request, householdId);

  // Añade la receta al plan en dos días distintos (lunes y martes, comida).
  await page.goto(`/plan/${weekStart}`);
  await expect(page.getByRole('heading', { name: /Plan semanal|/ })).toBeVisible();
  await addRecipeToSlot(page, 'Lunes', 'comida', title);
  await expect(page.getByRole('link', { name: title }).first()).toBeVisible();

  await addRecipeToSlot(page, 'Martes', 'comida', title);
  await expect(page.getByRole('link', { name: title })).toHaveCount(2, { timeout: 15_000 });

  // Genera/carga la lista de la semana y comprueba las cantidades agregadas
  // (200 g de patata x 2 días = 400 g, 2 ud de huevo x 2 días = 4 ud).
  await page.goto(`/shopping/${weekStart}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const potatoItem = page.getByRole('button', { name: /patata/i }).first();
  await expect(potatoItem).toBeVisible({ timeout: 15_000 });
  await expect(potatoItem).toContainText('400');
  await expect(potatoItem).toContainText('g');

  const eggItem = page.getByRole('button', { name: /huevo/i }).first();
  await expect(eggItem).toBeVisible();
  await expect(eggItem).toContainText('4');
  await expect(eggItem).toContainText('ud');

  expect(recipeId).toBeTruthy();
  expect(householdId).toBeTruthy();
});
