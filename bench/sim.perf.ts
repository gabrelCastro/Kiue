import { LEVELS } from '../src/game/levels';
import { runLevel, solutionGraph } from '../src/game/run';
import { runScenario, STRESS } from '../tests/perf/scenarios';

// Medição do simulador: `npm run bench`. Mostra a mediana de várias execuções.

function median(fn: () => void, runs: number): number {
  fn(); // aquecimento do JIT
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

it('tempo de simulação', () => {
  const rows: [string, string][] = [];
  rows.push(['todas as fases (solução)', `${median(() => LEVELS.forEach((l) => runLevel(l, solutionGraph(l))), 7).toFixed(1)} ms`]);
  for (const s of STRESS) rows.push([`carga ${s.name}`, `${median(() => void runScenario(s), 5).toFixed(1)} ms`]);
  process.stdout.write('\n' + rows.map(([k, v]) => `${k.padEnd(28)} ${v.padStart(10)}`).join('\n') + '\n');
});
