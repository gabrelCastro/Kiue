import { describe, expect, it } from 'vitest';
import type { Controller } from '../../src/game/controller';
import { describeNode } from '../../src/render/labels';
import type { GraphNode } from '../../src/sim/types';

// o rótulo vira innerHTML: um grafo adulterado (sandbox salvo pela API) não pode injetar HTML
describe('rótulo das peças', () => {
  const ctrl = { graph: { nodes: [], edges: [] } } as unknown as Controller;
  const evil = '<img src=x onerror=alert(1)>';

  it('escapa nome e valores de configuração, mesmo os que deveriam ser números', () => {
    const consumer = {
      id: 'c1',
      kind: 'consumer',
      name: evil,
      x: 0,
      z: 0,
      config: { workers: evil, processingTime: evil, batchSize: evil, waitTime: evil, interest: [evil], outages: [], httpOnly: false, idempotent: false, heartbeat: false },
    } as unknown as GraphNode;
    const producer = { id: 'p1', kind: 'producer', name: 'p', x: 0, z: 0, config: { rate: evil, total: evil, groups: evil, poisonRate: 0, retryRate: 0, largeRate: 0 } } as unknown as GraphNode;
    const lambda = { id: 'l1', kind: 'lambda', name: 'l', x: 0, z: 0, config: { batchSize: evil, timeout: evil, maxConcurrency: evil, dbLimit: evil } } as unknown as GraphNode;
    for (const node of [consumer, producer, lambda]) {
      const html = describeNode(node, ctrl, null, true);
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    }
  });
});
