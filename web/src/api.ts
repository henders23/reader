import type { Participant, SessionMeta, SessionSnapshot } from '@reader/shared';

export interface SavedSession {
  sessionId: string;
  token: string;
  hostKey?: string;
  name: string;
  title: string;
  passcode?: string;
  savedAt: number;
}

const KEY = 'reader:sessions';

export function loadSaved(): Record<string, SavedSession> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveSession(s: SavedSession): void {
  const all = loadSaved();
  all[s.sessionId] = s;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function forgetSession(sessionId: string): void {
  const all = loadSaved();
  delete all[sessionId];
  localStorage.setItem(KEY, JSON.stringify(all));
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

interface JoinResult {
  sessionId: string;
  token: string;
  participant: Participant;
  session: SessionMeta;
  passcode?: string;
  hostKey?: string;
}

export const api = {
  async createSession(pdf: File, name: string, title: string): Promise<JoinResult> {
    const fd = new FormData();
    fd.append('pdf', pdf);
    fd.append('name', name);
    if (title) fd.append('title', title);
    return handle(await fetch('/api/sessions', { method: 'POST', body: fd }));
  },
  async join(passcode: string, name: string): Promise<JoinResult> {
    return handle(
      await fetch('/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passcode, name }) }),
    );
  },
  async claimHost(sessionId: string, hostKey: string): Promise<JoinResult> {
    return handle(
      await fetch('/api/host/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, hostKey }) }),
    );
  },
  async snapshot(token: string): Promise<SessionSnapshot> {
    return handle(await fetch('/api/session', { headers: { authorization: `Bearer ${token}` } }));
  },
  async pdfBytes(token: string): Promise<ArrayBuffer> {
    const res = await fetch('/api/session/pdf', { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new ApiError(res.status, 'Could not load PDF');
    return res.arrayBuffer();
  },
  async rename(token: string, name: string): Promise<void> {
    await handle(await fetch('/api/session/me', { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name }) }));
  },
  async updateSession(token: string, patch: { title?: string; extendDays?: number }): Promise<{ session: SessionMeta }> {
    return handle(await fetch('/api/session', { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(patch) }));
  },
  async regeneratePasscode(token: string): Promise<{ passcode: string }> {
    return handle(await fetch('/api/session/passcode', { method: 'POST', headers: { authorization: `Bearer ${token}` } }));
  },
  async removeParticipant(token: string, participantId: string): Promise<void> {
    await handle(await fetch('/api/session/remove', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ participantId }) }));
  },
  async endSession(token: string): Promise<{ session: SessionMeta }> {
    return handle(await fetch('/api/session/end', { method: 'POST', headers: { authorization: `Bearer ${token}` } }));
  },
  async deleteSession(token: string): Promise<void> {
    await handle(await fetch('/api/session', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }));
  },
  exportUrl(token: string): string {
    return `/api/session/export.md?token=${encodeURIComponent(token)}`;
  },
};
