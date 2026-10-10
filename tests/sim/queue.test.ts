import { defaultQueue } from '../../src/sim/defaults';
import { SqsQueue, STANDARD_REORDER_RATE, type QueueContext } from '../../src/sim/queue';
import { Rng } from '../../src/sim/rng';
import type { Token } from '../../src/sim/types';

function token(n: number, groupId: string | null = null): Token {
  return {
    copyId: n, logicalId: n, type: 'pedido', poison: false, groupId, seq: n, dedupId: `d${n}`,
    body: `${n}`, createdAt: 0, producerId: 'p', sizeKb: 2, s3: false,
  };
}

function context(rng: Rng): QueueContext & { now: number } {
  let receipt = 1;
  return {
    now: 0,
    rng,
    emit: () => {},
    nextReceipt: () => receipt++,
    cloneToken: (t) => t,
    moveToDlq: () => {},
  };
}

/** Algoritmo original: embaralha a fila visível inteira e pega o começo. */
function eagerReceive(ids: number[], max: number, rng: Rng): number[] {
  const v = [...ids];
  for (let i = 0; i + 1 < v.length; i++) {
    if (rng.chance(STANDARD_REORDER_RATE)) {
      [v[i], v[i + 1]] = [v[i + 1], v[i]];
      i++;
    }
  }
  return v.slice(0, max);
}

describe('SqsQueue', () => {
  it('reordenamento sob demanda devolve o mesmo prefixo que embaralhar a fila inteira', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const n = 1 + (seed % 37);
      const max = 1 + (seed % 10);
      const q = new SqsQueue('q', defaultQueue());
      const ctx = context(new Rng(999));
      for (let i = 1; i <= n; i++) q.enqueue(token(i), ctx, 0);
      // pula algumas mensagens (em voo) para testar a varredura com buracos
      const skip = q.receive(seed % 3, 'x', { ...ctx, rng: new Rng(seed * 7) }, 0).map((m) => m.token.logicalId);
      const ids = Array.from({ length: n }, (_, i) => i + 1).filter((id) => !skip.includes(id));
      const got = q.receive(max, 'c', { ...ctx, rng: new Rng(seed) }, 0).map((m) => m.token.logicalId);
      expect(got, `seed ${seed}`).toEqual(eagerReceive(ids, max, new Rng(seed)));
    }
  });

  it('contadores acompanham delay, voo, expiração e remoção', () => {
    const q = new SqsQueue('q', defaultQueue({ delaySeconds: 2, visibilityTimeout: 5 }));
    const ctx = context(new Rng(1));
    for (let i = 1; i <= 4; i++) q.enqueue(token(i), ctx, 0);
    expect(q.counts(0)).toEqual({ visible: 0, inFlight: 0, delayed: 4, total: 4 });
    ctx.now = 2000;
    const got = q.receive(3, 'c', ctx, 0);
    expect(q.counts(2000)).toEqual({ visible: 1, inFlight: 3, delayed: 0, total: 4 });
    expect(q.delete(got[0].receipt!)).not.toBeNull();
    expect(q.delete(got[0].receipt!)).toBeNull();
    ctx.now = 7000;
    q.tick(ctx);
    expect(q.counts(7000)).toEqual({ visible: 3, inFlight: 0, delayed: 0, total: 3 });
    // receipt antigo ainda apaga enquanto ninguém recebeu de novo
    expect(q.delete(got[1].receipt!)).not.toBeNull();
    expect(q.size).toBe(2);
  });

  it('FIFO entrega por grupo e bloqueia o grupo com mensagem em voo', () => {
    const q = new SqsQueue('q', defaultQueue({ fifo: true }));
    const ctx = context(new Rng(1));
    const groups = ['A', 'B', 'A', 'C', 'B', 'A'];
    groups.forEach((g, i) => q.enqueue(token(i + 1, g), ctx, 0));
    const first = q.receive(2, 'c', ctx, 0).map((m) => m.token.logicalId);
    expect(first).toEqual([1, 2]); // A1, B2
    const second = q.receive(10, 'c', ctx, 0).map((m) => m.token.logicalId);
    expect(second).toEqual([4]); // A e B bloqueados, sobra C
  });

  it('suporta muitas mensagens sem varrer a fila a cada recebimento', () => {
    const q = new SqsQueue('q', defaultQueue());
    const ctx = context(new Rng(1));
    for (let i = 1; i <= 50000; i++) q.enqueue(token(i), ctx, 0);
    const t0 = performance.now();
    for (let k = 0; k < 2000; k++) {
      for (const m of q.receive(10, 'c', ctx, 0)) q.delete(m.receipt!);
    }
    expect(q.size).toBe(30000);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
