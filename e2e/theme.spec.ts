import { expect, test } from '@playwright/test';

test('no Sandbox o jogador escolhe o tema, e a escolha volta no próximo sandbox', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  const panel = page.locator('.sandbox-theme');
  await expect(panel.getByRole('button', { name: 'Indústria' })).toHaveAttribute('aria-pressed', 'true');

  await panel.getByRole('button', { name: 'Fazenda' }).click();
  await expect(panel.getByRole('button', { name: 'Fazenda' })).toHaveAttribute('aria-pressed', 'true');
  // a cena se remonta com as peças do tema; montar e rodar não pode quebrar
  await page.getByRole('button', { name: /^Produtor/ }).click();
  await page.mouse.click(600, 400);
  await page.getByRole('button', { name: '▶ Rodar' }).click();
  await page.waitForTimeout(500);

  await page.reload();
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await expect(page.locator('.sandbox-theme').getByRole('button', { name: 'Fazenda' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('as fases não mostram o seletor de tema', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Primeiro pedido/ }).click();
  await expect(page.locator('.level-screen')).toBeVisible();
  await expect(page.locator('.sandbox-theme')).toHaveCount(0);
});
