import { expect, test } from '@playwright/test';
import { MEMBER_STATE } from './global-setup';

test.describe('sessão de estudos (visitante)', () => {
  test('lê o capítulo 1, marca como lido e vê o cadeado nos capítulos de conta', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'Estudos', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Por que filas' })).toBeVisible();
    // termo do glossário com a definição
    const term = page.locator('.term').first();
    await term.hover();
    await expect(term.locator('.term-pop')).toBeVisible();

    // rolar até o botão já leva ao fim do texto, o que marca o capítulo sozinho: o clique pode
    // chegar com o botão já desabilitado. O que importa é o resultado (capítulo lido).
    await page.getByRole('button', { name: 'Marcar como lido' }).click({ timeout: 5000 }).catch(() => {});
    await expect(page.getByRole('button', { name: '✓ Lido' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Apostila/ })).toContainText('1 de 13 lidos');

    await page.getByRole('button', { name: /Tópicos, fan-out e filtros/ }).click();
    await expect(page.getByRole('heading', { name: 'Tópicos, fan-out e filtros' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar conta grátis' })).toBeVisible();

    // o lido sobrevive ao recarregar (fica no navegador)
    await page.reload();
    await page.getByRole('button', { name: 'Estudos', exact: true }).click();
    await expect(page.getByRole('tab', { name: /Apostila/ })).toContainText('1 de 13 lidos');
    expect(errors).toEqual([]);
  });

  test('glossário com busca e link para o capítulo', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Estudos', exact: true }).click();
    await page.getByRole('tab', { name: /Glossário/ }).click();
    await page.getByRole('textbox', { name: 'Buscar no glossário' }).fill('idempot');
    // o termo e quem o cita na definição (at-least-once)
    await expect(page.locator('.gl-entry dt')).toHaveText([/At-least-once/, /Idempotência/]);
    await page.getByRole('textbox', { name: 'Buscar no glossário' }).fill('fila (queue)');
    await page.getByRole('button', { name: 'Ler no capítulo 1' }).click();
    await expect(page.getByRole('heading', { name: 'Por que filas' })).toBeVisible();
  });

  test('revisão com as perguntas das fases concluídas', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kiue:progress:v1', JSON.stringify({ i01: { stars: 3 }, i02: { stars: 2 } })));
    await page.goto('/');
    await page.getByRole('button', { name: 'Estudos', exact: true }).click();
    await page.getByRole('tab', { name: /Revisão/ }).click();
    await page.getByRole('button', { name: 'Começar a revisão' }).click();
    await expect(page.locator('.modal-kicker')).toContainText('Revisão · pergunta 1 de');
    await page.locator('.quiz-option').first().click();
    await expect(page.locator('.quiz-explain')).toBeVisible();
    await expect(page.getByRole('button', { name: /Reler o capítulo/ })).toBeVisible();
  });

  test('"Estudar" na fase abre o capítulo por cima, sem perder a montagem', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Começar pela fase 1/ }).click();
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    await page.waitForFunction(() => '__kiue' in window);
    const nodes = () => page.evaluate(() => (window as unknown as { __kiue: { ctrl: { graph: { nodes: unknown[] } } } }).__kiue.ctrl.graph.nodes.length);
    const before = await nodes();
    await page.getByRole('button', { name: 'Estudar', exact: true }).click();
    const panel = page.getByRole('dialog', { name: /Estudar: Por que filas/ });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Fechar' }).click();
    await expect(panel).toBeHidden();
    expect(await nodes()).toBe(before);
  });
});

test.describe('sessão de estudos (com conta)', () => {
  test.use({ storageState: MEMBER_STATE });

  test('capítulo fechado chega do servidor e o lido fica na conta', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Estudos', exact: true }).click();
    await page.getByRole('button', { name: /Visibility timeout e heartbeat/ }).click();
    await expect(page.getByText('O padrão costuma ser 30 s e o máximo, 12 horas.', { exact: false })).toBeVisible();
    // rolar até o botão já leva ao fim do texto, o que marca o capítulo sozinho: o clique pode
    // chegar com o botão já desabilitado. O que importa é o resultado (capítulo lido).
    await page.getByRole('button', { name: 'Marcar como lido' }).click({ timeout: 5000 }).catch(() => {});
    await expect(page.getByRole('button', { name: '✓ Lido' })).toBeVisible();
    // dá tempo de a gravação chegar ao servidor e confere de outro lugar (sem o cache do navegador)
    await expect
      .poll(async () => (await page.request.get('/api/study-progress')).json().then((j: { read: string[] }) => j.read))
      .toContain('cap04');
  });
});
