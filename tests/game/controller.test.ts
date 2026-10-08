import { Controller } from '../../src/game/controller';
import { levelById } from '../../src/game/levels';
import type { GraphNode } from '../../src/sim/types';

function open(id: string) {
  const c = new Controller();
  c.progress = {};
  c.startLevel(id);
  return c;
}

describe('Controller', () => {
  it('coloca, conecta e vence a fase 1', () => {
    const c = open('i01');
    const item = c.level!.palette[0];
    c.setTool({ type: 'place', item });
    c.placeAt(0, 0);
    const q = c.graph.nodes.find((n) => n.kind === 'queue')!;
    expect(c.connect('site', q.id)).toBe(true);
    expect(c.connect(q.id, 'separacao')).toBe(true);
    c.run();
    c.finishNow();
    expect(c.mode).toBe('done');
    expect(c.result?.passed).toBe(true);
    expect(c.progress['i01'].stars).toBe(3);
  });

  it('respeita o limite da paleta', () => {
    const c = open('i01');
    const item = c.level!.palette[0];
    c.setTool({ type: 'place', item });
    c.placeAt(0, 0);
    expect(c.paletteRemaining(item)).toBe(0);
    expect(c.tool.type).toBe('select');
    c.setTool({ type: 'place', item });
    expect(c.tool.type).toBe('select');
  });

  it('não deixa colocar peças sobrepostas', () => {
    const c = open('i01');
    c.setTool({ type: 'place', item: c.level!.palette[0] });
    c.placeAt(-7, 0);
    expect(c.graph.nodes).toHaveLength(2);
    expect(c.toast?.kind).toBe('warn');
  });

  it('peças do cenário não podem ser removidas', () => {
    const c = open('i01');
    c.deleteNode('site');
    expect(c.graph.nodes.some((n) => n.id === 'site')).toBe(true);
  });

  it('não edita durante a execução', () => {
    const c = open('i07');
    c.run();
    c.updateConfig<'queue'>('fila', { visibilityTimeout: 99 });
    expect((c.graph.nodes.find((n) => n.id === 'fila') as GraphNode<'queue'>).config.visibilityTimeout).toBe(2);
  });

  it('trocar o tópico para FIFO derruba assinaturas Standard incompatíveis', () => {
    const c = open('sandbox');
    const topic = c.level!.palette.find((p) => p.kind === 'topic')!;
    const queue = c.level!.palette.find((p) => p.kind === 'queue')!;
    c.setTool({ type: 'place', item: topic });
    c.placeAt(-2, 0);
    c.setTool({ type: 'place', item: queue });
    c.placeAt(3, 0);
    const t = c.graph.nodes.find((n) => n.kind === 'topic')!;
    const q = c.graph.nodes.find((n) => n.kind === 'queue')!;
    expect(c.connect(t.id, q.id)).toBe(true);
    c.updateConfig<'topic'>(t.id, { fifo: true });
    expect(c.graph.edges.some((e) => e.from === t.id)).toBe(false);
  });

  it('remover a DLQ limpa a referência na fila de origem', () => {
    const c = open('i06');
    c.setTool({ type: 'place', item: c.level!.palette[0] });
    c.placeAt(0, 4);
    const dlq = c.graph.nodes.find((n) => n.kind === 'queue' && n.id !== 'fila')!;
    c.updateConfig<'queue'>('fila', { dlq: dlq.id });
    c.deleteNode(dlq.id);
    expect((c.graph.nodes.find((n) => n.id === 'fila') as GraphNode<'queue'>).config.dlq).toBeNull();
  });

  it('trocar a DLQ para FIFO desfaz a ligação incompatível', () => {
    const c = open('i06');
    c.setTool({ type: 'place', item: c.level!.palette[0] });
    c.placeAt(0, 4);
    const dlq = c.graph.nodes.find((n) => n.kind === 'queue' && n.id !== 'fila')!;
    c.updateConfig<'queue'>('fila', { dlq: dlq.id });
    c.updateConfig<'queue'>(dlq.id, { fifo: true }); // limpa a DLQ incompatível
    expect((c.graph.nodes.find((n) => n.id === 'fila') as GraphNode<'queue'>).config.dlq).toBeNull();
  });

  it('desbloqueio das trilhas', () => {
    const c = new Controller();
    c.progress = {};
    expect(c.isUnlocked(levelById('i01')!)).toBe(true);
    expect(c.isUnlocked(levelById('i02')!)).toBe(false);
    expect(c.isUnlocked(levelById('c01')!)).toBe(false);
    c.progress = { i01: { stars: 1 }, i05: { stars: 2 } };
    expect(c.isUnlocked(levelById('i02')!)).toBe(true);
    expect(c.isUnlocked(levelById('c01')!)).toBe(true);
    expect(c.isUnlocked(levelById('c02')!)).toBe(false);
  });

  it('ver solução carrega a solução de referência', () => {
    const c = open('i10');
    c.showSolution();
    c.run();
    c.finishNow();
    expect(c.result?.stars).toBe(3);
  });
});
