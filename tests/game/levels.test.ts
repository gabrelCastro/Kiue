import { footprintsOverlap } from '../../src/game/footprint';
import { connectionError, validateGraph } from '../../src/game/graph';
import { ALL_LEVELS as LEVELS } from '../../content/levels';
import { runLevel, solutionGraph } from '../../src/game/run';

describe.each(LEVELS.map((l) => [l.id, l] as const))('fase %s', (_id, level) => {
  it('o estado inicial não vence a fase', () => {
    const { result } = runLevel(level, structuredClone(level.graph));
    expect(result.passed).toBe(false);
  });

  it('a solução de referência vence com 3 estrelas', () => {
    const g = solutionGraph(level);
    expect(validateGraph(g).errors).toEqual([]);
    const { result, sim } = runLevel(level, g);
    const failing = result.goals.filter((r) => r.status !== 'ok').map((r) => `${r.label}: ${r.detail}`);
    expect(failing).toEqual([]);
    expect({ stars: result.stars, p95: result.p95, api: result.apiCalls, end: sim.now }).toMatchObject({ stars: 3 });
  });

  it('nenhuma peça encosta em outra (estado inicial e solução)', () => {
    for (const g of [level.graph, solutionGraph(level)]) {
      const clash: string[] = [];
      g.nodes.forEach((a, i) =>
        g.nodes.slice(i + 1).forEach((b) => {
          if (footprintsOverlap(a.kind, a.x, a.z, b.kind, b.x, b.z)) clash.push(`${a.id} × ${b.id}`);
        }),
      );
      expect(clash).toEqual([]);
    }
  });

  it('a solução respeita as regras de conexão e a paleta', () => {
    const sol = solutionGraph(level);
    const g = structuredClone(level.graph);
    g.edges = g.edges.filter((e) => sol.edges.some((s) => s.from === e.from && s.to === e.to));
    for (const n of sol.nodes) if (!g.nodes.some((m) => m.id === n.id)) g.nodes.push(n);
    for (const e of sol.edges) {
      if (g.edges.some((x) => x.from === e.from && x.to === e.to)) continue;
      expect(connectionError(g, e.from, e.to), `${e.from} → ${e.to}`).toBeNull();
      g.edges.push(e);
    }
    const added = sol.nodes.filter((n) => !level.graph.nodes.some((m) => m.id === n.id));
    for (const kind of ['producer', 'topic', 'queue', 'consumer'] as const) {
      const used = added.filter((n) => n.kind === kind).length;
      const allowed = level.palette.filter((p) => p.kind === kind).reduce((s, p) => s + p.count, 0);
      expect(used, kind).toBeLessThanOrEqual(allowed);
    }
  });

  it('tem conteúdo didático', () => {
    expect(level.lesson.length).toBeGreaterThan(0);
    expect(level.quiz.length).toBeGreaterThan(0);
    for (const q of level.quiz) expect(q.answer).toBeLessThan(q.options.length);
  });
});
