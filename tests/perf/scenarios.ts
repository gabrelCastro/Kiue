import { Simulation } from '../../src/sim/engine';
import type { Graph, SimEvent, SimOptions } from '../../src/sim/types';
import { consumer, graph, lambda, producer, queue, topic } from '../sim/helpers';

export interface Scenario {
  name: string;
  graph: Graph;
  options: Partial<SimOptions>;
}

/** Cenários de carga bem acima das fases: expõem custos O(n) por tick. */
export const STRESS: Scenario[] = [
  {
    name: 'standard-backlog',
    graph: graph(
      [
        producer('p', { rate: 400, total: 20000, poisonRate: 0.01, retryRate: 0.02 }),
        queue('q', { dlq: 'dlq', maxReceiveCount: 3, visibilityTimeout: 5 }),
        queue('dlq'),
        consumer('c1', { workers: 10, batchSize: 10, processingTime: 0.05, failRate: 0.05 }),
        consumer('c2', { workers: 10, batchSize: 10, processingTime: 0.05, failRate: 0.05, heartbeat: true }),
        consumer('c3', { workers: 10, batchSize: 1, processingTime: 0.05, waitTime: 0 }),
      ],
      [
        ['p', 'q'],
        ['q', 'c1'],
        ['q', 'c2'],
        ['q', 'c3'],
      ],
    ),
    options: { seed: 7, duration: 900, standardDupRate: 0.02 },
  },
  {
    name: 'fifo-groups',
    graph: graph(
      [
        producer('p', { rate: 300, total: 15000, groups: 26, dedupId: true, retryRate: 0.05, poisonRate: 0.005 }),
        queue('q', { fifo: true, contentDedup: true, dlq: 'dlq', maxReceiveCount: 2, visibilityTimeout: 3 }),
        queue('dlq', { fifo: true }),
        consumer('c', { workers: 20, batchSize: 10, processingTime: 0.02, failRate: 0.02 }),
      ],
      [
        ['p', 'q'],
        ['q', 'c'],
      ],
    ),
    options: { seed: 3, duration: 900 },
  },
  {
    name: 'sns-fanout',
    graph: graph(
      [
        producer('p', {
          rate: 200,
          total: 10000,
          types: [
            { value: 'pedido', weight: 3 },
            { value: 'cancelamento', weight: 1 },
            { value: 'devolucao', weight: 1 },
          ],
        }),
        topic('t'),
        ...Array.from({ length: 6 }, (_, i) => queue(`q${i}`)),
        ...Array.from({ length: 6 }, (_, i) => consumer(`c${i}`, { workers: 8, batchSize: 10, processingTime: 0.03 })),
        consumer('http', { httpOnly: true, workers: 4, processingTime: 0.05, outages: [{ from: 10, to: 20 }] }),
        queue('subdlq'),
      ],
      [
        ['p', 't'],
        ...Array.from({ length: 6 }, (_, i): [string, string, Record<string, string[]>?] => [
          't',
          `q${i}`,
          i % 2 ? { tipo: ['pedido'] } : undefined,
        ]),
        ...Array.from({ length: 6 }, (_, i): [string, string] => [`q${i}`, `c${i}`]),
        ['t', 'http', undefined, 'subdlq'],
      ],
    ),
    options: { seed: 5, duration: 900 },
  },
  {
    name: 'lambda',
    graph: graph(
      [
        producer('p', { rate: 300, total: 15000, poisonRate: 0.01 }),
        queue('q', { dlq: 'dlq', maxReceiveCount: 3, visibilityTimeout: 60 }),
        queue('dlq'),
        lambda('l', { batchSize: 10, processingTime: 0.02, reportBatchItemFailures: true, dbLimit: 15 }),
      ],
      [
        ['p', 'q'],
        ['q', 'l'],
      ],
    ),
    options: { seed: 9, duration: 900 },
  },
];

/** FNV-1a de 32 bits sobre o stream completo de eventos e as métricas finais. */
export function fingerprint(sim: Simulation, events: SimEvent[]): string {
  let h = 0x811c9dc5;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const e of events) {
    const tok = 'token' in e ? `${e.token.copyId}:${e.token.logicalId}` : '';
    const extra = JSON.stringify({ ...e, token: undefined });
    mix(`${tok}|${extra};`);
  }
  const m = sim.metrics;
  const summary = {
    now: sim.now,
    produced: m.produced,
    processed: m.processed,
    lost: m.lost,
    dup: m.duplicatesProcessed,
    ooo: m.outOfOrder,
    dlq: m.movedToDlq,
    api: m.api,
    p95: m.latencyPercentile(95),
    max: m.maxLatency(),
  };
  mix(JSON.stringify(summary));
  return `${(h >>> 0).toString(16)} ${JSON.stringify(summary)}`;
}

export function runScenario(s: Scenario): Simulation {
  const sim = new Simulation(s.graph, s.options);
  sim.runToEnd();
  return sim;
}
