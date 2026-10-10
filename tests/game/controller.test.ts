import { Controller } from '../../src/game/controller';
import { levelById } from '../../src/game/levels';
import type { GraphNode } from '../../src/sim/types';

function open(id: string) {
  const c = new Controller();
  c.progress = {};
  c.access = 'member';
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

  it('a sobreposição considera o tamanho de cada peça', () => {
    const c = open('i01');
    c.setTool({ type: 'place', item: c.level!.palette[0] });
    // a fila é comprida: a 3 unidades do consumidor (x = 7) ela encostaria nele
    c.placeAt(4, 0);
    expect(c.graph.nodes).toHaveLength(2);
    expect(c.canPlaceAt('queue', 3, 0)).toBe(true);
    // e é rasa: outra fila cabe logo abaixo, coisa que um consumidor não faria
    expect(c.canPlaceAt('queue', -7, 2)).toBe(true);
    expect(c.canPlaceAt('consumer', -7, 2)).toBe(false);
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
    c.access = 'member';
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

  describe('acesso de visitante', () => {
    function guest() {
      const c = new Controller();
      c.progress = { i01: { stars: 3 }, i02: { stars: 3 }, i05: { stars: 3 } };
      const asked: string[] = [];
      c.onAccountRequired = (l) => asked.push(l.id);
      return { c, asked };
    }

    it('libera só as fases 1 e 2, mesmo com progresso salvo', () => {
      const { c } = guest();
      expect(c.lockReason(levelById('i01')!)).toBeNull();
      expect(c.lockReason(levelById('i02')!)).toBeNull();
      expect(c.lockReason(levelById('i03')!)).toBe('account');
      expect(c.lockReason(levelById('c01')!)).toBe('account');
      c.setAccess('member');
      expect(c.lockReason(levelById('i03')!)).toBeNull();
      expect(c.lockReason(levelById('i04')!)).toBe('progress');
    });

    it('pede conta em vez de abrir uma fase fechada', () => {
      const { c, asked } = guest();
      c.startLevel('i03');
      expect(c.screen).toBe('menu');
      expect(asked).toEqual(['i03']);
    });

    it('sandbox de visitante tem menos peças e cresce ao entrar na conta', () => {
      const { c } = guest();
      c.startLevel('sandbox');
      const queues = () => c.level!.palette.find((p) => p.kind === 'queue')!;
      expect(queues().count).toBe(2);
      c.setTool({ type: 'place', item: queues() });
      c.placeAt(0, 4);
      c.setTool({ type: 'place', item: queues() });
      c.placeAt(4, -4);
      expect(c.paletteRemaining(queues())).toBe(0);
      c.setAccess('member');
      expect(c.level!.id).toBe('sandbox');
      expect(c.graph.nodes.filter((n) => n.kind === 'queue')).toHaveLength(2);
      expect(c.paletteRemaining(queues())).toBe(18);
    });

    it('sair da conta no meio de uma fase fechada volta ao menu', () => {
      const { c } = guest();
      c.setAccess('member');
      c.startLevel('i03');
      expect(c.screen).toBe('level');
      c.setAccess('guest');
      expect(c.screen).toBe('menu');
      c.setAccess('member');
      c.startLevel('i02');
      c.setAccess('guest');
      expect(c.screen).toBe('level');
    });
  });
});
