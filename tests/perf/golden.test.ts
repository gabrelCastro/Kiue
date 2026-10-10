import { Simulation } from '../../src/sim/engine';
import { LEVELS } from '../../src/game/levels';
import { solutionGraph } from '../../src/game/run';
import { isRoutine, type SimEvent } from '../../src/sim/types';
import { describeEvent } from '../../src/ui/format';
import { fingerprint, STRESS } from './scenarios';

// Trava o comportamento do simulador: otimizações não podem mudar nenhum evento.
// Se uma mudança de regra for intencional, atualize com `npx vitest run -u`.

function record(sim: Simulation) {
  const events: SimEvent[] = [];
  sim.onEvent((e) => events.push(e));
  sim.runToEnd();
  return fingerprint(sim, events);
}

describe('fingerprint determinístico', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('fase %s', (_id, level) => {
    const initial = record(new Simulation(structuredClone(level.graph), level.sim));
    const solved = record(new Simulation(solutionGraph(level), level.sim));
    expect({ initial, solved }).toMatchSnapshot();
  });

  it.each(STRESS.map((s) => [s.name, s] as const))('carga %s', (_name, s) => {
    expect(record(new Simulation(s.graph, s.options))).toMatchSnapshot();
  });
});

describe('log de eventos', () => {
  it('isRoutine concorda com o que o log esconde fora do modo detalhado', () => {
    const seen = new Set<string>();
    for (const s of [...STRESS, ...LEVELS.map((l) => ({ graph: solutionGraph(l), options: l.sim }))]) {
      const sim = new Simulation(s.graph, s.options);
      sim.onEvent((e) => {
        const key = `${e.type}:${'retry' in e ? e.retry : ''}:${'receiveCount' in e ? Math.min(e.receiveCount, 2) : ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        expect(isRoutine(e), key).toBe(describeEvent(e, s.graph, false) === null);
      });
      sim.runToEnd();
    }
    expect(seen.size).toBeGreaterThan(20);
  });
});
