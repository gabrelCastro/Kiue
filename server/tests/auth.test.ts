import { hashPassword, needsRehash, verifyPassword } from '../src/auth/password';
import { SlidingWindowLimiter } from '../src/auth/rate-limit';
import { hashToken } from '../src/auth/tokens';
import { ALICE, setup } from './helpers';

const DAY = 86_400_000;

describe('senha', () => {
  it('confere a senha certa e recusa a errada; cada hash tem sal próprio', async () => {
    const a = await hashPassword('correta-123', 10);
    const b = await hashPassword('correta-123', 10);
    expect(a).not.toBe(b);
    expect(await verifyPassword('correta-123', a)).toBe(true);
    expect(await verifyPassword('errada-123', a)).toBe(false);
    expect(await verifyPassword('correta-123', 'lixo')).toBe(false);
  });

  it('pede rehash quando o custo configurado muda', async () => {
    const h = await hashPassword('x'.repeat(10), 10);
    expect(needsRehash(h, 10)).toBe(false);
    expect(needsRehash(h, 11)).toBe(true);
  });
});

describe('limitador', () => {
  it('bloqueia depois do limite e libera quando a janela passa', () => {
    let t = 0;
    const l = new SlidingWindowLimiter(2, 1000, () => t);
    l.hit('k');
    expect(l.retryAfter('k')).toBe(0);
    l.hit('k');
    expect(l.retryAfter('k')).toBe(1);
    t = 1001;
    expect(l.retryAfter('k')).toBe(0);
  });
});

describe('cadastro e login', () => {
  it('cadastra, mantém a sessão por cookie e sai', async () => {
    const s = setup();
    const b = s.browser();
    const reg = await b.post('/auth/register', ALICE);
    expect(reg.status).toBe(201);
    expect(reg.json.user).toMatchObject({ name: 'Alice', email: 'alice@example.com' });
    expect(reg.json.user.passwordHash).toBeUndefined();
    const cookie = reg.setCookie[0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    expect((await b.get('/auth/me')).json.user.email).toBe('alice@example.com');
    expect((await b.get('/auth/session')).json.user.email).toBe('alice@example.com');
    expect((await b.post('/auth/logout')).status).toBe(204);
    expect((await b.get('/auth/me')).status).toBe(401);
    // para visitantes a sessão é `null`, sem erro (não suja o console de quem só joga)
    const guest = await b.get('/auth/session');
    expect(guest.status).toBe(200);
    expect(guest.json.user).toBeNull();
  });

  it('em produção o cookie é Secure e usa o prefixo __Host-', async () => {
    const s = setup({ secureCookies: true });
    const reg = await s.browser().post('/auth/register', ALICE);
    expect(reg.setCookie[0]).toMatch(/^__Host-kiue_session=.*Secure/);
  });

  it('o banco guarda só o hash do token de sessão e o hash da senha', async () => {
    const s = setup();
    const b = s.browser();
    await b.post('/auth/register', ALICE);
    const token = b.cookies.get('kiue_session')!;
    const row = s.db.prepare('SELECT id FROM sessions').get() as { id: string };
    expect(row.id).toBe(hashToken(token));
    const user = s.db.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
    expect(user.password_hash).toMatch(/^scrypt\$/);
    expect(user.password_hash).not.toContain(ALICE.password);
  });

  it('normaliza o e-mail e recusa cadastro duplicado', async () => {
    const s = setup();
    await s.browser().post('/auth/register', ALICE);
    const dup = await s.browser().post('/auth/register', { ...ALICE, email: '  ALICE@Example.com ' });
    expect(dup.status).toBe(409);
    expect(dup.json.error).toMatchObject({ code: 'email_taken', field: 'email' });
    const login = await s.browser().post('/auth/login', { email: 'Alice@EXAMPLE.com', password: ALICE.password });
    expect(login.status).toBe(200);
  });

  it.each([
    [{ ...ALICE, email: 'sem-arroba' }, 'email'],
    [{ ...ALICE, password: 'curta' }, 'password'],
    [{ ...ALICE, password: '12345678' }, 'password'],
    [{ ...ALICE, password: 'alice@example.com' }, 'password'],
    [{ ...ALICE, name: '   ' }, 'name'],
  ])('valida o cadastro (%#)', async (input, field) => {
    const res = await setup().browser().post('/auth/register', input);
    expect(res.status).toBe(400);
    expect(res.json.error.field).toBe(field);
  });

  it('mesma resposta para senha errada e e-mail inexistente', async () => {
    const s = setup();
    await s.browser().post('/auth/register', ALICE);
    const wrong = await s.browser().post('/auth/login', { email: ALICE.email, password: 'outra-senha-qualquer' });
    const ghost = await s.browser().post('/auth/login', { email: 'ninguem@example.com', password: 'outra-senha-qualquer' });
    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(wrong.json).toEqual(ghost.json);
  });

  it('bloqueia a conta depois de 5 senhas erradas e libera após a janela', async () => {
    const s = setup();
    await s.browser().post('/auth/register', ALICE);
    for (let i = 0; i < 5; i++) await s.browser().post('/auth/login', { email: ALICE.email, password: 'errada-errada' });
    const blocked = await s.browser().post('/auth/login', ALICE);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    s.advance(16 * 60_000);
    expect((await s.browser().post('/auth/login', ALICE)).status).toBe(200);
  });

  it('limita tentativas por IP contra várias contas', async () => {
    const s = setup();
    for (let i = 0; i < 30; i++) await s.browser().post('/auth/login', { email: `u${i}@example.com`, password: 'qualquer-coisa' });
    expect((await s.browser().post('/auth/login', { email: 'outra@example.com', password: 'qualquer-coisa' })).status).toBe(429);
    s.setIp('198.51.100.7');
    expect((await s.browser().post('/auth/login', { email: 'outra@example.com', password: 'qualquer-coisa' })).status).toBe(401);
  });
});

describe('proteções da API', () => {
  it('recusa requisições que mudam estado sem Origin conhecida (CSRF)', async () => {
    const s = setup();
    const b = s.browser();
    expect((await b.call('POST', '/auth/register', ALICE, { origin: 'https://site-malicioso.example' })).status).toBe(403);
    const noOrigin = await s.app.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ALICE) });
    expect(noOrigin.status).toBe(403);
  });

  it('exige JSON e limita o tamanho do corpo', async () => {
    const b = setup().browser();
    expect((await b.call('POST', '/auth/login', undefined, { 'content-type': 'text/plain' })).status).toBe(400);
    expect((await b.post('/auth/register', { ...ALICE, name: 'x'.repeat(20_000) })).status).toBe(413);
  });

  it('respostas não vão para cache e têm cabeçalhos de segurança', async () => {
    const res = await setup().browser().get('/health');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rota desconhecida responde 404 em JSON', async () => {
    const res = await setup().browser().get('/nada');
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe('not_found');
  });
});

describe('sessões', () => {
  it('expira após 30 dias sem uso e renova enquanto é usada', async () => {
    const s = setup();
    const b = s.browser();
    await b.post('/auth/register', ALICE);
    s.advance(20 * DAY);
    expect((await b.get('/auth/me')).status).toBe(200); // renova por mais 30 dias
    s.advance(20 * DAY);
    expect((await b.get('/auth/me')).status).toBe(200);
    s.advance(31 * DAY);
    expect((await b.get('/auth/me')).status).toBe(401);
  });

  it('tem limite absoluto mesmo em uso contínuo', async () => {
    const s = setup({ sessionMaxDays: 60 });
    const b = s.browser();
    await b.post('/auth/register', ALICE);
    for (let d = 0; d < 59; d += 10) {
      s.advance(10 * DAY);
      if (d < 50) expect((await b.get('/auth/me')).status).toBe(200);
    }
    s.advance(2 * DAY);
    expect((await b.get('/auth/me')).status).toBe(401);
  });

  it('sair dos outros aparelhos mantém só a sessão atual', async () => {
    const s = setup();
    const laptop = s.browser();
    const phone = s.browser();
    await laptop.post('/auth/register', ALICE);
    await phone.post('/auth/login', ALICE);
    expect((await laptop.post('/auth/logout-others')).json.ended).toBe(1);
    expect((await laptop.get('/auth/me')).status).toBe(200);
    expect((await phone.get('/auth/me')).status).toBe(401);
  });

  it('cookie forjado ou de sessão encerrada não autentica', async () => {
    const s = setup();
    const b = s.browser();
    b.cookies.set('kiue_session', 'inventado'.repeat(5));
    expect((await b.get('/auth/me')).status).toBe(401);
  });

  it('a limpeza remove sessões vencidas', async () => {
    const s = setup();
    await s.browser().post('/auth/register', ALICE);
    s.advance(31 * DAY);
    expect(s.auth.purgeExpired().sessions).toBe(1);
  });
});

describe('conta', () => {
  it('troca a senha (derrubando os outros aparelhos) e exige a senha atual', async () => {
    const s = setup();
    const laptop = s.browser();
    const phone = s.browser();
    await laptop.post('/auth/register', ALICE);
    await phone.post('/auth/login', ALICE);
    const bad = await laptop.post('/auth/password', { currentPassword: 'nao-e-essa', newPassword: 'nova-senha-forte' });
    expect(bad.status).toBe(401);
    expect(bad.json.error.field).toBe('currentPassword');
    expect((await laptop.post('/auth/password', { currentPassword: ALICE.password, newPassword: 'nova-senha-forte' })).status).toBe(204);
    expect((await laptop.get('/auth/me')).status).toBe(200);
    expect((await phone.get('/auth/me')).status).toBe(401);
    expect((await s.browser().post('/auth/login', ALICE)).status).toBe(401);
    expect((await s.browser().post('/auth/login', { email: ALICE.email, password: 'nova-senha-forte' })).status).toBe(200);
  });

  it('atualiza o nome', async () => {
    const b = setup().browser();
    await b.post('/auth/register', ALICE);
    const res = await b.call('PATCH', '/auth/me', { name: '  Alice   Souza ' });
    expect(res.json.user.name).toBe('Alice Souza');
  });

  it('excluir a conta pede a senha e apaga tudo', async () => {
    const s = setup();
    const b = s.browser();
    await b.post('/auth/register', ALICE);
    expect((await b.call('DELETE', '/auth/account', { password: 'errada-errada' })).status).toBe(401);
    expect((await b.call('DELETE', '/auth/account', { password: ALICE.password })).status).toBe(204);
    expect((await b.get('/auth/me')).status).toBe(401);
    expect(s.db.prepare('SELECT count(*) n FROM sessions').get()).toEqual({ n: 0 });
    expect((await s.browser().post('/auth/login', ALICE)).status).toBe(401);
  });

  it('rotas da conta exigem login', async () => {
    const b = setup().browser();
    expect((await b.post('/auth/password', { currentPassword: 'a', newPassword: 'b' })).status).toBe(401);
    expect((await b.post('/auth/logout-others')).status).toBe(401);
  });
});

describe('esqueci a senha', () => {
  const linkToken = (text: string) => /\?reset=([\w-]+)/.exec(text)![1];

  it('envia link de uso único que redefine a senha e derruba as sessões', async () => {
    const s = setup();
    const b = s.browser();
    await b.post('/auth/register', ALICE);
    expect((await s.browser().post('/auth/password-reset/request', { email: ALICE.email })).status).toBe(202);
    expect(s.mailer.sent).toHaveLength(1);
    expect(s.mailer.sent[0].to).toBe(ALICE.email);
    const token = linkToken(s.mailer.sent[0].text);
    expect(s.mailer.sent[0].text).toContain(`${s.config.appUrl}/?reset=`);

    expect((await s.browser().post('/auth/password-reset/confirm', { token, newPassword: 'senha-recuperada' })).status).toBe(204);
    expect((await b.get('/auth/me')).status).toBe(401);
    expect((await s.browser().post('/auth/login', { email: ALICE.email, password: 'senha-recuperada' })).status).toBe(200);
    // o mesmo link não vale duas vezes
    const again = await s.browser().post('/auth/password-reset/confirm', { token, newPassword: 'outra-senha-boa' });
    expect(again.status).toBe(400);
    expect(again.json.error.code).toBe('invalid_token');
  });

  it('responde igual para e-mail sem conta (e não envia nada)', async () => {
    const s = setup();
    const res = await s.browser().post('/auth/password-reset/request', { email: 'ninguem@example.com' });
    expect(res.status).toBe(202);
    expect(s.mailer.sent).toHaveLength(0);
  });

  it('o link expira e um pedido novo invalida o anterior', async () => {
    const s = setup();
    await s.browser().post('/auth/register', ALICE);
    await s.browser().post('/auth/password-reset/request', { email: ALICE.email });
    const first = linkToken(s.mailer.sent[0].text);
    await s.browser().post('/auth/password-reset/request', { email: ALICE.email });
    const second = linkToken(s.mailer.sent[1].text);
    expect((await s.browser().post('/auth/password-reset/confirm', { token: first, newPassword: 'senha-recuperada' })).status).toBe(400);
    s.advance(31 * 60_000);
    expect((await s.browser().post('/auth/password-reset/confirm', { token: second, newPassword: 'senha-recuperada' })).status).toBe(400);
  });

  it('limita pedidos por e-mail sem revelar o limite', async () => {
    const s = setup();
    await s.browser().post('/auth/register', ALICE);
    for (let i = 0; i < 5; i++) expect((await s.browser().post('/auth/password-reset/request', { email: ALICE.email })).status).toBe(202);
    expect(s.mailer.sent).toHaveLength(3);
  });
});
