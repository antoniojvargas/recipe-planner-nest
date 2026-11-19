import { expect, test } from '@playwright/test';

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000';

test.describe('smoke @smoke', () => {
  test('muestra la pantalla de login', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Correo electrónico')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('GET /api/health responde ok', async ({ request }) => {
    const response = await request.get(`${apiURL}/api/health`);

    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { status?: string };
    expect(body.status).toBe('ok');
  });

  test('la consola de MinIO no está expuesta en la pila E2E', async ({ request }) => {
    await expect(request.get('http://localhost:9001', { timeout: 2_000 })).rejects.toThrow();
  });
});
