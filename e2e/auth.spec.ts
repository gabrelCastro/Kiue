import { expect, test, type Page } from '@playwright/test';

// Cada teste usa um e-mail novo: a API de teste é compartilhada durante a execução.
const unique = () => `jogador-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const PASSWORD = 'mensagens-na-fila';

async function register(page: Page, email: string, name = 'Ana Lima') {
  await page.goto('/');
  await page.locator('.console-nav').getByRole('button', { name: 'Entrar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Criar conta' }).click();
  await dialog.getByLabel('Nome').fill(name);
  await dialog.getByLabel('E-mail').fill(email);
  await dialog.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('cria conta, continua logado ao recarregar, sai e entra de novo', async ({ page }) => {
  const email = unique();
  await register(page, email);
  const account = page.locator('.console-nav .account-btn');
  await expect(account).toContainText('Ana');

  await page.reload();
  await expect(account).toContainText('Ana');

  await account.click();
  await expect(page.getByRole('dialog')).toContainText(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.locator('.console-nav').getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();

  // senha errada: mensagem genérica, sem dizer se o e-mail existe
  await page.locator('.console-nav').getByRole('button', { name: 'Entrar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('E-mail').fill(email);
  await dialog.getByLabel('Senha', { exact: true }).fill('senha-errada-mesmo');
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('E-mail ou senha incorretos');

  await dialog.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(account).toContainText('Ana');
});

test('erros de validação aparecem no campo certo', async ({ page }) => {
  await page.goto('/');
  await page.locator('.console-nav').getByRole('button', { name: 'Entrar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Criar conta' }).click();
  await dialog.getByLabel('Nome').fill('Bruno');
  await dialog.getByLabel('E-mail').fill('bruno-sem-arroba');
  await dialog.getByLabel('Senha', { exact: true }).fill('outra-senha-longa');
  await dialog.getByRole('button', { name: 'Criar conta' }).click();
  await expect(dialog.locator('.form-field.has-error')).toContainText('E-mail inválido');
});

test('troca a senha pela tela da conta', async ({ page }) => {
  const email = unique();
  await register(page, email);
  await page.locator('.console-nav .account-btn').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Alterar senha' }).click();
  await dialog.getByLabel('Senha atual').fill(PASSWORD);
  await dialog.getByLabel('Nova senha').fill('uma-senha-novinha');
  await dialog.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(dialog).toContainText('Senha alterada');
});

test('o botão de conta também aparece dentro da fase', async ({ page }) => {
  await register(page, unique(), 'Carla Dias');
  await page.getByRole('button', { name: /Primeiro pedido/ }).click();
  await expect(page.locator('.topbar .account-btn')).toContainText('Carla');
});

test('capturas das telas de conta (SHOTS_DIR)', async ({ page }) => {
  const dir = process.env.SHOTS_DIR;
  test.skip(!dir, 'só gera imagens quando SHOTS_DIR está definido');
  await page.goto('/');
  await page.locator('.console-nav').getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('dialog').getByLabel('E-mail').fill('ana@example.com');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/auth-login.png` });
  await page.getByRole('dialog').getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('dialog').getByLabel('Nome').fill('Ana');
  await page.getByRole('dialog').getByLabel('E-mail').fill('ana-sem-arroba');
  await page.getByRole('dialog').getByLabel('Senha', { exact: true }).fill('curta');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar conta' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/auth-register-error.png` });
  await page.keyboard.press('Escape');
  await register(page, unique(), 'Ana Lima');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/auth-nav.png` });
  await page.locator('.console-nav .account-btn').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Alterar senha' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/auth-account.png` });
});
