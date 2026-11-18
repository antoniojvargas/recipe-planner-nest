import { expect, test } from '@playwright/test';

test('la aplicación responde en la raíz', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/.*/);
});
