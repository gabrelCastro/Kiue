import { api, ApiError } from '../api/http';
import type { AuthStore } from '../auth/store';
import type { Controller } from '../game/controller';
import { loadProgress, localProgress, mergeProgress, saveProgress, type Progress, type ProgressSink } from '../game/save';

const RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
const pendingKey = (userId: string) => `kiue:pending-progress:${userId}`;
/** Última cópia do progresso da conta: o menu aparece certo sem esperar o servidor. */
const cacheKey = (userId: string) => `kiue:account-progress:${userId}`;

function read(key: string): Progress {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Progress) : {};
  } catch {
    return {};
  }
}

function write(key: string, p: Progress): void {
  try {
    if (Object.keys(p).length) localStorage.setItem(key, JSON.stringify(p));
    else localStorage.removeItem(key);
  } catch {
    // sem storage: fica só na memória
  }
}

const readPending = (userId: string) => read(pendingKey(userId));
const writePending = (userId: string, p: Progress) => write(pendingKey(userId), p);

/**
 * Liga o progresso do jogo à conta.
 *
 * - Visitante: progresso neste navegador (como sempre foi).
 * - Ao entrar: o progresso de visitante deste navegador é somado ao da conta e sai do navegador.
 * - Logado: cada fase concluída vai para o servidor. Se a rede falhar, a gravação fica pendente
 *   (também no navegador, para sobreviver a um recarregamento) e é reenviada depois. A mesclagem do
 *   servidor fica com o melhor resultado, então reenviar nunca estraga nada.
 */
export class ProgressSync implements ProgressSink {
  private userId: string | null = null;
  private pending: Progress = {};
  private inflight = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctrl: Controller,
    private readonly auth: AuthStore,
  ) {
    auth.subscribe(() => this.onAuth());
    window.addEventListener('online', () => this.flush());
    this.onAuth();
  }

  private onAuth(): void {
    const id = this.auth.status === 'signed-in' ? (this.auth.user?.id ?? null) : null;
    if (id === this.userId || this.auth.status === 'loading') return;
    this.userId = id;
    this.attempt = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (id) void this.attach(id);
    else {
      this.pending = {};
      this.ctrl.progressSink = localProgress;
      this.ctrl.setProgress(loadProgress());
    }
  }

  private async attach(userId: string): Promise<void> {
    this.ctrl.progressSink = this;
    this.inflight = true; // fases concluídas durante a carga esperam a resposta e vão depois
    try {
      await this.load(userId);
    } finally {
      this.inflight = false;
    }
    if (this.userId === userId && !this.retryTimer) void this.flush();
  }

  private async load(userId: string): Promise<void> {
    const guest = loadProgress();
    this.pending = mergeProgress(readPending(userId), guest);
    // enquanto o servidor não responde, mostra o que já se sabe (cópia local + pendente)
    this.ctrl.setProgress(mergeProgress(read(cacheKey(userId)), this.pending));
    try {
      const upload = this.pending;
      const { progress } = Object.keys(upload).length
        ? await api<{ progress: Progress }>('PATCH', '/progress', { progress: upload })
        : await api<{ progress: Progress }>('GET', '/progress');
      if (this.userId !== userId) return; // trocou de conta no meio do caminho
      this.settle(userId, upload);
      if (Object.keys(guest).length) {
        saveProgress({});
        this.ctrl.flash('O progresso deste navegador foi adicionado à sua conta.', 'info');
      }
      this.accept(userId, progress);
    } catch (e) {
      if (this.userId !== userId) return;
      // o progresso de visitante já está no pendente: pode sair do navegador sem se perder
      if (Object.keys(guest).length) saveProgress({});
      writePending(userId, this.pending);
      this.retryLater(e);
    }
  }

  save(_all: Progress, changed: Progress): void {
    if (!this.userId) return;
    this.pending = mergeProgress(this.pending, changed);
    writePending(this.userId, this.pending);
    void this.flush();
  }

  clear(): void {
    const userId = this.userId;
    if (!userId) return;
    this.pending = {};
    writePending(userId, {});
    write(cacheKey(userId), {});
    api('DELETE', '/progress').catch((e) => {
      if (this.userId === userId) this.ctrl.flash(e instanceof ApiError ? e.message : 'Não foi possível apagar o progresso.', 'error');
    });
  }

  /** Envia o que está pendente; uma gravação por vez. */
  async flush(): Promise<void> {
    const userId = this.userId;
    if (!userId || this.inflight || !Object.keys(this.pending).length) return;
    this.inflight = true;
    const upload = this.pending;
    try {
      const { progress } = await api<{ progress: Progress }>('PATCH', '/progress', { progress: upload });
      if (this.userId !== userId) return;
      this.attempt = 0;
      this.settle(userId, upload);
      this.accept(userId, progress);
    } catch (e) {
      if (this.userId === userId) this.retryLater(e);
    } finally {
      this.inflight = false;
    }
    if (this.userId === userId && Object.keys(this.pending).length && !this.retryTimer) void this.flush();
  }

  /** O servidor respondeu: é a versão oficial (mais o que ainda não foi enviado). */
  private accept(userId: string, progress: Progress): void {
    write(cacheKey(userId), progress);
    this.ctrl.setProgress(mergeProgress(progress, this.pending));
  }

  /** Tira do pendente o que já foi aceito (a não ser que tenha melhorado nesse meio-tempo). */
  private settle(userId: string, sent: Progress): void {
    const rest: Progress = {};
    for (const [id, p] of Object.entries(this.pending)) {
      const s = sent[id];
      if (!s || p.stars > s.stars || (p.quizCorrect ?? -1) > (s.quizCorrect ?? -1)) rest[id] = p;
    }
    this.pending = rest;
    writePending(userId, rest);
  }

  private retryLater(e: unknown): void {
    // sessão caiu: o AuthStore cuida (volta a visitante); o pendente fica guardado para a próxima entrada
    if (e instanceof ApiError && e.code === 'unauthenticated') {
      void this.auth.init();
      return;
    }
    if (e instanceof ApiError && e.status === 400) {
      // formato recusado não melhora tentando de novo: descarta para não travar a fila
      console.error('progresso recusado pelo servidor', e);
      this.pending = {};
      if (this.userId) writePending(this.userId, {});
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
