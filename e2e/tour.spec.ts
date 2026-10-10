import { expect, test } from '@playwright/test';
import { MEMBER_STATE } from './global-setup';

// fases fechadas para visitantes: roda logado
test.use({ storageState: MEMBER_STATE });

// Roda a solução de cada fase pela interface e verifica que a cena renderiza sem erros.
const LEVEL_IDS = ['i01', 'i02', 'i03', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'i10', 'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12'];
const SHOTS = process.env.SHOTS_DIR;

type Hook = { ctrl: { openLevel(id: string): Promise<void>; setBriefing(v: boolean): void; showSolution(): void; run(): void; setSpeed(n: number): void; finishNow(): void; select(s: unknown): void } };

for (const id of LEVEL_IDS) {
  test(`solução da fase ${id} roda na interface`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/');
    await expect(page.locator('.console-nav .account-btn')).toBeVisible(); // sessão confirmada antes de abrir fases fechadas
    await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
    await page.waitForFunction(() => '__kiue' in window);
    await page.evaluate(async (id) => {
      const { ctrl } = (window as unknown as { __kiue: Hook }).__kiue;
      await ctrl.openLevel(id);
      ctrl.setBriefing(false);
      ctrl.showSolution();
      ctrl.select(null);
      ctrl.setSpeed(4);
      ctrl.run();
    }, id);
    await page.waitForTimeout(2500);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tour-${id}.png` });
    await page.getByRole('button', { name: /Concluir agora/ }).click();
    await expect(page.getByText('Fase concluída!')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
