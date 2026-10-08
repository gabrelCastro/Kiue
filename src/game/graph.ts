import type { Graph, GraphEdge, GraphNode, NodeKind } from '../sim/types';

export function findNode(g: Graph, id: string): GraphNode | undefined {
  return g.nodes.find((n) => n.id === id);
}

export function isQueue(n: GraphNode | undefined): n is GraphNode<'queue'> {
  return n?.kind === 'queue';
}

export function isTopic(n: GraphNode | undefined): n is GraphNode<'topic'> {
  return n?.kind === 'topic';
}

/** Explica por que a conexão não é permitida, ou retorna null se ela é válida. */
export function connectionError(g: Graph, fromId: string, toId: string): string | null {
  const from = findNode(g, fromId);
  const to = findNode(g, toId);
  if (!from || !to) return 'Peça não encontrada.';
  if (from.id === to.id) return 'Não dá para ligar uma peça nela mesma.';
  if (g.edges.some((e) => e.from === fromId && e.to === toId)) return 'Essas peças já estão ligadas.';
  if (to.kind === 'producer') return 'O produtor só envia mensagens; nada entrega para ele.';

  switch (from.kind) {
    case 'producer':
      if (g.edges.some((e) => e.from === fromId))
        return 'Um produtor envia para um único destino. Remova a conexão atual primeiro.';
      break;
    case 'topic':
      if (to.kind !== 'queue')
        return 'Neste jogo o SNS entrega para filas SQS. (Na AWS ele também entrega para Lambda, HTTP, e-mail, SMS…)';
      if (from.config.fifo && !(to as GraphNode<'queue'>).config.fifo)
        return 'Tópico SNS FIFO só aceita filas SQS FIFO como assinantes.';
      if (!from.config.fifo && (to as GraphNode<'queue'>).config.fifo)
        return 'Fila FIFO só pode assinar tópico SNS FIFO. Mude o tópico para FIFO.';
      break;
    case 'queue':
      if (to.kind === 'queue')
        return 'Fila não envia para fila. Para usar uma fila como DLQ, selecione a fila de origem e escolha a "Dead-letter queue" no inspetor.';
      if (to.kind !== 'consumer')
        return 'O SQS não empurra mensagens: alguém precisa ler a fila. Ligue a fila a um consumidor.';
      break;
    case 'consumer':
      return 'Consumidores só leem mensagens neste jogo.';
  }

  if (to.kind === 'consumer' && g.edges.some((e) => e.to === toId))
    return 'Um consumidor lê de uma única origem. Remova a conexão atual dele primeiro.';
  return null;
}

/** Filas que podem servir de DLQ para `queueId` (mesmo tipo, Standard ou FIFO). */
export function dlqCandidates(g: Graph, queueId: string): GraphNode<'queue'>[] {
  const q = findNode(g, queueId);
  if (!isQueue(q)) return [];
  return g.nodes.filter(
    (n): n is GraphNode<'queue'> => isQueue(n) && n.id !== queueId && n.config.fifo === q.config.fifo,
  );
}

export interface GraphIssues {
  errors: string[];
  warnings: string[];
}

/** Problemas que impedem (errors) ou merecem aviso (warnings) antes de rodar. */
export function validateGraph(g: Graph): GraphIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const n of g.nodes) {
    if (n.kind === 'queue') {
      const q = n as GraphNode<'queue'>;
      if (q.config.dlq) {
        const dlq = findNode(g, q.config.dlq);
        if (!isQueue(dlq)) errors.push(`${q.name}: a DLQ configurada não existe mais.`);
        else if (dlq.config.fifo !== q.config.fifo)
          errors.push(`${q.name}: a DLQ de uma fila ${q.config.fifo ? 'FIFO' : 'Standard'} precisa ser ${q.config.fifo ? 'FIFO' : 'Standard'}.`);
      }
      const hasConsumer = g.edges.some((e) => e.from === n.id);
      const isDlq = g.nodes.some((o) => o.kind === 'queue' && (o as GraphNode<'queue'>).config.dlq === n.id);
      if (!hasConsumer && !isDlq) warnings.push(`${n.name} não tem consumidor: as mensagens vão ficar paradas.`);
    }
    if (n.kind === 'producer' && !g.edges.some((e) => e.from === n.id))
      warnings.push(`${n.name} não está ligado a nada: tudo o que ele enviar será perdido.`);
    if (n.kind === 'topic' && !g.edges.some((e) => e.from === n.id))
      warnings.push(`${n.name} não tem assinantes: as mensagens publicadas somem.`);
  }
  for (const e of g.edges) {
    const from = findNode(g, e.from);
    const to = findNode(g, e.to);
    if (isTopic(from) && isQueue(to) && from.config.fifo !== to.config.fifo)
      errors.push(`${from.name} → ${to.name}: tópico e fila precisam ser ambos FIFO ou ambos Standard.`);
  }
  return { errors, warnings };
}

export function removeNode(g: Graph, id: string): void {
  g.nodes = g.nodes.filter((n) => n.id !== id);
  g.edges = g.edges.filter((e) => e.from !== id && e.to !== id);
  for (const n of g.nodes) {
    if (n.kind === 'queue' && (n as GraphNode<'queue'>).config.dlq === id) (n as GraphNode<'queue'>).config.dlq = null;
  }
}

export function newId(g: Graph, prefix: string): string {
  let i = 1;
  const ids = new Set([...g.nodes.map((n) => n.id), ...g.edges.map((e) => e.id)]);
  while (ids.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function addEdge(g: Graph, from: string, to: string, extra: Partial<GraphEdge> = {}): GraphEdge {
  const edge: GraphEdge = { id: newId(g, 'e'), from, to, ...extra };
  g.edges.push(edge);
  return edge;
}

export function countKind(g: Graph, kind: NodeKind): number {
  return g.nodes.filter((n) => n.kind === kind).length;
}
