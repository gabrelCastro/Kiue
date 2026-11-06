import { api, ApiError } from '../api/http';
import type { AuthStore } from '../auth/store';
import { loadLocalRead, saveLocalRead, type ReadSink, type StudyState } from '../study/state';

const RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
const pendingKey = (userId: string) => `kiue:pending-study:${userId}`;
/** Última cópia dos lidos da conta: a apostila aparece certa sem esperar o servidor. */
const cacheKey = (userId: string) => `kiue:account-study:${userId}`;

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, ids: Iterable<string>): void {
  try {
    const list = [...ids];
    if (list.length) localStorage.setItem(key, JSON.stringify(list));
    else localStorage.removeItem(key);
  } catch {
    // sem storage: fica só na memória
  }
}

/**
 * Liga os capítulos lidos à conta, no mesmo molde do progresso das fases (`progress-sync.ts`):
 *
 * - Visitante: lidos neste navegador.
 * - Ao entrar: os lidos de visitante deste navegador vão para a conta e saem do navegador.
 * - Logado: cada capítulo marcado vai para o servidor; se a rede falhar, fica pendente (também no
 *   navegador) e é reenviado depois. O servidor faz a união, então reenviar nunca estraga nada.
 */
export class StudySync implements ReadSink {
  private userId: string | null = null;
  private pending = new Set<string>();
  private inflight = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly study: StudyState,
    private readonly auth: AuthStore,
  ) {
    auth.subscribe(() => this.onAuth());
    window.addEventListener('online', () => void this.flush());
    this.onAuth();
  }

  private onAuth(): void {
    const id = this.auth.status === 'signed-in' ? (this.auth.user?.id ?? null) : null;
    if (id === this.userId || this.auth.status === 'loading') return;
    this.userId = id;
    this.attempt = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (id) void this.attach(id);
    else {
      this.pending.clear();
      this.study.readSink = { save: () => saveLocalRead(this.study.read) };
      this.study.setRead(loadLocalRead());
    }
  }

  private async attach(userId: string): Promise<void> {
    this.study.readSink = this;
    const guest = loadLocalRead();
    this.pending = new Set([...read(pendingKey(userId)), ...guest]);
    // enquanto o servidor não responde, mostra o que já se sabe (cópia local + pendente)
    this.study.setRead([...read(cacheKey(userId)), ...this.pending]);
    this.inflight = true;
    try {
      const upload = [...this.pending];
      const { read: server } = upload.length
        ? await api<{ read: string[] }>('PATCH', '/study-progress', { read: upload })
        : await api<{ read: string[] }>('GET', '/study-progress');
      if (this.userId !== userId) return; // trocou de conta no meio do caminho
      this.settle(userId, upload);
      if (guest.length) saveLocalRead([]);
      this.accept(userId, server);
    } catch (e) {
      if (this.userId !== userId) return;
      // os lidos de visitante já estão no pendente: podem sair do navegador sem se perder
      if (guest.length) saveLocalRead([]);
      write(pendingKey(userId), this.pending);
      this.retryLater(e);
    } finally {
      this.inflight = false;
    }
    if (this.userId === userId && this.pending.size && !this.retryTimer) void this.flush();
  }

  save(ids: string[]): void {
    if (!this.userId) return;
    for (const id of ids) this.pending.add(id);
    write(pendingKey(this.userId), this.pending);
    void this.flush();
  }

  /** Envia o que está pendente; uma gravação por vez. */
  async flush(): Promise<void> {
    const userId = this.userId;
    if (!userId || this.inflight || !this.pending.size) return;
    this.inflight = true;
    const upload = [...this.pending];
    try {
      const { read: server } = await api<{ read: string[] }>('PATCH', '/study-progress', { read: upload });
      if (this.userId !== userId) return;
      this.attempt = 0;
      this.settle(userId, upload);
      this.accept(userId, server);
    } catch (e) {
      if (this.userId === userId) this.retryLater(e);
    } finally {
      this.inflight = false;
    }
    if (this.userId === userId && this.pending.size && !this.retryTimer) void this.flush();
  }

  /** O servidor respondeu: é a versão oficial (mais o que ainda não foi enviado). */
  private accept(userId: string, server: string[]): void {
    write(cacheKey(userId), server);
    this.study.setRead([...server, ...this.pending]);
  }

  private settle(userId: string, sent: string[]): void {
    for (const id of sent) this.pending.delete(id);
    write(pendingKey(userId), this.pending);
  }

  private retryLater(e: unknown): void {
    // sessão caiu: o AuthStore cuida (volta a visitante); o pendente fica guardado para a próxima entrada
    if (e instanceof ApiError && e.code === 'unauthenticated') {
      void this.auth.init();
      return;
    }
    if (e instanceof ApiError && e.status === 400) {
      // formato recusado não melhora tentando de novo: descarta para não travar a fila
      console.error('capítulos lidos recusados pelo servidor', e);
      this.pending.clear();
      if (this.userId) write(pendingKey(this.userId), this.pending);
      return;
    }
    const delay = RETRY_MS[Math.min(this.attempt++, RETRY_MS.length - 1)];
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }
}
