import type { Rng } from './rng';
import type { QueueConfig, SimEvent, Token } from './types';

export const DEDUP_WINDOW_MS = 5 * 60 * 1000;
/** Probabilidade de a fila Standard inverter duas mensagens vizinhas (ordem best-effort). */
export const STANDARD_REORDER_RATE = 0.15;

export interface QueueMessage {
  token: Token;
  receiveCount: number;
  visibleAt: number;
  sentAt: number;
  receipt: number | null;
  inFlight: boolean;
  receivedBy: string | null;
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

export class SqsQueue {
  messages: QueueMessage[] = [];
  private dedup = new Map<string, number>();

  constructor(
    readonly id: string,
    public config: QueueConfig,
  ) {}

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
    this.messages.push({
      token,
      receiveCount: 0,
      visibleAt: now + this.config.delaySeconds * 1000,
      sentAt,
      receipt: null,
      inFlight: false,
      receivedBy: null,
    });
  }

  isVisible(m: QueueMessage, now: number): boolean {
    return !m.inFlight && m.visibleAt <= now;
  }

  /**
   * ReceiveMessage. Pode mover mensagens para a DLQ (redrive) durante a busca.
   * `shortPollEmptyRate` simula o short polling consultando só parte dos servidores.
   */
  receive(max: number, consumerId: string, ctx: QueueContext, shortPollEmptyRate: number): QueueMessage[] {
    const { now, rng } = ctx;
    const out: QueueMessage[] = [];
    const toDlq: QueueMessage[] = [];

    const exceeded = (m: QueueMessage) =>
      this.config.dlq !== null && m.receiveCount >= this.config.maxReceiveCount;

    if (this.config.fifo) {
      const blocked = new Set<string>();
      for (const m of this.messages) {
        if (m.inFlight) blocked.add(m.token.groupId ?? '');
      }
      for (const m of this.messages) {
        if (out.length >= max) break;
        const g = m.token.groupId ?? '';
        if (blocked.has(g)) continue;
        if (!this.isVisible(m, now)) {
          blocked.add(g);
          continue;
        }
        if (exceeded(m)) {
          toDlq.push(m);
          continue;
        }
        out.push(m);
      }
    } else {
      const visible = this.messages.filter((m) => this.isVisible(m, now));
      if (visible.length > 0 && visible.length < 5 && rng.chance(shortPollEmptyRate)) return [];
      for (let i = 0; i + 1 < visible.length; i++) {
        if (rng.chance(STANDARD_REORDER_RATE)) {
          [visible[i], visible[i + 1]] = [visible[i + 1], visible[i]];
          i++;
        }
      }
      for (const m of visible) {
        if (out.length >= max) break;
        if (exceeded(m)) {
          toDlq.push(m);
          continue;
        }
        out.push(m);
      }
    }

    if (toDlq.length) {
      this.messages = this.messages.filter((m) => !toDlq.includes(m));
      for (const m of toDlq) ctx.moveToDlq(this, m);
    }

    for (const m of out) {
      m.receiveCount++;
      m.receipt = ctx.nextReceipt();
      m.inFlight = true;
      m.receivedBy = consumerId;
      m.visibleAt = now + this.config.visibilityTimeout * 1000;
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
    const idx = this.messages.findIndex((m) => m.receipt === receipt);
    if (idx < 0) return null;
    const [m] = this.messages.splice(idx, 1);
    return m;
  }

  /** Expira visibility timeouts e retenção. */
  tick(ctx: QueueContext): void {
    const { now } = ctx;
    const keep: QueueMessage[] = [];
    for (const m of this.messages) {
      if (now - m.sentAt >= this.config.retention * 1000) {
        ctx.emit({ t: now, type: 'expired', node: this.id, token: m.token });
        continue;
      }
      if (m.inFlight && m.visibleAt <= now) {
        m.inFlight = false;
        m.receivedBy = null;
        ctx.emit({ t: now, type: 'visibility_expired', node: this.id, token: m.token });
      }
      keep.push(m);
    }
    this.messages = keep;
    if (this.dedup.size > 0) {
      for (const [k, until] of this.dedup) if (until <= now) this.dedup.delete(k);
    }
  }

  counts(now: number) {
    let visible = 0;
    let inFlight = 0;
    let delayed = 0;
    for (const m of this.messages) {
      if (m.inFlight) inFlight++;
      else if (m.visibleAt > now) delayed++;
      else visible++;
    }
    return { visible, inFlight, delayed, total: this.messages.length };
  }
}
