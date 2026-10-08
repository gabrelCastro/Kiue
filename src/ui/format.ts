import type { Graph, SimEvent, Token } from '../sim/types';
import { typeInfo } from '../game/catalog';

export type LogKind = 'ok' | 'bad' | 'warn' | 'info' | 'muted' | 'dlq';

export interface LogLine {
  t: number;
  text: string;
  kind: LogKind;
}

export function msgRef(t: Token): string {
  const group = t.groupId ? ` ${t.groupId} nº${t.seq}` : '';
  return `#${t.logicalId}${group}${t.poison ? ' ☠' : ''}`;
}

/** Converte um evento em uma linha de log em português. `verbose` inclui eventos rotineiros. */
export function describeEvent(e: SimEvent, graph: Graph, verbose: boolean): LogLine | null {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
  const L = (text: string, kind: LogKind): LogLine => ({ t: e.t, text, kind });
  switch (e.type) {
    case 'produced':
      if (e.retry) return L(`${name(e.node)} reenviou ${msgRef(e.token)} (retry de rede)`, 'warn');
      return verbose ? L(`${name(e.node)} enviou ${msgRef(e.token)} (${typeInfo(e.token.type).label.toLowerCase()})`, 'muted') : null;
    case 'send_error':
      return L(`Erro ao enviar ${msgRef(e.token)}: ${e.reason}`, 'bad');
    case 'published':
      return verbose ? L(`${name(e.node)} publicou ${msgRef(e.token)} para os assinantes`, 'muted') : null;
    case 'filtered':
      return verbose ? L(`${name(e.node)} → ${name(e.target)}: ${msgRef(e.token)} barrada pela filter policy`, 'muted') : null;
    case 'deduplicated':
      return L(`${name(e.node)} descartou ${msgRef(e.token)}: duplicata dentro da janela de 5 min`, 'info');
    case 'enqueued':
      return verbose ? L(`${msgRef(e.token)} entrou em ${name(e.node)}`, 'muted') : null;
    case 'sqs_duplicate':
      return L(`${name(e.node)} gerou uma cópia extra de ${msgRef(e.token)} (at-least-once)`, 'warn');
    case 'received':
      if (e.receiveCount > 1) return L(`${name(e.consumer)} recebeu ${msgRef(e.token)} de novo (recebimento nº${e.receiveCount})`, 'warn');
      return verbose ? L(`${name(e.consumer)} recebeu ${msgRef(e.token)} de ${name(e.node)}`, 'muted') : null;
    case 'visibility_expired':
      return L(`${name(e.node)}: visibility timeout de ${msgRef(e.token)} expirou; ela está visível de novo`, 'warn');
    case 'deleted':
      return verbose ? L(`${msgRef(e.token)} apagada de ${name(e.node)}`, 'muted') : null;
    case 'delete_stale':
      return L(`DeleteMessage de ${msgRef(e.token)} falhou: receipt handle antigo (outro consumidor já a recebeu)`, 'warn');
    case 'moved_to_dlq':
      return L(`${name(e.node)} → ${name(e.dlq)}: ${msgRef(e.token)} foi para a DLQ após ${e.receiveCount} recebimentos`, 'dlq');
    case 'expired':
      return L(`${name(e.node)} apagou ${msgRef(e.token)}: passou do período de retenção`, 'bad');
    case 'dropped':
      return L(`${name(e.node)} recusou ${msgRef(e.token)}: ocupado ou fora do ar (perdida)`, 'bad');
    case 'processed':
      return verbose ? L(`${name(e.node)} processou ${msgRef(e.token)} em ${(e.latency / 1000).toFixed(1)}s`, 'ok') : null;
    case 'duplicate_processed':
      return L(`${name(e.node)} processou ${msgRef(e.token)} DE NOVO (efeito duplicado!)`, 'bad');
    case 'duplicate_ignored':
      return L(`${name(e.node)} ignorou ${msgRef(e.token)}: já processado (idempotente)`, 'info');
    case 'out_of_order':
      return L(`${name(e.node)} processou ${msgRef(e.token)} depois do nº${e.expectedAfter}: fora de ordem!`, 'bad');
    case 'wrong_delivery':
      return L(`${name(e.node)} recebeu ${msgRef(e.token)} (${typeInfo(e.token.type).label.toLowerCase()}), que não lhe interessa`, 'bad');
    case 'process_failed':
      if (e.reason === 'outage') return L(`${name(e.node)} caiu no meio de ${msgRef(e.token)}`, 'bad');
      return L(`${name(e.node)} falhou ao processar ${msgRef(e.token)}${e.reason === 'poison' ? ' (mensagem venenosa)' : ''}; não apagou`, 'bad');
    case 'empty_receive':
      return verbose ? L(`${name(e.node)}: ReceiveMessage voltou vazio (e foi cobrado)`, 'muted') : null;
    case 'outage_start':
      return L(`${name(e.node)} saiu do ar`, 'bad');
    case 'outage_end':
      return L(`${name(e.node)} voltou`, 'ok');
    case 'invocation_failed': {
      const why = {
        error: 'uma mensagem lançou erro e o lote inteiro volta para a fila',
        timeout: 'a função estourou o timeout; o lote inteiro volta para a fila',
        db: 'o banco recusou a conexão (conexões demais); o lote volta para a fila',
      }[e.reason];
      return L(`${name(e.node)}: invocação com ${e.size} mensage${e.size === 1 ? 'm' : 'ns'} falhou: ${why}`, 'bad');
    }
    case 'scaled':
      return L(`${name(e.node)}: concorrência agora é ${e.concurrency}`, 'info');
    case 'visibility_extended':
      return verbose ? L(`${name(e.node)} estendeu a visibilidade de ${e.count} mensage${e.count === 1 ? 'm' : 'ns'} (ChangeMessageVisibility)`, 'muted') : null;
    case 'sns_retry':
      return L(`${name(e.node)} → ${name(e.target)}: entrega de ${msgRef(e.token)} falhou; nova tentativa (nº${e.attempt})`, 'warn');
    case 'sns_dlq':
      return L(`${name(e.node)} → ${name(e.target)}: retries esgotados; ${msgRef(e.token)} foi para a DLQ da assinatura (${name(e.dlq)})`, 'dlq');
    case 's3_put':
      return L(`${name(e.node)} guardou o anexo de ${msgRef(e.token)} no S3 e enviou só o ponteiro`, 'info');
  }
}

export function fmtTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
