import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Migrações em ordem. Cada uma roda uma vez, dentro de uma transação; a versão aplicada fica em
 * `PRAGMA user_version`. Nunca edite uma migração já publicada: acrescente outra.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  -- o id é o SHA-256 do token do cookie: vazar o banco não entrega sessões válidas
  CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    user_agent  TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE INDEX sessions_expires ON sessions(expires_at);

  CREATE TABLE password_resets (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER
  );
  CREATE INDEX password_resets_user ON password_resets(user_id);
  `,
  `
  -- uma linha por fase concluída; a mesclagem guarda sempre o melhor resultado
  CREATE TABLE progress (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level_id     TEXT NOT NULL,
    stars        INTEGER NOT NULL,
    quiz_correct INTEGER,
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (user_id, level_id)
  ) WITHOUT ROWID;

  -- o grafo fica como JSON: o servidor guarda e devolve, quem interpreta é o jogo
  CREATE TABLE sandboxes (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    graph       TEXT NOT NULL,
    node_count  INTEGER NOT NULL,
    revision    INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX sandboxes_user ON sandboxes(user_id, updated_at DESC);
  `,
];

export type Database = DatabaseSync;

export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
  }
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
