import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addCsrfCookie, prepareData } from './helpers/data';

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
  const { recipeId, weekStart } = await prepareData(page.context().request);
  await addCsrfCookie(page.context());

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
