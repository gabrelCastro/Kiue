import { expect, test, type Page } from '@playwright/test';
import { MEMBER_STATE } from './global-setup';

// fases fechadas para visitantes: roda logado
test.use({ storageState: MEMBER_STATE });

type Hook = {
  ctrl: { openLevel(id: string): Promise<void>; setBriefing(v: boolean): void; progress: Record<string, unknown> };
  project: (x: number, z: number, y: number) => { x: number; y: number };
};

const SHOTS = process.env.SHOTS_DIR;

async function openLevel(page: Page, id: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.console-nav .account-btn')).toBeVisible(); // sessão confirmada antes de abrir fases fechadas
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.waitForFunction(() => '__kiue' in window);
  await page.evaluate(async (id) => {
    const { ctrl } = (window as unknown as { __kiue: Hook }).__kiue;
    await ctrl.openLevel(id);
    ctrl.setBriefing(false);
  }, id);
  await page.waitForTimeout(200);
  return errors;
}

async function clickWorld(page: Page, x: number, z: number, y = 0.5) {
  const p = await page.evaluate(([x, z, y]) => (window as unknown as { __kiue: Hook }).__kiue.project(x, z, y), [x, z, y] as const);
  await page.mouse.click(p.x, p.y);
}

async function finish(page: Page) {
  await page.getByRole('button', { name: '▶ Rodar' }).click();
  await page.getByRole('button', { name: /Concluir agora/ }).click();
}

test('fase 6: configurar DLQ pelo inspetor', async ({ page }) => {
  const errors = await openLevel(page, 'i06');
  await finish(page);
  await expect(page.getByText('Ainda não…')).toBeVisible();
  await expect(page.locator('.result-goals')).toContainText('DLQ');
  await page.getByRole('button', { name: 'Tentar de novo' }).click();

  await page.getByRole('button', { name: /Fila SQS \(DLQ\)/ }).click();
  await clickWorld(page, 0, 4, 0);
  await clickWorld(page, 0, 0);
  await page.getByLabel('Dead-letter queue (DLQ)').selectOption({ label: 'fila-pedidos-dlq' });
  await expect(page.getByText('maxReceiveCount', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Na vida real' }).click();
  await expect(page.locator('.realworld')).toContainText('aws sqs create-queue');
  await expect(page.locator('.realworld')).toContainText('RedrivePolicy');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/insp-i06.png` });
  await page.getByRole('tab', { name: 'Configurar' }).click();
  await finish(page);
  await expect(page.getByText('Fase concluída!')).toBeVisible();
  expect(errors).toEqual([]);
});

test('fase 9: trocar a fila para FIFO', async ({ page }) => {
  const errors = await openLevel(page, 'i09');
  await clickWorld(page, 0, 0);
  await page.getByLabel('Tipo da fila').selectOption('fifo');
  await expect(page.locator('.node-label').filter({ hasText: 'movimentacoes' })).toContainText('FIFO');
  await finish(page);
  await expect(page.getByText('Fase concluída!')).toBeVisible();
  expect(errors).toEqual([]);
});

test('fase 5: fan-out com filter policy', async ({ page }) => {
  const errors = await openLevel(page, 'i05');
  const subs: [number, string, string | null][] = [
    [-4, 'Livraria', 'Livro'],
    [0, 'Eletrônicos', 'Eletrônico'],
    [4, 'Auditoria', null],
  ];
  for (const [z, consumer, type] of subs) {
    await page.getByRole('button', { name: /Fila SQS/ }).click();
    await clickWorld(page, 3, z, 0);
    // fila → consumidor
    await page.getByRole('button', { name: '⟶ Conectar' }).click();
    await clickWorld(page, 8, z, 0.4);
    // tópico → fila
    await clickWorld(page, -3, 0, 0.8);
    await page.getByRole('button', { name: '⟶ Conectar' }).click();
    await clickWorld(page, 3, z);
    await clickWorld(page, 3, z);
    await expect(page.locator('.connections')).toContainText(consumer);
    if (type) {
      const row = page.locator('.edge-row').filter({ hasText: '← pedidos-criados' });
      await row.getByLabel('Filter policy').selectOption('only');
      await row.locator('.chip-check').filter({ hasText: type }).locator('input').check();
      for (const other of ['Livro', 'Eletrônico', 'Roupa'].filter((t) => t !== type)) {
        await row.locator('.chip-check').filter({ hasText: other }).locator('input').uncheck();
      }
    }
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/insp-i05.png` });
  await finish(page);
  await expect(page.getByText('Fase concluída!')).toBeVisible();
  expect(errors).toEqual([]);
});

test('conexão inválida mostra explicação', async ({ page }) => {
  await openLevel(page, 'c01');
  await page.getByRole('button', { name: /Tópico SNS/ }).click();
  await clickWorld(page, -3, 0, 0);
  await page.getByLabel('Tipo do tópico').selectOption('fifo');
  await page.getByRole('button', { name: /Fila SQS/ }).click();
  await clickWorld(page, 3, -3, 0);
  await clickWorld(page, -3, 0, 0.8);
  await page.getByRole('button', { name: '⟶ Conectar' }).click();
  await clickWorld(page, 3, -3);
  await expect(page.locator('.toast.error')).toContainText('FIFO');
});

test('fase c06: ativar falha parcial de lote na Lambda', async ({ page }) => {
  const errors = await openLevel(page, 'c06');
  await clickWorld(page, 6, 0, 0.8);
  await expect(page.locator('.inspector-head')).toContainText('Função Lambda');
  await page.getByText('Report batch item failures').click();
  await page.getByRole('tab', { name: 'Na vida real' }).click();
  await expect(page.locator('.realworld')).toContainText('ReportBatchItemFailures');
  await expect(page.locator('.realworld')).toContainText('batchItemFailures');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/insp-c06.png` });
  await finish(page);
  await expect(page.getByText('Fase concluída!')).toBeVisible();
  expect(errors).toEqual([]);
});

test('fase c09: DLQ da assinatura SNS', async ({ page }) => {
  const errors = await openLevel(page, 'c09');
  await page.getByRole('button', { name: /Fila SQS \(DLQ\)/ }).click();
  await clickWorld(page, 3, 6, 0);
  await clickWorld(page, -3, 0, 0.8);
  const row = page.locator('.edge-row').filter({ hasText: '→ Parceiro (HTTPS)' });
  await row.getByLabel('DLQ da assinatura').selectOption({ label: 'parceiro-dlq' });
  await finish(page);
  await expect(page.getByText('Fase concluída!')).toBeVisible();
  expect(errors).toEqual([]);
});
