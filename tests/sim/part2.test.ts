import { Simulation } from '../../src/sim/engine';
import { consumer, graph, lambda, producer, queue, topic } from './helpers';

const lambdaGraph = (l: Parameters<typeof lambda>[1], q: Parameters<typeof queue>[1] = {}, p: Parameters<typeof producer>[1] = {}) =>
  graph([producer('p', { rate: 4, total: 40, ...p }), queue('q', { visibilityTimeout: 20, ...q }), queue('dlq'), lambda('fn', l)], [
    ['p', 'q'],
    ['q', 'fn'],
  ]);

describe('Lambda (event source mapping)', () => {
  it('processa a fila em lotes', () => {
    const sim = new Simulation(lambdaGraph({ maxConcurrency: 2, processingTime: 0.3 }));
    sim.runToEnd();
    expect(sim.metrics.processed).toBe(40);
    expect(sim.metrics.invocations).toBeLessThan(40);
  });

  it('sem ReportBatchItemFailures, uma venenosa devolve o lote inteiro e gera duplicatas', () => {
    const sim = new Simulation(
      lambdaGraph({ maxConcurrency: 2, processingTime: 0.3 }, { maxReceiveCount: 3, dlq: 'dlq' }, { poisonRate: 0.1 }),
      { seed: 3, duration: 200 },
    );
    sim.runToEnd();
    expect(sim.metrics.invocationErrors).toBeGreaterThan(0);
    expect(sim.metrics.duplicatesProcessed).toBeGreaterThan(0);
    const goodInDlq = [...sim.metrics.dlqLogical].filter((id) => !sim.metrics.producedInfo.get(id)!.poison);
    expect(goodInDlq.length).toBeGreaterThan(0);
  });

  it('com ReportBatchItemFailures, só as venenosas voltam', () => {
    const sim = new Simulation(
      lambdaGraph({ maxConcurrency: 2, processingTime: 0.3, reportBatchItemFailures: true }, { maxReceiveCount: 3, dlq: 'dlq' }, { poisonRate: 0.1 }),
      { seed: 3, duration: 200 },
    );
    sim.runToEnd();
    expect(sim.metrics.duplicatesProcessed).toBe(0);
    const info = sim.metrics.producedInfo;
    for (const id of sim.metrics.dlqLogical) expect(info.get(id)!.poison).toBe(true);
    const poison = [...info.values()].filter((i) => i.poison).length;
    expect(sim.metrics.dlqLogical.size).toBe(poison);
  });

  it('escala a concorrência até MaximumConcurrency', () => {
    const sim = new Simulation(lambdaGraph({ maxConcurrency: 7, processingTime: 1, batchSize: 1 }, {}, { rate: 20, total: 100 }));
    sim.runToEnd();
    expect(sim.metrics.peakConcurrency.get('fn')).toBe(7);
  });

  it('sem limite, passa do que o banco aguenta', () => {
    const g = (max: number) => lambdaGraph({ maxConcurrency: max, processingTime: 1, batchSize: 2, dbLimit: 4 }, {}, { rate: 20, total: 100 });
    const a = new Simulation(g(0));
    a.runToEnd();
    expect(a.metrics.dbOverloads).toBeGreaterThan(0);
    const b = new Simulation(g(4));
    b.runToEnd();
    expect(b.metrics.dbOverloads).toBe(0);
    expect(b.metrics.processed).toBe(100);
  });

  it('timeout da função devolve o lote', () => {
    const sim = new Simulation(lambdaGraph({ maxConcurrency: 2, processingTime: 1, batchSize: 10, timeout: 3, jitter: 0 }, { visibilityTimeout: 20 }, { rate: 10, total: 20 }), {
      duration: 30,
    });
    sim.runToEnd();
    expect(sim.events.some((e) => e.type === 'invocation_failed' && e.reason === 'timeout')).toBe(true);
  });
});

describe('heartbeat (ChangeMessageVisibility)', () => {
  const g = (heartbeat: boolean) =>
    graph(
      [producer('p', { rate: 1, total: 20 }), queue('q', { visibilityTimeout: 2 }), consumer('a', { processingTime: 4, jitter: 0, heartbeat }), consumer('b', { processingTime: 4, jitter: 0, heartbeat })],
      [
        ['p', 'q'],
        ['q', 'a'],
        ['q', 'b'],
      ],
    );

  it('sem heartbeat, processamento longo duplica', () => {
    const sim = new Simulation(g(false));
    sim.runToEnd();
    expect(sim.metrics.duplicatesProcessed).toBeGreaterThan(0);
  });

  it('com heartbeat, a mensagem não reaparece enquanto é processada', () => {
    const sim = new Simulation(g(true));
    sim.runToEnd();
    expect(sim.metrics.duplicatesProcessed).toBe(0);
    expect(sim.metrics.visibilityExtensions).toBeGreaterThan(0);
    expect(sim.metrics.api.ChangeMessageVisibility).toBeGreaterThan(0);
  });

  it('se o consumidor cai, a mensagem volta após o timeout curto', () => {
    const sim = new Simulation(
      graph([producer('p', { rate: 1, total: 3 }), queue('q', { visibilityTimeout: 3 }), consumer('a', { processingTime: 5, jitter: 0, heartbeat: true, outages: [{ from: 2, to: 4 }] })], [
        ['p', 'q'],
        ['q', 'a'],
      ]),
    );
    sim.runToEnd();
    expect(sim.metrics.processed).toBe(3);
    expect(sim.metrics.visibilityExpired).toBeGreaterThan(0);
  });
});

describe('SNS → endpoint HTTP', () => {
  const g = (dlq?: string) =>
    graph(
      [producer('p', { rate: 1, total: 20 }), topic('t'), consumer('http', { httpOnly: true, workers: 3, processingTime: 0.2, outages: [{ from: 3, to: 40 }] }), queue('sdlq')],
      [
        ['p', 't'],
        ['t', 'http', undefined, dlq],
      ],
    );

  it('tenta de novo e perde quando acabam os retries', () => {
    const sim = new Simulation(g());
    sim.runToEnd();
    expect(sim.metrics.snsRetries).toBeGreaterThan(0);
    expect(sim.metrics.lost).toBeGreaterThan(0);
  });

  it('com DLQ da assinatura, nada se perde', () => {
    const sim = new Simulation(g('sdlq'));
    sim.runToEnd();
    expect(sim.metrics.lost).toBe(0);
    expect(sim.metrics.snsDlq).toBeGreaterThan(0);
    expect(sim.queues.get('sdlq')!.size).toBe(sim.metrics.snsDlq);
  });

  it('retry entrega quando o endpoint volta a tempo', () => {
    const sim = new Simulation(
      graph([producer('p', { rate: 1, total: 5 }), topic('t'), consumer('http', { httpOnly: true, processingTime: 0.2, outages: [{ from: 0, to: 6 }] })], [
        ['p', 't'],
        ['t', 'http'],
      ]),
    );
    sim.runToEnd();
    expect(sim.metrics.lost).toBe(0);
    expect(sim.metrics.processed).toBe(5);
  });
});

describe('tamanho de mensagem', () => {
  const g = (extendedClient: boolean) =>
    graph([producer('p', { rate: 2, total: 40, largeRate: 0.3, largeKb: 3000, extendedClient }), queue('q'), consumer('c', { processingTime: 0.1 })], [
      ['p', 'q'],
      ['q', 'c'],
    ]);

  it('mensagem acima de 1 MiB é recusada', () => {
    const sim = new Simulation(g(false));
    sim.runToEnd();
    expect(sim.metrics.sendErrors).toBeGreaterThan(0);
  });

  it('Extended Client manda o payload para o S3', () => {
    const sim = new Simulation(g(true));
    sim.runToEnd();
    expect(sim.metrics.sendErrors).toBe(0);
    expect(sim.metrics.s3Puts).toBeGreaterThan(0);
    expect(sim.metrics.processed).toBe(40);
  });

  it('cada bloco de 64 KB conta como uma requisição', () => {
    const sim = new Simulation(graph([producer('p', { total: 1, largeRate: 1, largeKb: 200 }), queue('q')], [['p', 'q']]));
    sim.runToEnd();
    expect(sim.metrics.api.SendMessage).toBe(4);
  });

  it('SNS recusa mensagem acima de 256 KB', () => {
    const sim = new Simulation(graph([producer('p', { total: 1, largeRate: 1, largeKb: 300 }), topic('t')], [['p', 't']]));
    sim.runToEnd();
    expect(sim.metrics.sendErrors).toBe(1);
  });
});
