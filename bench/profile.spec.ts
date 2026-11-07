import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { levelById } from '../content/levels';

// Perfil de CPU de uma fase rodando (LEVEL=c12, padrão) ou do grafo de estresse (STRESS=1):
// `npm run bench:profile`. Grava o perfil (abre no DevTools → Performance) e imprime: elementos da
// página por região, chamadas de desenho/triângulos e o tempo de uma reconstrução completa da cena.
// Com bench/profile-dev.config.ts roda no servidor de desenvolvimento (nomes de função legíveis).
const OUT = process.env.OUT ?? 'test-results/profile.json';
const LEVEL = process.env.LEVEL ?? 'c12';

test('perfil de CPU', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.waitForFunction(() => '__kiue' in window);
  if (process.env.STRESS) {
    const { heavyGraph } = await import('./graphs');
    await page.evaluate((g) => {
      const ctrl = (window as any).__kiue.ctrl;
      ctrl.setBriefing(false);
      ctrl.graph = g;
      ctrl.graphVersion++;
      ctrl.run();
      ctrl.setSpeed(8);
    }, heavyGraph());
  } else await page.evaluate((level) => {
    const ctrl = (window as any).__kiue.ctrl;
    ctrl.access = 'member';
    ctrl.registerLevel(level);
    ctrl.startLevel(level.id);
    ctrl.setBriefing(false);
    ctrl.showSolution();
    ctrl.run();
    ctrl.setSpeed(Number(new URLSearchParams(location.search).get('speed') ?? 4));
  }, levelById(LEVEL)!);
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(6000);
  const { profile } = await cdp.send('Profiler.stop');
  writeFileSync(OUT, JSON.stringify(profile));
  const dom = await page.evaluate(() => {
    const count: Record<string, number> = {};
    for (const el of document.querySelectorAll('*')) {
      // conta pelo ancestral com classe mais próximo da raiz da UI
      let a: Element | null = el;
      let key = el.tagName.toLowerCase();
      while (a && a !== document.body) { if (a.classList.length) key = a.tagName.toLowerCase() + '.' + a.classList[0]; if (a.parentElement === document.body || a.parentElement?.id === 'app') break; a = a.parentElement; }
      count[key] = (count[key] ?? 0) + 1;
    }
    return Object.entries(count).sort((x, y) => y[1] - x[1]).slice(0, 12);
  });
  console.log(JSON.stringify(dom));
  const sub = await page.evaluate(() => {
    const count: Record<string, number> = {};
    for (const el of document.querySelectorAll('.level-screen *')) { const c = el.closest('[class]:not(.level-screen)'); let top: Element | null = c; while (top?.parentElement && !top.parentElement.classList.contains('level-screen')) top = top.parentElement; const k = top ? top.tagName.toLowerCase() + '.' + (top.classList[0] ?? '') : '?'; count[k] = (count[k] ?? 0) + 1; }
    return Object.entries(count).sort((x, y) => y[1] - x[1]).slice(0, 10);
  });
  console.log(JSON.stringify(sub));
  const info = await page.evaluate(() => {
    const v = (window as any).__kiue.view;
    const r = v.renderer.info.render;
    let meshes = 0, inst = 0;
    v.scene.traverse((o: any) => { if (o.isMesh) { meshes++; if (o.isInstancedMesh) inst++; } });
    return { calls: r.calls, triangles: r.triangles, meshes, inst, geometries: v.renderer.info.memory.geometries, textures: v.renderer.info.memory.textures };
  });
  console.log('RENDER ' + JSON.stringify(info));
  const rebuild = await page.evaluate(() => {
    const { ctrl, view } = (window as any).__kiue;
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      ctrl.graphVersion++;
      const t = performance.now();
      view.sync();
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    return { median: times[5].toFixed(1), min: times[0].toFixed(1) };
  });
  console.log('REBUILD ' + JSON.stringify(rebuild));
  await cdp.send('Profiler.start');
  await page.evaluate(() => {
    const { ctrl, view } = (window as any).__kiue;
    for (let i = 0; i < 30; i++) { ctrl.graphVersion++; view.sync(); }
  });
  const prof2 = await cdp.send('Profiler.stop');
  writeFileSync(OUT.replace('.json', '-rebuild.json'), JSON.stringify(prof2.profile));
});
