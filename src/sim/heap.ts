/** Min-heap binário. `less(a, b)` define a prioridade (true = `a` sai antes). */
export class MinHeap<T> {
  readonly items: T[] = [];

  constructor(private readonly less: (a: T, b: T) => boolean) {}

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(a[i], a[parent])) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }

  pop(): T | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }

  /** Remove os itens que não passam em `keep` (para limpar entradas obsoletas). */
  rebuild(keep: (item: T) => boolean): void {
    const kept = this.items.filter(keep);
    this.items.length = 0;
    for (const item of kept) this.push(item);
  }
}

/** Buffer circular de tamanho fixo: guarda os últimos `capacity` itens. */
export class RingBuffer<T> {
  private buf: T[] = [];
  private start = 0;

  constructor(readonly capacity: number) {}

  get length(): number {
    return this.buf.length;
  }

  push(item: T): void {
    if (this.buf.length < this.capacity) {
      this.buf.push(item);
      return;
    }
    this.buf[this.start] = item;
    this.start = (this.start + 1) % this.capacity;
  }

  /** Item `i`, do mais antigo (0) para o mais novo (length - 1). */
  at(i: number): T {
    return this.buf[(this.start + i) % this.buf.length];
  }

  toArray(): T[] {
    return [...this.buf.slice(this.start), ...this.buf.slice(0, this.start)];
  }
}

/**
 * Fila FIFO com remoção pela frente em O(1) amortizado. Serve para timers de prazo fixo
 * (agora + constante): eles vencem na mesma ordem em que entram.
 */
export class Deque<T> {
  private items: T[] = [];
  private head = 0;

  get size(): number {
    return this.items.length - this.head;
  }

  push(item: T): void {
    this.items.push(item);
  }

  peek(): T | undefined {
    return this.head < this.items.length ? this.items[this.head] : undefined;
  }

  shift(): T | undefined {
    if (this.head >= this.items.length) return undefined;
    const item = this.items[this.head++];
    if (this.head === this.items.length) {
      this.items = [];
      this.head = 0;
    } else if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return item;
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = this.head; i < this.items.length; i++) yield this.items[i];
  }
}
