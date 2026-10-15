import type { Database } from './db';

/*
 * Acesso a dados atrás de interfaces: o serviço de autenticação não sabe que é SQLite. Para levar
 * a API para a AWS (Lambda + DynamoDB), basta outra implementação destas interfaces.
 */

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  userAgent: string | null;
}

export interface ResetRecord {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
}

export interface UserRepo {
  findByEmail(email: string): UserRecord | null;
  findById(id: string): UserRecord | null;
  /** Falha com `EmailTakenError` se o e-mail já existir (a checagem é do banco, sem corrida). */
  insert(user: UserRecord): void;
  updatePassword(id: string, passwordHash: string, now: number): void;
  updateName(id: string, name: string, now: number): void;
  delete(id: string): void;
}

export interface IdentityRepo {
  /** Dono de uma identidade externa (`provider` + `sub`), se já vinculada. */
  findUserId(provider: string, subject: string): string | null;
  insert(provider: string, subject: string, userId: string, now: number): void;
  hasProvider(userId: string, provider: string): boolean;
}

export interface SessionRepo {
  insert(session: SessionRecord): void;
  find(id: string): SessionRecord | null;
  touch(id: string, lastSeenAt: number, expiresAt: number): void;
  delete(id: string): void;
  deleteByUser(userId: string, exceptId?: string): number;
  deleteExpired(now: number): number;
}

export interface ResetRepo {
  insert(reset: ResetRecord): void;
  find(id: string): ResetRecord | null;
  markUsed(id: string, now: number): void;
  /** Invalida os links ainda abertos de um usuário (só o mais recente vale). */
  invalidateByUser(userId: string, now: number): void;
  deleteExpired(now: number): number;
}

export interface ProgressRecord {
  levelId: string;
  stars: number;
  quizCorrect: number | null;
  updatedAt: number;
}

export interface ProgressRepo {
  list(userId: string): ProgressRecord[];
  /** Grava cada fase guardando o melhor entre o que já existe e o que chegou. */
  mergeBest(userId: string, entries: ProgressRecord[]): void;
  clear(userId: string): void;
}

export interface SandboxSummary {
  id: string;
  name: string;
  nodeCount: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface SandboxRecord extends SandboxSummary {
  userId: string;
  /** Grafo serializado em JSON. */
  graph: string;
}

export interface SandboxRepo {
  list(userId: string): SandboxSummary[];
  count(userId: string): number;
  find(userId: string, id: string): SandboxRecord | null;
  insert(s: SandboxRecord): void;
  /** Atualiza só se a revisão ainda for `expectedRevision`; devolve se atualizou. */
  update(userId: string, id: string, expectedRevision: number, patch: { name: string; graph: string; nodeCount: number; updatedAt: number }): boolean;
  delete(userId: string, id: string): boolean;
}

export class EmailTakenError extends Error {}

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

const toUser = (r: UserRow): UserRecord => ({
  id: r.id,
  email: r.email,
  name: r.name,
  passwordHash: r.password_hash,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SqliteUserRepo implements UserRepo {
  constructor(private db: Database) {}

  findByEmail(email: string): UserRecord | null {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  findById(id: string): UserRecord | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  insert(u: UserRecord): void {
    try {
      this.db
        .prepare('INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(u.id, u.email, u.name, u.passwordHash, u.createdAt, u.updatedAt);
    } catch (e) {
      if (e instanceof Error && /UNIQUE constraint failed: users\.email/.test(e.message)) throw new EmailTakenError();
      throw e;
    }
  }

  updatePassword(id: string, passwordHash: string, now: number): void {
    this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, now, id);
  }

  updateName(id: string, name: string, now: number): void {
    this.db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
}

interface SessionRow {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
  user_agent: string | null;
}

export class SqliteSessionRepo implements SessionRepo {
  constructor(private db: Database) {}

  insert(s: SessionRecord): void {
    this.db
      .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
      .run(s.id, s.userId, s.createdAt, s.expiresAt, s.lastSeenAt, s.userAgent);
  }

  find(id: string): SessionRecord | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    return r ? { id: r.id, userId: r.user_id, createdAt: r.created_at, expiresAt: r.expires_at, lastSeenAt: r.last_seen_at, userAgent: r.user_agent } : null;
  }

  touch(id: string, lastSeenAt: number, expiresAt: number): void {
    this.db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(lastSeenAt, expiresAt, id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  deleteByUser(userId: string, exceptId?: string): number {
    const r = exceptId
      ? this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(userId, exceptId)
      : this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    return Number(r.changes);
  }

  deleteExpired(now: number): number {
    return Number(this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes);
  }
}

interface ResetRow {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
}

export class SqliteResetRepo implements ResetRepo {
  constructor(private db: Database) {}

  insert(r: ResetRecord): void {
    this.db
      .prepare('INSERT INTO password_resets (id, user_id, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?)')
      .run(r.id, r.userId, r.createdAt, r.expiresAt, r.usedAt);
  }

  find(id: string): ResetRecord | null {
    const r = this.db.prepare('SELECT * FROM password_resets WHERE id = ?').get(id) as ResetRow | undefined;
    return r ? { id: r.id, userId: r.user_id, createdAt: r.created_at, expiresAt: r.expires_at, usedAt: r.used_at } : null;
  }

  markUsed(id: string, now: number): void {
    this.db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now, id);
  }

  invalidateByUser(userId: string, now: number): void {
    this.db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(now, userId);
  }

  deleteExpired(now: number): number {
    return Number(this.db.prepare('DELETE FROM password_resets WHERE expires_at <= ? OR used_at IS NOT NULL').run(now).changes);
  }
}

interface ProgressRow {
  level_id: string;
  stars: number;
  quiz_correct: number | null;
  updated_at: number;
}

export class SqliteProgressRepo implements ProgressRepo {
  constructor(private db: Database) {}

  list(userId: string): ProgressRecord[] {
    const rows = this.db.prepare('SELECT level_id, stars, quiz_correct, updated_at FROM progress WHERE user_id = ? ORDER BY level_id').all(userId) as unknown as ProgressRow[];
    return rows.map((r) => ({ levelId: r.level_id, stars: r.stars, quizCorrect: r.quiz_correct, updatedAt: r.updated_at }));
  }

  mergeBest(userId: string, entries: ProgressRecord[]): void {
    // MAX(NULL, x) é NULL no SQLite: COALESCE mantém o quiz quando um dos lados não tem
    const stmt = this.db.prepare(`
      INSERT INTO progress (user_id, level_id, stars, quiz_correct, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (user_id, level_id) DO UPDATE SET
        stars = MAX(stars, excluded.stars),
        quiz_correct = MAX(COALESCE(quiz_correct, excluded.quiz_correct), COALESCE(excluded.quiz_correct, quiz_correct)),
        updated_at = excluded.updated_at
      WHERE excluded.stars > stars OR COALESCE(excluded.quiz_correct, -1) > COALESCE(quiz_correct, -1)`);
    for (const e of entries) stmt.run(userId, e.levelId, e.stars, e.quizCorrect, e.updatedAt);
  }

  clear(userId: string): void {
    this.db.prepare('DELETE FROM progress WHERE user_id = ?').run(userId);
  }
}

interface SandboxRow {
  id: string;
  user_id: string;
  name: string;
  graph: string;
  node_count: number;
  revision: number;
  created_at: number;
  updated_at: number;
}

const toSummary = (r: Omit<SandboxRow, 'graph' | 'user_id'>): SandboxSummary => ({
  id: r.id,
  name: r.name,
  nodeCount: r.node_count,
  revision: r.revision,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SqliteSandboxRepo implements SandboxRepo {
  constructor(private db: Database) {}

  list(userId: string): SandboxSummary[] {
    const rows = this.db
      .prepare('SELECT id, name, node_count, revision, created_at, updated_at FROM sandboxes WHERE user_id = ? ORDER BY updated_at DESC, id')
      .all(userId) as unknown as SandboxRow[];
    return rows.map(toSummary);
  }

  count(userId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM sandboxes WHERE user_id = ?').get(userId) as { n: number }).n;
  }

  find(userId: string, id: string): SandboxRecord | null {
    const r = this.db.prepare('SELECT * FROM sandboxes WHERE user_id = ? AND id = ?').get(userId, id) as SandboxRow | undefined;
    return r ? { ...toSummary(r), userId: r.user_id, graph: r.graph } : null;
  }

  insert(s: SandboxRecord): void {
    this.db
      .prepare('INSERT INTO sandboxes (id, user_id, name, graph, node_count, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(s.id, s.userId, s.name, s.graph, s.nodeCount, s.revision, s.createdAt, s.updatedAt);
  }

  update(userId: string, id: string, expectedRevision: number, p: { name: string; graph: string; nodeCount: number; updatedAt: number }): boolean {
    const r = this.db
      .prepare('UPDATE sandboxes SET name = ?, graph = ?, node_count = ?, updated_at = ?, revision = revision + 1 WHERE user_id = ? AND id = ? AND revision = ?')
      .run(p.name, p.graph, p.nodeCount, p.updatedAt, userId, id, expectedRevision);
    return Number(r.changes) === 1;
  }

  delete(userId: string, id: string): boolean {
    return Number(this.db.prepare('DELETE FROM sandboxes WHERE user_id = ? AND id = ?').run(userId, id).changes) === 1;
  }
}

export class SqliteIdentityRepo implements IdentityRepo {
  constructor(private db: Database) {}

  findUserId(provider: string, subject: string): string | null {
    const r = this.db.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?').get(provider, subject) as { user_id: string } | undefined;
    return r?.user_id ?? null;
  }

  insert(provider: string, subject: string, userId: string, now: number): void {
    this.db.prepare('INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)').run(provider, subject, userId, now);
  }

  hasProvider(userId: string, provider: string): boolean {
    return this.db.prepare('SELECT 1 FROM identities WHERE user_id = ? AND provider = ?').get(userId, provider) !== undefined;
  }
}
