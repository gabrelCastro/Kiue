import { api, ApiError } from '../api/http';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: number;
}

/**
 * - `loading`: perguntando ao servidor quem está logado
 * - `guest`: servidor no ar, ninguém logado
 * - `signed-in`: logado
 * - `offline`: sem servidor; o jogo funciona igual, com o progresso só neste navegador
 */
export type AuthStatus = 'loading' | 'guest' | 'signed-in' | 'offline';
export type DialogMode = 'login' | 'register' | 'forgot' | 'reset' | 'account';

export interface DialogState {
  mode: DialogMode;
  /** Token do link de redefinição (modo `reset`). */
  token?: string;
  /** Mensagem de sucesso para mostrar no topo do diálogo. */
  notice?: string;
  /** Por que o diálogo abriu sozinho (ex.: fase que pede conta). */
  reason?: string;
}

type Listener = () => void;

/** Estado de autenticação observável, no mesmo estilo do Controller do jogo. */
export class AuthStore {
  status: AuthStatus = 'loading';
  user: User | null = null;
  dialog: DialogState | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<Pick<AuthStore, 'status' | 'user' | 'dialog'>>): void {
    Object.assign(this, patch);
    for (const fn of this.listeners) fn();
  }

  async init(): Promise<void> {
    try {
      const { user } = await api<{ user: User | null }>('GET', '/auth/session');
      this.set({ status: user ? 'signed-in' : 'guest', user });
    } catch (e) {
      this.set({ status: e instanceof ApiError && e.offline ? 'offline' : 'guest', user: null });
    }
  }

  open(mode: DialogMode, extra: Omit<DialogState, 'mode'> = {}): void {
    this.set({ dialog: { mode, ...extra } });
  }

  close(): void {
    this.set({ dialog: null });
  }

  async login(email: string, password: string): Promise<void> {
    const { user } = await api<{ user: User }>('POST', '/auth/login', { email, password });
    this.set({ status: 'signed-in', user, dialog: null });
  }

  async register(name: string, email: string, password: string): Promise<void> {
    const { user } = await api<{ user: User }>('POST', '/auth/register', { name, email, password });
    this.set({ status: 'signed-in', user, dialog: null });
  }

  /** Sai mesmo se o servidor não responder: o cookie expira sozinho e a interface não fica presa. */
  async logout(): Promise<void> {
    try {
      await api('POST', '/auth/logout');
    } finally {
      this.set({ status: this.status === 'offline' ? 'offline' : 'guest', user: null, dialog: null });
    }
  }

  async logoutOthers(): Promise<number> {
    const { ended } = await this.authed(() => api<{ ended: number }>('POST', '/auth/logout-others'));
    return ended;
  }

  async updateName(name: string): Promise<void> {
    const { user } = await this.authed(() => api<{ user: User }>('PATCH', '/auth/me', { name }));
    this.set({ user });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.authed(() => api('POST', '/auth/password', { currentPassword, newPassword }));
  }

  async requestReset(email: string): Promise<void> {
    await api('POST', '/auth/password-reset/request', { email });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await api('POST', '/auth/password-reset/confirm', { token, newPassword });
    this.set({ status: 'guest', user: null, dialog: { mode: 'login', notice: 'Senha redefinida. Entre com a nova senha.' } });
  }

  async deleteAccount(password: string): Promise<void> {
    await this.authed(() => api('DELETE', '/auth/account', { password }));
    this.set({ status: 'guest', user: null, dialog: null });
  }

  /** Se a sessão caiu no meio do caminho (expirou, foi encerrada em outro aparelho), volta ao login. */
  private async authed<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'unauthenticated') {
        this.set({ status: 'guest', user: null, dialog: { mode: 'login', notice: 'Sua sessão terminou. Entre de novo.' } });
      }
      throw e;
    }
  }
}

export const auth = new AuthStore();
