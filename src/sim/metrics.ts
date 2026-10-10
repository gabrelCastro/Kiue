import type { SimEvent } from './types';

export interface ProducedInfo {
  logicalId: number;
  type: string;
  poison: boolean;
  groupId: string | null;
  seq: number;
  producerId: string;
}

export type ApiName =
  | 'SendMessage'
  | 'Publish'
  | 'ReceiveMessage'
  | 'DeleteMessage'
  | 'DeleteMessageBatch'
  | 'ChangeMessageVisibility'
  | 'ChangeMessageVisibilityBatch';

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
    ChangeMessageVisibility: 0,
    ChangeMessageVisibilityBatch: 0,
  };
  invocations = 0;
  invocationErrors = 0;
  dbOverloads = 0;
  peakConcurrency = new Map<string, number>();
  visibilityExtensions = 0;
  snsRetries = 0;
  snsDlq = 0;
  s3Puts = 0;
  snsDlqLogical = new Set<number>();
  latencies: number[] = [];
  private sortedLatencies: number[] = [];
  private maxLat = -Infinity;
  private minLat = Infinity;
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
        if (e.latency > this.maxLat) this.maxLat = e.latency;
        if (e.latency < this.minLat) this.minLat = e.latency;
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
      case 'invocation_failed':
        this.invocationErrors++;
        if (e.reason === 'db') this.dbOverloads++;
        break;
      case 'scaled':
        if (e.concurrency > (this.peakConcurrency.get(e.node) ?? 0)) this.peakConcurrency.set(e.node, e.concurrency);
        break;
      case 'visibility_extended':
        this.visibilityExtensions += e.count;
        break;
      case 'sns_retry':
        this.snsRetries++;
        break;
      case 'sns_dlq':
        this.snsDlq++;
        this.snsDlqLogical.add(e.token.logicalId);
        break;
      case 's3_put':
        this.s3Puts++;
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

  /**
   * Latências em ordem. A HUD consulta o p95 várias vezes por segundo: em vez de reordenar tudo,
   * ordena só as que chegaram desde a última consulta e intercala (O(n + k log k)).
   */
  private sorted(): number[] {
    const done = this.sortedLatencies;
    const all = this.latencies;
    if (done.length === all.length) return done;
    const fresh = all.slice(done.length).sort((a, b) => a - b);
    const merged = new Array<number>(all.length);
    let i = 0;
    let j = 0;
    let k = 0;
    while (i < done.length && j < fresh.length) merged[k++] = done[i] <= fresh[j] ? done[i++] : fresh[j++];
    while (i < done.length) merged[k++] = done[i++];
    while (j < fresh.length) merged[k++] = fresh[j++];
    this.sortedLatencies = merged;
    return merged;
  }

  /** Percentil de latência em segundos (0 se não houver dados). */
  latencyPercentile(p: number): number {
    if (this.latencies.length === 0) return 0;
    const sorted = this.sorted();
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)] / 1000;
  }

  maxLatency(): number {
    return this.latencies.length ? this.maxLat / 1000 : 0;
  }

  minLatency(): number {
    return this.latencies.length ? this.minLat / 1000 : 0;
  }
}
