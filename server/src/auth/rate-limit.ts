/**
 * Limite de tentativas por janela deslizante, em memória. Serve para frear adivinhação de senha e
 * abuso de cadastro/redefinição num único processo. Com várias instâncias (ex.: várias Lambdas),
 * a contagem precisa ir para um armazenamento compartilhado; a interface já isola isso.
 */
export interface RateLimiter {
  /** Segundos até liberar, se a chave já estourou o limite; senão `0`. */
  retryAfter(key: string): number;
  /** Conta uma tentativa (para limites de falha, só as falhas). */
  hit(key: string): void;
  reset(key: string): void;
}

export class SlidingWindowLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string): number[] {
    const since = this.now() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  retryAfter(key: string): number {
    const list = this.recent(key);
    if (list.length < this.limit) return 0;
    return Math.max(1, Math.ceil((list[0] + this.windowMs - this.now()) / 1000));
  }

  hit(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.hits.set(key, list);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Remove chaves velhas para a memória não crescer sem limite. */
  sweep(): void {
    for (const key of [...this.hits.keys()]) this.recent(key);
  }
}
