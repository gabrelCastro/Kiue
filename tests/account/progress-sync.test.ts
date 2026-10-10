import { ProgressSync } from '../../src/account/progress-sync';
import type { AuthStore } from '../../src/auth/store';
import { Controller } from '../../src/game/controller';
import type { Progress } from '../../src/game/save';

/** Servidor de progresso falso: mesmo contrato da API, com uma chave para "cair a rede". */
function fakeServer() {
  const state = { progress: {} as Progress, offline: false, calls: [] as string[] };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    state.calls.push(`${init.method} ${url}`);
    if (state.offline) throw new TypeError('Failed to fetch');
    if (init.method === 'PATCH') {
      const incoming = JSON.parse(init.body as string).progress as Progress;
      for (const [id, p] of Object.entries(incoming)) {
        const prev = state.progress[id];
        state.progress[id] = prev ? { ...prev, stars: Math.max(prev.stars, p.stars), ...(p.quizCorrect !== undefined ? { quizCorrect: Math.max(prev.quizCorrect ?? 0, p.quizCorrect) } : {}) } : p;
      }
    }
    if (init.method === 'DELETE') {
      state.progress = {};
      return new Response(null, { status: 204 });
    }
    return Response.json({ progress: structuredClone(state.progress) });
  });
  return { state, fetch };
}

function fakeAuth(): AuthStore & { signIn(id: string): void; signOut(): void } {
  const listeners = new Set<() => void>();
  const a = {
    status: 'loading',
    user: null as { id: string } | null,
    subscribe: (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn)),
    init: async () => {},
    signIn(id: string) {
      a.status = 'signed-in';
      a.user = { id };
      listeners.forEach((fn) => fn());
    },
    signOut() {
      a.status = 'guest';
      a.user = null;
      listeners.forEach((fn) => fn());
    },
  };
  return a as unknown as AuthStore & { signIn(id: string): void; signOut(): void };
}

let storage: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal('window', { addEventListener: () => {} });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Deixa as promessas pendentes (fetch falso) andarem. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('ProgressSync', () => {
  it('ao entrar, soma o progresso de visitante à conta e limpa o navegador', async () => {
    const server = fakeServer();
    server.state.progress = { i02: { stars: 1 } };
    vi.stubGlobal('fetch', server.fetch);
    storage.set('kiue:progress:v1', JSON.stringify({ i01: { stars: 3 } }));
    const ctrl = new Controller();
    const auth = fakeAuth();
    new ProgressSync(ctrl, auth);

    auth.signIn('u1');
    await settle();
    expect(server.state.progress).toEqual({ i01: { stars: 3 }, i02: { stars: 1 } });
    expect(ctrl.progress).toEqual({ i01: { stars: 3 }, i02: { stars: 1 } });
    expect(storage.get('kiue:progress:v1')).toBe('{}');

    auth.signOut();
    expect(ctrl.progress).toEqual({});
  });

  it('sem rede, guarda a fase concluída e reenvia depois', async () => {
    const server = fakeServer();
    vi.stubGlobal('fetch', server.fetch);
    const ctrl = new Controller();
    const auth = fakeAuth();
    new ProgressSync(ctrl, auth);
    auth.signIn('u1');
    await settle();

    server.state.offline = true;
    ctrl.progressSink.save({ i01: { stars: 2 } }, { i01: { stars: 2 } });
    await settle();
    expect(server.state.progress).toEqual({});
    // o pendente sobrevive a um recarregamento
    expect(JSON.parse(storage.get('kiue:pending-progress:u1')!)).toEqual({ i01: { stars: 2 } });

    server.state.offline = false;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(server.state.progress).toEqual({ i01: { stars: 2 } });
    expect(storage.has('kiue:pending-progress:u1')).toBe(false);
  });

  it('pendente de uma visita anterior é enviado ao entrar de novo', async () => {
    const server = fakeServer();
    vi.stubGlobal('fetch', server.fetch);
    storage.set('kiue:pending-progress:u1', JSON.stringify({ c01: { stars: 1, quizCorrect: 2 } }));
    const ctrl = new Controller();
    const auth = fakeAuth();
    new ProgressSync(ctrl, auth);
    auth.signIn('u1');
    await settle();
    expect(server.state.progress).toEqual({ c01: { stars: 1, quizCorrect: 2 } });
    expect(storage.has('kiue:pending-progress:u1')).toBe(false);
  });

  it('não mistura contas: o pendente de uma não vai para a outra', async () => {
    const server = fakeServer();
    vi.stubGlobal('fetch', server.fetch);
    storage.set('kiue:pending-progress:u1', JSON.stringify({ i05: { stars: 3 } }));
    const ctrl = new Controller();
    const auth = fakeAuth();
    new ProgressSync(ctrl, auth);
    auth.signIn('u2');
    await settle();
    expect(server.state.progress).toEqual({});
    expect(storage.has('kiue:pending-progress:u1')).toBe(true);
  });

  it('apagar o progresso logado apaga no servidor', async () => {
    const server = fakeServer();
    server.state.progress = { i01: { stars: 3 } };
    vi.stubGlobal('fetch', server.fetch);
    const ctrl = new Controller();
    const auth = fakeAuth();
    new ProgressSync(ctrl, auth);
    auth.signIn('u1');
    await settle();
    ctrl.resetProgress();
    await settle();
    expect(server.state.progress).toEqual({});
    expect(server.state.calls.at(-1)).toBe('DELETE /api/progress');
  });

  it('mostra a cópia local do progresso da conta antes de o servidor responder', async () => {
    const server = fakeServer();
    server.state.progress = { i01: { stars: 3 }, i02: { stars: 2 } };
    vi.stubGlobal('fetch', server.fetch);
    const ctrl = new Controller();
    const auth = fakeAuth();
    new ProgressSync(ctrl, auth);
    auth.signIn('u1');
    await settle();
    expect(JSON.parse(storage.get('kiue:account-progress:u1')!)).toEqual({ i01: { stars: 3 }, i02: { stars: 2 } });

    // nova visita: antes da resposta, o menu já tem o progresso
    const ctrl2 = new Controller();
    const auth2 = fakeAuth();
    new ProgressSync(ctrl2, auth2);
    auth2.signIn('u1');
    expect(ctrl2.progress).toEqual({ i01: { stars: 3 }, i02: { stars: 2 } });
    await settle();
    expect(ctrl2.progress).toEqual({ i01: { stars: 3 }, i02: { stars: 2 } });
  });
});
