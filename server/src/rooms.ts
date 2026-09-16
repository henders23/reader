import type { WebSocket } from 'ws';
import type { Annotation, ClientMsg, Comment, ID, Participant, PresenceState, RosterEntry, ServerMsg, Selector } from '@reader/shared';
import { TAGS } from '@reader/shared';
import type { Store, SessionRow } from './store.ts';

interface Conn {
  ws: WebSocket;
  participant: Participant;
  sessionId: ID;
  alive: boolean;
}

interface Room {
  conns: Set<Conn>;
  presence: Map<ID, PresenceState>;
  spotlight: ID | null;
}

const MAX_BODY = 20_000;
const MAX_SELECTORS_JSON = 50_000;

export class Rooms {
  private rooms = new Map<ID, Room>();

  constructor(private store: Store) {}

  private room(sessionId: ID): Room {
    let r = this.rooms.get(sessionId);
    if (!r) {
      r = { conns: new Set(), presence: new Map(), spotlight: null };
      this.rooms.set(sessionId, r);
    }
    return r;
  }

  roster(sessionId: ID, hostId: ID): RosterEntry[] {
    const room = this.rooms.get(sessionId);
    const online = new Set<ID>();
    room?.conns.forEach((c) => online.add(c.participant.id));
    return this.store
      .listParticipants(sessionId, hostId)
      .filter((p) => !p.removedAt)
      .map((p) => ({ id: p.id, name: p.name, color: p.color, isHost: p.isHost, online: online.has(p.id) }));
  }

  send(ws: WebSocket, msg: ServerMsg): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  broadcast(sessionId: ID, msg: ServerMsg, opts: { except?: WebSocket; only?: ID } = {}): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    const data = JSON.stringify(msg);
    for (const c of room.conns) {
      if (c.ws === opts.except) continue;
      if (opts.only && c.participant.id !== opts.only) continue;
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
    }
  }

  broadcastRoster(session: SessionRow): void {
    this.broadcast(session.id, { t: 'roster', roster: this.roster(session.id, session.hostId) });
  }

  /** Disconnect every socket for a participant (host removed them). */
  kick(sessionId: ID, participantId: ID): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    for (const c of room.conns) {
      if (c.participant.id === participantId) {
        this.send(c.ws, { t: 'session', op: 'removed' });
        c.ws.close(4001, 'removed');
      }
    }
  }

  closeAll(sessionId: ID, op: 'ended' | 'removed' = 'ended'): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    for (const c of room.conns) {
      this.send(c.ws, { t: 'session', op });
      c.ws.close(4000, op);
    }
    this.rooms.delete(sessionId);
  }

  join(ws: WebSocket, session: SessionRow, participant: Participant): void {
    const room = this.room(session.id);
    const conn: Conn = { ws, participant, sessionId: session.id, alive: true };
    room.conns.add(conn);
    this.store.touchParticipant(participant.id);

    const presence: Record<ID, PresenceState> = {};
    for (const [id, st] of room.presence) presence[id] = st;
    this.send(ws, { t: 'welcome', roster: this.roster(session.id, session.hostId), presence, spotlight: room.spotlight });
    this.broadcast(session.id, { t: 'roster', roster: this.roster(session.id, session.hostId) }, { except: ws });
    this.store.logEvent(session.id, participant.id, 'join', {});

    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(raw.toString()) as ClientMsg;
      } catch {
        return;
      }
      try {
        this.handle(conn, room, msg);
      } catch (e) {
        this.send(ws, { t: 'error', message: (e as Error).message });
      }
    });
    ws.on('close', () => {
      room.conns.delete(conn);
      const stillOnline = [...room.conns].some((c) => c.participant.id === participant.id);
      if (!stillOnline) {
        room.presence.delete(participant.id);
        if (room.spotlight === participant.id) {
          room.spotlight = null;
          this.broadcast(session.id, { t: 'spotlight', by: null });
        }
        this.broadcast(session.id, { t: 'presence', from: participant.id, state: { cursor: null, viewport: null, selection: null, at: Date.now() } });
        this.store.touchParticipant(participant.id);
        this.store.logEvent(session.id, participant.id, 'leave', {});
      }
      const s = this.store.getSession(session.id);
      if (s) this.broadcastRoster(s);
      if (room.conns.size === 0) this.rooms.delete(session.id);
    });
  }

  heartbeat(): void {
    for (const room of this.rooms.values()) {
      for (const c of room.conns) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
    }
  }

  private handle(conn: Conn, room: Room, msg: ClientMsg): void {
    const { participant, sessionId, ws } = conn;
    switch (msg.t) {
      case 'ping':
        this.send(ws, { t: 'pong' });
        return;
      case 'presence': {
        const state: PresenceState = { ...sanitizePresence(msg.state), at: Date.now() };
        room.presence.set(participant.id, state);
        this.broadcast(sessionId, { t: 'presence', from: participant.id, state }, { except: ws });
        return;
      }
      case 'laser':
        if (!Array.isArray(msg.points) || msg.points.length > 500) return;
        this.broadcast(sessionId, { t: 'laser', from: participant.id, page: num(msg.page), points: msg.points.slice(0, 500), id: String(msg.id).slice(0, 40), done: !!msg.done }, { except: ws });
        return;
      case 'react':
        this.broadcast(sessionId, { t: 'react', from: participant.id, emoji: String(msg.emoji).slice(0, 8), page: num(msg.page), x: clamp01(msg.x), y: clamp01(msg.y) }, { except: ws });
        return;
      case 'spotlight': {
        if (msg.on) room.spotlight = participant.id;
        else if (room.spotlight === participant.id || participant.isHost) room.spotlight = null;
        else return;
        this.broadcast(sessionId, { t: 'spotlight', by: room.spotlight });
        return;
      }
    }

    // Everything below mutates persistent state.
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error('Session gone');
    if (session.endedAt) throw new Error('This session has ended; it is read-only.');

    switch (msg.t) {
      case 'annotation.create': {
        const a = msg.annotation;
        if (!['highlight', 'area', 'pin'].includes(a.kind)) throw new Error('Bad annotation kind');
        const page = num(a.page);
        if (page < 1 || page > session.pageCount) throw new Error('Bad page');
        const selectors = sanitizeSelectors(a.selectors);
        const row = this.store.createAnnotation({
          id: String(a.id).slice(0, 40),
          sessionId,
          authorId: participant.id,
          kind: a.kind,
          page,
          selectors,
          color: String(a.color).slice(0, 16),
          tag: a.tag && (TAGS as readonly string[]).includes(a.tag) ? a.tag : null,
          private: !!a.private,
        });
        this.emitAnnotation(sessionId, 'create', row);
        this.store.logEvent(sessionId, participant.id, 'annotation.create', { id: row.id, page });
        return;
      }
      case 'annotation.update': {
        const cur = this.store.getAnnotation(msg.id);
        if (!cur || cur.sessionId !== sessionId) throw new Error('Annotation not found');
        if (cur.authorId !== participant.id) throw new Error('Only the author can edit an annotation');
        const patch: typeof msg.patch = {};
        if (msg.patch.color !== undefined) patch.color = String(msg.patch.color).slice(0, 16);
        if (msg.patch.tag !== undefined) patch.tag = msg.patch.tag && (TAGS as readonly string[]).includes(msg.patch.tag) ? msg.patch.tag : null;
        if (msg.patch.private !== undefined) patch.private = !!msg.patch.private;
        const wasPrivate = cur.private;
        const row = this.store.updateAnnotation(msg.id, patch)!;
        if (wasPrivate && !row.private) this.emitAnnotation(sessionId, 'create', row);
        else if (!wasPrivate && row.private) {
          this.broadcast(sessionId, { t: 'annotation', op: 'delete', row }, { except: ws });
          this.broadcast(sessionId, { t: 'annotation', op: 'update', row }, { only: participant.id });
        } else this.emitAnnotation(sessionId, 'update', row);
        return;
      }
      case 'annotation.delete': {
        const cur = this.store.getAnnotation(msg.id);
        if (!cur || cur.sessionId !== sessionId) return;
        if (cur.authorId !== participant.id && !participant.isHost) throw new Error('Only the author or host can delete this');
        this.store.deleteAnnotation(msg.id);
        this.emitAnnotation(sessionId, 'delete', cur);
        return;
      }
      case 'comment.create': {
        const c = msg.comment;
        const ann = this.store.getAnnotation(c.annotationId);
        if (!ann || ann.sessionId !== sessionId) throw new Error('Annotation not found');
        if (ann.private && ann.authorId !== participant.id) throw new Error('Cannot comment on a private note');
        const body = String(c.body ?? '').slice(0, MAX_BODY).trim();
        if (!body) throw new Error('Empty comment');
        let parentId: string | null = null;
        if (c.parentId) {
          const parent = this.store.getComment(c.parentId);
          if (!parent || parent.annotationId !== ann.id) throw new Error('Parent comment not found');
          parentId = parent.parentId ?? parent.id; // one level of nesting
        }
        const row = this.store.createComment({ id: String(c.id).slice(0, 40), annotationId: ann.id, parentId, authorId: participant.id, body });
        this.emitComment(sessionId, 'create', row, ann);
        this.store.logEvent(sessionId, participant.id, 'comment.create', { id: row.id, annotationId: ann.id });
        return;
      }
      case 'comment.update': {
        const cur = this.store.getComment(msg.id);
        const ann = cur && this.store.getAnnotation(cur.annotationId);
        if (!cur || !ann || ann.sessionId !== sessionId) throw new Error('Comment not found');
        if (cur.authorId !== participant.id) throw new Error('Only the author can edit a comment');
        const body = String(msg.body ?? '').slice(0, MAX_BODY).trim();
        if (!body) throw new Error('Empty comment');
        this.emitComment(sessionId, 'update', this.store.updateComment(msg.id, body)!, ann);
        return;
      }
      case 'comment.resolve': {
        const cur = this.store.getComment(msg.id);
        const ann = cur && this.store.getAnnotation(cur.annotationId);
        if (!cur || !ann || ann.sessionId !== sessionId) throw new Error('Comment not found');
        this.emitComment(sessionId, 'update', this.store.resolveComment(msg.id, !!msg.resolved)!, ann);
        return;
      }
      case 'comment.delete': {
        const cur = this.store.getComment(msg.id);
        const ann = cur && this.store.getAnnotation(cur.annotationId);
        if (!cur || !ann || ann.sessionId !== sessionId) return;
        if (cur.authorId !== participant.id && !participant.isHost) throw new Error('Only the author or host can delete this');
        this.store.deleteComment(msg.id);
        this.emitComment(sessionId, 'delete', cur, ann);
        return;
      }
    }
  }

  private emitAnnotation(sessionId: ID, op: 'create' | 'update' | 'delete', row: Annotation): void {
    if (row.private) this.broadcast(sessionId, { t: 'annotation', op, row }, { only: row.authorId });
    else this.broadcast(sessionId, { t: 'annotation', op, row });
  }

  private emitComment(sessionId: ID, op: 'create' | 'update' | 'delete', row: Comment, ann: Annotation): void {
    if (ann.private) this.broadcast(sessionId, { t: 'comment', op, row }, { only: ann.authorId });
    else this.broadcast(sessionId, { t: 'comment', op, row });
  }
}

function num(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('Bad number');
  return n;
}
function clamp01(v: unknown): number {
  return Math.min(1, Math.max(0, Number(v) || 0));
}

function sanitizePresence(s: PresenceState): PresenceState {
  const out: PresenceState = {};
  if (s.cursor) out.cursor = { page: num(s.cursor.page), x: clamp01(s.cursor.x), y: clamp01(s.cursor.y) };
  else if (s.cursor === null) out.cursor = null;
  if (s.viewport) out.viewport = { page: num(s.viewport.page), top: clamp01(s.viewport.top), pageEnd: num(s.viewport.pageEnd), bottom: clamp01(s.viewport.bottom) };
  if (s.selection && Array.isArray(s.selection.rects)) out.selection = { page: num(s.selection.page), rects: s.selection.rects.slice(0, 200) };
  else if (s.selection === null) out.selection = null;
  if (s.tool) out.tool = s.tool;
  out.following = s.following ? String(s.following).slice(0, 40) : null;
  out.handRaised = !!s.handRaised;
  return out;
}

function sanitizeSelectors(sel: unknown): Selector[] {
  if (!Array.isArray(sel)) throw new Error('Bad selectors');
  const json = JSON.stringify(sel);
  if (json.length > MAX_SELECTORS_JSON) throw new Error('Selectors too large');
  const allowed = new Set(['TextQuoteSelector', 'TextPositionSelector', 'RectSelector', 'PointSelector']);
  const out = (sel as Selector[]).filter((s) => s && allowed.has(s.type));
  if (!out.length) throw new Error('No selectors');
  return out;
}
