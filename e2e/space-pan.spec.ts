import { expect, test, type Page } from '@playwright/test';

type Kiue = {
  project: (x: number, z: number, y: number) => { x: number; y: number };
  ctrl: { mode: string; paused: boolean; selection: { id: string } | null; graph: { nodes: { id: string; x: number; z: number }[] } };
};
const kiue = (page: Page) => page.evaluate(() => {
  const k = (window as unknown as { __kiue: Kiue }).__kiue;
  return { mode: k.ctrl.mode, paused: k.ctrl.paused, selection: k.ctrl.selection, site: k.ctrl.graph.nodes.find((n) => n.id === 'site') };
});
const screen = (page: Page, x: number, z: number) =>
  page.evaluate(([x, z]) => (window as unknown as { __kiue: Kiue }).__kiue.project(x, z, 0), [x, z] as const);

async function openFirstLevel(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Primeiro pedido/ }).click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.waitForFunction(() => '__kiue' in window);
  await page.waitForTimeout(400);
}

test('segurar Espaço e arrastar move a câmera, sem selecionar nem mover peças', async ({ page }) => {
  await openFirstLevel(page);
  const before = await screen(page, 0, 0);
  const site = await screen(page, -7, 0);

  // começa o arrasto em cima de uma peça: com Espaço segurado, nada de selecionar/mover
  await page.keyboard.down(' ');
  await page.waitForTimeout(300);
  await page.mouse.move(site.x, site.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(site.x + i * 15, site.y + i * 5);
  await page.mouse.up();
  await page.keyboard.up(' ');

  const after = await screen(page, 0, 0);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(50);
  const state = await kiue(page);
  expect(state.selection).toBeNull();
  expect(state.site).toMatchObject({ x: -7, z: 0 });
  // segurar não conta como toque: a simulação não começou
  expect(state.mode).toBe('build');
});

test('toque rápido no Espaço continua rodando e pausando', async ({ page }) => {
  await openFirstLevel(page);
  await page.keyboard.press(' ');
  await expect.poll(async () => (await kiue(page)).mode).toBe('run');
  await page.keyboard.press(' ');
  await expect.poll(async () => (await kiue(page)).paused).toBe(true);
});
