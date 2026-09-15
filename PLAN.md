# Reader — synchronous collaborative PDF reading

> Working name: **Reader**. "Miro for PDFs": a shared PDF where you can see everyone's cursors, what they're looking at, and what they're saying, in real time. Built for academics reading a paper *together*, live, not just leaving notes for each other.

This document is the product and technical plan. It is meant to be argued with and revised.

---

## 1. Why this exists

Every existing annotation tool for papers is asynchronous at heart:

| Tool | Model | Gap |
|---|---|---|
| Talis Elevate, Perusall | Social annotation for courses | No live presence; comment threads only |
| Hypothesis | Web/PDF annotation layer | Great anchoring, no synchronous session |
| Kami, Adobe, Drawboard | Live co-annotation of PDFs | Aimed at classrooms/office, not scholarly reading; no citations, math, or discussion structure |
| alphaXiv, Fermat's Library | Public paper discussion | Async, public, one paper at a time |
| Zotero / Paperpile | Library management | Personal notes; no realtime |

A reading group today runs on Zoom + everyone's own PDF + "can you see my screen, I'm on page 4, bottom left." The screen-sharer has all the agency, and nothing anyone says is anchored to the text afterwards.

**Reader's bet:** make the *paper itself* the shared surface. Everyone has their own cursor and scroll position, everyone can point and mark, and everything said is anchored to a passage and survives the call.

Primary user: a small group (2–12) of researchers or grad students in a reading group, lab meeting, or journal club. Secondary: a supervisor and student going through a draft; a seminar of ~30 students with an instructor.

---

## 2. Core experience (MVP)

The MVP is the smallest thing that is obviously better than Zoom + PDF.

### 2.1 Open a paper together
- Upload a PDF, or paste an arXiv ID / DOI / URL. Get a room link.
- Join by link. Signed-in users get a persistent identity; guests pick a name and colour. Sign-in via Google, GitHub, and **ORCID** (academics already have one).
- Roles: owner, editor (annotate), commenter, viewer. Link sharing per role.

### 2.2 Presence — the "Miro" layer
Everything here is ephemeral and high frequency. Nothing in this section is stored.

- **Live cursors** with name tags, in page-space coordinates so they land on the same word regardless of zoom or window size.
- **Viewport indicators**: a translucent rectangle showing what region of which page each person can see. Also shown as coloured ticks on a page strip / minimap on the side, so you can see at a glance "three people are on page 6, one is still on page 2."
- **Live selection**: when someone drags to select text, everyone sees the selection highlighted in that person's colour as they drag. This is the single most useful presence feature for reading together: "*this* sentence" without saying which one.
- **Laser pointer / ephemeral ink**: hold a key to draw strokes that fade after ~3 s. For "look at this arrow in Fig. 2."
- **Follow mode**: click a participant's avatar to lock your viewport to theirs. A facilitator can **spotlight** (bring everyone to me), with an unobtrusive "you're being brought along; click to break away" affordance.
- **Reactions**: transient emoji that float up from your cursor. Cheap synchronous signal ("agree", "confused", "wait, what?").

### 2.3 Annotations — the persistent layer
Everything here is stored and appears in the sidebar and in exports.

- **Text highlight**, anchored to text (see §4.3 for how), with a colour and an optional **type tag**: *key claim, question, confusion, disagree, method, definition, todo*. Tags make later filtering and the "confusion heatmap" (§3) possible.
- **Area highlight** for figures, tables, and equations (a rectangle in page space).
- **Pinned comment**: a point marker with a thread. For "why is this here?" without a specific passage.
- **Threads** on any annotation: Markdown, **LaTeX via KaTeX** (`$\alpha$` must just work for this audience), @mentions, reactions, resolve/unresolve.
- **Sidebar** with two views: *by position* (walk the paper top to bottom) and *by time* (a live feed of what's happening right now). Filters by person, tag, resolved state.
- **Private notes**: a per-user layer that only you see, toggleable. People will not use a shared tool for their real thoughts unless they can also keep some private.

### 2.4 Activity
- Activity feed in the sidebar: "Priya highlighted on p.4 · Sam replied to Alex · Jordan joined."
- Unread indicators on pages and threads since you last looked.

---

## 3. Features beyond the MVP (recommended)

Ranked by how much they matter for the *synchronous academic* use case specifically.

### Tier A — makes the live session work
1. **Session mode.** Start a "session" inside a room: it has a facilitator, an optional agenda (e.g. sections of the paper as checkpoints), a timer, and a **speaking queue / raise hand**. Everything annotated during the session is grouped, so afterwards there is a "Journal club, 14 Oct" bundle.
2. **Session recap export.** One click after the session: a Markdown/PDF summary of all highlights and threads in reading order, plus BibTeX for the paper. Push to Zotero as notes. Email digest to participants. This is the artefact that makes people come back.
3. **Confusion heatmap.** Aggregate *confusion* and *question* tags across participants and render a heat strip in the margin. Facilitators see at a glance where the group got lost. Anonymous by default in classroom settings.
4. **Built-in voice (huddle).** WebRTC audio via LiveKit or Daily so the group does not need a parallel Zoom. Voice activity shown on the avatar. Recommend shipping *without* this first and validating that people will run Zoom alongside; add when retention data says the friction matters.

### Tier B — academic depth
5. **Citation resolution.** Click an in-text citation or a bibliography entry and get title/authors/abstract from Crossref / OpenAlex / Semantic Scholar, with "open in a new room" and "add to reading list." Reference extraction via GROBID.
6. **Import from arXiv / DOI / Semantic Scholar.** Paste an identifier and the PDF plus metadata is fetched. Deduplicate by PDF fingerprint so two groups reading the same preprint can optionally see each other's public annotations.
7. **Figure and equation lens.** Double-click a figure to open it in a shared zoomable lens that everyone in follow mode sees. Equations get a "render as LaTeX" attempt (via Mathpix-style OCR later).
8. **Full-text search** across the paper and across all annotations in a group library.
9. **Compare mode.** Two papers (or two versions of a draft) side by side with linked scrolling. Useful for supervisor/student draft reviews.
10. **Group library.** A workspace holds many papers, a reading schedule, and cross-paper search of everything the group has ever said.

### Tier C — differentiators
11. **Session replay.** Because all events are logged, scrub through a past session: cursors move, highlights appear, threads unfold. Miro has version history; nobody has this for a reading group. Also the basis for "catch up on what I missed."
12. **AI assist (opt-in, per room).** Explain a selected passage; define a term in context; summarise a thread; "what did we conclude in this session?"; suggest related papers. Keep it firmly secondary and never let it write into the shared layer without a human clicking.
13. **Anonymous mode** for teaching: students appear as animals/colours to each other, real names to the instructor.
14. **Integrations:** Zotero (bi-directional notes), Slack/Discord notifications for new threads, Google Drive / Dropbox import, calendar invites for scheduled sessions.
15. **Public/embeddable rooms** for open journal clubs and post-publication discussion.

### Explicitly out of scope (for now)
- Editing the PDF itself (form filling, redaction).
- Mobile-first authoring. Mobile/tablet should be able to *follow* and read threads; authoring can be desktop-only initially.
- Video.

---

## 4. Technical design

### 4.1 Guiding principles
- **Two realtime tiers, kept apart.** Ephemeral presence (cursors, viewports, selections, laser, reactions) is high-frequency, lossy-OK, never persisted. Annotations and comments are low-frequency, must be durable, queryable, exportable, and permissioned. Mixing them in one channel or one data model is the most common mistake in this space.
- **Page-space coordinates everywhere.** Every position is `(page, x, y)` with `x, y` normalised to `[0, 1]` of the page's PDF-point dimensions. Never pixels. This makes cursors, highlights, and viewports zoom- and device-independent for free.
- **Anchor to text, render from rects.** Highlights are stored as text selectors (robust) *and* cached rectangles (fast to draw). If the rects ever disagree with the text (different PDF build, OCR update), the text wins and the rects are recomputed.
- **Postgres is the source of truth for anything persistent.** A CRDT (Yjs) is the right tool for co-editing *prose*; our persistent objects are discrete and append-mostly (highlights, comments), so rows with realtime fan-out are simpler, queryable, and easier to permission with row-level security. If we later add co-edited shared notes, that one document becomes a Yjs doc.

### 4.2 Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Standard, deploys to Vercel trivially |
| PDF rendering | `pdfjs-dist` directly (not a wrapper) | Need control over the text layer, page virtualisation, and coordinate mapping |
| Local state | Zustand | Small, fine-grained subscriptions for 60 fps cursor updates |
| Auth, DB, storage, realtime | **Supabase** (Postgres + RLS, Storage for PDFs, Realtime Broadcast + Presence, Auth with Google/GitHub/ORCID via OIDC) | One backend, no separate WebSocket server to run, RLS gives per-room permissions at the data layer |
| Presence transport | Supabase Realtime **Broadcast** (cursors, selections, laser) + **Presence** (who is here) | Adequate for rooms ≤ ~50. Wrapped behind a `PresenceProvider` interface so it can be swapped for Liveblocks or a Yjs/PartyKit server if we hit limits |
| Persistent sync | Postgres `postgres_changes` subscriptions per room | Annotations appear on everyone's screen within ~100 ms of insert |
| Server-side PDF processing | Node worker (pdf.js in Node, or PyMuPDF in a small Python service) | Per-page text extraction, page dimensions, thumbnails, SHA-256 fingerprint |
| Math | KaTeX | Fast, synchronous, good enough for comments |
| Hosting | Vercel (web) + Supabase (backend) | Both already connected to this workspace |
| Later | LiveKit (audio), GROBID (references), OpenAlex/Crossref/Semantic Scholar APIs (metadata) | |

**Alternatives considered.**
- *Liveblocks*: fastest path to great presence (cursors, comments, and threads are products). Costs money per MAU and you rent your core differentiator. Reasonable choice if speed to demo matters more than cost.
- *Yjs + Hocuspocus/PartyKit*: most control and offline-first; overkill for discrete annotations, and means running and scaling a WebSocket tier ourselves.
- Recommendation: Supabase now, behind interfaces, so either alternative is a two-file swap.

### 4.3 Anchoring highlights (the hard problem)

Follow the W3C Web Annotation model, as Hypothesis does. Each text highlight stores several selectors:

```json
{
  "page": 4,
  "selectors": [
    { "type": "TextQuoteSelector", "exact": "we observe a 3.2× speedup", "prefix": "Under these conditions ", "suffix": " over the baseline" },
    { "type": "TextPositionSelector", "start": 1842, "end": 1868 },
    { "type": "RectSelector", "rects": [[0.12, 0.44, 0.61, 0.46]] }
  ]
}
```

- `TextPositionSelector` offsets are into the **server-extracted per-page text**, which is canonical for all clients. Client-side pdf.js text extraction can differ across versions; the server copy is what everyone anchors against.
- On load, try position → verify quote matches → fall back to fuzzy quote search → fall back to rects → mark as *orphaned* (still visible in the sidebar, flagged).
- Area highlights and pins store only `RectSelector` / a point.

### 4.4 Presence message shape

Broadcast at most ~30 Hz per client, coalesced; clients interpolate incoming cursors so 30 Hz looks smooth.

```ts
type PresenceState = {
  userId: string; name: string; color: string;
  cursor?: { page: number; x: number; y: number };
  viewport: { page: number; top: number; bottom: number; pageEnd?: number }; // normalised
  selection?: { page: number; rects: [number, number, number, number][] };
  tool: 'pointer' | 'highlight' | 'area' | 'pin' | 'laser';
  following?: string;          // userId being followed
  handRaised?: boolean;
  updatedAt: number;
};
// Laser strokes and reactions are separate fire-and-forget broadcast events.
```

### 4.5 Data model (Postgres)

```
users            id, name, avatar_url, orcid, color
workspaces       id, name, owner_id                       -- group library
documents        id, workspace_id, title, sha256, storage_path, page_count,
                 page_dims jsonb, metadata jsonb (doi, arxiv_id, authors, year), created_by
document_pages   document_id, page, text, text_items jsonb  -- canonical text for anchoring
rooms            id, document_id, workspace_id, slug, settings jsonb, created_by
room_members     room_id, user_id, role (owner|editor|commenter|viewer)
sessions         id, room_id, facilitator_id, started_at, ended_at, agenda jsonb
annotations      id, room_id, session_id?, author_id, kind (highlight|area|pin|ink),
                 page, selectors jsonb, color, tag, visibility (shared|private),
                 created_at, updated_at, deleted_at
comments         id, annotation_id, parent_id?, author_id, body (markdown),
                 mentions uuid[], resolved_at, created_at, edited_at, deleted_at
reactions        target_type, target_id, user_id, emoji
events           id, room_id, session_id?, actor_id, type, payload jsonb, at   -- append-only; feeds + replay
```

Row-level security keyed on `room_members` gives per-room permissions without an API layer in the way. Private annotations are filtered by `visibility = 'private' AND author_id = auth.uid()`.

### 4.6 Rendering and performance
- Virtualise pages: render the visible pages ±1 at current zoom; keep low-res thumbnails for the rest so scrolling never shows blank.
- Three stacked layers per page: canvas (pdf.js), text layer (selection + anchoring), and an SVG/DOM **overlay layer** for highlights, cursors, viewports, laser. The overlay is positioned in normalised page space and scaled with a single CSS transform, so zooming never re-lays-out annotations.
- Cursor updates bypass React re-renders: write straight to a `transform` on the cursor element via a ref, driven by a `requestAnimationFrame` interpolation loop.
- Text extraction and thumbnails happen once on upload, not on every open.

### 4.7 Ingestion pipeline
1. Upload to Supabase Storage (or fetch from arXiv/DOI resolver).
2. Worker: SHA-256 fingerprint → dedupe; page count and dimensions; per-page text with item positions; thumbnails; metadata lookup by DOI/arXiv ID if present (else attempt title extraction from page 1).
3. If a page has no text layer, flag the document as *scanned*; run OCR (Tesseract or a hosted OCR) in a later phase.
4. Mark document ready; room opens.

### 4.8 Security and privacy
- Unpublished manuscripts are the norm here. PDFs are private by default, served via short-lived signed URLs, encrypted at rest. Rooms can be set to expire. Deleting a document deletes the file and all derived text.
- Never index or train on user content. Say so in plain words in the UI.
- Guest identities are scoped to a room and cannot see the workspace library.

---

## 5. Roadmap

Each phase ends with something usable by a real reading group.

**Phase 0 — Skeleton (≈1 week)**
Repo, Next.js + Supabase scaffolding, auth, upload, ingestion worker, PDF render with text layer and page virtualisation, room links with roles. *Done when:* two people can open the same PDF via a link.

**Phase 1 — Presence (≈2 weeks)**
Cursors, viewport indicators, page strip with participant ticks, live selection, follow mode + spotlight, laser, floating reactions. *Done when:* a group of four can read a paper together and point at things without screen sharing.

**Phase 2 — Annotations (≈2–3 weeks)**
Text and area highlights with robust anchoring, pins, threaded comments with Markdown + KaTeX + mentions, tags, sidebar (by position / by time), activity feed, private notes, unread state. *Done when:* the reading group's discussion survives the call and can be revisited.

**Phase 3 — Session mode (≈2 weeks)**
Start/end session, facilitator, agenda checkpoints, hand raise / speaking queue, timer, confusion heatmap, recap export (Markdown, PDF, BibTeX, Zotero). *Done when:* a journal club prefers this to Zoom + PDF and gets a recap afterwards.

**Phase 4 — Academic depth (≈3 weeks)**
arXiv/DOI import, metadata and citation resolution, GROBID references, figure/equation lens, full-text and annotation search, group library, compare mode.

**Phase 5 — Differentiators (ongoing)**
Session replay from the event log, built-in audio, AI assist, anonymous classroom mode, integrations, public rooms.

Dogfood from the end of Phase 1 with one real reading group; every phase after that is shaped by what they actually do.

---

## 6. Risks and how we handle them

| Risk | Mitigation |
|---|---|
| PDF text layers are messy (ligatures, hyphenation, columns), breaking highlight anchoring | Canonical server-side text; multiple selectors with fallback chain; orphaned state instead of silent loss; OCR path for scans |
| Cursor traffic feels laggy or jittery | 30 Hz coalesced broadcast, client-side interpolation, direct DOM writes; measured on a 12-person room before Phase 1 ships |
| Large PDFs (200-page theses, scanned books) | Page virtualisation, thumbnails, lazy text-layer creation; cap initial support at ~300 pages and say so |
| Supabase Broadcast limits at larger rooms | Presence abstracted behind an interface; swap to Liveblocks / Yjs server if a room ever exceeds ~50 |
| Copyright of uploaded papers | Private by default, no public index, standard takedown flow; public rooms only for content the owner asserts they may share |
| Nobody wants another tool alongside Zoom | Ship without audio first and measure; recap export gives a reason to use it even if the call happens elsewhere |
| Feature sprawl toward "another Hypothesis" | Every phase must improve the *synchronous* session; async-only features wait |

---

## 7. Decisions to confirm

These are the choices that materially change the work. Defaults are in bold; the plan above assumes them.

1. **Backend:** **Supabase** vs Liveblocks vs self-hosted Yjs. Supabase is already connected to this workspace and keeps one backend.
2. **Audio in v1?** **No**; validate with Zoom alongside first.
3. **Auth providers:** **Google + GitHub + ORCID**, plus guest access by link.
4. **First real users:** which reading group dogfoods Phase 1?
5. **Name and domain.**

---

## 8. Immediate next steps

1. Confirm the decisions in §7.
2. Scaffold Phase 0: Next.js app, Supabase project and schema from §4.5, upload → ingest → render.
3. Build a throwaway two-browser cursor demo on day one of Phase 1 to measure latency before designing anything else on top.
