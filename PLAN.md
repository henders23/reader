# Reader — lean synchronous PDF reading

> Create a session, upload a PDF, read the passcode out on the call. Everyone who joins sees each other's cursors and selections, can highlight and comment, and can export the discussion afterwards. One self-hosted process, no accounts.

This is the plan for the lean version. The earlier, larger plan (workspaces, ORCID login, LTI, analytics) is deliberately gone; the objects here are the same, so any of it can be layered on later if there is ever a reason.

---

## 1. What it is

A reading group today runs on Zoom + everyone's own PDF + "I'm on page 4, bottom left." Reader makes the paper itself the shared surface.

**Who:** you and a handful of colleagues. Sessions of 2–12 people. Trusted participants; the passcode keeps out strangers, not adversaries.

**Not in scope:** accounts, institutions, libraries, analytics, LMS integration, audio, mobile authoring, editing the PDF.

---

## 2. The experience

### Host
1. Open the site, click **Create session**, drop in a PDF, type your name.
2. Get a **passcode** (three words, e.g. `amber-fox-river`) and a link. Read the passcode aloud or paste it in chat.
3. Host controls, and nothing more: regenerate passcode, remove a participant, end session, delete session and PDF.

### Participant
1. Open the site, enter the passcode and a display name. You get a colour.
2. You are in the paper with everyone else.

### In the session
**Presence (live, never stored)**
- Cursors with name tags, in page coordinates, so they land on the same word regardless of zoom or window size.
- Viewport rectangles: a translucent box showing which part of which page each person can see, plus coloured ticks on a page strip so you can see "three of us are on p.6, Sam is still on p.2."
- Live text selection: when someone drags to select, everyone sees it in their colour as it happens. This is the single most useful feature; "*this* sentence" without saying which one.
- Laser / ephemeral ink: hold a key and draw; strokes fade after ~3 s.
- Follow: click an avatar to lock your view to theirs. Host can **spotlight** to bring everyone along; one click breaks away.
- Floating emoji reactions from your cursor.

**Annotations (stored, in the sidebar and the export)**
- Text highlights anchored to text, with a colour and an optional tag: *key claim, question, confusion, disagree, method, definition*.
- Area highlights for figures, tables, equations.
- Pinned comments at a point.
- Threads on any of the above: Markdown, LaTeX via KaTeX, @mentions, reactions, resolve.
- Private notes: a layer only you see, toggleable.
- Sidebar in two modes: *by position* (walk the paper) and *by time* (a live feed). Filter by person, tag, resolved.

**Afterwards**
- **Export** the session as Markdown: every highlight and thread in reading order, with page numbers and quoted text. Later: PDF and BibTeX.
- Sessions **expire** (default 14 days, host can extend or end early). Expiry deletes the PDF and all derived text. The expiry date and export button are always visible.

### Later, if the group wants it
Confusion heat strip in the margin (aggregate *confusion* / *question* tags), raise-hand queue, agenda checkpoints by section, session replay from the event log, arXiv/DOI import, citation lookup, audio huddle.

---

## 3. Architecture

### 3.1 Shape
**One Node process** serves the static frontend, a small HTTP API, and a WebSocket endpoint. State is SQLite plus a data directory of PDFs. Deployable as a single container with one mounted volume.

```
reader/
  server/      Node + TypeScript: Hono (HTTP) + ws (WebSocket), better-sqlite3, pdfjs-dist (Node build) for text extraction
  web/         Vite + React + TypeScript + Tailwind, pdfjs-dist for rendering, Zustand for state, KaTeX
  data/        sqlite.db, pdfs/<sessionId>.pdf, thumbs/   (mounted volume)
  Dockerfile
```

Why this shape: it is the easiest thing for a colleague at another department to run (`docker run -v ./data:/data -p 8080:8080 reader`), there is no third-party account to create, and a WebSocket server in-process is simpler than any hosted realtime product for rooms of this size.

### 3.2 Two realtime tiers, kept separate
- **Ephemeral presence** (cursors, viewports, selections, laser, reactions): WebSocket messages fanned out to the room from memory. Never written to disk. Coalesced to ≤30 Hz per client; clients interpolate so it looks smooth.
- **Persistent objects** (annotations, comments, reactions on comments): written to SQLite first, then broadcast to the room. Reconnecting clients fetch the full set over HTTP and then resume the stream.

Mixing these is the classic mistake; keeping them apart is what keeps the code small.

### 3.3 Coordinates and anchoring
- Every position is `(page, x, y)` with `x, y` normalised to `[0, 1]` of the page's PDF-point size. Never pixels. Cursors, highlights, and viewports are zoom- and device-independent for free.
- Highlights follow the W3C Web Annotation selector model, as Hypothesis does. Each stores a text quote (exact + prefix + suffix), a character position into the **server-extracted per-page text**, and cached rectangles for drawing. Re-anchor on load: position → verify quote → fuzzy quote search → rects → mark *orphaned* rather than drop. The server's text is canonical so every client anchors against the same string.
- Area highlights and pins store only rects / a point.

### 3.4 Data model (SQLite)

```
sessions      id, title, passcode, host_key_hash, pdf_path, page_count, page_dims json,
              created_at, expires_at, ended_at
pages         session_id, page, text, items json            -- canonical text for anchoring
participants  id, session_id, name, color, token_hash, created_at, last_seen_at, removed_at
annotations   id, session_id, author_id, kind (highlight|area|pin), page, selectors json,
              color, tag, private int, created_at, updated_at, deleted_at
comments      id, annotation_id, parent_id, author_id, body, resolved_at,
              created_at, edited_at, deleted_at
reactions     target_type, target_id, participant_id, emoji
events        id, session_id, actor_id, type, payload json, at   -- feed now; replay later
```

Eight tables, no joins across sessions, nothing that needs a migration framework beyond a numbered SQL file list.

### 3.5 Identity without accounts
- **Passcode** is the only thing needed to join. Three random words from a ~2000-word list (~33 bits). Join attempts are rate-limited per IP and per passcode; ten failures lock the passcode for a minute. Sessions expire. That is proportionate for colleagues and a paper, and not a substitute for real auth if the audience ever widens.
- On joining, the server issues a **participant token** stored in `localStorage`. Reconnecting with it reclaims the same identity, colour, and annotations. Losing it (new browser) means rejoining as a new participant; the host can merge or remove duplicates.
- The host gets a separate **host key** in `localStorage` at creation time; host-only actions require it. Hosts can also copy a "host link" to move to another device.
- Everyone is a peer for annotating. The only asymmetry is the host controls listed above.

### 3.6 WebSocket protocol (sketch)

```ts
// client → server
{ t: 'hello', sessionId, participantToken }
{ t: 'presence', cursor?, viewport, selection?, tool, following? }   // coalesced ≤30 Hz
{ t: 'laser', page, points }                                          // fire-and-forget
{ t: 'react', emoji, page, x, y }
{ t: 'annotation.create' | 'annotation.update' | 'annotation.delete', ... }
{ t: 'comment.create' | 'comment.update' | 'comment.delete' | 'comment.resolve', ... }

// server → clients
{ t: 'roster', participants }                     // on join/leave/rename
{ t: 'presence', from, ...state }                 // relayed
{ t: 'laser' | 'react', from, ... }               // relayed
{ t: 'annotation' | 'comment', op, row }          // after persist
{ t: 'session', op: 'ended' | 'expiring' | 'passcodeChanged' }
```

Presence is last-write-wins per participant. Annotation edits are last-write-wins by `updated_at`; comments are append-mostly, so no CRDT is needed.

### 3.7 PDF pipeline
On upload, in-process (queued so a big upload does not block the event loop for long):
1. Store the file; compute page count and page dimensions.
2. Extract per-page text with item positions (pdfjs-dist Node build) into `pages`. If a page has no text, mark the session *scanned*; highlights on those pages fall back to area highlights. OCR is not in scope.
3. Render small thumbnails for the page strip.
4. Mark ready; the host is redirected into the session.

### 3.8 Rendering
- Virtualise: render visible pages ±1 at current zoom; thumbnails elsewhere.
- Per page, three stacked layers: canvas (pdf.js), text layer (selection), and one SVG overlay for highlights, cursors, viewports, laser, positioned in normalised page space and scaled with one CSS transform, so zooming never re-lays-out annotations.
- Remote cursors update via `requestAnimationFrame` writes to a `transform` on a ref, bypassing React renders.

### 3.9 Operations
- `docker compose up` or `node server/dist/index.js` with `DATA_DIR`, `PORT`, `BASE_URL`, `SESSION_TTL_DAYS`.
- TLS via Caddy or whatever reverse proxy the host already has; WebSockets need `Upgrade` passthrough.
- Backup is copying the data directory. Restore is copying it back.
- A nightly sweep deletes expired sessions' files and rows.
- No telemetry, no external calls at runtime. The KaTeX and pdf.js assets are bundled, so it runs on an internal network.

---

## 4. Milestones

Each ends with something a real group can use on a call.

**M1 — Skeleton (week 1)**
Create session → upload → passcode → join → render with text layer and page virtualisation. Roster in the corner. Expiry and delete. *Done when:* two people are looking at the same PDF via a passcode.

**M2 — Presence (week 2)**
Cursors, viewports, page strip ticks, live selection, follow and spotlight, laser, reactions, reconnect handling. *Done when:* four people read a paper together and point at things without screen sharing. Measure round-trip latency and cursor smoothness with a 12-tab test before moving on.

**M3 — Annotations (weeks 3–4)**
Text and area highlights with the anchoring chain, pins, threads with Markdown + KaTeX + mentions, tags, private notes, sidebar (position / time), unread markers, activity feed. *Done when:* the discussion survives the call.

**M4 — Wrap-up (week 5)**
Markdown export, host controls polish, session-expiring warnings, Docker image, README for self-hosting, a few end-to-end tests with Playwright driving two browsers.

**Later, driven by use:** confusion heat strip, raise hand, agenda checkpoints, PDF/BibTeX export, replay, arXiv/DOI import, citation lookup, audio.

Dogfood from the end of M2 with your own group. Everything after M2 is shaped by what people actually do on the call.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Messy PDF text layers (ligatures, hyphenation, two columns) break anchoring | Canonical server text; selector fallback chain; *orphaned* state rather than silent loss; area highlights on scanned pages |
| Cursor traffic feels laggy | 30 Hz coalescing, client interpolation, direct DOM writes; measured at M2 |
| Large PDFs | Page virtualisation, thumbnails; cap at ~300 pages and say so |
| Passcode guessed | Three-word codes, rate limiting, expiry; audience is colleagues, stated plainly in the README |
| Lost `localStorage` means lost identity | Host link + participant token are copyable; host can merge duplicates |
| Single process is a single point of failure | Fine for one group; SQLite + data dir are trivially backed up; nothing here precludes moving to Postgres later |
| Unpublished manuscripts | Private by default, expiry deletes everything, no external calls, runs on an internal network if needed |

---

## 6. Decisions taken

- **Passcode only**, no accounts, no link secret. Audience is colleagues.
- **Single self-hosted Node process** with SQLite and a data directory; Docker image for others.
- **No audio in v1**; run it alongside whatever call the group already uses.
- **Sessions expire** by default; export is the durable artefact.

## 7. Next steps

1. Scaffold `server/` and `web/` (M1).
2. Get a two-browser cursor demo working on day one of M2 and measure latency before building anything on top of presence.
