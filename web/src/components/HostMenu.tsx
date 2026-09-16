import { useState } from 'react';
import { api, forgetSession, loadSaved, saveSession } from '../api.ts';
import { useStore } from '../store.ts';
import { navigate } from '../App.tsx';
import { daysLeft } from '../ids.ts';

export function HostMenu() {
  const session = useStore((s) => s.session!);
  const token = useStore((s) => s.token!);
  const hostKey = useStore((s) => s.hostKey);
  const setSession = useStore((s) => s.setSession);
  const toast = useStore((s) => s.toastMsg);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast(`Could not copy; ${what}: ${text}`);
    }
  };

  const regenerate = () =>
    run(async () => {
      const { passcode } = await api.regeneratePasscode(token);
      setSession({ passcode });
      const saved = loadSaved()[session.id];
      if (saved) saveSession({ ...saved, passcode });
      toast('New passcode issued; the old one no longer works');
    });

  const rename = () => {
    const title = prompt('Session title', session.title);
    if (title === null || !title.trim()) return;
    run(async () => setSession((await api.updateSession(token, { title: title.trim() })).session));
  };

  const extend = () => run(async () => setSession((await api.updateSession(token, { extendDays: 7 })).session));

  const end = () => {
    if (!confirm('End the session for everyone? It becomes read-only; the export still works until it expires.')) return;
    run(async () => setSession((await api.endSession(token)).session));
  };

  const del = () => {
    if (!confirm('Delete this session, its PDF and every comment? This cannot be undone.')) return;
    run(async () => {
      await api.deleteSession(token);
      forgetSession(session.id);
      navigate('/');
    });
  };

  const hostLink = `${location.origin}/s/${session.id}#host=${hostKey ?? ''}`;

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-100">
        Host ▾
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-zinc-200 bg-white p-2 text-sm shadow-xl" onMouseLeave={() => setOpen(false)}>
          <div className="rounded-lg bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">Passcode</div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <code className="text-base font-semibold tracking-wide">{session.passcode}</code>
              <button onClick={() => copy(session.passcode ?? '', 'Passcode')} className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs hover:bg-white">
                Copy
              </button>
            </div>
            <button onClick={() => copy(`${location.origin}/?code=${session.passcode}`, 'Join link')} className="mt-2 w-full rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-white">
              Copy join link (passcode pre-filled)
            </button>
          </div>
          <div className="my-1 border-t border-zinc-100" />
          <MenuItem onClick={regenerate} disabled={busy}>
            Regenerate passcode
          </MenuItem>
          <MenuItem onClick={rename} disabled={busy}>
            Rename session…
          </MenuItem>
          <MenuItem onClick={extend} disabled={busy}>
            Extend by 7 days <span className="text-zinc-400">(expires in {daysLeft(session.expiresAt)}d)</span>
          </MenuItem>
          {hostKey && <MenuItem onClick={() => copy(hostLink, 'Host link')}>Copy host link (for another device)</MenuItem>}
          <div className="my-1 border-t border-zinc-100" />
          {!session.endedAt && (
            <MenuItem onClick={end} disabled={busy} danger>
              End session (read-only)
            </MenuItem>
          )}
          <MenuItem onClick={del} disabled={busy} danger>
            Delete session and PDF
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`block w-full rounded-md px-2.5 py-1.5 text-left disabled:opacity-50 ${danger ? 'text-rose-600 hover:bg-rose-50' : 'hover:bg-zinc-100'}`}>
      {children}
    </button>
  );
}
