import { expect, test } from '@playwright/test';

test('visitante joga as fases 1 e 2; a 3 pede conta e libera depois do cadastro', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.guest-banner')).toContainText('visitante');
  await expect(page.getByRole('button', { name: /Primeiro pedido/ })).toBeEnabled();
  await expect(page.locator('.level-card.needs-account')).toHaveCount(20);

  await page.getByRole('button', { name: /A fila não para de crescer/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Criar conta' })).toBeVisible();
  await expect(dialog).toContainText('A fila não para de crescer');

  await dialog.getByLabel('Nome').fill('Davi');
  await dialog.getByLabel('E-mail').fill(`visitante-${Date.now()}@example.com`);
  await dialog.getByLabel('Senha', { exact: true }).fill('agora-tenho-conta');
  await dialog.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.guest-banner')).toHaveCount(0);
  await expect(page.locator('.level-card.needs-account')).toHaveCount(0);
});

test('visitante tem sandbox limitado', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.guest-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await expect(page.getByRole('button', { name: /Fila SQS/ })).toContainText('×2');
  await expect(page.locator('.sandbox-limit')).toContainText('Sandbox limitado');
  await page.locator('.sandbox-limit').getByRole('button', { name: 'Crie uma conta' }).click();
  await expect(page.getByRole('dialog')).toContainText('até 20 filas');
});

test('a API não entrega fases fechadas sem conta', async ({ page }) => {
  await page.goto('/');
  const status = await page.evaluate(async () => (await fetch('/api/levels/i03')).status);
  expect(status).toBe(401);
});
