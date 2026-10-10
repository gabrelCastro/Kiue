import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function screenPos(page: Page, x: number, z: number, y = 0.5) {
  return page.evaluate(
    ([x, z, y]) => (window as unknown as { __kiue: { project: (x: number, z: number, y: number) => { x: number; y: number } } }).__kiue.project(x, z, y),
    [x, z, y] as const,
  );
}

async function clickWorld(page: Page, x: number, z: number, y = 0.5) {
  const p = await screenPos(page, x, z, y);
  await page.mouse.click(p.x, p.y);
}

test('joga a fase 1 pela interface e vence com 3 estrelas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Kiuê' })).toBeVisible();
  await shot(page, '01-menu');

  await page.getByRole('button', { name: /Primeiro pedido/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, '02-briefing');
  await page.getByRole('button', { name: 'Começar' }).click();

  await page.getByRole('button', { name: /Fila SQS/ }).click();
  await page.waitForTimeout(300);
  await clickWorld(page, 0, 0, 0);
  await expect(page.locator('.inspector-head')).toContainText('Fila SQS');

  await clickWorld(page, -7, 0, 0.5);
  await page.getByRole('button', { name: '⟶ Conectar' }).click();
  await clickWorld(page, 0, 0, 0.5);
  await clickWorld(page, 0, 0, 0.5);
  await page.getByRole('button', { name: '⟶ Conectar' }).click();
  await clickWorld(page, 7, 0, 0.4);
  await expect(page.locator('.connections')).toContainText('Separação');
  await shot(page, '03-built');

  await page.getByRole('button', { name: '▶ Rodar' }).click();
  await page.waitForTimeout(3500);
  await shot(page, '04-running');
  await page.getByRole('button', { name: /Concluir agora/ }).click();
  await expect(page.getByText('Fase concluída!')).toBeVisible();
  await expect(page.locator('.result .stars .on')).toHaveCount(3);
  await shot(page, '05-result');

  await page.getByRole('button', { name: /Quiz rápido/ }).click();
  await page.locator('.quiz-option').nth(1).click();
  await expect(page.locator('.quiz-explain')).toContainText('Isso mesmo');
  await shot(page, '06-quiz');

  expect(errors).toEqual([]);
});
