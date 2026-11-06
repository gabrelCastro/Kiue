import { StudySync } from '../../src/account/study-sync';
import type { AuthStore } from '../../src/auth/store';
import { Controller } from '../../src/game/controller';

/** Servidor falso dos capítulos lidos: união, com uma chave para "cair a rede". */
function fakeServer() {
  const state = { read: new Set<string>(), offline: false, calls: [] as string[] };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    state.calls.push(`${init.method} ${url}`);
    if (state.offline) throw new TypeError('Failed to fetch');
    if (init.method === 'PATCH') for (const id of JSON.parse(init.body as string).read as string[]) state.read.add(id);
    return Response.json({ read: [...state.read].sort() });
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

const settle = () => vi.advanceTimersByTimeAsync(0);

describe('StudySync', () => {
  it('visitante guarda os lidos no navegador', () => {
    const ctrl = new Controller();
    const auth = fakeAuth();
    new StudySync(ctrl.study, auth);
    auth.signOut();
    ctrl.study.markRead('cap01');
    expect(JSON.parse(storage.get('kiue:study-read:v1')!)).toEqual(['cap01']);
  });

  it('ao entrar, soma os lidos de visitante aos da conta e limpa o navegador', async () => {
    const server = fakeServer();
    server.state.read = new Set(['cap02']);
    vi.stubGlobal('fetch', server.fetch);
    storage.set('kiue:study-read:v1', JSON.stringify(['cap01']));
    const ctrl = new Controller();
    const auth = fakeAuth();
    new StudySync(ctrl.study, auth);
    auth.signIn('u1');
    await settle();
    expect([...server.state.read].sort()).toEqual(['cap01', 'cap02']);
    expect([...ctrl.study.read].sort()).toEqual(['cap01', 'cap02']);
    expect(storage.has('kiue:study-read:v1')).toBe(false);
  });

  it('lido sem rede fica pendente e vai quando a rede volta', async () => {
    const server = fakeServer();
    vi.stubGlobal('fetch', server.fetch);
    const ctrl = new Controller();
    const auth = fakeAuth();
    new StudySync(ctrl.study, auth);
    auth.signIn('u1');
    await settle();
    server.state.offline = true;
    ctrl.study.markRead('cap03');
    await settle();
    expect(ctrl.study.read.has('cap03')).toBe(true);
    expect(JSON.parse(storage.get('kiue:pending-study:u1')!)).toEqual(['cap03']);
    server.state.offline = false;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(server.state.read.has('cap03')).toBe(true);
    expect(storage.has('kiue:pending-study:u1')).toBe(false);
  });

  it('ao sair, volta para os lidos de visitante (vazios)', async () => {
    const server = fakeServer();
    server.state.read = new Set(['cap04']);
    vi.stubGlobal('fetch', server.fetch);
    const ctrl = new Controller();
    const auth = fakeAuth();
    new StudySync(ctrl.study, auth);
    auth.signIn('u1');
    await settle();
    expect(ctrl.study.read.has('cap04')).toBe(true);
    auth.signOut();
    expect(ctrl.study.read.size).toBe(0);
  });
});
