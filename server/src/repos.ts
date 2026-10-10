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
