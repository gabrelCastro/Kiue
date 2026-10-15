import { describe, expect, it } from 'vitest';
import { ALICE, FakeGoogle, setup } from './helpers';

function withGoogle() {
  const google = new FakeGoogle();
  const s = setup({}, google);
  const browser = s.browser();
  /** Faz o caminho inteiro: /start, volta do Google com o `code` dado (e o `state` do cookie). */
  async function loginWith(code: string, opts: { state?: string; b?: ReturnType<typeof s.browser> } = {}) {
    const b = opts.b ?? browser;
    const start = await b.get('/auth/google/start');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const cb = await b.get(`/auth/google/callback?code=${code}&state=${opts.state ?? state}`);
    return { start, cb, b };
  }
  return { google, s, browser, loginWith };
}

const profile = (over: Partial<{ sub: string; email: string; emailVerified: boolean; name: string }> = {}) => ({
  sub: 'g-1',
  email: 'alice@example.com',
  emailVerified: true,
  name: 'Alice G.',
  ...over,
});

describe('login com Google', () => {
  it('fica desligado sem credenciais e o front descobre pelo /auth/session', async () => {
    const off = setup();
    const b = off.browser();
    expect((await b.get('/auth/session')).json.providers.google).toBe(false);
    expect((await b.get('/auth/google/start')).status).toBe(404);
    const on = withGoogle();
    expect((await on.browser.get('/auth/session')).json.providers.google).toBe(true);
  });

  it('start manda para o Google e guarda o state num cookie HttpOnly', async () => {
    const { browser } = withGoogle();
    const res = await browser.get('/auth/google/start');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(res.setCookie.join(';')).toMatch(/kiue_oauth=.*HttpOnly/i);
  });

  it('cria uma conta nova, sem senha, e abre a sessão', async () => {
    const { google, loginWith, browser } = withGoogle();
    google.profiles.set('c1', profile());
    const { cb } = await loginWith('c1');
    expect(cb.status).toBe(302);
    expect(cb.headers.get('location')).toBe('http://localhost:5173/');
    const me = (await browser.get('/auth/me')).json.user;
    expect(me).toMatchObject({ email: 'alice@example.com', name: 'Alice G.', hasPassword: false, google: true });
    // sem senha: nenhum login por e-mail e senha entra
    const other = withGoogle();
    other.google.profiles.set('c1', profile());
    await other.loginWith('c1');
    const attempt = await other.browser.call('POST', '/auth/login', { email: 'alice@example.com', password: 'qualquer-coisa-aqui' }, {});
    expect(attempt.status).toBe(401);
  });

  it('segundo login com o mesmo sub volta à mesma conta, mesmo com e-mail novo no Google', async () => {
    const { google, loginWith, s } = withGoogle();
    google.profiles.set('c1', profile());
    await loginWith('c1');
    google.profiles.set('c2', profile({ email: 'alice.nova@example.com' }));
    const second = s.browser();
    await loginWith('c2', { b: second });
    const users = s.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    expect(users.n).toBe(1);
    expect((await second.get('/auth/me')).json.user.email).toBe('alice@example.com');
  });

  it('vincula automaticamente a conta existente pelo e-mail verificado, mantendo o progresso', async () => {
    const { google, loginWith, s } = withGoogle();
    const old = s.browser();
    const reg = await old.post('/auth/register', ALICE);
    const userId = reg.json.user.id as string;
    expect((await old.patch('/progress', { progress: { i01: { stars: 3 } } })).status).toBe(200);

    google.profiles.set('c1', profile());
    const fresh = s.browser();
    await loginWith('c1', { b: fresh });
    const me = (await fresh.get('/auth/me')).json.user;
    expect(me.id).toBe(userId);
    expect(me.google).toBe(true);
    expect(me.hasPassword).toBe(false);
    expect((await fresh.get('/progress')).json.progress.i01.stars).toBe(3);
    // não criou uma segunda conta
    expect((s.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(1);
  });

  it('ao vincular, a senha antiga deixa de valer e as sessões abertas caem', async () => {
    const { google, loginWith, s } = withGoogle();
    const squatter = s.browser();
    await squatter.post('/auth/register', ALICE);
    expect((await squatter.get('/auth/me')).status).toBe(200);

    google.profiles.set('c1', profile());
    await loginWith('c1', { b: s.browser() });

    expect((await squatter.get('/auth/me')).status).toBe(401);
    const relogin = await s.browser().post('/auth/login', { email: ALICE.email, password: ALICE.password });
    expect(relogin.status).toBe(401);
  });

  it('recusa e-mail não verificado e não abre sessão', async () => {
    const { google, loginWith, browser } = withGoogle();
    google.profiles.set('c1', profile({ emailVerified: false }));
    const { cb } = await loginWith('c1');
    expect(cb.headers.get('location')).toContain('auth_error=google_unverified');
    expect((await browser.get('/auth/me')).status).toBe(401);
  });

  it('recusa state diferente do cookie (CSRF) e callback sem passar pelo start', async () => {
    const { google, loginWith, browser, s } = withGoogle();
    google.profiles.set('c1', profile());
    const bad = await loginWith('c1', { state: 'outro-state' });
    expect(bad.cb.headers.get('location')).toContain('auth_error=google_failed');
    expect((await browser.get('/auth/me')).status).toBe(401);

    const direct = await s.browser().get('/auth/google/callback?code=c1&state=x');
    expect(direct.headers.get('location')).toContain('auth_error=google_failed');
  });

  it('o state só vale uma vez', async () => {
    const { google, browser } = withGoogle();
    google.profiles.set('c1', profile());
    const start = await browser.get('/auth/google/start');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    expect((await browser.get(`/auth/google/callback?code=c1&state=${state}`)).headers.get('location')).toBe('http://localhost:5173/');
    // mesmo navegador, mesmo state, depois de já ter usado
    const again = await browser.get(`/auth/google/callback?code=c1&state=${state}`);
    expect(again.headers.get('location')).toContain('auth_error=google_failed');
  });

  it('o jogador pode negar o acesso no Google', async () => {
    const { browser } = withGoogle();
    await browser.get('/auth/google/start');
    const res = await browser.get('/auth/google/callback?error=access_denied');
    expect(res.headers.get('location')).toContain('auth_error=google_denied');
  });

  it('conta só-Google se exclui confirmando o e-mail', async () => {
    const { google, loginWith, browser } = withGoogle();
    google.profiles.set('c1', profile());
    await loginWith('c1');
    expect((await browser.del('/auth/account', { email: 'outra@example.com' })).status).toBe(400);
    expect((await browser.del('/auth/account', { email: 'ALICE@example.com' })).status).toBe(204);
    expect((await browser.get('/auth/me')).status).toBe(401);
  });

  it('conta só-Google pode definir senha pelo link de redefinição', async () => {
    const { google, loginWith, browser, s } = withGoogle();
    google.profiles.set('c1', profile());
    await loginWith('c1');
    await browser.post('/auth/password-reset/request', { email: 'alice@example.com' });
    const token = s.mailer.sent.at(-1)!.text.match(/reset=([\w-]+)/)![1];
    expect((await browser.post('/auth/password-reset/confirm', { token, newPassword: 'uma-frase-bem-longa' })).status).toBe(204);
    const login = await s.browser().post('/auth/login', { email: 'alice@example.com', password: 'uma-frase-bem-longa' });
    expect(login.status).toBe(200);
    expect(login.json.user.google).toBe(true);
  });
});
