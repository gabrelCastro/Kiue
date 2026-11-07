// Grafos de carga para as medições (render.spec.ts, profile.spec.ts).
// Grafo pesado no sandbox: SNS → 6 filas com backlog, consumidores lentos e um endpoint HTTPS.
const node = (id: string, kind: string, x: number, z: number, config: object) => ({ id, kind, name: id, x, z, config });
export function heavyGraph() {
  const queues = Array.from({ length: 6 }, (_, i) => i);
  return {
    nodes: [
      node('p', 'producer', -11, 0, {
        rate: 120, total: 20000, startAt: 0, bursts: [], poisonRate: 0.01, groups: 0, dedupId: false, retryRate: 0.02,
        largeRate: 0, largeKb: 2048, extendedClient: false,
        types: [{ value: 'livro', weight: 2 }, { value: 'eletronico', weight: 1 }, { value: 'roupa', weight: 1 }],
      }),
      node('t', 'topic', -6, 0, { fifo: false, contentDedup: false }),
      ...queues.map((i) =>
        node(`q${i}`, 'queue', 0, -7.5 + i * 2.6, {
          fifo: false, visibilityTimeout: 30, delaySeconds: i === 5 ? 3 : 0, retention: 345600, maxReceiveCount: 3, dlq: null, contentDedup: false,
        }),
      ),
      ...queues.map((i) =>
        node(`c${i}`, 'consumer', 7, -7.5 + i * 2.6, {
          workers: 6, batchSize: 10, waitTime: 20, processingTime: 0.25, jitter: 0.2, failRate: 0.02, idempotent: false,
          interest: null, outages: [], heartbeat: false, httpOnly: false,
        }),
      ),
    ],
    edges: [
      { id: 'e-p', from: 'p', to: 't' },
      ...queues.map((i) => ({ id: `e-t${i}`, from: 't', to: `q${i}` })),
      ...queues.map((i) => ({ id: `e-c${i}`, from: `q${i}`, to: `c${i}` })),
    ],
  };
}

