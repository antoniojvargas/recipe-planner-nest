import { expect, test } from '@playwright/test';
import { addCsrfCookie, prepareData } from './helpers/data';

test('Socket.IO solo se conecta en la lista de la compra', async ({ page }) => {
  const { recipeId, weekStart } = await prepareData(page.context().request);
  await addCsrfCookie(page.context());

  const sockets: string[] = [];
  page.on('websocket', (socket) => {
    sockets.push(socket.url());
  });

  // Ni el detalle (ahora Server Component) ni el editor necesitan tiempo real.
  for (const path of [`/recipes/${recipeId}`, `/recipes/${recipeId}/editor`]) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    expect(
      sockets.filter((url) => url.includes('/socket.io')),
      path,
    ).toEqual([]);
  }

  await page.goto(`/shopping/${weekStart}`, { waitUntil: 'domcontentloaded' });
  await expect
    .poll(() => sockets.filter((url) => url.includes('/socket.io')).length, { timeout: 10_000 })
    .toBeGreaterThan(0);
});
