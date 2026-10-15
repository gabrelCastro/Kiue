import { expect, test } from '@playwright/test';

// O Google de verdade não roda em teste: aqui só a parte do jogo (botão, ida e volta com erro).
// O fluxo do servidor tem testes próprios em server/tests/google.test.ts.

test('mostra o botão do Google quando o servidor oferece e vai para /api/auth/google/start', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { user: null, providers: { google: true } } }),
  );
  let started = false;
  await page.route('**/api/auth/google/start', (route) => {
    started = true;
    return route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
  });

  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Entrar', exact: true }).click();
  const google = page.getByRole('button', { name: 'Entrar com o Google' });
  await expect(google).toBeVisible();
  await google.click();
  await expect.poll(() => started).toBe(true);
});

test('sem Google configurado, o botão não aparece', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { user: null, providers: { google: false } } }));
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: /Google/ })).toHaveCount(0);
});

test('volta do Google com erro: mostra o motivo e limpa o endereço', async ({ page }) => {
  await page.goto('/?auth_error=google_unverified');
  await expect(page.getByRole('dialog')).toContainText('não confirmou o e-mail');
  expect(new URL(page.url()).search).toBe('');
});
