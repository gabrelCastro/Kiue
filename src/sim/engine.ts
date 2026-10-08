import { matchesFilterPolicy } from './filter';
import { Metrics, type ApiName } from './metrics';
import { DEDUP_WINDOW_MS, SqsQueue, type QueueContext, type QueueMessage } from './queue';
import { Rng } from './rng';
import {
  DEFAULT_SIM_OPTIONS,
  type ConsumerConfig,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type ProducerConfig,
  type SimEvent,
  type SimOptions,
  type Token,
  type TopicConfig,
} from './types';

export const TICK_MS = 50;
export const DELIVER_MS = 500;
export const RECEIVE_MS = 300;
export const RETRY_DELAY_MS = 400;
/** Intervalo do loop de short polling de um worker (um `while(true)` sem sleep, limitado pela rede). */
export const SHORT_POLL_INTERVAL_MS = 200;
const EVENT_LOG_CAP = 400;

export type TransitKind = 'deliver' | 'receive' | 'dlq';

export interface Transit {
  id: number;
  token: Token;
  from: string;
  to: string;
  start: number;
  end: number;
  kind: TransitKind;
}

interface PendingSend {
  at: number;
  token: Token;
}

export interface ProducerState {
  node: GraphNode<'producer'>;
  emitted: number;
  acc: number;
  seqByGroup: Map<string, number>;
  pending: PendingSend[];
}

export interface TopicState {
  node: GraphNode<'topic'>;
  dedup: Map<string, number>;
}

export type WorkerState = 'idle' | 'polling' | 'receiving' | 'processing' | 'down';

export interface BatchItem {
  token: Token;
  receipt: number | null;
  ok: boolean;
}

export interface Worker {
  state: WorkerState;
  until: number;
  start: number;
  nextPollAt: number;
  batch: BatchItem[];
  index: number;
}

export interface ConsumerState {
  node: GraphNode<'consumer'>;
  source: GraphNode | null;
  workers: Worker[];
  down: boolean;
  /** Consumidores que leem da mesma fila são instâncias do mesmo serviço e compartilham este estado. */
  service: ServiceState;
}

export interface ServiceState {
  processed: Set<number>;
  maxSeq: Map<string, number>;
}

export class Simulation {
  readonly options: SimOptions;
  readonly rng: Rng;
  readonly metrics = new Metrics();
  now = 0;
  finished = false;
  events: SimEvent[] = [];
  transits: Transit[] = [];
  readonly producers = new Map<string, ProducerState>();
  readonly topics = new Map<string, TopicState>();
  readonly queues = new Map<string, SqsQueue>();
  readonly consumers = new Map<string, ConsumerState>();
  readonly nodes = new Map<string, GraphNode>();
  private outgoing = new Map<string, GraphEdge[]>();
  private services = new Map<string, ServiceState>();
  private dlqIds = new Set<string>();
  private nextCopy = 1;
  private nextLogical = 1;
  private nextReceiptId = 1;
  private nextTransit = 1;
  private listeners: ((e: SimEvent) => void)[] = [];
  private readonly ctx: QueueContext;

  constructor(graph: Graph, options: Partial<SimOptions> = {}) {
    this.options = { ...DEFAULT_SIM_OPTIONS, ...options };
    this.rng = new Rng(this.options.seed);
    const graphCopy: Graph = structuredClone(graph);

    for (const n of graphCopy.nodes) this.nodes.set(n.id, n);
    for (const e of graphCopy.edges) {
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to)) continue;
      const list = this.outgoing.get(e.from) ?? [];
      list.push(e);
      this.outgoing.set(e.from, list);
    }

    for (const n of graphCopy.nodes) {
      switch (n.kind) {
        case 'producer':
          this.producers.set(n.id, {
            node: n as GraphNode<'producer'>,
            emitted: 0,
            acc: 1,
            seqByGroup: new Map(),
            pending: [],
          });
          break;
        case 'topic':
          this.topics.set(n.id, { node: n as GraphNode<'topic'>, dedup: new Map() });
          break;
        case 'queue': {
          const q = new SqsQueue(n.id, (n as GraphNode<'queue'>).config);
          this.queues.set(n.id, q);
          if (q.config.dlq) this.dlqIds.add(q.config.dlq);
          break;
        }
        case 'consumer': {
          const cfg = (n as GraphNode<'consumer'>).config;
          const incoming = graphCopy.edges.find((e) => e.to === n.id);
          const source = incoming ? (this.nodes.get(incoming.from) ?? null) : null;
          const serviceKey = source?.kind === 'queue' ? `q:${source.id}` : `c:${n.id}`;
          let service = this.services.get(serviceKey);
          if (!service) this.services.set(serviceKey, (service = { processed: new Set(), maxSeq: new Map() }));
          this.consumers.set(n.id, {
            node: n as GraphNode<'consumer'>,
            source,
            workers: Array.from({ length: Math.max(1, cfg.workers) }, () => ({
              state: 'idle' as WorkerState,
              until: 0,
              start: 0,
              nextPollAt: 0,
              batch: [],
              index: 0,
            })),
            down: false,
            service,
          });
          break;
        }
      }
    }

    const self = this;
    this.ctx = {
      get now() {
        return self.now;
      },
      rng: this.rng,
      emit: (e) => this.emit(e),
      nextReceipt: () => this.nextReceiptId++,
      cloneToken: (t) => ({ ...t, copyId: this.nextCopy++ }),
      moveToDlq: (from, msg) => this.moveToDlq(from, msg),
    };
  }

  onEvent(fn: (e: SimEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(e: SimEvent) {
    this.metrics.record(e);
    this.events.push(e);
    if (this.events.length > EVENT_LOG_CAP) this.events.splice(0, this.events.length - EVENT_LOG_CAP);
    for (const l of this.listeners) l(e);
  }

  private call(api: ApiName) {
    this.metrics.call(api);
  }

  get durationMs() {
    return this.options.duration * 1000;
  }

  /** Avança um passo fixo. */
  step(): void {
    if (this.finished) return;
    this.now += TICK_MS;
    for (const p of this.producers.values()) this.tickProducer(p);
    this.tickTransits();
    for (const q of this.queues.values()) {
      q.tick(this.ctx);
      this.metrics.trackDepth(q.id, q.messages.length);
    }
    for (const c of this.consumers.values()) this.tickConsumer(c);
    if (this.now >= this.durationMs || this.isSettled()) this.finished = true;
  }

  /** Avança até `ms` de tempo de jogo (ou até terminar). */
  advance(ms: number): void {
    const target = this.now + ms;
    while (!this.finished && this.now + TICK_MS <= target) this.step();
  }

  runToEnd(): void {
    while (!this.finished) this.step();
  }

  // ───────────────────────── Produtores ─────────────────────────

  private rateAt(cfg: ProducerConfig, tSec: number): number {
    let rate = cfg.rate;
    for (const b of cfg.bursts) {
      if (tSec >= b.at && tSec < b.at + b.duration) rate *= b.multiplier;
    }
    return rate;
  }

  private tickProducer(p: ProducerState) {
    const cfg = p.node.config;
    const tSec = this.now / 1000;
    if (tSec >= cfg.startAt && p.emitted < cfg.total) {
      p.acc += (this.rateAt(cfg, tSec) * TICK_MS) / 1000;
      while (p.acc >= 1 && p.emitted < cfg.total) {
        p.acc -= 1;
        this.produce(p);
      }
    }
    if (p.pending.length) {
      const due = p.pending.filter((s) => s.at <= this.now);
      p.pending = p.pending.filter((s) => s.at > this.now);
      for (const s of due) this.send(p, s.token, true);
    }
  }

  private produce(p: ProducerState) {
    const cfg = p.node.config;
    p.emitted++;
    const logicalId = this.nextLogical++;
    let groupId: string | null = null;
    if (cfg.groups > 0) {
      const idx = Math.floor(this.rng.next() * cfg.groups);
      groupId = `cliente-${String.fromCharCode(65 + idx)}`;
    }
    const seqKey = groupId ?? '';
    const seq = (p.seqByGroup.get(seqKey) ?? 0) + 1;
    p.seqByGroup.set(seqKey, seq);
    const type = cfg.types.length ? this.rng.weighted(cfg.types).value : 'pedido';
    const poison = this.rng.chance(cfg.poisonRate);
    const token: Token = {
      copyId: this.nextCopy++,
      logicalId,
      type,
      poison,
      groupId,
      seq,
      dedupId: cfg.dedupId ? `pedido-${logicalId}` : null,
      body: JSON.stringify({ pedido: logicalId, tipo: type, seq }),
      createdAt: this.now,
      producerId: p.node.id,
    };
    this.send(p, token, false);
    if (this.rng.chance(cfg.retryRate)) {
      p.pending.push({ at: this.now + RETRY_DELAY_MS, token: { ...token, copyId: this.nextCopy++ } });
    }
  }

  private send(p: ProducerState, token: Token, retry: boolean) {
    const id = p.node.id;
    this.emit({ t: this.now, type: 'produced', node: id, token, retry });
    const edge = this.outgoing.get(id)?.[0];
    const target = edge ? this.nodes.get(edge.to) : undefined;
    if (!target) {
      this.emit({ t: this.now, type: 'send_error', node: id, target: '', token, reason: 'produtor sem destino' });
      return;
    }
    if (target.kind === 'queue') {
      this.call('SendMessage');
      const res = this.queues.get(target.id)!.validateSend(token);
      if (!res.ok) {
        this.emit({ t: this.now, type: 'send_error', node: id, target: target.id, token, reason: res.reason });
        return;
      }
    } else if (target.kind === 'topic') {
      this.call('Publish');
      const res = this.validatePublish(this.topics.get(target.id)!.node.config, token);
      if (!res.ok) {
        this.emit({ t: this.now, type: 'send_error', node: id, target: target.id, token, reason: res.reason });
        return;
      }
    }
    this.startTransit(token, id, target.id, 'deliver', DELIVER_MS);
  }

  private validatePublish(cfg: TopicConfig, token: Token): { ok: true } | { ok: false; reason: string } {
    if (!cfg.fifo) return { ok: true };
    if (!token.groupId) return { ok: false, reason: 'tópico FIFO exige MessageGroupId' };
    if (!token.dedupId && !cfg.contentDedup)
      return { ok: false, reason: 'tópico FIFO exige MessageDeduplicationId ou ContentBasedDeduplication' };
    return { ok: true };
  }

  // ───────────────────────── Trânsito ─────────────────────────

  private startTransit(token: Token, from: string, to: string, kind: TransitKind, duration: number) {
    this.transits.push({ id: this.nextTransit++, token, from, to, start: this.now, end: this.now + duration, kind });
  }

  private tickTransits() {
    if (!this.transits.length) return;
    const arrived: Transit[] = [];
    this.transits = this.transits.filter((t) => {
      if (t.end <= this.now) {
        arrived.push(t);
        return false;
      }
      return true;
    });
    for (const t of arrived) {
      if (t.kind === 'receive') continue; // só visual; o worker controla o tempo
      const target = this.nodes.get(t.to);
      if (!target) continue;
      if (target.kind === 'queue') {
        const q = this.queues.get(target.id)!;
        if (t.kind === 'dlq') {
          q.enqueue(t.token, this.ctx, 0, t.token.createdAt);
        } else {
          q.enqueue(t.token, this.ctx, this.options.standardDupRate);
        }
      } else if (target.kind === 'topic') {
        this.publish(this.topics.get(target.id)!, t.token);
      } else if (target.kind === 'consumer') {
        this.push(this.consumers.get(target.id)!, t.token);
      }
    }
  }

  // ───────────────────────── SNS ─────────────────────────

  private publish(topic: TopicState, token: Token) {
    const cfg = topic.node.config;
    const id = topic.node.id;
    let dedupId = token.dedupId;
    if (cfg.fifo) {
      const key = dedupId ?? `body:${token.body}`;
      const until = topic.dedup.get(key);
      if (until !== undefined && until > this.now) {
        this.emit({ t: this.now, type: 'deduplicated', node: id, token });
        return;
      }
      topic.dedup.set(key, this.now + DEDUP_WINDOW_MS);
      dedupId = key;
    }
    this.emit({ t: this.now, type: 'published', node: id, token });
    for (const edge of this.outgoing.get(id) ?? []) {
      if (!matchesFilterPolicy(edge.filterPolicy, { tipo: token.type })) {
        this.emit({ t: this.now, type: 'filtered', node: id, edge: edge.id, target: edge.to, token });
        continue;
      }
      const copy: Token = { ...token, copyId: this.nextCopy++, dedupId };
      this.startTransit(copy, id, edge.to, 'deliver', DELIVER_MS);
    }
  }

  // ───────────────────────── DLQ ─────────────────────────

  private moveToDlq(from: SqsQueue, msg: QueueMessage) {
    const dlqId = from.config.dlq!;
    this.emit({
      t: this.now,
      type: 'moved_to_dlq',
      node: from.id,
      dlq: dlqId,
      token: msg.token,
      receiveCount: msg.receiveCount,
    });
    if (this.queues.has(dlqId)) this.startTransit(msg.token, from.id, dlqId, 'dlq', DELIVER_MS);
  }

  // ───────────────────────── Consumidores ─────────────────────────

  private inOutage(cfg: ConsumerConfig): boolean {
    const t = this.now / 1000;
    return cfg.outages.some((o) => t >= o.from && t < o.to);
  }

  /** Entrega síncrona (produtor ligado direto no consumidor). */
  private push(c: ConsumerState, token: Token) {
    const w = c.down ? undefined : c.workers.find((w) => w.state === 'idle');
    if (!w) {
      this.emit({ t: this.now, type: 'dropped', node: c.node.id, token });
      return;
    }
    w.batch = [{ token, receipt: null, ok: false }];
    w.index = 0;
    this.startProcessing(c, w);
  }

  private tickConsumer(c: ConsumerState) {
    const cfg = c.node.config;
    const down = this.inOutage(cfg);
    if (down && !c.down) {
      c.down = true;
      this.emit({ t: this.now, type: 'outage_start', node: c.node.id });
      for (const w of c.workers) {
        if (w.state === 'processing' || w.state === 'receiving') {
          const item = w.batch[w.index];
          if (item) {
            this.emit({ t: this.now, type: 'process_failed', node: c.node.id, token: item.token, reason: 'outage' });
            if (item.receipt === null) this.metrics.lose(item.token.logicalId);
          }
        }
        w.state = 'down';
        w.batch = [];
      }
    } else if (!down && c.down) {
      c.down = false;
      this.emit({ t: this.now, type: 'outage_end', node: c.node.id });
      for (const w of c.workers) {
        w.state = 'idle';
        w.nextPollAt = this.now;
      }
    }
    if (c.down) return;

    const queue = c.source?.kind === 'queue' ? this.queues.get(c.source.id) : undefined;
    for (const w of c.workers) {
      switch (w.state) {
        case 'idle':
          if (queue && this.now >= w.nextPollAt) {
            this.call('ReceiveMessage');
            const shortPoll = cfg.waitTime <= 0;
            const msgs = queue.receive(this.batchSize(cfg), c.node.id, this.ctx, shortPoll ? this.options.shortPollEmptyRate : 0);
            if (msgs.length) this.startReceive(c, w, queue, msgs);
            else if (!shortPoll) {
              w.state = 'polling';
              w.until = this.now + Math.min(20, cfg.waitTime) * 1000;
            } else {
              this.emit({ t: this.now, type: 'empty_receive', node: c.node.id });
              w.nextPollAt = this.now + SHORT_POLL_INTERVAL_MS;
            }
          }
          break;
        case 'polling':
          if (queue) {
            const msgs = queue.receive(this.batchSize(cfg), c.node.id, this.ctx, 0);
            if (msgs.length) this.startReceive(c, w, queue, msgs);
            else if (this.now >= w.until) {
              this.emit({ t: this.now, type: 'empty_receive', node: c.node.id });
              w.state = 'idle';
              w.nextPollAt = this.now;
            }
          }
          break;
        case 'receiving':
          if (this.now >= w.until) this.startProcessing(c, w);
          break;
        case 'processing':
          if (this.now >= w.until) this.finishItem(c, w, queue);
          break;
      }
    }
  }

  private batchSize(cfg: ConsumerConfig) {
    return Math.max(1, Math.min(10, Math.round(cfg.batchSize)));
  }

  private startReceive(c: ConsumerState, w: Worker, queue: SqsQueue, msgs: QueueMessage[]) {
    w.batch = msgs.map((m) => ({ token: m.token, receipt: m.receipt, ok: false }));
    w.index = 0;
    w.state = 'receiving';
    w.start = this.now;
    w.until = this.now + RECEIVE_MS;
    for (const m of msgs) this.startTransit(m.token, queue.id, c.node.id, 'receive', RECEIVE_MS);
  }

  private startProcessing(c: ConsumerState, w: Worker) {
    const cfg = c.node.config;
    const factor = 1 + cfg.jitter * (this.rng.next() * 2 - 1);
    w.state = 'processing';
    w.start = this.now;
    w.until = this.now + Math.max(TICK_MS, cfg.processingTime * 1000 * factor);
  }

  private finishItem(c: ConsumerState, w: Worker, queue: SqsQueue | undefined) {
    const cfg = c.node.config;
    const item = w.batch[w.index];
    const id = c.node.id;
    if (item.token.poison) {
      this.emit({ t: this.now, type: 'process_failed', node: id, token: item.token, reason: 'poison' });
      if (item.receipt === null) this.metrics.lose(item.token.logicalId);
    } else if (this.rng.chance(cfg.failRate)) {
      this.emit({ t: this.now, type: 'process_failed', node: id, token: item.token, reason: 'error' });
      if (item.receipt === null) this.metrics.lose(item.token.logicalId);
    } else {
      item.ok = true;
      this.applySideEffect(c, item.token);
    }

    w.index++;
    if (w.index < w.batch.length) {
      this.startProcessing(c, w);
      return;
    }

    const toDelete = w.batch.filter((b) => b.ok && b.receipt !== null);
    if (queue && toDelete.length) {
      this.call(toDelete.length > 1 ? 'DeleteMessageBatch' : 'DeleteMessage');
      for (const b of toDelete) {
        const removed = queue.delete(b.receipt!);
        this.emit({ t: this.now, type: removed ? 'deleted' : 'delete_stale', node: queue.id, token: b.token });
      }
    }
    w.batch = [];
    w.state = 'idle';
    w.nextPollAt = this.now;
  }

  private applySideEffect(c: ConsumerState, token: Token) {
    const cfg = c.node.config;
    const id = c.node.id;
    const { processed, maxSeq } = c.service;
    if (processed.has(token.logicalId)) {
      this.emit({ t: this.now, type: cfg.idempotent ? 'duplicate_ignored' : 'duplicate_processed', node: id, token });
      return;
    }
    processed.add(token.logicalId);
    if (cfg.interest && !cfg.interest.includes(token.type)) {
      this.emit({ t: this.now, type: 'wrong_delivery', node: id, token });
    }
    if (token.groupId !== null) {
      const key = `${token.producerId}/${token.groupId ?? ''}`;
      const max = maxSeq.get(key) ?? 0;
      if (token.seq < max) {
        this.emit({ t: this.now, type: 'out_of_order', node: id, token, expectedAfter: max });
      } else maxSeq.set(key, token.seq);
    }
    this.emit({ t: this.now, type: 'processed', node: id, token, latency: this.now - token.createdAt });
  }

  // ───────────────────────── Estado ─────────────────────────

  private isSettled(): boolean {
    for (const p of this.producers.values()) {
      if (p.emitted < p.node.config.total || p.pending.length) return false;
    }
    if (this.transits.length) return false;
    for (const q of this.queues.values()) {
      if (q.messages.length === 0) continue;
      const hasConsumer = [...this.consumers.values()].some((c) => c.source?.id === q.id);
      if (hasConsumer || !this.dlqIds.has(q.id)) return false;
    }
    for (const c of this.consumers.values()) {
      if (c.workers.some((w) => w.state === 'processing' || w.state === 'receiving')) return false;
    }
    return true;
  }

  isDlq(queueId: string): boolean {
    return this.dlqIds.has(queueId);
  }
}
