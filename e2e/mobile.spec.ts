import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;

async function shot(page: Page, name: string, project: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` });
}

type Kiue = {
  project: (x: number, z: number, y: number) => { x: number; y: number };
  ctrl: { graph: { nodes: { id: string; kind: string; x: number; z: number }[] }; selection: { id: string } | null; tool: { type: string } };
};

const project = (page: Page, x: number, z: number, y: number) =>
  page.evaluate(([x, z, y]) => (window as unknown as { __kiue: Kiue }).__kiue.project(x, z, y), [x, z, y] as const);

/** Posição na tela de um ponto do chão, esperando a câmera parar (a gaveta muda o tamanho do palco). */
async function world(page: Page, x: number, z: number, y = 0.5) {
  let last = await project(page, x, z, y);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(100);
    const now = await project(page, x, z, y);
    if (Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) return now;
    last = now;
  }
  return last;
}

async function openFirstLevel(page: Page) {
  await page.goto('/');
  const entendi = page.getByRole('button', { name: 'Entendi' });
  if (await entendi.isVisible()) await entendi.click();
  await page.getByRole('button', { name: /Primeiro pedido/ }).click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.waitForFunction(() => '__kiue' in window);
  await page.waitForTimeout(400);
}

test('celular: aviso de girar só em pé, fase jogável por toque', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const portrait = (page.viewportSize()?.width ?? 0) < (page.viewportSize()?.height ?? 0);

  await page.goto('/');
  const hint = page.locator('.rotate-hint');
  if (portrait) {
    await expect(hint).toBeVisible();
    await shot(page, '01-menu', info.project.name);
    await hint.getByRole('button', { name: 'Entendi' }).click();
    await expect(hint).toHaveCount(0);
  } else {
    await expect(hint).toHaveCount(0);
    await shot(page, '01-menu', info.project.name);
  }

  await openFirstLevel(page);
  await shot(page, '02-level', info.project.name);

  // sem rolagem horizontal da página
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // abre a gaveta, escolhe a peça: a gaveta recolhe e o toque no chão só marca o lugar
  await page.getByRole('tab', { name: 'Peças', exact: true }).tap();
  await shot(page, '03-sheet', info.project.name);
  await page.getByRole('button', { name: /Fila SQS/ }).tap();
  await page.waitForTimeout(400); // a gaveta recolhe e o palco reenquadra
  await expect(page.locator('.stage-hint')).toContainText('Toque no chão');
  const spot = await world(page, 0, 0, 0);
  await page.touchscreen.tap(spot.x, spot.y);
  await expect(page.getByRole('button', { name: '✓ Colocar aqui' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __kiue: Kiue }).__kiue.ctrl.graph.nodes.filter((n) => n.kind === 'queue').length)).toBe(0);
  await shot(page, '04-pending', info.project.name);
  await page.getByRole('button', { name: '✓ Colocar aqui' }).tap();
  await expect(page.getByRole('tab', { name: 'Peça', exact: true })).toBeVisible();
  await page.waitForTimeout(400); // o palco encolhe quando a gaveta abre
  await shot(page, '05-placed', info.project.name);

  // toque numa peça do cenário seleciona e mostra "Conectar"
  const src = await world(page, -7, 0, 0.5);
  await page.touchscreen.tap(src.x, src.y);
  await page.locator('.touch-actions').getByRole('button', { name: '⟶ Conectar' }).tap();
  await expect(page.locator('.stage-hint')).toContainText('Toque na peça de destino');
  const q = await world(page, 0, 0, 0.5);
  await page.touchscreen.tap(q.x, q.y);
  await expect(page.locator('.stage-hint')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('celular: toque longo arrasta a peça; um dedo move a câmera', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium');
  await openFirstLevel(page);
  await page.getByRole('tab', { name: 'Peças', exact: true }).tap();
  await page.getByRole('button', { name: /Fila SQS/ }).tap();
  await page.waitForTimeout(400); // a gaveta recolhe e o palco reenquadra
  const spot = await world(page, 0, 0, 0);
  await page.touchscreen.tap(spot.x, spot.y);
  await page.getByRole('button', { name: '✓ Colocar aqui' }).tap();
  await page.waitForTimeout(500); // o palco encolhe quando a gaveta abre

  const queue = () =>
    page.evaluate(() => {
      const n = (window as unknown as { __kiue: Kiue }).__kiue.ctrl.graph.nodes.find((n) => n.kind === 'queue')!;
      return { x: n.x, z: n.z };
    });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const dragZ = async (dz: number, holdMs: number) => {
    const at = await queue();
    const from = await world(page, at.x, at.z, 0.3);
    const to = await world(page, at.x, at.z + dz, 0.3);
    await touch('touchStart', from.x, from.y);
    await page.waitForTimeout(holdMs);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
      await page.waitForTimeout(20);
    }
    await touch('touchEnd', to.x, to.y);
    await page.waitForTimeout(100);
  };

  // peça selecionada (acabou de ser colocada): arrastar move direto
  const first = await queue();
  await dragZ(3, 0);
  const second = await queue();
  expect(second.z).toBeGreaterThan(first.z);
  await shot(page, '06-dragged', info.project.name);

  // peça não selecionada: só o toque longo pega a peça
  await page.evaluate(() => (window as unknown as { __kiue: { ctrl: { select: (s: null) => void } } }).__kiue.ctrl.select(null));
  await page.waitForTimeout(100);
  await dragZ(-2, 450);
  const third = await queue();
  expect(third.z).toBeLessThan(second.z);

  // um dedo no chão vazio move a câmera: a posição projetada de um ponto muda
  // chão vazio entre o site e a fila, um pouco à frente: fica no palco em pé e deitado
  const empty = await world(page, -3.5, 3, 0);
  const before = await world(page, 0, 0, 0);
  await touch('touchStart', empty.x, empty.y);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', empty.x - i * 15, empty.y);
    await page.waitForTimeout(20);
  }
  await touch('touchEnd', empty.x - 90, empty.y);
  await page.waitForTimeout(100);
  const after = await world(page, 0, 0, 0);
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(20);
});
