import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { config } from './config.ts';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    passcode TEXT NOT NULL UNIQUE,
    host_key_hash TEXT NOT NULL,
    host_id TEXT NOT NULL,
    pdf_path TEXT NOT NULL,
    page_count INTEGER NOT NULL,
    page_dims TEXT NOT NULL,
    scanned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ended_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS pages (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (session_id, page)
  );
  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    removed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS participants_session ON participants(session_id);
  CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    page INTEGER NOT NULL,
    selectors TEXT NOT NULL,
    color TEXT NOT NULL,
    tag TEXT,
    private INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS annotations_session ON annotations(session_id);
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    parent_id TEXT,
    author_id TEXT NOT NULL,
    body TEXT NOT NULL,
    resolved_at INTEGER,
    created_at INTEGER NOT NULL,
    edited_at INTEGER,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS comments_annotation ON comments(annotation_id);
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    actor_id TEXT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_session ON events(session_id, at);
  `,
];

export function openDb(file = path.join(config.dataDir, 'reader.db')): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[i]);
    if (row) db.prepare('UPDATE schema_version SET version = ?').run(i + 1);
    else db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    db.exec('COMMIT');
    version = i + 1;
  }
  return db;
}

export type Db = DatabaseSync;
