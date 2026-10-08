import type { SimEvent } from './types';

export interface ProducedInfo {
  logicalId: number;
  type: string;
  poison: boolean;
  groupId: string | null;
  seq: number;
  producerId: string;
}

export type ApiName = 'SendMessage' | 'Publish' | 'ReceiveMessage' | 'DeleteMessage' | 'DeleteMessageBatch';

/** Métricas agregadas a partir do stream de eventos. */
export class Metrics {
  produced = 0;
  sent = 0;
  processed = 0;
  lost = 0;
  dropped = 0;
  expired = 0;
  sendErrors = 0;
  duplicatesProcessed = 0;
  duplicatesIgnored = 0;
  outOfOrder = 0;
  wrongDelivery = 0;
  movedToDlq = 0;
  failures = 0;
  emptyReceives = 0;
  deduplicated = 0;
  staleDeletes = 0;
  visibilityExpired = 0;
  apiCalls = 0;
  api: Record<ApiName, number> = {
    SendMessage: 0,
    Publish: 0,
    ReceiveMessage: 0,
    DeleteMessage: 0,
    DeleteMessageBatch: 0,
  };
  latencies: number[] = [];
  producedInfo = new Map<number, ProducedInfo>();
  processedBy = new Map<string, Set<number>>();
  dlqLogical = new Set<number>();
  lostLogical = new Set<number>();
  maxDepth = new Map<string, number>();

  call(api: ApiName, n = 1) {
    this.api[api] += n;
    this.apiCalls += n;
  }

  record(e: SimEvent) {
    switch (e.type) {
      case 'produced':
        this.sent++;
        if (!e.retry) {
          this.produced++;
          const t = e.token;
          this.producedInfo.set(t.logicalId, {
            logicalId: t.logicalId,
            type: t.type,
            poison: t.poison,
            groupId: t.groupId,
            seq: t.seq,
            producerId: t.producerId,
          });
        }
        break;
      case 'send_error':
        this.sendErrors++;
        this.lose(e.token.logicalId);
        break;
      case 'dropped':
        this.dropped++;
        this.lose(e.token.logicalId);
        break;
      case 'expired':
        this.expired++;
        this.lose(e.token.logicalId);
        break;
      case 'processed': {
        this.processed++;
        this.latencies.push(e.latency);
        let set = this.processedBy.get(e.node);
        if (!set) this.processedBy.set(e.node, (set = new Set()));
        set.add(e.token.logicalId);
        break;
      }
      case 'duplicate_processed':
        this.duplicatesProcessed++;
        break;
      case 'duplicate_ignored':
        this.duplicatesIgnored++;
        break;
      case 'out_of_order':
        this.outOfOrder++;
        break;
      case 'wrong_delivery':
        this.wrongDelivery++;
        break;
      case 'moved_to_dlq':
        this.movedToDlq++;
        this.dlqLogical.add(e.token.logicalId);
        break;
      case 'process_failed':
        this.failures++;
        break;
      case 'empty_receive':
        this.emptyReceives++;
        break;
      case 'deduplicated':
        this.deduplicated++;
        break;
      case 'delete_stale':
        this.staleDeletes++;
        break;
      case 'visibility_expired':
        this.visibilityExpired++;
        break;
    }
  }

  lose(logicalId: number) {
    this.lost++;
    this.lostLogical.add(logicalId);
  }

  trackDepth(queueId: string, depth: number) {
    if (depth > (this.maxDepth.get(queueId) ?? 0)) this.maxDepth.set(queueId, depth);
  }

  /** Percentil de latência em segundos (0 se não houver dados). */
  latencyPercentile(p: number): number {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)] / 1000;
  }

  minLatency(): number {
    if (this.latencies.length === 0) return 0;
    return Math.min(...this.latencies) / 1000;
  }
}
