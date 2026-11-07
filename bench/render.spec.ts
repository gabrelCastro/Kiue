import { test } from '@playwright/test';
import { levelById } from '../content/levels';

import { heavyGraph } from './graphs';

const VARIANT = process.env.VARIANT ?? '';
/** `LEVEL=c12` mede uma fase real (solução de referência) em vez do grafo de stress. */
const LEVEL = process.env.LEVEL ?? '';

test('custo por frame do renderer sob carga', async ({ page }) => {
  if (VARIANT.includes('idle')) await page.addInitScript(() => ((window as any).IDLE = true));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.waitForFunction(() => '__kiue' in window);
  await page.evaluate(() => (window as any).__kiue.ctrl.setBriefing(false));
  await page.evaluate(
    ([g, level]) => {
      const ctrl = (window as any).__kiue.ctrl;
      if (level) {
        // fase real com a solução de referência, no lugar do grafo de stress (injetada direto:
        // o benchmark roda só com o `vite preview`, sem a API que entrega as fases fechadas)
        ctrl.access = 'member';
        ctrl.registerLevel(level);
        ctrl.startLevel(level.id);
        ctrl.setBriefing(false);
        ctrl.showSolution();
      } else {
        ctrl.graph = g;
        ctrl.graphVersion++;
      }
      if (!(window as any).IDLE) {
        ctrl.run();
        ctrl.setSpeed(8);
      }
    },
    [heavyGraph(), LEVEL ? (levelById(LEVEL) ?? null) : null] as const,
  );
  await page.waitForTimeout(3000); // deixa o backlog crescer
  await page.evaluate((spec) => {
    const variant = spec.split('+');
    const view = (window as any).__kiue.view;
    if (variant.includes('noshadow')) view.renderer.shadowMap.enabled = false;
    if (variant.includes('notokenshadow')) view.tokens.castShadow = false;
    if (variant.includes('tokenshadow')) view.tokens.castShadow = true;
    if (variant.includes('dpr1')) view.renderer.setPixelRatio(1);
    if (variant.includes('notokens')) view.tokens.visible = false;
    if (variant.includes('static')) {
      view.tokens.castShadow = false;
      view.renderer.shadowMap.autoUpdate = false;
      view.renderer.shadowMap.needsUpdate = true;
    }
    if (variant.includes('pcf')) view.renderer.shadowMap.type = 1;
    if (variant.includes('map1024')) {
      view.scene.traverse((o: any) => {
        if (o.isDirectionalLight) {
          o.shadow.mapSize.set(1024, 1024);
          o.shadow.map?.dispose();
          o.shadow.map = null;
        }
      });
    }
    if (variant.includes('noaa')) view.renderer.getContext().canvas.style.imageRendering = 'auto';
    if (variant.includes('noenv'))
      view.scene.traverse((o: any) => {
        if (o.material && 'envMap' in o.material) o.material.envMap = null;
        if (o.material) o.material.needsUpdate = true;
      });
    if (variant.includes('noglass'))
      view.scene.traverse((o: any) => {
        if (o.material?.isMeshPhysicalMaterial) o.material.clearcoat = 0;
      });
    if (variant.includes('norim'))
      view.scene.traverse((o: any) => {
        if (o.isDirectionalLight && !o.castShadow) o.visible = false;
      });
    if (variant.includes('nolabels')) view.labels.domElement.style.display = 'none';
  }, VARIANT);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metric = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((m: { name: string; value: number }) => [m.name, m.value]));
  };
  const before = await metric();
  const frames = await page.evaluate(
    () =>
      new Promise<{ frames: number; worst: number; tokens: number }>((resolve) => {
        let frames = 0;
        let last = performance.now();
        let worst = 0;
        const start = last;
        const tick = (t: number) => {
          frames++;
          worst = Math.max(worst, t - last);
          last = t;
          if (t - start < 6000) requestAnimationFrame(tick);
          else {
            const sim = (window as any).__kiue.ctrl.sim;
            let tokens = 0;
            if (sim) for (const q of sim.queues.values()) tokens += q.size;
            resolve({ frames, worst, tokens });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  const after = await metric();
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  const script = (after.ScriptDuration - before.ScriptDuration) * 1000;
  const task = (after.TaskDuration - before.TaskDuration) * 1000;
  const layout = (after.LayoutDuration - before.LayoutDuration) * 1000;
  const style = (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000;
  const nodes = after.Nodes;
  process.stdout.write(
    `\nframes ${frames.frames} em 6s (${(frames.frames / 6).toFixed(1)} fps), pior frame ${frames.worst.toFixed(0)} ms, mensagens nas filas ${frames.tokens}\n` +
      `por frame: script ${(script / frames.frames).toFixed(2)} ms · tarefa ${(task / frames.frames).toFixed(2)} ms · layout ${(layout / frames.frames).toFixed(2)} ms · estilo ${(style / frames.frames).toFixed(2)} ms · nós DOM ${nodes}\n`,
  );
});
