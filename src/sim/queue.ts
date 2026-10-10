import { MinHeap } from './heap';
import type { Rng } from './rng';
import type { QueueConfig, SimEvent, Token } from './types';

export const DEDUP_WINDOW_MS = 5 * 60 * 1000;
/** Probabilidade de a fila Standard inverter duas mensagens vizinhas (ordem best-effort). */
export const STANDARD_REORDER_RATE = 0.15;

/**
 * delayed: ainda no DelaySeconds · visible: pode ser recebida · inflight: recebida, dentro do
 * visibility timeout · removed: apagada, expirada ou movida para a DLQ (só existe como lápide).
 */
export type MessageState = 'delayed' | 'visible' | 'inflight' | 'removed';

export interface QueueMessage {
  token: Token;
  receiveCount: number;
  visibleAt: number;
  sentAt: number;
  receipt: number | null;
  state: MessageState;
  receivedBy: string | null;
  /** Ordem de chegada na fila: define a ordem de entrega. */
  seq: number;
  group: OrderedList | null;
}

export interface QueueContext {
  now: number;
  rng: Rng;
  emit(e: SimEvent): void;
  nextReceipt(): number;
  cloneToken(t: Token): Token;
  moveToDlq(from: SqsQueue, msg: QueueMessage): void;
}

export type SendResult = { ok: true } | { ok: false; reason: string };

/**
 * Lista em ordem de chegada com remoção O(1): o item removido vira lápide e a lista é
 * compactada quando as lápides passam da metade.
 */
export class OrderedList {
  items: QueueMessage[] = [];
  private head = 0;
  private dead = 0;
  /** Mensagens em voo (no FIFO, bloqueiam o grupo). */
  inFlight = 0;

  get live(): number {
    return this.items.length - this.head - this.dead;
  }

  push(m: QueueMessage): void {
    this.items.push(m);
  }

  /** Avisa que um item da lista passou a `removed`. */
  removed(): void {
    this.dead++;
    while (this.head < this.items.length && this.items[this.head].state === 'removed') {
      this.head++;
      this.dead--;
    }
    if (this.head === this.items.length) {
      this.items = [];
      this.head = 0;
      this.dead = 0;
    } else if (this.dead > 32 && this.dead * 2 > this.live) {
      this.items = this.items.slice(this.head).filter((m) => m.state !== 'removed');
      this.head = 0;
      this.dead = 0;
    } else if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
  }

  /** Índice do primeiro item vivo depois de `i` (-1 se não houver). */
  next(i: number): number {
    for (let j = Math.max(i + 1, this.head); j < this.items.length; j++) {
      if (this.items[j].state !== 'removed') return j;
    }
    return -1;
  }
}

interface InFlightTimer {
  msg: QueueMessage;
  visibleAt: number;
  receipt: number;
}

const byVisibleAt = (a: QueueMessage, b: QueueMessage) => a.visibleAt < b.visibleAt || (a.visibleAt === b.visibleAt && a.seq < b.seq);
const bySentAt = (a: QueueMessage, b: QueueMessage) => a.sentAt < b.sentAt || (a.sentAt === b.sentAt && a.seq < b.seq);
const bySeq = (a: { seq: number }, b: { seq: number }) => a.seq - b.seq;

/** Primeiro índice com `seq >= seq` (a lista está em ordem de chegada). */
function lowerBound(items: QueueMessage[], seq: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].seq < seq) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface Cursor {
  list: OrderedList;
  i: number;
  msg: QueueMessage;
}

export class SqsQueue {
  /** Todas as mensagens vivas, em ordem de chegada. */
  private list = new OrderedList();
  /** FIFO: mensagens por MessageGroupId, em ordem de chegada. */
  private groups = new Map<string, OrderedList>();
  private byReceipt = new Map<number, QueueMessage>();
  private count = { delayed: 0, visible: 0, inflight: 0 };
  /** Nenhuma mensagem visível tem `seq` menor que isto: a busca começa daqui. */
  private visibleFloor = 0;
  private nextSeq = 1;

  // Timers. Entradas obsoletas (mensagem já mudou de estado) são descartadas ao sair do heap.
  private delayTimers = new MinHeap<QueueMessage>(byVisibleAt);
  private visibilityTimers = new MinHeap<InFlightTimer>(
    (a, b) => a.visibleAt < b.visibleAt || (a.visibleAt === b.visibleAt && a.msg.seq < b.msg.seq),
  );
  private retentionTimers = new MinHeap<QueueMessage>(bySentAt);
  private staleRetention = 0;

  /** Janela de deduplicação FIFO: as chaves expiram na mesma ordem em que entram. */
  private dedup = new Map<string, number>();
  private dedupOrder: { key: string; until: number }[] = [];
  private dedupHead = 0;

  constructor(
    readonly id: string,
    public config: QueueConfig,
  ) {}

  /** Mensagens na fila (visíveis, atrasadas e em voo). */
  get size(): number {
    return this.list.live;
  }

  /** Validação síncrona do SendMessage (o que a API responderia). */
  validateSend(token: Token): SendResult {
    if (!this.config.fifo) return { ok: true };
    if (!token.groupId) return { ok: false, reason: 'fila FIFO exige MessageGroupId' };
    if (!token.dedupId && !this.config.contentDedup)
      return {
        ok: false,
        reason: 'fila FIFO exige MessageDeduplicationId ou ContentBasedDeduplication',
      };
    return { ok: true };
  }

  private dedupKey(token: Token): string | null {
    if (token.dedupId) return token.dedupId;
    if (this.config.contentDedup) return `body:${token.body}`;
    return null;
  }

  /** Enfileira uma mensagem que chegou. Assume validateSend já aprovado. */
  enqueue(token: Token, ctx: QueueContext, standardDupRate: number, sentAt?: number): void {
    const { now } = ctx;
    if (this.config.fifo) {
      const key = this.dedupKey(token);
      if (key) {
        const until = this.dedup.get(key);
        if (until !== undefined && until > now) {
          ctx.emit({ t: now, type: 'deduplicated', node: this.id, token });
          return;
        }
        this.dedup.set(key, now + DEDUP_WINDOW_MS);
        this.dedupOrder.push({ key, until: now + DEDUP_WINDOW_MS });
      }
    }
    this.push(token, now, sentAt ?? now);
    ctx.emit({ t: now, type: 'enqueued', node: this.id, token });
    if (!this.config.fifo && ctx.rng.chance(standardDupRate)) {
      const copy = ctx.cloneToken(token);
      this.push(copy, now, sentAt ?? now);
      ctx.emit({ t: now, type: 'sqs_duplicate', node: this.id, token: copy });
    }
  }

  private push(token: Token, now: number, sentAt: number) {
    const visibleAt = now + this.config.delaySeconds * 1000;
    const m: QueueMessage = {
      token,
      receiveCount: 0,
      visibleAt,
      sentAt,
      receipt: null,
      state: visibleAt > now ? 'delayed' : 'visible',
      receivedBy: null,
      seq: this.nextSeq++,
      group: null,
    };
    this.count[m.state as 'delayed' | 'visible']++;
    this.list.push(m);
    if (this.config.fifo) {
      const key = token.groupId ?? '';
      let g = this.groups.get(key);
      if (!g) this.groups.set(key, (g = new OrderedList()));
      g.push(m);
      m.group = g;
    }
    if (m.state === 'delayed') this.delayTimers.push(m);
    this.retentionTimers.push(m);
  }

  private setState(m: QueueMessage, state: MessageState) {
    if (m.state !== 'removed') this.count[m.state]--;
    if (state !== 'removed') this.count[state]++;
    if (state === 'visible' && m.seq < this.visibleFloor) this.visibleFloor = m.seq;
    if (m.group) {
      if (m.state === 'inflight') m.group.inFlight--;
      if (state === 'inflight') m.group.inFlight++;
    }
    m.state = state;
  }

  private remove(m: QueueMessage) {
    this.setState(m, 'removed');
    this.list.removed();
    if (m.group) {
      m.group.removed();
      if (m.group.live === 0) this.groups.delete(m.token.groupId ?? '');
    }
    if (m.receipt !== null) this.byReceipt.delete(m.receipt);
    this.staleRetention++;
    if (this.staleRetention > 1024 && this.staleRetention > this.retentionTimers.size / 2) {
      this.retentionTimers.rebuild((x) => x.state !== 'removed');
      this.staleRetention = 0;
    }
  }

  /** Mensagens cujo DelaySeconds acabou passam a visíveis. */
  private promote(now: number) {
    const timers = this.delayTimers;
    while (timers.size && timers.peek()!.visibleAt <= now) {
      const m = timers.pop()!;
      if (m.state === 'delayed') this.setState(m, 'visible');
    }
  }

  /**
   * ReceiveMessage. Pode mover mensagens para a DLQ (redrive) durante a busca.
   * `shortPollEmptyRate` simula o short polling consultando só parte dos servidores.
   */
  receive(max: number, consumerId: string, ctx: QueueContext, shortPollEmptyRate: number): QueueMessage[] {
    const { now, rng } = ctx;
    this.promote(now);
    const out: QueueMessage[] = [];
    const toDlq: QueueMessage[] = [];

    const exceeded = (m: QueueMessage) =>
      this.config.dlq !== null && m.receiveCount >= this.config.maxReceiveCount;

    if (this.config.fifo) {
      // Merge por ordem de chegada das cabeças de cada grupo livre (sem mensagem em voo).
      // Um grupo para na primeira mensagem ainda atrasada: as seguintes esperam por ela.
      const heads = new MinHeap<Cursor>((a, b) => a.msg.seq < b.msg.seq);
      for (const list of this.groups.values()) {
        if (list.inFlight > 0) continue;
        const i = list.next(-1);
        if (i >= 0) heads.push({ list, i, msg: list.items[i] });
      }
      while (out.length < max && heads.size) {
        const c = heads.pop()!;
        if (c.msg.state !== 'visible') continue;
        if (exceeded(c.msg)) toDlq.push(c.msg);
        else out.push(c.msg);
        const i = c.list.next(c.i);
        if (i >= 0) heads.push({ list: c.list, i, msg: c.list.items[i] });
      }
    } else if (this.count.visible > 0) {
      if (this.count.visible < 5 && rng.chance(shortPollEmptyRate)) return [];
      // Ordem best-effort: cada par de vizinhas pode trocar de lugar. A sequência é gerada sob
      // demanda, então só sorteia os pares que podem ser entregues, e não a fila inteira.
      const items = this.list.items;
      const nextVisible = (from: number) => {
        for (let j = from; j < items.length; j++) if (items[j].state === 'visible') return j;
        return -1;
      };
      const take = (m: QueueMessage) => {
        if (exceeded(m)) toDlq.push(m);
        else out.push(m);
      };
      let i = nextVisible(lowerBound(items, this.visibleFloor));
      if (i >= 0) this.visibleFloor = items[i].seq;
      while (i >= 0 && out.length < max) {
        const j = nextVisible(i + 1);
        if (j >= 0 && rng.chance(STANDARD_REORDER_RATE)) {
          take(items[j]);
          if (out.length < max) take(items[i]);
          i = nextVisible(j + 1);
        } else {
          take(items[i]);
          i = j;
        }
      }
    }

    for (const m of toDlq) this.remove(m);
    for (const m of toDlq) ctx.moveToDlq(this, m);

    const visibleAt = now + this.config.visibilityTimeout * 1000;
    for (const m of out) {
      m.receiveCount++;
      if (m.receipt !== null) this.byReceipt.delete(m.receipt);
      m.receipt = ctx.nextReceipt();
      this.byReceipt.set(m.receipt, m);
      this.setState(m, 'inflight');
      m.receivedBy = consumerId;
      m.visibleAt = visibleAt;
      this.visibilityTimers.push({ msg: m, visibleAt, receipt: m.receipt });
      ctx.emit({
        t: now,
        type: 'received',
        node: this.id,
        consumer: consumerId,
        token: m.token,
        receiveCount: m.receiveCount,
      });
    }
    return out;
  }

  /** DeleteMessage: só funciona com o receipt handle mais recente. */
  delete(receipt: number): QueueMessage | null {
    const m = this.byReceipt.get(receipt);
    if (!m) return null;
    this.remove(m);
    return m;
  }

  /** Mensagem em voo com este receipt handle (null se o handle não é o atual ou ela já voltou). */
  inFlight(receipt: number): QueueMessage | null {
    const m = this.byReceipt.get(receipt);
    return m && m.state === 'inflight' ? m : null;
  }

  /**
   * ChangeMessageVisibility: renova o prazo de uma mensagem em voo.
   * Só funciona com o receipt handle atual e enquanto a mensagem ainda está em voo.
   */
  extendVisibility(receipt: number, now: number): boolean {
    const m = this.inFlight(receipt);
    if (!m) return false;
    m.visibleAt = now + this.config.visibilityTimeout * 1000;
    this.visibilityTimers.push({ msg: m, visibleAt: m.visibleAt, receipt });
    return true;
  }

  /** Expira visibility timeouts e retenção (em ordem de chegada, como uma varredura da fila). */
  tick(ctx: QueueContext): void {
    const { now } = ctx;
    this.promote(now);
    const retention = this.config.retention * 1000;
    let expired: QueueMessage[] | null = null;
    let reappeared: QueueMessage[] | null = null;

    const rt = this.retentionTimers;
    while (rt.size && now - rt.peek()!.sentAt >= retention) {
      const m = rt.pop()!;
      if (m.state === 'removed') this.staleRetention--;
      else (expired ??= []).push(m);
    }
    const vt = this.visibilityTimers;
    while (vt.size && vt.peek()!.visibleAt <= now) {
      const { msg, visibleAt, receipt } = vt.pop()!;
      if (msg.state === 'inflight' && msg.receipt === receipt && msg.visibleAt === visibleAt) (reappeared ??= []).push(msg);
    }

    if (expired || reappeared) {
      const gone = new Set(expired);
      const due = [...(expired ?? []), ...(reappeared ?? []).filter((m) => !gone.has(m))].sort(bySeq);
      for (const m of due) {
        if (gone.has(m)) {
          ctx.emit({ t: now, type: 'expired', node: this.id, token: m.token });
          this.remove(m);
        } else {
          this.setState(m, 'visible');
          m.receivedBy = null;
          ctx.emit({ t: now, type: 'visibility_expired', node: this.id, token: m.token });
        }
      }
    }

    const order = this.dedupOrder;
    while (this.dedupHead < order.length && order[this.dedupHead].until <= now) {
      const { key, until } = order[this.dedupHead++];
      if (this.dedup.get(key) === until) this.dedup.delete(key);
    }
    if (this.dedupHead > 1024 && this.dedupHead * 2 > order.length) {
      this.dedupOrder = order.slice(this.dedupHead);
      this.dedupHead = 0;
    }
  }

  counts(now: number) {
    this.promote(now);
    return { visible: this.count.visible, inFlight: this.count.inflight, delayed: this.count.delayed, total: this.size };
  }

  /** Percorre as mensagens que estão na fila (não em voo), em ordem; `fn` devolve false para parar. */
  forEachWaiting(fn: (m: QueueMessage) => boolean | void): void {
    for (const m of this.list.items) {
      if (m.state === 'removed' || m.state === 'inflight') continue;
      if (fn(m) === false) return;
    }
  }
}
