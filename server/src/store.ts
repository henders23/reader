import fs from 'node:fs';
import type { Db } from './db.ts';
import type { Annotation, Comment, Participant, SessionMeta, Selector, Tag } from '@reader/shared';
import { PARTICIPANT_COLORS } from '@reader/shared';
import { hashToken } from './passcode.ts';

type Row = Record<string, unknown>;

export interface SessionRow extends SessionMeta {
  passcode: string;
  hostKeyHash: string;
  pdfPath: string;
}

function toSession(r: Row): SessionRow {
  return {
    id: r.id as string,
    title: r.title as string,
    passcode: r.passcode as string,
    hostKeyHash: r.host_key_hash as string,
    hostId: r.host_id as string,
    pdfPath: r.pdf_path as string,
    pageCount: r.page_count as number,
    pageDims: JSON.parse(r.page_dims as string),
    scanned: !!(r.scanned as number),
    createdAt: r.created_at as number,
    expiresAt: r.expires_at as number,
    endedAt: (r.ended_at as number | null) ?? null,
  };
}

function toParticipant(r: Row, hostId: string): Participant {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    name: r.name as string,
    color: r.color as string,
    isHost: r.id === hostId,
    createdAt: r.created_at as number,
    lastSeenAt: r.last_seen_at as number,
    removedAt: (r.removed_at as number | null) ?? null,
  };
}

function toAnnotation(r: Row): Annotation {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    authorId: r.author_id as string,
    kind: r.kind as Annotation['kind'],
    page: r.page as number,
    selectors: JSON.parse(r.selectors as string) as Selector[],
    color: r.color as string,
    tag: (r.tag as Tag | null) ?? null,
    private: !!(r.private as number),
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

function toComment(r: Row): Comment {
  return {
    id: r.id as string,
    annotationId: r.annotation_id as string,
    parentId: (r.parent_id as string | null) ?? null,
    authorId: r.author_id as string,
    body: r.body as string,
    resolvedAt: (r.resolved_at as number | null) ?? null,
    createdAt: r.created_at as number,
    editedAt: (r.edited_at as number | null) ?? null,
  };
}

/** Public view of a session for a given viewer. */
export function publicSession(s: SessionRow, viewerId: string | null): SessionMeta {
  const { passcode, hostKeyHash: _h, pdfPath: _p, ...rest } = s;
  return viewerId === s.hostId ? { ...rest, passcode } : rest;
}

export class Store {
  constructor(public db: Db) {}

  // ---- sessions ----
  createSession(s: {
    id: string; title: string; passcode: string; hostKeyHash: string; hostId: string; pdfPath: string;
    pageCount: number; pageDims: unknown; scanned: boolean; pages: string[]; ttlMs: number;
  }): SessionRow {
    const now = Date.now();
    const tx = this.db.prepare(
      `INSERT INTO sessions (id, title, passcode, host_key_hash, host_id, pdf_path, page_count, page_dims, scanned, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const pageStmt = this.db.prepare('INSERT INTO pages (session_id, page, text) VALUES (?, ?, ?)');
    this.db.exec('BEGIN');
    try {
      tx.run(s.id, s.title, s.passcode, s.hostKeyHash, s.hostId, s.pdfPath, s.pageCount, JSON.stringify(s.pageDims), s.scanned ? 1 : 0, now, now + s.ttlMs);
      s.pages.forEach((text, i) => pageStmt.run(s.id, i + 1, text));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return this.getSession(s.id)!;
  }

  getSession(id: string): SessionRow | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Row | undefined;
    return r ? toSession(r) : null;
  }

  getSessionByPasscode(passcode: string): SessionRow | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE passcode = ?').get(passcode) as Row | undefined;
    return r ? toSession(r) : null;
  }

  passcodeInUse(passcode: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM sessions WHERE passcode = ?').get(passcode);
  }

  setPasscode(id: string, passcode: string): void {
    this.db.prepare('UPDATE sessions SET passcode = ? WHERE id = ?').run(passcode, id);
  }

  setTitle(id: string, title: string): void {
    this.db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id);
  }

  endSession(id: string): void {
    this.db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL').run(Date.now(), id);
  }

  extendSession(id: string, expiresAt: number): void {
    this.db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt, id);
  }

  deleteSession(id: string): void {
    const s = this.getSession(id);
    if (!s) return;
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    try {
      fs.rmSync(s.pdfPath, { force: true });
    } catch {
      /* ignore */
    }
  }

  expiredSessionIds(now = Date.now()): string[] {
    return (this.db.prepare('SELECT id FROM sessions WHERE expires_at < ?').all(now) as Row[]).map((r) => r.id as string);
  }

  pageTexts(sessionId: string): string[] {
    return (this.db.prepare('SELECT text FROM pages WHERE session_id = ? ORDER BY page').all(sessionId) as Row[]).map((r) => r.text as string);
  }

  // ---- participants ----
  createParticipant(p: { id: string; sessionId: string; name: string; token: string; hostId: string }): Participant {
    const now = Date.now();
    const used = (this.db.prepare('SELECT color FROM participants WHERE session_id = ? AND removed_at IS NULL').all(p.sessionId) as Row[]).map((r) => r.color as string);
    const color = PARTICIPANT_COLORS.find((c) => !used.includes(c)) ?? PARTICIPANT_COLORS[used.length % PARTICIPANT_COLORS.length];
    this.db
      .prepare('INSERT INTO participants (id, session_id, name, color, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(p.id, p.sessionId, p.name, color, hashToken(p.token), now, now);
    return this.getParticipant(p.id, p.hostId)!;
  }

  getParticipant(id: string, hostId: string): Participant | null {
    const r = this.db.prepare('SELECT * FROM participants WHERE id = ?').get(id) as Row | undefined;
    return r ? toParticipant(r, hostId) : null;
  }

  /** Resolve a bearer token to its participant and session. */
  authenticate(token: string): { participant: Participant; session: SessionRow } | null {
    const r = this.db.prepare('SELECT * FROM participants WHERE token_hash = ?').get(hashToken(token)) as Row | undefined;
    if (!r) return null;
    const session = this.getSession(r.session_id as string);
    if (!session) return null;
    const participant = toParticipant(r, session.hostId);
    if (participant.removedAt) return null;
    return { participant, session };
  }

  listParticipants(sessionId: string, hostId: string): Participant[] {
    return (this.db.prepare('SELECT * FROM participants WHERE session_id = ? ORDER BY created_at').all(sessionId) as Row[]).map((r) => toParticipant(r, hostId));
  }

  touchParticipant(id: string): void {
    this.db.prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?').run(Date.now(), id);
  }

  renameParticipant(id: string, name: string): void {
    this.db.prepare('UPDATE participants SET name = ? WHERE id = ?').run(name, id);
  }

  removeParticipant(id: string): void {
    this.db.prepare('UPDATE participants SET removed_at = ? WHERE id = ?').run(Date.now(), id);
  }

  // ---- annotations ----
  listAnnotations(sessionId: string, viewerId: string): Annotation[] {
    return (
      this.db
        .prepare('SELECT * FROM annotations WHERE session_id = ? AND deleted_at IS NULL AND (private = 0 OR author_id = ?) ORDER BY created_at')
        .all(sessionId, viewerId) as Row[]
    ).map(toAnnotation);
  }

  listAllAnnotations(sessionId: string): Annotation[] {
    return (this.db.prepare('SELECT * FROM annotations WHERE session_id = ? AND deleted_at IS NULL ORDER BY page, created_at').all(sessionId) as Row[]).map(toAnnotation);
  }

  getAnnotation(id: string): Annotation | null {
    const r = this.db.prepare('SELECT * FROM annotations WHERE id = ? AND deleted_at IS NULL').get(id) as Row | undefined;
    return r ? toAnnotation(r) : null;
  }

  createAnnotation(a: Omit<Annotation, 'createdAt' | 'updatedAt'>): Annotation {
    const now = Date.now();
    this.db
      .prepare('INSERT INTO annotations (id, session_id, author_id, kind, page, selectors, color, tag, private, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(a.id, a.sessionId, a.authorId, a.kind, a.page, JSON.stringify(a.selectors), a.color, a.tag, a.private ? 1 : 0, now, now);
    return this.getAnnotation(a.id)!;
  }

  updateAnnotation(id: string, patch: Partial<Pick<Annotation, 'color' | 'tag' | 'private'>>): Annotation | null {
    const cur = this.getAnnotation(id);
    if (!cur) return null;
    this.db
      .prepare('UPDATE annotations SET color = ?, tag = ?, private = ?, updated_at = ? WHERE id = ?')
      .run(patch.color ?? cur.color, patch.tag === undefined ? cur.tag : patch.tag, (patch.private ?? cur.private) ? 1 : 0, Date.now(), id);
    return this.getAnnotation(id);
  }

  deleteAnnotation(id: string): void {
    this.db.prepare('UPDATE annotations SET deleted_at = ? WHERE id = ?').run(Date.now(), id);
  }

  // ---- comments ----
  listComments(sessionId: string, viewerId: string): Comment[] {
    return (
      this.db
        .prepare(
          `SELECT c.* FROM comments c JOIN annotations a ON a.id = c.annotation_id
           WHERE a.session_id = ? AND c.deleted_at IS NULL AND a.deleted_at IS NULL AND (a.private = 0 OR a.author_id = ?)
           ORDER BY c.created_at`,
        )
        .all(sessionId, viewerId) as Row[]
    ).map(toComment);
  }

  listAllComments(sessionId: string): Comment[] {
    return (
      this.db
        .prepare(
          `SELECT c.* FROM comments c JOIN annotations a ON a.id = c.annotation_id
           WHERE a.session_id = ? AND c.deleted_at IS NULL AND a.deleted_at IS NULL ORDER BY c.created_at`,
        )
        .all(sessionId) as Row[]
    ).map(toComment);
  }

  getComment(id: string): Comment | null {
    const r = this.db.prepare('SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL').get(id) as Row | undefined;
    return r ? toComment(r) : null;
  }

  createComment(c: Pick<Comment, 'id' | 'annotationId' | 'parentId' | 'authorId' | 'body'>): Comment {
    this.db
      .prepare('INSERT INTO comments (id, annotation_id, parent_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(c.id, c.annotationId, c.parentId, c.authorId, c.body, Date.now());
    return this.getComment(c.id)!;
  }

  updateComment(id: string, body: string): Comment | null {
    this.db.prepare('UPDATE comments SET body = ?, edited_at = ? WHERE id = ?').run(body, Date.now(), id);
    return this.getComment(id);
  }

  resolveComment(id: string, resolved: boolean): Comment | null {
    this.db.prepare('UPDATE comments SET resolved_at = ? WHERE id = ?').run(resolved ? Date.now() : null, id);
    return this.getComment(id);
  }

  deleteComment(id: string): void {
    this.db.prepare('UPDATE comments SET deleted_at = ? WHERE id = ?').run(Date.now(), id);
  }

  // ---- events ----
  logEvent(sessionId: string, actorId: string | null, type: string, payload: unknown): void {
    this.db.prepare('INSERT INTO events (session_id, actor_id, type, payload, at) VALUES (?, ?, ?, ?, ?)').run(sessionId, actorId, type, JSON.stringify(payload ?? {}), Date.now());
  }
}
