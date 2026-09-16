# Reader

Read a paper together, live. Create a session, upload a PDF, read the passcode out on the call. Everyone who joins sees each other's cursors and selections, can highlight and comment, and can export the discussion afterwards. Think Miro, but for a PDF, for a reading group.

One self-hosted Node process. SQLite and a data directory. No accounts.

## What it does

- **Presence:** live cursors with names, a bar showing which part of the page each person can see, live text selection in each person's colour, a fading laser pointer, floating emoji reactions.
- **Follow and spotlight:** click an avatar to follow someone's scrolling. Anyone can spotlight to bring the whole group to where they are; one scroll breaks away.
- **Annotations:** text highlights anchored to the text (not just to pixels), area highlights for figures, pinned comments, six optional tags (key claim, question, confusion, disagree, method, definition), six colours.
- **Discussion:** threaded comments with Markdown, LaTeX via KaTeX (`$\alpha$`), and `@name` mentions. Resolve, edit, delete.
- **Private notes:** a layer only you can see, toggled per annotation.
- **Sidebar:** by position in the paper, or by recent activity, filtered by person or tag.
- **Export:** the whole discussion as Markdown, in reading order with quoted passages.
- **Sessions expire** (14 days by default) and delete their PDF. The host can extend, end (read-only), or delete at any time, regenerate the passcode, or remove a participant.

## Run it

Requires Node 22.13 or newer (it uses the built-in SQLite module).

```bash
npm install
npm run build
npm start          # http://localhost:8080, data in ./data
```

Or with Docker:

```bash
docker compose up -d          # http://localhost:8080, data in ./data
```

Put it behind any reverse proxy that passes WebSocket upgrades (Caddy does by default):

```
reader.example.org {
    reverse_proxy localhost:8080
}
```

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Listen port |
| `DATA_DIR` | `./data` | SQLite database and uploaded PDFs |
| `SESSION_TTL_DAYS` | `14` | Sessions expire and are deleted after this many days |
| `MAX_PDF_MB` | `50` | Upload size limit |
| `MAX_PAGES` | `300` | Page count limit |
| `WEB_DIST` | `./web/dist` | Built frontend to serve |

Backup is copying `DATA_DIR`. Restore is copying it back.

## How joining works

- The host creates a session and gets a three-word passcode like `amber-fox-river`. That passcode is the only credential; there are no accounts. Join attempts are rate-limited per address and per passcode, and sessions expire, which is proportionate for a group of colleagues and a paper. It is not a substitute for real authentication if you want to open it to strangers.
- Each device that joins gets a token in its browser's local storage, so reloading or reconnecting keeps the same identity, colour, and annotations. A new browser means joining again as a new participant.
- The host also gets a host key. "Copy host link" in the Host menu moves host control to another device.
- Everyone is a peer for annotating. Only the host can end or delete the session, regenerate the passcode, remove people, or delete other people's annotations.

## Keyboard

`V` select · `H` highlight · `A` area · `P` pin · `L` laser · `Esc` back to select · `⌘/Ctrl +` `-` `0` zoom and fit · `[` toggle sidebar · `⌘/Ctrl Enter` post a comment

## Development

```bash
npm run dev          # server on :8080 (tsx watch) + Vite on :5173 with proxy
npm run typecheck
npm test             # unit tests (anchoring, page text)
npm run build && npm run e2e     # two-browser Playwright test against the built app
```

`test/smoke.sh` and `test/browser-smoke.mjs` are quicker ad-hoc checks against a running server on port 8081. If Playwright cannot download Chromium, point `CHROMIUM_PATH` at a local one.

## Layout

```
shared/   types, the WebSocket protocol, canonical page text, highlight anchoring
server/   Hono HTTP API + ws rooms + node:sqlite store + pdf.js text extraction + Markdown export
web/      Vite + React + pdf.js viewer, presence, annotations, sidebar
e2e/      Playwright spec
```

Two realtime tiers are kept apart on purpose: presence (cursors, viewports, selections, laser, reactions) is fanned out from memory and never stored; annotations and comments are written to SQLite first and then broadcast. Every position is stored in normalised page coordinates, so cursors and highlights land in the same place at any zoom. Highlights store a text quote, a character position into the server-extracted page text, and cached rectangles, and are re-anchored in that order.

See [PLAN.md](./PLAN.md) for the design and what is deliberately left out.
