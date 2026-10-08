import { Simulation } from '../../src/sim/engine';
import { consumer, graph, producer, queue, topic } from './helpers';

describe('fila simples', () => {
  it('processa todas as mensagens e termina antes do limite', () => {
    const sim = new Simulation(
      graph([producer('p', { total: 10 }), queue('q'), consumer('c', { processingTime: 0.2 })], [
        ['p', 'q'],
        ['q', 'c'],
      ]),
    );
    sim.runToEnd();
    expect(sim.metrics.produced).toBe(10);
    expect(sim.metrics.processed).toBe(10);
    expect(sim.metrics.lost).toBe(0);
    expect(sim.now).toBeLessThan(sim.durationMs);
  });

  it('produtor sem destino perde as mensagens', () => {
    const sim = new Simulation(graph([producer('p', { total: 3 })], []));
    sim.runToEnd();
    expect(sim.metrics.lost).toBe(3);
  });

  it('produtor ligado direto no consumidor perde mensagens quando ele está ocupado', () => {
    const sim = new Simulation(
      graph([producer('p', { rate: 5, total: 20 }), consumer('c', { processingTime: 1 })], [['p', 'c']]),
    );
    sim.runToEnd();
    expect(sim.metrics.dropped).toBeGreaterThan(0);
    expect(sim.metrics.processed + sim.metrics.dropped).toBe(20);
  });

  it('a fila absorve o pico e nada se perde', () => {
    const sim = new Simulation(
      graph([producer('p', { rate: 5, total: 20 }), queue('q'), consumer('c', { processingTime: 1 })], [
        ['p', 'q'],
        ['q', 'c'],
      ]),
    );
    sim.runToEnd();
    expect(sim.metrics.lost).toBe(0);
    expect(sim.metrics.processed).toBe(20);
    expect(sim.metrics.maxDepth.get('q')).toBeGreaterThan(5);
  });

  it('consumidores concorrentes dividem as mensagens (cada uma vai para um só)', () => {
    const sim = new Simulation(
      graph([producer('p', { rate: 4, total: 40 }), queue('q'), consumer('a'), consumer('b')], [
        ['p', 'q'],
        ['q', 'a'],
        ['q', 'b'],
      ]),
    );
    sim.runToEnd();
    const a = sim.metrics.processedBy.get('a')!.size;
    const b = sim.metrics.processedBy.get('b')!.size;
    expect(a + b).toBe(40);
    expect(a).toBeGreaterThan(5);
    expect(b).toBeGreaterThan(5);
  });
});

describe('visibility timeout e DLQ', () => {
  it('mensagem venenosa sem DLQ volta para a fila indefinidamente', () => {
    const sim = new Simulation(
      graph([producer('p', { total: 5, poisonRate: 1 }), queue('q', { visibilityTimeout: 2 }), consumer('c', { processingTime: 0.2 })], [
        ['p', 'q'],
        ['q', 'c'],
      ]),
      { duration: 30 },
    );
    sim.runToEnd();
    expect(sim.now).toBe(30000);
    expect(sim.metrics.visibilityExpired).toBeGreaterThan(10);
    expect(sim.queues.get('q')!.messages.length).toBe(5);
  });

  it('com maxReceiveCount=3 a mensagem vai para a DLQ após 3 recebimentos', () => {
    const sim = new Simulation(
      graph(
        [
          producer('p', { total: 1, poisonRate: 1 }),
          queue('q', { visibilityTimeout: 1, maxReceiveCount: 3, dlq: 'dlq' }),
          queue('dlq'),
          consumer('c', { processingTime: 0.1, jitter: 0 }),
        ],
        [
          ['p', 'q'],
          ['q', 'c'],
        ],
      ),
    );
    sim.runToEnd();
    const received = sim.events.filter((e) => e.type === 'received');
    expect(received).toHaveLength(3);
    expect(sim.metrics.movedToDlq).toBe(1);
    expect(sim.queues.get('dlq')!.messages).toHaveLength(1);
    expect(sim.finished).toBe(true);
    expect(sim.now).toBeLessThan(sim.durationMs);
  });

  it('visibility menor que o processamento gera processamento duplicado', () => {
    const sim = new Simulation(
      graph(
        [
          producer('p', { total: 6, rate: 2 }),
          queue('q', { visibilityTimeout: 1 }),
          consumer('a', { processingTime: 2, jitter: 0 }),
          consumer('b', { processingTime: 2, jitter: 0 }),
        ],
        [
          ['p', 'q'],
          ['q', 'a'],
          ['q', 'b'],
        ],
      ),
    );
    sim.runToEnd();
    expect(sim.metrics.staleDeletes).toBeGreaterThan(0);
  });

  it('delete com receipt handle antigo falha', () => {
    const sim = new Simulation(graph([queue('q', { visibilityTimeout: 1 })], []));
    const q = sim.queues.get('q')!;
    const ctx = (sim as unknown as { ctx: Parameters<typeof q.receive>[2] }).ctx;
    q.enqueue({ copyId: 1, logicalId: 1, type: 'x', poison: false, groupId: null, seq: 1, dedupId: null, body: '', createdAt: 0, producerId: 'p', sizeKb: 2, s3: false }, ctx, 0);
    const [m1] = q.receive(1, 'c', ctx, 0);
    const old = m1.receipt!;
    sim.advance(1100);
    const [m2] = q.receive(1, 'c', ctx, 0);
    expect(m2.receipt).not.toBe(old);
    expect(q.delete(old)).toBeNull();
    expect(q.delete(m2.receipt!)).not.toBeNull();
  });
});

describe('SNS', () => {
  it('fan-out entrega uma cópia para cada fila', () => {
    const sim = new Simulation(
      graph(
        [producer('p', { total: 10 }), topic('t'), queue('q1'), queue('q2'), consumer('c1'), consumer('c2')],
        [
          ['p', 't'],
          ['t', 'q1'],
          ['t', 'q2'],
          ['q1', 'c1'],
          ['q2', 'c2'],
        ],
      ),
    );
    sim.runToEnd();
    expect(sim.metrics.processedBy.get('c1')!.size).toBe(10);
    expect(sim.metrics.processedBy.get('c2')!.size).toBe(10);
  });

  it('filter policy entrega só os tipos assinados', () => {
    const sim = new Simulation(
      graph(
        [
          producer('p', { total: 30, rate: 3, types: [{ value: 'livro', weight: 1 }, { value: 'roupa', weight: 1 }] }),
          topic('t'),
          queue('q1'),
          consumer('c1', { interest: ['livro'] }),
        ],
        [
          ['p', 't'],
          ['t', 'q1', { tipo: ['livro'] }],
          ['q1', 'c1'],
        ],
      ),
    );
    sim.runToEnd();
    expect(sim.metrics.wrongDelivery).toBe(0);
    const livros = [...sim.metrics.producedInfo.values()].filter((i) => i.type === 'livro').length;
    expect(sim.metrics.processedBy.get('c1')!.size).toBe(livros);
  });
});

describe('FIFO', () => {
  const base = (fifo: boolean, extra: Partial<Parameters<typeof queue>[1]> = {}) =>
    graph(
      [
        producer('p', { total: 60, rate: 4, groups: 3, dedupId: true }),
        queue('q', { fifo, ...extra }),
        consumer('a', { processingTime: 0.6, jitter: 0.6 }),
        consumer('b', { processingTime: 0.6, jitter: 0.6 }),
      ],
      [
        ['p', 'q'],
        ['q', 'a'],
        ['q', 'b'],
      ],
    );

  it('Standard com dois consumidores processa fora de ordem', () => {
    const sim = new Simulation(base(false), { seed: 7 });
    sim.runToEnd();
    expect(sim.metrics.outOfOrder).toBeGreaterThan(0);
  });

  it('FIFO mantém a ordem por grupo', () => {
    const sim = new Simulation(base(true), { seed: 7 });
    sim.runToEnd();
    expect(sim.metrics.outOfOrder).toBe(0);
    expect(sim.metrics.processed).toBe(60);
  });

  it('FIFO sem dedup ID e sem content-based dedup recusa o envio', () => {
    const sim = new Simulation(
      graph([producer('p', { total: 3, groups: 1 }), queue('q', { fifo: true })], [['p', 'q']]),
    );
    sim.runToEnd();
    expect(sim.metrics.sendErrors).toBe(3);
  });

  it('FIFO com content-based dedup descarta retries do produtor', () => {
    const sim = new Simulation(
      graph(
        [producer('p', { total: 30, groups: 2, retryRate: 0.5 }), queue('q', { fifo: true, contentDedup: true }), consumer('c', { processingTime: 0.1 })],
        [
          ['p', 'q'],
          ['q', 'c'],
        ],
      ),
    );
    sim.runToEnd();
    expect(sim.metrics.deduplicated).toBeGreaterThan(0);
    expect(sim.metrics.duplicatesProcessed).toBe(0);
    expect(sim.metrics.processed).toBe(30);
  });

  it('Standard sem idempotência processa duplicatas; idempotente as ignora', () => {
    const mk = (idempotent: boolean) =>
      new Simulation(
        graph([producer('p', { total: 40, rate: 4, retryRate: 0.3 }), queue('q'), consumer('c', { processingTime: 0.1, idempotent })], [
          ['p', 'q'],
          ['q', 'c'],
        ]),
        { standardDupRate: 0.2 },
      );
    const a = mk(false);
    a.runToEnd();
    expect(a.metrics.duplicatesProcessed).toBeGreaterThan(0);
    const b = mk(true);
    b.runToEnd();
    expect(b.metrics.duplicatesProcessed).toBe(0);
    expect(b.metrics.duplicatesIgnored).toBeGreaterThan(0);
  });
});

describe('polling e custo', () => {
  const mk = (waitTime: number) =>
    new Simulation(
      graph([producer('p', { total: 10, rate: 0.1 }), queue('q'), consumer('c', { waitTime, processingTime: 0.2 })], [
        ['p', 'q'],
        ['q', 'c'],
      ]),
      { duration: 120 },
    );

  it('long polling usa muito menos chamadas que short polling', () => {
    const short = mk(0);
    short.runToEnd();
    const long = mk(20);
    long.runToEnd();
    expect(short.metrics.processed).toBe(10);
    expect(long.metrics.processed).toBe(10);
    expect(long.metrics.api.ReceiveMessage * 10).toBeLessThan(short.metrics.api.ReceiveMessage);
  });
});

describe('retenção, delay e indisponibilidade', () => {
  it('mensagens expiram se o consumidor ficar fora mais que a retenção', () => {
    const sim = new Simulation(
      graph(
        [producer('p', { total: 20, rate: 1 }), queue('q', { retention: 60 }), consumer('c', { processingTime: 0.1, outages: [{ from: 0, to: 90 }] })],
        [
          ['p', 'q'],
          ['q', 'c'],
        ],
      ),
      { duration: 200 },
    );
    sim.runToEnd();
    expect(sim.metrics.expired).toBeGreaterThan(0);
  });

  it('delay queue segura a mensagem antes de entregar', () => {
    const sim = new Simulation(
      graph([producer('p', { total: 5 }), queue('q', { delaySeconds: 10 }), consumer('c', { processingTime: 0.1 })], [
        ['p', 'q'],
        ['q', 'c'],
      ]),
    );
    sim.runToEnd();
    expect(sim.metrics.minLatency()).toBeGreaterThanOrEqual(10);
  });
});

describe('determinismo', () => {
  it('mesma seed produz o mesmo log de eventos', () => {
    const g = graph(
      [producer('p', { total: 30, rate: 3, poisonRate: 0.2, retryRate: 0.2 }), queue('q', { visibilityTimeout: 2 }), consumer('c', { failRate: 0.1 })],
      [
        ['p', 'q'],
        ['q', 'c'],
      ],
    );
    const run = () => {
      const s = new Simulation(g, { seed: 99, standardDupRate: 0.1 });
      const log: string[] = [];
      s.onEvent((e) => log.push(`${e.t}:${e.type}:${'token' in e ? e.token.copyId : ''}`));
      s.runToEnd();
      return log.join('|');
    };
    expect(run()).toBe(run());
  });
});
