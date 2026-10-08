import type { Simulation } from '../sim/engine';
import type { Graph, GraphNode } from '../sim/types';

export type Goal =
  | { type: 'processedAll'; consumer?: string }
  | { type: 'noLost' }
  | { type: 'noDuplicates' }
  | { type: 'noOutOfOrder' }
  | { type: 'noWrongDelivery' }
  | { type: 'poisonToDlq' }
  | { type: 'minLatency'; seconds: number }
  | { type: 'maxP95'; seconds: number }
  | { type: 'maxApiCalls'; max: number };

export type GoalStatus = 'ok' | 'fail' | 'pending';

export interface GoalResult {
  goal: Goal;
  label: string;
  status: GoalStatus;
  detail: string;
  /** Explicação quando falha no fim da execução. */
  why?: string;
}

export interface StarTargets {
  p95?: number;
  apiCalls?: number;
}

function consumerName(graph: Graph, id: string | undefined): string {
  if (!id) return 'os consumidores';
  return graph.nodes.find((n) => n.id === id)?.name ?? id;
}

/** Mensagens que o consumidor (ou o conjunto deles) deveria processar. */
function expectedFor(sim: Simulation, consumerId: string | undefined): number[] {
  const interest = consumerId
    ? (sim.nodes.get(consumerId) as GraphNode<'consumer'> | undefined)?.config.interest
    : null;
  const ids: number[] = [];
  for (const info of sim.metrics.producedInfo.values()) {
    if (info.poison) continue;
    if (interest && !interest.includes(info.type)) continue;
    ids.push(info.logicalId);
  }
  return ids;
}

function processedSet(sim: Simulation, consumerId: string | undefined): Set<number> {
  if (consumerId) return sim.metrics.processedBy.get(consumerId) ?? new Set();
  const all = new Set<number>();
  for (const s of sim.metrics.processedBy.values()) for (const id of s) all.add(id);
  return all;
}

export function totalPlanned(graph: Graph): number {
  return graph.nodes
    .filter((n): n is GraphNode<'producer'> => n.kind === 'producer')
    .reduce((s, p) => s + p.config.total, 0);
}

/** Avalia um objetivo. `final` indica que a simulação terminou. */
export function evaluateGoal(goal: Goal, sim: Simulation, graph: Graph, final: boolean): GoalResult {
  const m = sim.metrics;
  const zero = (count: number, label: string, unit: string, why: string): GoalResult => ({
    goal,
    label,
    status: count > 0 ? 'fail' : final ? 'ok' : 'pending',
    detail: count > 0 ? `${count} ${unit}` : 'nenhuma até agora',
    why: count > 0 ? why : undefined,
  });

  switch (goal.type) {
    case 'processedAll': {
      const expected = expectedFor(sim, goal.consumer);
      const done = processedSet(sim, goal.consumer);
      const got = expected.filter((id) => done.has(id)).length;
      const ok = final && got === expected.length && expected.length > 0;
      return {
        goal,
        label: `${consumerName(graph, goal.consumer)} processa${goal.consumer ? '' : 'm'} todos os pedidos${
          goal.consumer && (sim.nodes.get(goal.consumer) as GraphNode<'consumer'>)?.config.interest ? ' que lhe interessam' : ''
        }`,
        status: ok ? 'ok' : final ? 'fail' : 'pending',
        detail: `${got}/${expected.length}`,
        why: final && !ok ? `Faltaram ${expected.length - got} pedidos. Algum ficou parado, foi perdido ou nunca chegou a este consumidor?` : undefined,
      };
    }
    case 'noLost':
      return zero(m.lost, 'Nenhuma mensagem perdida', 'perdidas', 'Mensagens foram perdidas: veja o log (consumidor ocupado, erro de envio ou retenção expirada).');
    case 'noDuplicates':
      return zero(
        m.duplicatesProcessed,
        'Nenhum pedido processado duas vezes',
        'duplicadas',
        'O mesmo pedido gerou efeito duas vezes. Lembre: o SQS Standard é at-least-once e o visibility timeout pode expirar no meio do processamento.',
      );
    case 'noOutOfOrder':
      return zero(m.outOfOrder, 'Nenhum pedido fora de ordem', 'fora de ordem', 'Pedidos do mesmo cliente foram processados fora de ordem.');
    case 'noWrongDelivery':
      return zero(m.wrongDelivery, 'Cada consumidor só recebe o que lhe interessa', 'entregas indevidas', 'Consumidores receberam tipos de pedido que não deveriam.');
    case 'poisonToDlq': {
      const poison = [...m.producedInfo.values()].filter((i) => i.poison);
      const inDlq = poison.filter((i) => m.dlqLogical.has(i.logicalId)).length;
      const ok = final && inDlq === poison.length;
      return {
        goal,
        label: 'Mensagens venenosas vão para a DLQ',
        status: ok ? 'ok' : final ? 'fail' : 'pending',
        detail: `${inDlq}/${poison.length}`,
        why: final && !ok ? 'As mensagens venenosas ficaram voltando para a fila. Configure uma DLQ com maxReceiveCount.' : undefined,
      };
    }
    case 'minLatency': {
      const min = m.minLatency();
      const fail = m.latencies.length > 0 && min < goal.seconds;
      return {
        goal,
        label: `Nenhum pedido processado antes de ${goal.seconds}s`,
        status: fail ? 'fail' : final ? 'ok' : 'pending',
        detail: m.latencies.length ? `mais rápido: ${min.toFixed(1)}s` : '—',
        why: fail ? 'Pedidos foram processados cedo demais (ainda podiam ser cancelados).' : undefined,
      };
    }
    case 'maxP95': {
      const p95 = m.latencyPercentile(95);
      const ok = p95 <= goal.seconds;
      return {
        goal,
        label: `Latência p95 até ${goal.seconds}s`,
        status: final ? (ok && m.latencies.length > 0 ? 'ok' : 'fail') : 'pending',
        detail: `${p95.toFixed(1)}s`,
        why: final && !ok ? 'Os pedidos esperaram demais na fila. Mais consumidores processam em paralelo.' : undefined,
      };
    }
    case 'maxApiCalls': {
      const fail = m.apiCalls > goal.max;
      return {
        goal,
        label: `No máximo ${goal.max} chamadas de API`,
        status: fail ? 'fail' : final ? 'ok' : 'pending',
        detail: `${m.apiCalls}/${goal.max}`,
        why: fail ? 'Chamadas demais: short polling vazio custa dinheiro. Long polling e batch reduzem as chamadas.' : undefined,
      };
    }
  }
}

export interface RunResult {
  goals: GoalResult[];
  passed: boolean;
  stars: number;
  p95: number;
  apiCalls: number;
}

export function evaluateRun(goals: Goal[], targets: StarTargets, sim: Simulation, graph: Graph): RunResult {
  const results = goals.map((g) => evaluateGoal(g, sim, graph, true));
  const passed = results.every((r) => r.status === 'ok');
  const p95 = sim.metrics.latencyPercentile(95);
  const apiCalls = sim.metrics.apiCalls;
  let stars = 0;
  if (passed) {
    stars = 1;
    if (targets.p95 === undefined || p95 <= targets.p95) stars++;
    if (targets.apiCalls === undefined || apiCalls <= targets.apiCalls) stars++;
  }
  return { goals: results, passed, stars, p95, apiCalls };
}
