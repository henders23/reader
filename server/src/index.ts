import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { Rooms } from './rooms.ts';
import { createApp } from './api.ts';

const store = new Store(openDb());
const rooms = new Rooms(store);
const app = createApp(store, rooms);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`reader listening on http://${info.address}:${info.port}  data=${config.dataDir}`);
}) as Server;

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws') return socket.destroy();
  const token = url.searchParams.get('token') ?? '';
  const auth = token && store.authenticate(token);
  if (!auth || auth.session.expiresAt < Date.now()) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => rooms.join(ws, auth.session, auth.participant));
});

setInterval(() => rooms.heartbeat(), 30_000).unref();

function sweep() {
  for (const id of store.expiredSessionIds()) {
    rooms.closeAll(id, 'ended');
    store.deleteSession(id);
    console.log(`expired session ${id} deleted`);
  }
}
sweep();
setInterval(sweep, 60 * 60_000).unref();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close();
    process.exit(0);
  });
}
