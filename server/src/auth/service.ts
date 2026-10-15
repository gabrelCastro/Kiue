import type { Config } from '../config';
import type { Mailer } from '../mail';
import type { GoogleProfile } from './google';
import { EmailTakenError, type IdentityRepo, type ResetRepo, type SessionRepo, type UserRecord, type UserRepo } from '../repos';
import { HttpError } from '../errors';
import { hashPassword, needsRehash, verifyPassword } from './password';
import type { RateLimiter } from './rate-limit';
import { hashToken, newId, newToken } from './tokens';
import { NAME_MAX, normalizeEmail, passwordInput, tokenInput, validateName, validateNewPassword } from './validation';

const DAY = 86_400_000;
const MINUTE = 60_000;
/** Atualizar `expires_at` a cada requisição custaria uma escrita por chamada; uma vez por hora basta. */
const TOUCH_INTERVAL = 60 * MINUTE;

/** O que a API devolve sobre o usuário (nunca o hash da senha). */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  /** Tem senha própria (conta só-Google não tem). */
  hasPassword: boolean;
  /** Conta vinculada ao Google. */
  google: boolean;
}

export interface SessionInfo {
  user: PublicUser;
  sessionId: string;
  /** Novo prazo do cookie quando a sessão foi renovada nesta requisição. */
  renewedUntil?: number;
}

export interface IssuedSession {
  user: PublicUser;
  /** Valor do cookie: só vai para o navegador, o banco guarda o hash. */
  token: string;
  expiresAt: number;
}

export interface Limiters {
  /** Falhas de login por e-mail: protege uma conta específica. */
  loginByEmail: RateLimiter;
  /** Falhas de login por IP: freia quem testa muitas contas. */
  loginByIp: RateLimiter;
  registerByIp: RateLimiter;
  resetByEmail: RateLimiter;
  resetByIp: RateLimiter;
}

export interface AuthDeps {
  config: Config;
  users: UserRepo;
  identities: IdentityRepo;
  sessions: SessionRepo;
  resets: ResetRepo;
  mailer: Mailer;
  limiters: Limiters;
  now?: () => number;
}

export const toPublic = (u: UserRecord, google = false): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt,
  hasPassword: u.passwordHash !== '',
  google,
});

export class AuthService {
  private readonly now: () => number;
  /** Hash de uma senha qualquer: o login de e-mail inexistente gasta o mesmo tempo que um real. */
  private dummyHash: Promise<string>;

  constructor(private readonly deps: AuthDeps) {
    this.now = deps.now ?? Date.now;
    this.dummyHash = hashPassword(newToken(), deps.config.scryptCost);
  }

  // ───────────── cadastro e login ─────────────

  async register(input: { name?: unknown; email?: unknown; password?: unknown }, ctx: { ip: string; userAgent: string | null }): Promise<IssuedSession> {
    this.guard(this.deps.limiters.registerByIp, ctx.ip, 'Muitos cadastros a partir desta rede. Tente mais tarde.');
    const name = validateName(input.name);
    const email = normalizeEmail(input.email);
    const password = validateNewPassword(input.password, 'password', email);
    this.deps.limiters.registerByIp.hit(ctx.ip);

    const now = this.now();
    const user: UserRecord = { id: newId(), email, name, passwordHash: await hashPassword(password, this.deps.config.scryptCost), createdAt: now, updatedAt: now };
    try {
      this.deps.users.insert(user);
    } catch (e) {
      if (e instanceof EmailTakenError) throw new HttpError('email_taken', 'Já existe uma conta com este e-mail. Entre ou redefina a senha.', 409, 'email');
      throw e;
    }
    return this.issueSession(user, ctx.userAgent);
  }

  async login(input: { email?: unknown; password?: unknown }, ctx: { ip: string; userAgent: string | null }): Promise<IssuedSession> {
    const email = normalizeEmail(input.email);
    const password = passwordInput(input.password);
    const { loginByEmail, loginByIp } = this.deps.limiters;
    this.guard(loginByIp, ctx.ip, 'Muitas tentativas a partir desta rede. Tente mais tarde.');
    this.guard(loginByEmail, email, 'Muitas tentativas para esta conta. Espere um pouco ou redefina a senha.');

    const user = this.deps.users.findByEmail(email);
    const ok = user ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, await this.dummyHash), false);
    if (!user || !ok) {
      loginByEmail.hit(email);
      loginByIp.hit(ctx.ip);
      // mesma mensagem para e-mail inexistente e senha errada: não revela quem tem conta
      throw new HttpError('invalid_credentials', 'E-mail ou senha incorretos.', 401);
    }
    loginByEmail.reset(email);
    if (needsRehash(user.passwordHash, this.deps.config.scryptCost)) {
      this.deps.users.updatePassword(user.id, await hashPassword(password, this.deps.config.scryptCost), this.now());
    }
    return this.issueSession(user, ctx.userAgent);
  }

  // ───────────── login com Google ─────────────

  /**
   * Entra (ou cria/vincula) a conta do perfil do Google, sempre exigindo e-mail verificado:
   *  1. identidade já vinculada → entra nessa conta (mesmo que o e-mail tenha mudado);
   *  2. e-mail igual ao de uma conta existente → vincula automaticamente;
   *  3. senão → cria uma conta nova, sem senha.
   *
   * Como o cadastro por senha não confirma o e-mail, quem pré-cadastrou o e-mail de outra pessoa
   * ficaria com a senha dela depois da vinculação. Por isso, ao vincular uma conta com senha, a
   * senha é anulada e as sessões abertas caem; quem for o dono volta com o Google (ou "esqueci a senha").
   */
  loginWithGoogle(profile: GoogleProfile, ctx: { userAgent: string | null }): IssuedSession {
    if (!profile.emailVerified) throw new HttpError('google_unverified', 'O Google não confirmou o e-mail desta conta.', 403);
    const { users, identities, sessions, resets } = this.deps;
    const now = this.now();
    const email = normalizeEmail(profile.email);

    const linkedId = identities.findUserId('google', profile.sub);
    if (linkedId) {
      const linked = users.findById(linkedId);
      if (linked) return this.issueSession(linked, ctx.userAgent);
    }

    const existing = users.findByEmail(email);
    if (existing) {
      identities.insert('google', profile.sub, existing.id, now);
      if (existing.passwordHash !== '') {
        users.updatePassword(existing.id, '', now);
        sessions.deleteByUser(existing.id);
        resets.invalidateByUser(existing.id, now);
      }
      return this.issueSession(users.findById(existing.id)!, ctx.userAgent);
    }

    const user: UserRecord = { id: newId(), email, name: googleName(profile.name, email), passwordHash: '', createdAt: now, updatedAt: now };
    users.insert(user);
    identities.insert('google', profile.sub, user.id, now);
    return this.issueSession(user, ctx.userAgent);
  }

  // ───────────── sessão ─────────────

  /** Resolve o cookie numa sessão válida (ou `null`), renovando o prazo de inatividade. */
  authenticate(token: string | undefined): SessionInfo | null {
    if (!token || token.length > 100) return null;
    const id = hashToken(token);
    const session = this.deps.sessions.find(id);
    const now = this.now();
    if (!session) return null;
    if (session.expiresAt <= now) {
      this.deps.sessions.delete(id);
      return null;
    }
    const user = this.deps.users.findById(session.userId);
    if (!user) return null;
    const info: SessionInfo = { user: this.publicUser(user), sessionId: id };
    if (now - session.lastSeenAt >= TOUCH_INTERVAL) {
      const cap = session.createdAt + this.deps.config.sessionMaxDays * DAY;
      const expiresAt = Math.min(now + this.deps.config.sessionIdleDays * DAY, cap);
      this.deps.sessions.touch(id, now, expiresAt);
      info.renewedUntil = expiresAt;
    }
    return info;
  }

  logout(sessionId: string): void {
    this.deps.sessions.delete(sessionId);
  }

  /** Encerra as outras sessões (outros navegadores e aparelhos). */
  logoutOthers(userId: string, currentSessionId: string): number {
    return this.deps.sessions.deleteByUser(userId, currentSessionId);
  }

  // ───────────── conta ─────────────

  updateProfile(userId: string, input: { name?: unknown }): PublicUser {
    const name = validateName(input.name);
    this.deps.users.updateName(userId, name, this.now());
    return this.publicUser(this.deps.users.findById(userId)!);
  }

  /** Troca a senha sabendo a atual; derruba as outras sessões (quem roubou a senha antiga sai). */
  async changePassword(userId: string, sessionId: string, input: { currentPassword?: unknown; newPassword?: unknown }): Promise<void> {
    const current = passwordInput(input.currentPassword, 'currentPassword');
    const user = this.deps.users.findById(userId)!;
    const next = validateNewPassword(input.newPassword, 'newPassword', user.email);
    this.guard(this.deps.limiters.loginByEmail, user.email, 'Muitas tentativas. Espere um pouco.');
    if (!(await verifyPassword(current, user.passwordHash))) {
      this.deps.limiters.loginByEmail.hit(user.email);
      throw new HttpError('invalid_credentials', 'Senha atual incorreta.', 401, 'currentPassword');
    }
    this.deps.users.updatePassword(userId, await hashPassword(next, this.deps.config.scryptCost), this.now());
    this.deps.sessions.deleteByUser(userId, sessionId);
    this.deps.resets.invalidateByUser(userId, this.now());
  }

  /** Com senha, confirma pela senha; conta só-Google confirma digitando o próprio e-mail. */
  async deleteAccount(userId: string, input: { password?: unknown; email?: unknown }): Promise<void> {
    const user = this.deps.users.findById(userId)!;
    if (user.passwordHash === '') {
      if (normalizeEmail(input.email) !== user.email) throw new HttpError('invalid_credentials', 'O e-mail não confere com o da conta.', 400, 'email');
    } else {
      const password = passwordInput(input.password);
      if (!(await verifyPassword(password, user.passwordHash))) throw new HttpError('invalid_credentials', 'Senha incorreta.', 401, 'password');
    }
    this.deps.users.delete(userId); // sessões e links caem junto (ON DELETE CASCADE)
  }

  // ───────────── esqueci a senha ─────────────

  /**
   * Sempre responde do mesmo jeito, exista a conta ou não (não revela quem tem cadastro).
   * Se existir, envia um link de uso único que vale `resetTokenMinutes`.
   */
  async requestPasswordReset(input: { email?: unknown }, ctx: { ip: string }): Promise<void> {
    const email = normalizeEmail(input.email);
    const { resetByEmail, resetByIp } = this.deps.limiters;
    this.guard(resetByIp, ctx.ip, 'Muitos pedidos a partir desta rede. Tente mais tarde.');
    resetByIp.hit(ctx.ip);
    // por e-mail o limite é silencioso: avisar que estourou revelaria que a conta existe
    if (resetByEmail.retryAfter(email) > 0) return;
    resetByEmail.hit(email);

    const user = this.deps.users.findByEmail(email);
    if (!user) return;
    const now = this.now();
    const token = newToken();
    this.deps.resets.invalidateByUser(user.id, now);
    this.deps.resets.insert({ id: hashToken(token), userId: user.id, createdAt: now, expiresAt: now + this.deps.config.resetTokenMinutes * MINUTE, usedAt: null });
    const link = `${this.deps.config.appUrl.replace(/\/$/, '')}/?reset=${token}`;
    await this.deps.mailer.send({
      to: user.email,
      subject: 'Kiuê: redefinir sua senha',
      text: [
        `Olá, ${user.name}!`,
        '',
        'Recebemos um pedido para redefinir a senha da sua conta no Kiuê.',
        `Abra o link abaixo em até ${this.deps.config.resetTokenMinutes} minutos:`,
        '',
        link,
        '',
        'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
      ].join('\n'),
    });
  }

  /** Define a nova senha a partir do link; o link morre e todas as sessões caem. */
  async resetPassword(input: { token?: unknown; newPassword?: unknown }): Promise<void> {
    const token = tokenInput(input.token);
    const reset = this.deps.resets.find(hashToken(token));
    const now = this.now();
    if (!reset || reset.usedAt !== null || reset.expiresAt <= now) throw new HttpError('invalid_token', 'Link inválido ou expirado. Peça um novo.', 400);
    const user = this.deps.users.findById(reset.userId);
    if (!user) throw new HttpError('invalid_token', 'Link inválido ou expirado. Peça um novo.', 400);
    const next = validateNewPassword(input.newPassword, 'newPassword', user.email);
    this.deps.users.updatePassword(user.id, await hashPassword(next, this.deps.config.scryptCost), now);
    this.deps.resets.markUsed(reset.id, now);
    this.deps.sessions.deleteByUser(user.id);
    this.deps.limiters.loginByEmail.reset(user.email);
  }

  // ───────────── manutenção ─────────────

  purgeExpired(): { sessions: number; resets: number } {
    const now = this.now();
    return { sessions: this.deps.sessions.deleteExpired(now), resets: this.deps.resets.deleteExpired(now) };
  }

  private issueSession(user: UserRecord, userAgent: string | null): IssuedSession {
    const now = this.now();
    const token = newToken();
    const expiresAt = now + this.deps.config.sessionIdleDays * DAY;
    this.deps.sessions.insert({ id: hashToken(token), userId: user.id, createdAt: now, expiresAt, lastSeenAt: now, userAgent: userAgent?.slice(0, 200) ?? null });
    return { user: this.publicUser(user), token, expiresAt };
  }

  private publicUser(user: UserRecord): PublicUser {
    return toPublic(user, this.deps.identities.hasProvider(user.id, 'google'));
  }

  private guard(limiter: RateLimiter, key: string, message: string): void {
    const wait = limiter.retryAfter(key);
    if (wait > 0) throw new HttpError('rate_limited', message, 429, undefined, wait);
  }
}

/** Nome do perfil do Google dentro dos limites do jogo; sem nome, usa o começo do e-mail. */
function googleName(raw: string, email: string): string {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
  return name || email.split('@')[0]!.slice(0, NAME_MAX);
}
