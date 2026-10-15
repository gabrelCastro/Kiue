import { createApp } from '../src/app';
import type { GoogleClient, GoogleProfile } from '../src/auth/google';
import { loadConfig, type Config } from '../src/config';
import { openDatabase } from '../src/db';
import { MemoryMailer } from '../src/mail';

export const ORIGIN = 'http://localhost:5173';

/** Servidor de teste: banco em memória, relógio controlável, e-mails guardados. */
/** Google de mentira: o "código" do callback é uma chave para o perfil devolvido. */
export class FakeGoogle implements GoogleClient {
  profiles = new Map<string, GoogleProfile>();
  authUrl({ state }: { state: string; nonce: string; challenge: string }): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`;
  }
  async exchange({ code }: { code: string }): Promise<GoogleProfile> {
    const p = this.profiles.get(code);
    if (!p) throw new Error('código inválido');
    return p;
  }
}

export function setup(overrides: Partial<Config> = {}, google: GoogleClient | null = null) {
  const config: Config = { ...loadConfig({ NODE_ENV: 'test' }), databasePath: ':memory:', scryptCost: 10, ...overrides };
  const db = openDatabase(':memory:');
  const mailer = new MemoryMailer();
  const clock = { t: Date.UTC(2026, 9, 1) };
  let ip = '203.0.113.1';
  const { app, auth } = createApp({ config, db, mailer, now: () => clock.t, clientIp: () => ip, google });
  return {
    app,
    auth,
    db,
    mailer,
    config,
    advance: (ms: number) => (clock.t += ms),
    setIp: (next: string) => (ip = next),
    browser: () => new Browser(app.request.bind(app)),
  };
}

type RequestFn = (path: string, init?: RequestInit) => Response | Promise<Response>;

/** Cliente que guarda cookies como um navegador e manda `Origin` como o front-end. */
export class Browser {
  cookies = new Map<string, string>();
  constructor(private request: RequestFn) {}

  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { origin: ORIGIN, ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await this.request(`/api${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const [name, value] = pair.split('=');
      const expired = attrs.some((a) => /max-age=0/i.test(a) || (/expires=/i.test(a) && new Date(a.split('=')[1]).getTime() < Date.UTC(2000, 0)));
      if (expired || value === '') this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value);
    }
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null, setCookie: res.headers.getSetCookie() };
  }

  get = (path: string) => this.call('GET', path);
  post = (path: string, body?: unknown) => this.call('POST', path, body ?? {});
  put = (path: string, body: unknown) => this.call('PUT', path, body);
  patch = (path: string, body: unknown) => this.call('PATCH', path, body);
  del = (path: string, body?: unknown) => this.call('DELETE', path, body);
}

export const ALICE = { name: 'Alice', email: 'alice@example.com', password: 'fila-de-mensagens' };
