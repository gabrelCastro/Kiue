import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { AuthError } from './auth/errors';
import { SlidingWindowLimiter } from './auth/rate-limit';
import { AuthService, type IssuedSession, type Limiters, type SessionInfo } from './auth/service';
import type { Config } from './config';
import type { Database } from './db';
import type { Mailer } from './mail';
import { SqliteResetRepo, SqliteSessionRepo, SqliteUserRepo } from './repos';

const MINUTE = 60_000;

export interface AppDeps {
  config: Config;
  db: Database;
  mailer: Mailer;
  /** IP do cliente; o adaptador do servidor (Node, Lambda) sabe de onde tirar. */
  clientIp?: (c: Context) => string;
  now?: () => number;
  limiters?: Partial<Limiters>;
}

type Env = { Variables: { session: SessionInfo | null } };

export function defaultLimiters(now: () => number = Date.now): Limiters {
  return {
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
    sessions: new SqliteSessionRepo(deps.db),
    resets: new SqliteResetRepo(deps.db),
    mailer: deps.mailer,
    limiters,
    now,
  });
  // `__Host-` obriga Secure, Path=/ e nenhum Domain: o cookie não vaza para subdomínios
  const cookieName = config.secureCookies ? '__Host-kiue_session' : 'kiue_session';
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
  app.use('*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: { code: 'validation', message: 'Requisição grande demais.' } }, 413) }));

  // CSRF: além do SameSite, toda requisição que muda estado precisa vir de uma origem conhecida
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS') {
      const origin = c.req.header('origin');
      if (!origin || !config.allowedOrigins.includes(origin)) throw new AuthError('forbidden_origin', 'Origem não permitida.', 403);
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
    if (!s) throw new AuthError('unauthenticated', 'Entre na sua conta para continuar.', 401);
    return s;
  };
  const body = async (c: Context): Promise<Record<string, unknown>> => {
    if (!c.req.header('content-type')?.startsWith('application/json')) throw new AuthError('validation', 'Envie JSON.', 400);
    try {
      const data = await c.req.json();
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      throw new AuthError('validation', 'JSON inválido.', 400);
    }
  };

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/auth/register', async (c) => issued(c, await auth.register(await body(c), ctx(c)), 201));
  app.post('/auth/login', async (c) => issued(c, await auth.login(await body(c), ctx(c)), 200));

  app.post('/auth/logout', (c) => {
    const s = c.get('session');
    if (s) auth.logout(s.sessionId);
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  // estado da sessão sem erro para visitantes (a página pergunta isso em toda carga)
  app.get('/auth/session', (c) => c.json({ user: c.get('session')?.user ?? null }));
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

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Rota não encontrada.' } }, 404));
  app.onError((err, c) => {
    if (err instanceof AuthError) {
      if (err.retryAfter) c.header('Retry-After', String(err.retryAfter));
      return c.json({ error: { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) } }, err.status);
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Erro interno. Tente de novo em instantes.' } }, 500);
  });

  return { app, auth, limiters };
}
