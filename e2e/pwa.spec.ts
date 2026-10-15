import { expect, test } from '@playwright/test';

test('PWA: manifest válido e o jogo abre sem rede depois da primeira visita', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Kiuê' })).toBeVisible();

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href;
    return (await fetch(href)).json();
  });
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);

  // espera o service worker instalar e assumir (ele só controla a página na visita seguinte)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('kiue-')));
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Kiuê' })).toBeVisible();
  // e uma fase abre e roda offline (o painel de cena vem do cache)
  await page.getByRole('button', { name: /Primeiro pedido/ }).click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.waitForFunction(() => '__kiue' in window);
});
