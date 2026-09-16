import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Participant, SessionSnapshot } from '@reader/shared';
import { config, pdfPath } from './config.ts';
import { generatePasscode, hashToken, newId, newToken, normalisePasscode } from './passcode.ts';
import { extractPdf } from './pdf.ts';
import { RateLimiter } from './ratelimit.ts';
import { publicSession, type SessionRow, type Store } from './store.ts';
import type { Rooms } from './rooms.ts';
import { exportMarkdown } from './export.ts';

type Env = { Variables: { participant: Participant; session: SessionRow } };

export function createApp(store: Store, rooms: Rooms) {
  const app = new Hono<Env>();
  const joinByIp = new RateLimiter(30, 10 * 60_000);
  const joinByCode = new RateLimiter(10, 60_000);
  const createByIp = new RateLimiter(20, 60 * 60_000);
  setInterval(() => [joinByIp, joinByCode, createByIp].forEach((r) => r.sweep()), 10 * 60_000).unref();

  const ipOf = (c: { req: { header: (n: string) => string | undefined } }) =>
    (c.req.header('x-forwarded-for') ?? '').split(',')[0].trim() || c.req.header('x-real-ip') || 'local';

  const cleanName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

  app.get('/api/health', (c) => c.json({ ok: true }));

  // ---- create ----
  app.post('/api/sessions', bodyLimit({ maxSize: config.maxPdfBytes + 64 * 1024 }), async (c) => {
    if (!createByIp.hit(ipOf(c))) return c.json({ error: 'Too many sessions created; try again later' }, 429);
    const body = await c.req.parseBody();
    const file = body.pdf;
    const name = cleanName(body.name);
    if (!(file instanceof File)) return c.json({ error: 'Missing PDF file' }, 400);
    if (!name) return c.json({ error: 'Please enter your name' }, 400);
    if (file.size > config.maxPdfBytes) return c.json({ error: `PDF is larger than ${config.maxPdfBytes / 1024 / 1024} MB` }, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') return c.json({ error: 'That file does not look like a PDF' }, 400);

    let extracted;
    try {
      extracted = await extractPdf(bytes.slice(), config.maxPages); // pdf.js detaches the buffer it is given
    } catch (e) {
      return c.json({ error: `Could not read PDF: ${(e as Error).message}` }, 400);
    }

    const id = newId();
    let passcode = generatePasscode();
    while (store.passcodeInUse(passcode)) passcode = generatePasscode();
    const hostKey = newToken();
    const token = newToken();
    const hostId = newId();
    const title = cleanName(body.title) || extracted.title?.slice(0, 200) || file.name.replace(/\.pdf$/i, '').slice(0, 200) || 'Untitled';
    const filePath = pdfPath(id);
    fs.writeFileSync(filePath, bytes);

    const session = store.createSession({
      id, title, passcode, hostKeyHash: hashToken(hostKey), hostId, pdfPath: filePath,
      pageCount: extracted.pageCount, pageDims: extracted.pageDims, scanned: extracted.scanned,
      pages: extracted.pages, ttlMs: config.sessionTtlDays * 86_400_000,
    });
    const participant = store.createParticipant({ id: hostId, sessionId: id, name, token, hostId });
    store.logEvent(id, hostId, 'session.create', { title });
    return c.json({ sessionId: id, passcode, hostKey, token, participant, session: publicSession(session, hostId) });
  });

  // ---- join ----
  app.post('/api/join', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const passcode = normalisePasscode(String(body.passcode ?? ''));
    const name = cleanName(body.name);
    if (!passcode) return c.json({ error: 'Please enter the passcode' }, 400);
    if (!name) return c.json({ error: 'Please enter your name' }, 400);
    if (!joinByIp.hit(ipOf(c)) || !joinByCode.hit(passcode)) return c.json({ error: 'Too many attempts; wait a minute and try again' }, 429);
    const session = store.getSessionByPasscode(passcode);
    if (!session) return c.json({ error: 'No session with that passcode' }, 404);
    if (session.endedAt) return c.json({ error: 'That session has ended' }, 410);
    if (session.expiresAt < Date.now()) return c.json({ error: 'That session has expired' }, 410);
    const token = newToken();
    const participant = store.createParticipant({ id: newId(), sessionId: session.id, name, token, hostId: session.hostId });
    rooms.broadcastRoster(session);
    return c.json({ sessionId: session.id, token, participant, session: publicSession(session, participant.id) });
  });

  // ---- host moving to another device ----
  app.post('/api/host/claim', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const session = store.getSession(String(body.sessionId ?? ''));
    if (!session || session.hostKeyHash !== hashToken(String(body.hostKey ?? ''))) return c.json({ error: 'Invalid host link' }, 403);
    const token = newToken();
    store.db.prepare('UPDATE participants SET token_hash = ? WHERE id = ?').run(hashToken(token), session.hostId);
    const participant = store.getParticipant(session.hostId, session.hostId)!;
    return c.json({ sessionId: session.id, token, participant, session: publicSession(session, session.hostId) });
  });

  // ---- authenticated ----
  const auth = app.use('/api/session/*', async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : new URL(c.req.url).searchParams.get('token') ?? '';
    const res = token && store.authenticate(token);
    if (!res) return c.json({ error: 'Not signed in to a session' }, 401);
    if (res.session.expiresAt < Date.now()) return c.json({ error: 'Session expired' }, 410);
    c.set('participant', res.participant);
    c.set('session', res.session);
    await next();
  });

  const requireHost = (c: { get: (k: 'participant') => Participant }) => c.get('participant').isHost;

  auth.get('/api/session', (c) => {
    const s = c.get('session');
    const me = c.get('participant');
    store.touchParticipant(me.id);
    const snap: SessionSnapshot = {
      session: publicSession(s, me.id),
      you: me,
      roster: rooms.roster(s.id, s.hostId),
      annotations: store.listAnnotations(s.id, me.id),
      comments: store.listComments(s.id, me.id),
    };
    return c.json(snap);
  });

  auth.get('/api/session/pdf', (c) => {
    const s = c.get('session');
    const stat = fs.statSync(s.pdfPath);
    const stream = Readable.toWeb(fs.createReadStream(s.pdfPath)) as ReadableStream;
    return new Response(stream, {
      headers: { 'content-type': 'application/pdf', 'content-length': String(stat.size), 'cache-control': 'private, max-age=3600' },
    });
  });

  auth.get('/api/session/pages', (c) => c.json({ pages: store.pageTexts(c.get('session').id) }));

  auth.get('/api/session/export.md', (c) => {
    const s = c.get('session');
    const md = exportMarkdown({
      session: publicSession(s, null),
      participants: store.listParticipants(s.id, s.hostId),
      annotations: store.listAllAnnotations(s.id),
      comments: store.listAllComments(s.id),
      pages: store.pageTexts(s.id),
    });
    const filename = `${s.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'session'}.md`;
    return new Response(md, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"` } });
  });

  auth.patch('/api/session/me', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanName(body.name);
    if (!name) return c.json({ error: 'Name required' }, 400);
    store.renameParticipant(c.get('participant').id, name);
    rooms.broadcastRoster(c.get('session'));
    return c.json({ ok: true });
  });

  // ---- host controls ----
  auth.patch('/api/session', async (c) => {
    if (!requireHost(c)) return c.json({ error: 'Host only' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const s = c.get('session');
    if (body.title !== undefined) store.setTitle(s.id, cleanName(body.title) || s.title);
    if (body.extendDays !== undefined) {
      const days = Math.min(90, Math.max(1, Number(body.extendDays) || 0));
      store.extendSession(s.id, Math.max(s.expiresAt, Date.now()) + days * 86_400_000);
    }
    return c.json({ session: publicSession(store.getSession(s.id)!, s.hostId) });
  });

  auth.post('/api/session/passcode', (c) => {
    if (!requireHost(c)) return c.json({ error: 'Host only' }, 403);
    const s = c.get('session');
    let passcode = generatePasscode();
    while (store.passcodeInUse(passcode)) passcode = generatePasscode();
    store.setPasscode(s.id, passcode);
    rooms.broadcast(s.id, { t: 'session', op: 'passcodeChanged' }, { only: s.hostId });
    return c.json({ passcode });
  });

  auth.post('/api/session/remove', async (c) => {
    if (!requireHost(c)) return c.json({ error: 'Host only' }, 403);
    const s = c.get('session');
    const body = await c.req.json().catch(() => ({}));
    const target = store.getParticipant(String(body.participantId ?? ''), s.hostId);
    if (!target || target.sessionId !== s.id) return c.json({ error: 'Participant not found' }, 404);
    if (target.isHost) return c.json({ error: 'Cannot remove the host' }, 400);
    store.removeParticipant(target.id);
    rooms.kick(s.id, target.id);
    rooms.broadcastRoster(s);
    return c.json({ ok: true });
  });

  auth.post('/api/session/end', (c) => {
    if (!requireHost(c)) return c.json({ error: 'Host only' }, 403);
    const s = c.get('session');
    store.endSession(s.id);
    rooms.broadcast(s.id, { t: 'session', op: 'ended' });
    return c.json({ session: publicSession(store.getSession(s.id)!, s.hostId) });
  });

  auth.delete('/api/session', (c) => {
    if (!requireHost(c)) return c.json({ error: 'Host only' }, 403);
    const s = c.get('session');
    rooms.closeAll(s.id, 'removed');
    store.deleteSession(s.id);
    return c.json({ ok: true });
  });

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.text('Not found', 404)));

  // ---- static frontend (production) ----
  if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
    const root = path.relative(process.cwd(), config.webDist) || '.';
    app.use('/*', serveStatic({ root }));
    app.get('*', serveStatic({ root, path: 'index.html' }));
  }

  return app;
}
