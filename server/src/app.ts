import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { timingSafeEqual } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { HttpError } from './errors';
import { SlidingWindowLimiter, type RateLimiter } from './auth/rate-limit';
import { HttpGoogleClient, newOAuthSecrets, type GoogleClient } from './auth/google';
import { AuthService, type IssuedSession, type Limiters, type SessionInfo } from './auth/service';
import type { Config } from './config';
import type { Database } from './db';
import { LevelContent } from './game/levels';
import { ProgressService } from './game/progress';
import { SANDBOX_LIMITS, SandboxService } from './game/sandboxes';
import type { Mailer } from './mail';
import { SqliteIdentityRepo, SqliteProgressRepo, SqliteResetRepo, SqliteSandboxRepo, SqliteSessionRepo, SqliteUserRepo } from './repos';

const MINUTE = 60_000;

export interface AppDeps {
  config: Config;
  db: Database;
  mailer: Mailer;
  /** IP do cliente; o adaptador do servidor (Node, Lambda) sabe de onde tirar. */
  clientIp?: (c: Context) => string;
  now?: () => number;
  limiters?: Partial<AppLimiters>;
  /** Cliente do Google; por padrão sai das credenciais da configuração (ou fica desligado). */
  google?: GoogleClient | null;
}

type Env = { Variables: { session: SessionInfo | null } };

export interface AppLimiters extends Limiters {
  /** Escritas de jogo (progresso, sandboxes) por conta: freia scripts, não quem joga. */
  writesByUser: RateLimiter;
}

export function defaultLimiters(now: () => number = Date.now): AppLimiters {
  return {
    writesByUser: new SlidingWindowLimiter(120, 10 * MINUTE, now),
    loginByEmail: new SlidingWindowLimiter(5, 15 * MINUTE, now),
    loginByIp: new SlidingWindowLimiter(30, 15 * MINUTE, now),
    registerByIp: new SlidingWindowLimiter(10, 60 * MINUTE, now),
    resetByEmail: new SlidingWindowLimiter(3, 60 * MINUTE, now),
    resetByIp: new SlidingWindowLimiter(20, 60 * MINUTE, now),
  };
}

export function createApp(deps: AppDeps) {
  const { config } = deps;
  const now = deps.now ?? Date.now;
  const limiters = { ...defaultLimiters(now), ...deps.limiters };
  const auth = new AuthService({
    config,
    users: new SqliteUserRepo(deps.db),
    identities: new SqliteIdentityRepo(deps.db),
    sessions: new SqliteSessionRepo(deps.db),
    resets: new SqliteResetRepo(deps.db),
    mailer: deps.mailer,
    limiters,
    now,
  });
  const progress = new ProgressService(new SqliteProgressRepo(deps.db), now);
  const sandboxes = new SandboxService(new SqliteSandboxRepo(deps.db), now);
  const levels = new LevelContent();
  const google: GoogleClient | null =
    deps.google !== undefined
      ? deps.google
      : config.googleClientId && config.googleClientSecret
        ? new HttpGoogleClient({
            clientId: config.googleClientId,
            clientSecret: config.googleClientSecret,
            redirectUri: `${config.appUrl.replace(/\/$/, '')}/api/auth/google/callback`,
          })
        : null;
  // `__Host-` obriga Secure, Path=/ e nenhum Domain: o cookie não vaza para subdomínios
  const cookieName = config.secureCookies ? '__Host-kiue_session' : 'kiue_session';
  const oauthCookie = config.secureCookies ? '__Host-kiue_oauth' : 'kiue_oauth';
  const clientIp = (c: Context): string => {
    if (config.trustProxy) {
      const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (forwarded) return forwarded;
    }
    return deps.clientIp?.(c) ?? 'unknown';
  };
  const ctx = (c: Context) => ({ ip: clientIp(c), userAgent: c.req.header('user-agent') ?? null });

  const setSessionCookie = (c: Context, token: string, expiresAt: number) =>
    setCookie(c, cookieName, token, {
      httpOnly: true, // JavaScript da página não lê o cookie (XSS não rouba a sessão)
      secure: config.secureCookies,
      sameSite: 'Lax', // não vai em POST vindo de outro site
      path: '/',
      expires: new Date(expiresAt),
    });
  const clearSessionCookie = (c: Context) => deleteCookie(c, cookieName, { path: '/', secure: config.secureCookies });
  const issued = (c: Context, s: IssuedSession, status: 200 | 201) => {
    setSessionCookie(c, s.token, s.expiresAt);
    return c.json({ user: s.user }, status);
  };

  const app = new Hono<Env>().basePath('/api');

  app.use('*', secureHeaders());
  app.use('*', async (c, next) => {
    await next();
    // respostas da API dependem do usuário: nunca guardar em cache compartilhado
    c.header('Cache-Control', 'no-store');
  });
  const tooLarge = (c: Context) => c.json({ error: { code: 'validation', message: 'Requisição grande demais.' } }, 413);
  const smallBody = bodyLimit({ maxSize: 16 * 1024, onError: tooLarge });
  // sandboxes levam o grafo inteiro: um pouco de folga além do limite do próprio grafo
  const sandboxBody = bodyLimit({ maxSize: SANDBOX_LIMITS.graphBytes + 8 * 1024, onError: tooLarge });
  app.use('*', (c, next) => (c.req.path.startsWith('/api/sandboxes') ? sandboxBody(c, next) : smallBody(c, next)));

  // CSRF: além do SameSite, toda requisição que muda estado precisa vir de uma origem conhecida
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS') {
      const origin = c.req.header('origin');
      if (!origin || !config.allowedOrigins.includes(origin)) throw new HttpError('forbidden_origin', 'Origem não permitida.', 403);
    }
    await next();
  });

  // sessão: resolve o cookie em todas as rotas; as protegidas usam `requireSession`
  app.use('*', async (c, next) => {
    const session = auth.authenticate(getCookie(c, cookieName));
    c.set('session', session);
    if (session?.renewedUntil) setSessionCookie(c, getCookie(c, cookieName)!, session.renewedUntil);
    else if (!session && getCookie(c, cookieName)) clearSessionCookie(c);
    await next();
  });

  const requireSession = (c: Context<Env>): SessionInfo => {
    const s = c.get('session');
    if (!s) throw new HttpError('unauthenticated', 'Entre na sua conta para continuar.', 401);
    return s;
  };
  const body = async (c: Context): Promise<Record<string, unknown>> => {
    if (!c.req.header('content-type')?.startsWith('application/json')) throw new HttpError('validation', 'Envie JSON.', 400);
    try {
      const data = await c.req.json();
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      throw new HttpError('validation', 'JSON inválido.', 400);
    }
  };

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/auth/register', async (c) => issued(c, await auth.register(await body(c), ctx(c)), 201));
  app.post('/auth/login', async (c) => issued(c, await auth.login(await body(c), ctx(c)), 200));

  // ───────────── login com Google ─────────────

  app.get('/auth/google/start', (c) => {
    if (!google) throw new HttpError('not_found', 'Login com Google indisponível.', 404);
    const wait = limiters.loginByIp.retryAfter(clientIp(c));
    const secrets = newOAuthSecrets();
    // curto e só para a volta do Google (navegação de topo): Lax basta e Strict a perderia
    setCookie(c, oauthCookie, `${secrets.state}.${secrets.nonce}.${secrets.verifier}`, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'Lax',
      path: '/',
      maxAge: 600,
    });
    if (wait > 0) return c.redirect(appRedirect('rate_limited'));
    return c.redirect(google.authUrl(secrets));
  });

  const appRedirect = (error?: string) => `${config.appUrl.replace(/\/$/, '')}/${error ? `?auth_error=${error}` : ''}`;

  app.get('/auth/google/callback', async (c) => {
    const saved = getCookie(c, oauthCookie);
    deleteCookie(c, oauthCookie, { path: '/', secure: config.secureCookies });
    const fail = (code: string) => {
      limiters.loginByIp.hit(clientIp(c));
      return c.redirect(appRedirect(code));
    };
    if (!google) return c.redirect(appRedirect('google_failed'));
    if (c.req.query('error')) return c.redirect(appRedirect('google_denied'));
    const code = c.req.query('code');
    const state = c.req.query('state');
    const [savedState, nonce, verifier] = saved?.split('.') ?? [];
    if (!code || !state || !savedState || !nonce || !verifier) return fail('google_failed');
    const a = Buffer.from(state);
    const b = Buffer.from(savedState);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return fail('google_failed');
    const wait = limiters.loginByIp.retryAfter(clientIp(c));
    if (wait > 0) return c.redirect(appRedirect('rate_limited'));
    try {
      const profile = await google.exchange({ code, verifier, nonce });
      const session = auth.loginWithGoogle(profile, ctx(c));
      setSessionCookie(c, session.token, session.expiresAt);
      return c.redirect(appRedirect());
    } catch (e) {
      return fail(e instanceof HttpError ? e.code : 'google_failed');
    }
  });

  app.post('/auth/logout', (c) => {
    const s = c.get('session');
    if (s) auth.logout(s.sessionId);
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  // estado da sessão sem erro para visitantes (a página pergunta isso em toda carga)
  app.get('/auth/session', (c) => c.json({ user: c.get('session')?.user ?? null, providers: { google: google !== null } }));
  app.get('/auth/me', (c) => c.json({ user: requireSession(c).user }));

  app.patch('/auth/me', async (c) => {
    const s = requireSession(c);
    return c.json({ user: auth.updateProfile(s.user.id, await body(c)) });
  });

  app.post('/auth/logout-others', (c) => {
    const s = requireSession(c);
    return c.json({ ended: auth.logoutOthers(s.user.id, s.sessionId) });
  });

  app.post('/auth/password', async (c) => {
    const s = requireSession(c);
    await auth.changePassword(s.user.id, s.sessionId, await body(c));
    return c.body(null, 204);
  });

  app.post('/auth/password-reset/request', async (c) => {
    await auth.requestPasswordReset(await body(c), ctx(c));
    return c.body(null, 202);
  });

  app.post('/auth/password-reset/confirm', async (c) => {
    await auth.resetPassword(await body(c));
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  app.delete('/auth/account', async (c) => {
    const s = requireSession(c);
    await auth.deleteAccount(s.user.id, await body(c));
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  // ───────────── conteúdo, progresso e sandboxes (só com conta) ─────────────

  // fases fechadas para visitantes: o bundle não as traz, só esta rota (e só com sessão)
  app.get('/levels/:id', (c) => {
    requireSession(c);
    return c.body(levels.body(c.req.param('id')), 200, { 'content-type': 'application/json; charset=utf-8' });
  });

  /** Conta a escrita no limite da conta; acima dele, 429 com Retry-After. */
  const write = (c: Context<Env>): SessionInfo => {
    const s = requireSession(c);
    const wait = limiters.writesByUser.retryAfter(s.user.id);
    if (wait > 0) throw new HttpError('rate_limited', 'Muitas gravações seguidas. Espere um pouco.', 429, undefined, wait);
    limiters.writesByUser.hit(s.user.id);
    return s;
  };

  app.get('/progress', (c) => c.json({ progress: progress.get(requireSession(c).user.id) }));
  // mesclagem: guarda o melhor resultado de cada fase e devolve o progresso completo
  app.patch('/progress', async (c) => {
    const s = write(c);
    return c.json({ progress: progress.merge(s.user.id, await body(c)) });
  });
  app.delete('/progress', (c) => {
    progress.clear(write(c).user.id);
    return c.body(null, 204);
  });

  app.get('/sandboxes', (c) => c.json({ sandboxes: sandboxes.list(requireSession(c).user.id), limit: SANDBOX_LIMITS.perUser }));
  app.post('/sandboxes', async (c) => {
    const s = write(c);
    return c.json({ sandbox: sandboxes.create(s.user.id, await body(c)) }, 201);
  });
  app.get('/sandboxes/:id', (c) => c.json({ sandbox: sandboxes.get(requireSession(c).user.id, c.req.param('id')) }));
  app.put('/sandboxes/:id', async (c) => {
    const s = write(c);
    return c.json({ sandbox: sandboxes.update(s.user.id, c.req.param('id'), await body(c)) });
  });
  app.delete('/sandboxes/:id', (c) => {
    sandboxes.delete(write(c).user.id, c.req.param('id'));
    return c.body(null, 204);
  });

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Rota não encontrada.' } }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      if (err.retryAfter) c.header('Retry-After', String(err.retryAfter));
      return c.json({ error: { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) } }, err.status);
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Erro interno. Tente de novo em instantes.' } }, 500);
  });

  return { app, auth, progress, sandboxes, limiters };
}
