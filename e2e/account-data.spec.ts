import { expect, test, type Page } from '@playwright/test';
import { MEMBER_STATE } from './global-setup';

type Hook = {
  ctrl: {
    level: { palette: { kind: string }[] } | null;
    graph: { nodes: unknown[] };
    setBriefing(v: boolean): void;
    showSolution(): void;
    run(): void;
    finishNow(): void;
    openMenu(): void;
    setTool(t: unknown): void;
    placeAt(x: number, z: number): void;
  };
};

const hook = (page: Page) => page.waitForFunction(() => '__kiue' in window);

async function placeQueue(page: Page, x: number, z: number) {
  await page.evaluate(
    ([x, z]) => {
      const { ctrl } = (window as unknown as { __kiue: Hook }).__kiue;
      ctrl.setTool({ type: 'place', item: ctrl.level!.palette.find((p) => p.kind === 'queue') });
      ctrl.placeAt(x, z);
    },
    [x, z] as const,
  );
}

const nodeCount = (page: Page) => page.evaluate(() => (window as unknown as { __kiue: Hook }).__kiue.ctrl.graph.nodes.length);

test.describe('progresso na conta', () => {
  test('progresso de visitante vai para a conta e acompanha o login', async ({ page }) => {
    const email = `progresso-${Date.now()}@example.com`;
    const stars = page.locator('.star-count');
    await page.goto('/');
    await expect(page.locator('.guest-banner')).toBeVisible();

    // vence a fase 1 como visitante
    await page.getByRole('button', { name: /Primeiro pedido/ }).click();
    await hook(page);
    await page.evaluate(() => {
      const { ctrl } = (window as unknown as { __kiue: Hook }).__kiue;
      ctrl.setBriefing(false);
      ctrl.showSolution();
      ctrl.run();
      ctrl.finishNow();
    });
    await expect(page.getByText('Fase concluída!')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __kiue: Hook }).__kiue.ctrl.openMenu());
    await expect(stars).toContainText('3 / 66');

    // cria a conta: o progresso do navegador passa para ela
    await page.locator('.console-nav').getByRole('button', { name: 'Entrar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Criar conta' }).click();
    await dialog.getByLabel('Nome').fill('Eva');
    await dialog.getByLabel('E-mail').fill(email);
    await dialog.getByLabel('Senha', { exact: true }).fill('progresso-na-nuvem');
    await dialog.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.locator('.toast')).toContainText('adicionado à sua conta');
    await expect(stars).toContainText('3 / 66');
    expect(await page.evaluate(() => localStorage.getItem('kiue:progress:v1'))).toBe('{}');

    await page.reload();
    await expect(page.locator('.console-nav .account-btn')).toBeVisible();
    await expect(stars).toContainText('3 / 66');

    // sair: o navegador volta ao progresso de visitante (vazio)
    await page.locator('.console-nav .account-btn').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(stars).toContainText('0 / 66');

    await page.locator('.console-nav').getByRole('button', { name: 'Entrar', exact: true }).click();
    await dialog.getByLabel('E-mail').fill(email);
    await dialog.getByLabel('Senha', { exact: true }).fill('progresso-na-nuvem');
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(stars).toContainText('3 / 66');
  });
});

test.describe('sandboxes salvos', () => {
  test.use({ storageState: MEMBER_STATE });

  test('salva, reabre, detecta conflito entre abas e exclui', async ({ page, context }) => {
    const name = `Fan-out ${Date.now()}`;
    await page.goto('/');
    await expect(page.locator('.console-nav .account-btn')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Seus sandboxes' })).toBeVisible();

    await page.getByRole('button', { name: 'Novo sandbox' }).click();
    await hook(page);
    const status = page.locator('.sandbox-status');
    await expect(status).toHaveText('Sandbox novo');
    await placeQueue(page, 0, 4);
    await expect(status).toHaveText('Ainda não salvo');
    await page.getByLabel('Nome do sandbox').fill(name);
    await page.locator('.sandbox-file').getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(status).toHaveText('Salvo na sua conta');

    // Ctrl+S salva de novo depois de mexer
    await placeQueue(page, 4, -4);
    await expect(status).toHaveText('Alterações não salvas');
    await page.keyboard.press('Control+s');
    await expect(status).toHaveText('Salvo na sua conta');

    // sair com alteração pendente pergunta antes
    await placeQueue(page, -3, -5);
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: '← Menu' }).click();
    await expect(status).toHaveText('Alterações não salvas');
    await page.keyboard.press('Control+s');
    await expect(status).toHaveText('Salvo na sua conta');
    await page.getByRole('button', { name: '← Menu' }).click();

    const card = page.locator('.sandbox-card', { hasText: name });
    await expect(card).toContainText('4 peças');
    await card.locator('.sc-open').click();
    await hook(page);
    await expect(page.getByLabel('Nome do sandbox')).toHaveValue(name);
    expect(await nodeCount(page)).toBe(4);

    // outra aba abre o mesmo sandbox e salva primeiro
    const other = await context.newPage();
    await other.goto('/');
    await other.locator('.sandbox-card', { hasText: name }).locator('.sc-open').click();
    await hook(other);
    await placeQueue(other, 6, 4);
    await other.keyboard.press('Control+s');
    await expect(other.locator('.sandbox-status')).toHaveText('Salvo na sua conta');
    await other.close();

    await placeQueue(page, -6, 5);
    await page.keyboard.press('Control+s');
    const alert = page.locator('.sandbox-file [role=alert]');
    await expect(alert).toContainText('alterado em outra aba');
    await alert.getByRole('button', { name: 'Sobrescrever' }).click();
    await expect(status).toHaveText('Salvo na sua conta');

    await page.getByRole('button', { name: '← Menu' }).click();
    await expect(card).toContainText('5 peças');
    page.once('dialog', (d) => d.accept());
    await card.getByRole('button', { name: `Excluir ${name}` }).click();
    await expect(card).toHaveCount(0);
  });

  test('visitante não vê a seção nem o painel de arquivo', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('.guest-banner')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Seus sandboxes' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
    await expect(page.locator('.sandbox-limit')).toBeVisible();
    await expect(page.locator('.sandbox-file')).toHaveCount(0);
    await ctx.close();
  });
});

test.describe('fases servidas pela API', () => {
  test.use({ storageState: MEMBER_STATE });

  test('membro abre a fase 3 pelo menu: o conteúdo chega da API', async ({ page, baseURL }) => {
    const res = await page.request.patch('/api/progress', { data: { progress: { i01: { stars: 3 }, i02: { stars: 3 } } }, headers: { Origin: baseURL! } });
    expect(res.ok()).toBe(true);
    const levelCalls: string[] = [];
    page.on('request', (r) => r.url().includes('/api/levels/') && levelCalls.push(new URL(r.url()).pathname));

    await page.goto('/');
    await expect(page.locator('.console-nav .account-btn')).toBeVisible();
    await page.getByRole('button', { name: /A fila não para de crescer/ }).click();
    await expect(page.locator('.topbar h1')).toHaveText('A fila não para de crescer');
    await expect(page.getByRole('dialog')).toContainText('Mantenha a latência');
    // a fase 3 veio da API (por pré-carga ou pelo clique), uma vez só
    expect(levelCalls.filter((p) => p === '/api/levels/i03')).toHaveLength(1);
  });
});
