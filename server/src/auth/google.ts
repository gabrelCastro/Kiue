import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from '../errors';

/*
 * Login com Google por OpenID Connect, fluxo de código com PKCE, feito no servidor:
 *
 *   /start    gera state, nonce e verifier (guardados num cookie curto), vai para o Google
 *   /callback confere o state, troca o código pelo ID token e lê as informações da pessoa
 *
 * O ID token chega direto do endpoint de token do Google, por TLS, com o segredo do cliente:
 * por isso as declarações (iss, aud, exp, nonce) bastam, sem verificar assinatura (OIDC Core 3.1.3.7).
 */

export interface GoogleProfile {
  /** Identificador estável da pessoa no Google (não muda se o e-mail mudar). */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface GoogleClient {
  authUrl(p: { state: string; nonce: string; challenge: string }): string;
  /** Troca o código pelo perfil; lança `HttpError` se o Google recusar ou o token não bater. */
  exchange(p: { code: string; verifier: string; nonce: string }): Promise<GoogleProfile>;
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export const b64url = (buf: Buffer) => buf.toString('base64url');

/** Segredos de um início de login: `state` (anti-CSRF), `nonce` (anti-replay) e o verifier do PKCE. */
export function newOAuthSecrets() {
  const verifier = b64url(randomBytes(32));
  return {
    state: b64url(randomBytes(24)),
    nonce: b64url(randomBytes(24)),
    verifier,
    challenge: b64url(createHash('sha256').update(verifier).digest()),
  };
}

export class HttpGoogleClient implements GoogleClient {
  constructor(
    private cfg: { clientId: string; clientSecret: string; redirectUri: string },
    private fetchFn: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {}

  authUrl({ state, nonce, challenge }: { state: string; nonce: string; challenge: string }): string {
    const q = new URLSearchParams({
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `${AUTH_ENDPOINT}?${q}`;
  }

  async exchange({ code, verifier, nonce }: { code: string; verifier: string; nonce: string }): Promise<GoogleProfile> {
    const fail = () => new HttpError('google_failed', 'Não foi possível entrar com o Google.', 502);
    let res: Response;
    try {
      res = await this.fetchFn(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
          redirect_uri: this.cfg.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw fail();
    }
    if (!res.ok) throw fail();
    const idToken = ((await res.json().catch(() => null)) as { id_token?: unknown } | null)?.id_token;
    if (typeof idToken !== 'string') throw fail();
    const part = idToken.split('.')[1];
    let claims: Record<string, unknown>;
    try {
      claims = JSON.parse(Buffer.from(part ?? '', 'base64url').toString('utf8'));
    } catch {
      throw fail();
    }
    const { iss, aud, exp, sub, email, name } = claims;
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    if (typeof iss !== 'string' || !ISSUERS.has(iss)) throw fail();
    if (aud !== this.cfg.clientId) throw fail();
    if (typeof exp !== 'number' || exp * 1000 <= this.now()) throw fail();
    if (claims.nonce !== nonce) throw fail();
    if (typeof sub !== 'string' || !sub || typeof email !== 'string' || !email) throw fail();
    return { sub, email, emailVerified: verified, name: typeof name === 'string' ? name : '' };
  }
}
