import { ALICE, setup } from './helpers';

const BOB = { name: 'Bob', email: 'bob@example.com', password: 'topico-de-eventos' };

async function signedIn(s: ReturnType<typeof setup>, who = ALICE) {
  const b = s.browser();
  expect((await b.post('/auth/register', who)).status).toBe(201);
  return b;
}

describe('apostila na conta', () => {
  it('capítulo fechado exige conta e chega inteiro para quem está logado', async () => {
    const s = setup();
    expect((await s.browser().get('/study/cap03')).status).toBe(401);
    const b = await signedIn(s);
    const r = await b.get('/study/cap03');
    expect(r.status).toBe(200);
    expect(r.json.chapter.id).toBe('cap03');
    expect(r.json.chapter.blocks.length).toBeGreaterThan(0);
    // os abertos vêm no bundle; o servidor só tem os fechados
    expect((await b.get('/study/cap01')).status).toBe(404);
    expect((await b.get('/study/xyz')).status).toBe(404);
  });

  it('capítulos lidos: união idempotente, por conta', async () => {
    const s = setup();
    expect((await s.browser().get('/study-progress')).status).toBe(401);
    const alice = await signedIn(s);
    s.setIp('203.0.113.2');
    const bob = await signedIn(s, BOB);
    expect((await alice.get('/study-progress')).json).toEqual({ read: [] });

    let r = await alice.patch('/study-progress', { read: ['cap02', 'cap01'] });
    expect(r.status).toBe(200);
    expect(r.json.read).toEqual(['cap01', 'cap02']);
    // reenviar não duplica nem apaga nada
    r = await alice.patch('/study-progress', { read: ['cap01', 'cap05'] });
    expect(r.json.read).toEqual(['cap01', 'cap02', 'cap05']);

    expect((await bob.get('/study-progress')).json.read).toEqual([]);
  });

  it('recusa capítulos fora do formato', async () => {
    const s = setup();
    const b = await signedIn(s);
    for (const read of [null, 'cap01', [1], ['cap99'], ['../x'], Array.from({ length: 101 }, () => 'cap01')]) {
      const r = await b.patch('/study-progress', { read });
      expect(r.status, JSON.stringify(read).slice(0, 40)).toBe(400);
    }
  });

  it('apagar a conta apaga os lidos', async () => {
    const s = setup();
    const b = await signedIn(s);
    await b.patch('/study-progress', { read: ['cap01'] });
    const before = s.db.prepare('SELECT COUNT(*) AS n FROM study_reads').get() as { n: number };
    expect(before.n).toBe(1);
    s.db.prepare('DELETE FROM users').run();
    const after = s.db.prepare('SELECT COUNT(*) AS n FROM study_reads').get() as { n: number };
    expect(after.n).toBe(0);
  });
});
