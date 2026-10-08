import type { Controller } from '../game/controller';
import type { Simulation } from '../sim/engine';
import type { GraphNode } from '../sim/types';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const badge = (text: string, cls = '') => `<span class="badge ${cls}">${text}</span>`;

function fmtSeconds(s: number): string {
  if (s >= 86400) return `${+(s / 86400).toFixed(1)} d`;
  if (s >= 3600) return `${+(s / 3600).toFixed(1)} h`;
  if (s >= 60) return `${+(s / 60).toFixed(1)} min`;
  return `${s}s`;
}

/** HTML do rótulo flutuante de uma peça. */
export function describeNode(node: GraphNode, ctrl: Controller, sim: Simulation | null): string {
  const name = `<div class="nl-name">${escapeHtml(node.name)}</div>`;
  const lines: string[] = [];
  const badges: string[] = [];

  switch (node.kind) {
    case 'producer': {
      const cfg = (node as GraphNode<'producer'>).config;
      const p = sim?.producers.get(node.id);
      lines.push(p ? `enviados ${p.emitted}/${cfg.total}` : `${cfg.rate}/s · ${cfg.total} pedidos`);
      if (cfg.groups > 0) badges.push(badge(`${cfg.groups} grupos`));
      if (cfg.poisonRate > 0) badges.push(badge('venenosas', 'bad'));
      if (cfg.retryRate > 0) badges.push(badge('retries', 'warn'));
      break;
    }
    case 'topic': {
      const cfg = (node as GraphNode<'topic'>).config;
      badges.push(badge('SNS', 'sns'));
      if (cfg.fifo) badges.push(badge('FIFO', 'fifo'));
      const subs = ctrl.graph.edges.filter((e) => e.from === node.id).length;
      lines.push(`${subs} assinatura${subs === 1 ? '' : 's'}`);
      break;
    }
    case 'queue': {
      const cfg = (node as GraphNode<'queue'>).config;
      const isDlq = ctrl.graph.nodes.some((n) => n.kind === 'queue' && (n as GraphNode<'queue'>).config.dlq === node.id);
      badges.push(badge('SQS', 'sqs'));
      if (cfg.fifo) badges.push(badge('FIFO', 'fifo'));
      if (isDlq) badges.push(badge('DLQ', 'bad'));
      const q = sim?.queues.get(node.id);
      if (q && sim) {
        const c = q.counts(sim.now);
        let s = `<b>${c.visible}</b> na fila`;
        if (c.inFlight) s += ` · <b>${c.inFlight}</b> em voo`;
        if (c.delayed) s += ` · <b>${c.delayed}</b> atrasadas`;
        lines.push(s);
      } else if (!isDlq) {
        const parts = [`visibility ${fmtSeconds(cfg.visibilityTimeout)}`];
        if (cfg.delaySeconds) parts.push(`delay ${fmtSeconds(cfg.delaySeconds)}`);
        if (cfg.retention !== 345600) parts.push(`retenção ${fmtSeconds(cfg.retention)}`);
        lines.push(parts.join(' · '));
      }
      break;
    }
    case 'consumer': {
      const cfg = (node as GraphNode<'consumer'>).config;
      const c = sim?.consumers.get(node.id);
      if (c && sim) {
        const done = sim.metrics.processedBy.get(node.id)?.size ?? 0;
        const busy = c.workers.filter((w) => w.state === 'processing' || w.state === 'receiving').length;
        lines.push(c.down ? '<span class="down">fora do ar</span>' : `✓ <b>${done}</b> · ${busy}/${c.workers.length} ocupados`);
      } else {
        const parts = [`${cfg.workers} worker${cfg.workers > 1 ? 's' : ''}`, `${cfg.processingTime}s/msg`];
        if (cfg.batchSize > 1) parts.push(`lote ${cfg.batchSize}`);
        parts.push(cfg.waitTime > 0 ? `long poll ${cfg.waitTime}s` : 'short poll');
        lines.push(parts.join(' · '));
      }
      if (cfg.idempotent) badges.push(badge('idempotente', 'ok'));
      if (cfg.interest) badges.push(badge(`só ${cfg.interest.join('/')}`));
      if (cfg.outages.length) badges.push(badge('manutenção', 'warn'));
      break;
    }
  }
  return `${name}${badges.length ? `<div class="nl-badges">${badges.join('')}</div>` : ''}${lines.map((l) => `<div class="nl-line">${l}</div>`).join('')}`;
}
