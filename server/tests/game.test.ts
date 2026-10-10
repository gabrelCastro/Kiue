import { SANDBOX_LIMITS } from '../src/game/sandboxes';
import { ALICE, setup } from './helpers';

const BOB = { name: 'Bob', email: 'bob@example.com', password: 'topico-de-eventos' };

async function signedIn(s: ReturnType<typeof setup>, who = ALICE) {
  const b = s.browser();
  expect((await b.post('/auth/register', who)).status).toBe(201);
  return b;
}

const producer = (id: string, x = -7) => ({ id, kind: 'producer', name: 'Produtor', x, z: 0, config: { rate: 1, total: 30 } });
const queue = (id: string, x = 0) => ({ id, kind: 'queue', name: id, x, z: 0, config: { fifo: false, dlq: null } });
const GRAPH = { nodes: [producer('p1'), queue('q1')], edges: [{ id: 'e1', from: 'p1', to: 'q1' }] };

describe('progresso na conta', () => {
  it('exige conta', async () => {
    const s = setup();
    const b = s.browser();
    expect((await b.get('/progress')).status).toBe(401);
    expect((await b.patch('/progress', { progress: { i01: { stars: 1 } } })).status).toBe(401);
  });

  it('mescla guardando o melhor resultado de cada fase', async () => {
    const s = setup();
    const b = await signedIn(s);
    expect((await b.get('/progress')).json).toEqual({ progress: {} });

    let r = await b.patch('/progress', { progress: { i01: { stars: 2 }, i02: { stars: 1, quizCorrect: 2 } } });
    expect(r.status).toBe(200);
    expect(r.json.progress).toEqual({ i01: { stars: 2 }, i02: { stars: 1, quizCorrect: 2 } });

    // resultado pior não apaga o melhor; quiz sem estrela nova ainda conta
    r = await b.patch('/progress', { progress: { i01: { stars: 1, quizCorrect: 3 }, i02: { stars: 3 } } });
    expect(r.json.progress).toEqual({ i01: { stars: 2, quizCorrect: 3 }, i02: { stars: 3, quizCorrect: 2 } });

    // repetir a mesma escrita não muda nada (dá para reenviar depois de uma falha de rede)
    r = await b.patch('/progress', { progress: { i01: { stars: 1, quizCorrect: 3 }, i02: { stars: 3 } } });
    expect(r.json.progress).toEqual({ i01: { stars: 2, quizCorrect: 3 }, i02: { stars: 3, quizCorrect: 2 } });
  });

  it('cada conta vê só o seu progresso, e apagar zera só o dela', async () => {
    const s = setup();
    const alice = await signedIn(s);
    s.setIp('203.0.113.2');
    const bob = await signedIn(s, BOB);
    await alice.patch('/progress', { progress: { i01: { stars: 3 } } });
    await bob.patch('/progress', { progress: { c01: { stars: 1 } } });
    expect((await alice.get('/progress')).json.progress).toEqual({ i01: { stars: 3 } });
    expect((await bob.del('/progress')).status).toBe(204);
    expect((await bob.get('/progress')).json.progress).toEqual({});
    expect((await alice.get('/progress')).json.progress).toEqual({ i01: { stars: 3 } });
  });

  it('recusa entradas fora do formato', async () => {
    const s = setup();
    const b = await signedIn(s);
    for (const progress of [null, [], { i01: { stars: 4 } }, { i01: { stars: 1.5 } }, { 'X Y': { stars: 1 } }, { i01: { stars: 1, quizCorrect: -1 } }, { i01: 'três' }]) {
      const r = await b.patch('/progress', { progress });
      expect(r.status, JSON.stringify(progress)).toBe(400);
      expect(r.json.error.code).toBe('validation');
    }
  });

  it('some com a conta excluída', async () => {
    const s = setup();
    const b = await signedIn(s);
    await b.patch('/progress', { progress: { i01: { stars: 3 } } });
    await b.post('/sandboxes', { name: 'x', graph: GRAPH });
    expect((await b.del('/auth/account', { password: ALICE.password })).status).toBe(204);
    expect(s.db.prepare('SELECT COUNT(*) AS n FROM progress').get()).toEqual({ n: 0 });
    expect(s.db.prepare('SELECT COUNT(*) AS n FROM sandboxes').get()).toEqual({ n: 0 });
  });
});

describe('sandboxes salvos', () => {
  it('cria, lista, abre, salva por cima e exclui', async () => {
    const s = setup();
    const b = await signedIn(s);

    const created = await b.post('/sandboxes', { name: '  Fan-out   de pedidos ', graph: GRAPH });
    expect(created.status).toBe(201);
    const sb = created.json.sandbox;
    expect(sb).toMatchObject({ name: 'Fan-out de pedidos', nodeCount: 2, revision: 1, graph: GRAPH });

    s.advance(1000);
    await b.post('/sandboxes', { name: 'Outro', graph: { nodes: [], edges: [] } });
    const list = await b.get('/sandboxes');
    expect(list.json.limit).toBe(SANDBOX_LIMITS.perUser);
    // mais recente primeiro, sem o grafo (a lista fica leve)
    expect(list.json.sandboxes.map((x: { name: string }) => x.name)).toEqual(['Outro', 'Fan-out de pedidos']);
    expect(list.json.sandboxes[0].graph).toBeUndefined();

    expect((await b.get(`/sandboxes/${sb.id}`)).json.sandbox.graph).toEqual(GRAPH);

    const bigger = { nodes: [...GRAPH.nodes, queue('q2', 4)], edges: GRAPH.edges };
    const saved = await b.put(`/sandboxes/${sb.id}`, { graph: bigger, revision: 1 });
    expect(saved.status).toBe(200);
    expect(saved.json.sandbox).toMatchObject({ name: 'Fan-out de pedidos', nodeCount: 3, revision: 2 });

    const renamed = await b.put(`/sandboxes/${sb.id}`, { name: 'Renomeado', revision: 2 });
    expect(renamed.json.sandbox).toMatchObject({ name: 'Renomeado', nodeCount: 3, revision: 3 });

    expect((await b.del(`/sandboxes/${sb.id}`)).status).toBe(204);
    expect((await b.get(`/sandboxes/${sb.id}`)).status).toBe(404);
    expect((await b.del(`/sandboxes/${sb.id}`)).status).toBe(404);
  });

  it('não sobrescreve o que outra aba salvou depois (revisão)', async () => {
    const s = setup();
    const b = await signedIn(s);
    const { id } = (await b.post('/sandboxes', { name: 'A', graph: GRAPH })).json.sandbox;
    expect((await b.put(`/sandboxes/${id}`, { name: 'aba 1', revision: 1 })).status).toBe(200);
    const stale = await b.put(`/sandboxes/${id}`, { name: 'aba 2', revision: 1 });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe('conflict');
    expect((await b.get(`/sandboxes/${id}`)).json.sandbox.name).toBe('aba 1');
    expect((await b.put(`/sandboxes/${id}`, { name: 'sem revisão' })).status).toBe(400);
  });

  it('um usuário não vê nem mexe nos sandboxes de outro', async () => {
    const s = setup();
    const alice = await signedIn(s);
    s.setIp('203.0.113.2');
    const bob = await signedIn(s, BOB);
    const { id } = (await alice.post('/sandboxes', { name: 'da Alice', graph: GRAPH })).json.sandbox;
    expect((await bob.get('/sandboxes')).json.sandboxes).toEqual([]);
    expect((await bob.get(`/sandboxes/${id}`)).status).toBe(404);
    expect((await bob.put(`/sandboxes/${id}`, { name: 'roubado', revision: 1 })).status).toBe(404);
    expect((await bob.del(`/sandboxes/${id}`)).status).toBe(404);
    expect((await alice.get(`/sandboxes/${id}`)).json.sandbox.name).toBe('da Alice');
  });

  it('valida nome e grafo, e guarda só os campos conhecidos', async () => {
    const s = setup();
    const b = await signedIn(s);
    const bad = [
      { name: '', graph: GRAPH },
      { name: 'x'.repeat(61), graph: GRAPH },
      { name: 'ok', graph: null },
      { name: 'ok', graph: { nodes: [{ ...producer('p1'), kind: 'ec2' }], edges: [] } },
      { name: 'ok', graph: { nodes: [producer('p1'), producer('p1')], edges: [] } },
      { name: 'ok', graph: { nodes: [{ ...producer('p1'), x: Infinity }], edges: [] } },
      { name: 'ok', graph: { nodes: [producer('p1')], edges: [{ id: 'e1', from: 'p1', to: 'fantasma' }] } },
      { name: 'ok', graph: { nodes: Array.from({ length: SANDBOX_LIMITS.nodes + 1 }, (_, i) => queue(`q${i}`)), edges: [] } },
    ];
    for (const body of bad) {
      const r = await b.post('/sandboxes', body);
      expect(r.status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    const extra = { nodes: [{ ...producer('p1'), hack: '<script>' }], edges: [], outro: 1 };
    const r = await b.post('/sandboxes', { name: 'limpo', graph: extra });
    expect(r.json.sandbox.graph).toEqual({ nodes: [producer('p1')], edges: [] });
  });

  it('aceita o grafo de um sandbox cheio, mas recusa documentos enormes', async () => {
    const s = setup();
    const b = await signedIn(s);
    const full = { nodes: Array.from({ length: 65 }, (_, i) => queue(`q${i}`, (i % 20) - 10)), edges: [] };
    expect((await b.post('/sandboxes', { name: 'cheio', graph: full })).status).toBe(201);
    const huge = { nodes: [{ ...queue('q1'), config: { lixo: 'x'.repeat(200 * 1024) } }], edges: [] };
    expect((await b.post('/sandboxes', { name: 'enorme', graph: huge })).status).toBe(413);
  });

  it('limita a quantidade por conta', async () => {
    const s = setup();
    const b = await signedIn(s);
    for (let i = 0; i < SANDBOX_LIMITS.perUser; i++) expect((await b.post('/sandboxes', { name: `s${i}`, graph: GRAPH })).status).toBe(201);
    const over = await b.post('/sandboxes', { name: 'mais um', graph: GRAPH });
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe('quota_exceeded');
  });

  it('freia gravações em rajada por conta', async () => {
    const s = setup();
    const b = await signedIn(s);
    const { id } = (await b.post('/sandboxes', { name: 'A', graph: GRAPH })).json.sandbox;
    let revision = 1;
    let last = 200;
    for (let i = 0; i < 130 && last === 200; i++) {
      const r = await b.put(`/sandboxes/${id}`, { name: `v${i}`, revision });
      last = r.status;
      if (r.status === 200) revision = r.json.sandbox.revision;
    }
    expect(last).toBe(429);
    s.advance(11 * 60_000);
    expect((await b.put(`/sandboxes/${id}`, { name: 'depois', revision })).status).toBe(200);
  });

  it('exige origem conhecida para gravar', async () => {
    const s = setup();
    const b = await signedIn(s);
    const r = await b.call('POST', '/sandboxes', { name: 'x', graph: GRAPH }, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });
});

describe('conteúdo das fases fechadas', () => {
  it('só entrega para quem está logado', async () => {
    const s = setup();
    const guest = s.browser();
    const denied = await guest.get('/levels/i03');
    expect(denied.status).toBe(401);
    expect(JSON.stringify(denied.json)).not.toContain('story');

    const b = await signedIn(s);
    const r = await b.get('/levels/i03');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.json.level).toMatchObject({ id: 'i03', track: 'iniciante', index: 3, title: 'A fila não para de crescer' });
    // só dados: a solução vem pronta, sem função
    expect(r.json.level.solve).toBeUndefined();
    expect(r.json.level.solution.nodes.length).toBeGreaterThan(r.json.level.graph.nodes.length);
  });

  it('serve todas as fases fechadas e nenhuma das abertas (essas vêm no bundle)', async () => {
    const s = setup();
    const b = await signedIn(s);
    for (const id of ['i10', 'c01', 'c12']) expect((await b.get(`/levels/${id}`)).status, id).toBe(200);
    for (const id of ['i01', 'i02', 'sandbox', 'x99', '..%2Fsecrets']) expect((await b.get(`/levels/${id}`)).status, id).toBe(404);
  });
});
