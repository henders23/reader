// Two-client WebSocket smoke test. Requires tokens from test/smoke.sh in /tmp.
import fs from 'node:fs';
import WebSocket from 'ws';
const base = process.argv[2] ?? 'ws://localhost:8081';
const alice = fs.readFileSync('/tmp/alice.token', 'utf8').trim();
const bob = fs.readFileSync('/tmp/bob.token', 'utf8').trim();

const open = (token) => new Promise((res, rej) => {
  const ws = new WebSocket(`${base}/ws?token=${token}`);
  const inbox = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  ws.on('open', () => res({ ws, inbox }));
  ws.on('error', rej);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const a = await open(alice);
const b = await open(bob);
await wait(200);
console.log('alice welcome roster:', a.inbox.find((m) => m.t === 'welcome')?.roster.map((r) => `${r.name}${r.online ? '*' : ''}`));
b.ws.send(JSON.stringify({ t: 'presence', state: { cursor: { page: 1, x: 0.5, y: 0.25 }, viewport: { page: 1, top: 0, pageEnd: 1, bottom: 0.9 }, tool: 'pointer' } }));
a.ws.send(JSON.stringify({ t: 'annotation.create', annotation: { id: 'ann1', kind: 'highlight', page: 1, color: '#fde047', tag: 'claim', private: false, selectors: [
  { type: 'TextQuoteSelector', exact: '3.2x speedup', prefix: 'We observe a ', suffix: ' over the baseline' },
  { type: 'TextPositionSelector', start: 72, end: 84 },
  { type: 'RectSelector', rects: [{ x: 0.2, y: 0.1, w: 0.1, h: 0.02 }] } ] } }));
await wait(200);
b.ws.send(JSON.stringify({ t: 'comment.create', comment: { id: 'c1', annotationId: 'ann1', parentId: null, body: 'Is this $3.2\\times$ figure from Table 2?' } }));
a.ws.send(JSON.stringify({ t: 'annotation.create', annotation: { id: 'priv1', kind: 'pin', page: 2, color: '#fde047', tag: null, private: true, selectors: [{ type: 'PointSelector', x: 0.3, y: 0.3 }] } }));
b.ws.send(JSON.stringify({ t: 'annotation.delete', id: 'ann1' })); // not author, not host -> error
await wait(300);
console.log('alice got presence from bob:', JSON.stringify(a.inbox.find((m) => m.t === 'presence')?.state.cursor));
console.log('bob got annotation:', b.inbox.filter((m) => m.t === 'annotation').map((m) => `${m.op}:${m.row.id}`));
console.log('alice got annotation:', a.inbox.filter((m) => m.t === 'annotation').map((m) => `${m.op}:${m.row.id}`));
console.log('alice got comment:', a.inbox.filter((m) => m.t === 'comment').map((m) => `${m.op}:${m.row.body}`));
console.log('bob error:', b.inbox.find((m) => m.t === 'error')?.message);
b.ws.close();
await wait(200);
console.log('alice roster after bob left:', a.inbox.filter((m) => m.t === 'roster').at(-1)?.roster.map((r) => `${r.name}${r.online ? '*' : ''}`));
a.ws.close();
