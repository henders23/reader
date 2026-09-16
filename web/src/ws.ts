import type { ClientMsg, ServerMsg } from '@reader/shared';
import { useStore } from './store.ts';
import { api, forgetSession } from './api.ts';

type Listener = (msg: ServerMsg) => void;

class Socket {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private attempts = 0;
  private timer: number | null = null;
  private closedByUs = false;
  private listeners = new Set<Listener>();
  private pending: string[] = [];

  connect(token: string): void {
    this.token = token;
    this.closedByUs = false;
    this.attempts = 0;
    this.open();
  }

  private open(): void {
    if (!this.token) return;
    useStore.getState().setConnection(this.attempts ? 'reconnecting' : 'connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;
    const wasReconnect = this.attempts > 0;
    ws.onopen = async () => {
      this.attempts = 0;
      useStore.getState().setConnection('open');
      if (wasReconnect) {
        // We may have missed persistent changes while offline.
        await this.refreshSnapshot();
      }
      for (const p of this.pending) ws.send(p);
      this.pending = [];
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string) as ServerMsg;
      } catch {
        return;
      }
      this.dispatch(msg);
    };
    ws.onclose = (ev) => {
      if (this.closedByUs) return;
      if (ev.code === 4000 || ev.code === 4001) {
        useStore.getState().setConnection('closed');
        return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect(): void {
    if (this.timer) return;
    this.attempts++;
    useStore.getState().setConnection('reconnecting');
    const delay = Math.min(10_000, 500 * 2 ** Math.min(this.attempts, 5)) + Math.random() * 300;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.open();
    }, delay);
  }

  close(): void {
    this.closedByUs = true;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close();
    this.ws = null;
    useStore.getState().setConnection('idle');
  }

  send(msg: ClientMsg): void {
    const data = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
    else if (msg.t !== 'presence' && msg.t !== 'laser' && msg.t !== 'react' && msg.t !== 'ping') this.pending.push(data);
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private dispatch(msg: ServerMsg): void {
    const st = useStore.getState();
    switch (msg.t) {
      case 'welcome': {
        st.setRoster(msg.roster);
        for (const [id, state] of Object.entries(msg.presence)) if (id !== st.me?.id) st.setPresence(id, state);
        st.setSpotlight(msg.spotlight);
        break;
      }
      case 'roster':
        st.setRoster(msg.roster);
        break;
      case 'presence':
        if (msg.from === st.me?.id) break;
        if (msg.state.cursor === null && msg.state.viewport === null) st.clearPresence(msg.from);
        else st.setPresence(msg.from, msg.state);
        break;
      case 'spotlight':
        st.setSpotlight(msg.by);
        break;
      case 'annotation':
        if (msg.op === 'delete') st.removeAnnotation(msg.row.id);
        else st.upsertAnnotation(msg.row);
        break;
      case 'comment':
        if (msg.op === 'delete') st.removeComment(msg.row.id);
        else st.upsertComment(msg.row);
        break;
      case 'session':
        if (msg.op === 'ended') st.setSession({ endedAt: Date.now() });
        if (msg.op === 'removed') {
          if (st.sessionId) forgetSession(st.sessionId);
          st.setFatal('You were removed from this session, or it was deleted.');
        }
        if (msg.op === 'passcodeChanged') void this.refreshSnapshot();
        break;
      case 'error':
        st.toastMsg(msg.message);
        break;
    }
    for (const l of this.listeners) l(msg);
  }

  private async refreshSnapshot(): Promise<void> {
    if (!this.token) return;
    try {
      useStore.getState().applySnapshot(await api.snapshot(this.token));
    } catch {
      /* ignore */
    }
  }
}

export const socket = new Socket();
