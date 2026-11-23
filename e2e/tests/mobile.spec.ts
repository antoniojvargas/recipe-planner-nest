import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addCsrfCookie, prepareData } from './helpers/data';

// Tamaño de un móvil pequeño: es donde se comprueba que no hay scroll horizontal.
test.use({ viewport: { width: 360, height: 800 } });

async function open(page: Page, path: string): Promise<void> {
  // Socket.IO mantiene la conexión abierta, así que `networkidle` nunca llega.
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
}

async function expectNoHorizontalOverflow(page: Page, view: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${view} desborda horizontalmente`).toBeLessThanOrEqual(clientWidth);
}

test.describe('a 360 px', () => {
  test('las vistas principales no desbordan', async ({ page }) => {
    const { recipeId, weekStart } = await prepareData(page.context().request);
    await addCsrfCookie(page.context());

    for (const [view, path] of [
      ['recetas', '/recipes'],
      ['detalle', `/recipes/${recipeId}`],
      ['editor', `/recipes/${recipeId}/editor`],
      ['plan', `/plan/${weekStart}`],
      ['lista', `/shopping/${weekStart}`],
    ]) {
      await open(page, path);
      await expectNoHorizontalOverflow(page, view);
    }
  });

  test('la lista de la compra se maneja con una mano', async ({ page }) => {
    const { weekStart } = await prepareData(page.context().request);
    await addCsrfCookie(page.context());
    await open(page, `/shopping/${weekStart}`);

    const items = page.locator('li[id^="shopping-item-"] button');
    await expect(items).toHaveCount(2);
    for (const item of await items.all()) {
      const height = await item.evaluate((element) => element.getBoundingClientRect().height);
      expect(height, 'toda la fila es área táctil').toBeGreaterThanOrEqual(44);
    }

    const next = page.getByRole('button', { name: 'Ir al siguiente producto pendiente' });
    await expect(next).toBeVisible();
    await next.click();

    // El orden del API y el de los pasillos pueden diferir: lo importante es que el foco
    // aterrice en un producto pendiente, no en una posición concreta de la lista.
    const focused = page.locator('li[id^="shopping-item-"]:focus-within');
    await expect(focused).toHaveCount(1);
    const firstId = await focused.getAttribute('id');
    await focused.locator('button').click();
    await expect(focused.locator('button')).toHaveAttribute('aria-pressed', 'true');

    await next.click();
    await expect(page.locator(`li[id="${String(firstId)}"]:focus-within`)).toHaveCount(0);
    const anotherFocused = page.locator('li[id^="shopping-item-"]:focus-within');
    await expect(anotherFocused).toHaveCount(1);
    await expect(anotherFocused).not.toHaveAttribute('id', firstId ?? '');
  });

  test('el modo cocina se lee a un metro y responde al teclado', async ({ page }) => {
    const { recipeId } = await prepareData(page.context().request);
    await addCsrfCookie(page.context());

    // El navegador de CI no ofrece Wake Lock: lo simulamos para comprobar el ciclo de vida.
    await page.addInitScript(() => {
      const calls = { requested: 0, released: 0 };
      (window as unknown as { __wakeLock: typeof calls }).__wakeLock = calls;
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: async (type: string) => {
            if (type !== 'screen') {
              throw new Error(`Tipo de Wake Lock inesperado: ${type}`);
            }
            calls.requested += 1;
            return {
              release: async () => {
                calls.released += 1;
              },
            };
          },
        },
      });
    });

    await open(page, `/recipes/${recipeId}`);
    const trigger = page.getByRole('button', { name: 'Modo cocina' });
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: /Receta de ejemplo/ });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalOverflow(page, 'modo cocina');

    const step = dialog.locator('p[aria-live="polite"]');
    await expect(step).toHaveText('Cortar las verduras');
    const fontSize = await step.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
    expect(fontSize, 'pasos legibles a un metro').toBeGreaterThanOrEqual(24);

    for (const name of ['← Anterior', 'Siguiente →']) {
      const button = dialog.getByRole('button', { name });
      const height = await button.evaluate((element) => element.getBoundingClientRect().height);
      expect(height, 'controles grandes').toBeGreaterThanOrEqual(64);
    }

    const wakeLock = await page.evaluate(
      () =>
        (window as unknown as { __wakeLock: { requested: number; released: number } }).__wakeLock,
    );
    // En desarrollo React ejecuta los efectos dos veces (Strict Mode), así que basta con
    // comprobar que se pidió al menos una vez.
    expect(wakeLock.requested).toBeGreaterThanOrEqual(1);

    const violations = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
      .analyze();
    if (violations.violations.length > 0) {
      console.log(
        JSON.stringify(
          violations.violations.map((violation) => ({
            id: violation.id,
            nodes: violation.nodes.map((node) => ({
              target: node.target,
              summary: node.failureSummary,
            })),
          })),
          null,
          2,
        ),
      );
    }
    expect(violations.violations.map((violation) => violation.id)).toEqual([]);

    await dialog.getByRole('button', { name: 'Siguiente →' }).click();
    await expect(step).toHaveText('Cocinar el pollo');
    await page.keyboard.press('ArrowLeft');
    await expect(step).toHaveText('Cortar las verduras');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    const afterClose = await page.evaluate(
      () =>
        (window as unknown as { __wakeLock: { requested: number; released: number } }).__wakeLock,
    );
    expect(afterClose.released).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
});
