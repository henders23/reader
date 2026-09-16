import { useEffect, useState } from 'react';
import type { ServerMsg } from '@reader/shared';
import { api, ApiError, forgetSession, loadSaved, saveSession } from '../api.ts';
import { navigate } from '../App.tsx';
import { loadPdf, type PDFDocumentProxy } from '../pdf.ts';
import { useStore } from '../store.ts';
import { socket } from '../ws.ts';
import { presence } from '../presence.ts';
import { laser, reactions } from '../ephemeral.ts';
import { pageTexts } from '../viewer/pageText.ts';
import { Viewer } from '../viewer/Viewer.tsx';
import { PageStrip } from '../viewer/PageStrip.tsx';
import { Sidebar } from '../components/Sidebar.tsx';
import { Roster } from '../components/Roster.tsx';
import { Toolbar } from '../components/Toolbar.tsx';
import { HostMenu } from '../components/HostMenu.tsx';
import { daysLeft } from '../ids.ts';

type Phase = { kind: 'loading'; msg: string } | { kind: 'join' } | { kind: 'ready' } | { kind: 'error'; msg: string };

export function SessionPage({ sessionId }: { sessionId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', msg: 'Opening session…' });
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const fatal = useStore((s) => s.fatal);

  useEffect(() => {
    let cancelled = false;
    const st = useStore.getState();
    st.reset();
    pageTexts.clear();

    (async () => {
      let saved = loadSaved()[sessionId];
      const hostKey = new URLSearchParams(location.hash.slice(1)).get('host');
      if (hostKey) {
        history.replaceState(null, '', location.pathname);
        try {
          const r = await api.claimHost(sessionId, hostKey);
          saved = { sessionId, token: r.token, hostKey, name: r.participant.name, title: r.session.title, passcode: r.session.passcode, savedAt: Date.now() };
          saveSession(saved);
        } catch (e) {
          setPhase({ kind: 'error', msg: (e as Error).message });
          return;
        }
      }
      if (!saved) {
        setPhase({ kind: 'join' });
        return;
      }
      await open(saved.token, saved.hostKey ?? null);
    })();

    async function open(token: string, hostKey: string | null) {
      try {
        setPhase({ kind: 'loading', msg: 'Loading session…' });
        const snap = await api.snapshot(token);
        if (cancelled) return;
        useStore.getState().setIdentity({ sessionId, token, hostKey });
        useStore.getState().applySnapshot(snap);
        setPhase({ kind: 'loading', msg: 'Loading PDF…' });
        const bytes = await api.pdfBytes(token);
        const doc = await loadPdf(bytes);
        if (cancelled) return;
        setPdf(doc);
        socket.connect(token);
        setPhase({ kind: 'ready' });
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 410 || e.status === 404)) {
          forgetSession(sessionId);
          setPhase(e.status === 401 ? { kind: 'join' } : { kind: 'error', msg: e.message });
        } else setPhase({ kind: 'error', msg: (e as Error).message });
      }
    }

    (window as unknown as { __openSession?: typeof open }).__openSession = open;
    return () => {
      cancelled = true;
      socket.close();
      useStore.getState().reset();
    };
  }, [sessionId]);

  // Ephemeral message routing (laser strokes, reactions).
  useEffect(() => {
    return socket.on((msg: ServerMsg) => {
      if (msg.t === 'laser') laser.upsert({ id: msg.id, from: msg.from, page: msg.page, points: msg.points, done: !!msg.done });
      if (msg.t === 'react') reactions.add({ id: `${msg.from}-${Date.now()}-${Math.random()}`, from: msg.from, emoji: msg.emoji, page: msg.page, x: msg.x, y: msg.y });
      if (msg.t === 'welcome') presence.resend();
    });
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      const st = useStore.getState();
      const ended = !!st.session?.endedAt;
      const key = e.key.toLowerCase();
      if (e.metaKey || e.ctrlKey) {
        if (key === '=' || key === '+') {
          e.preventDefault();
          st.setScale(st.scale * 1.15);
        } else if (key === '-') {
          e.preventDefault();
          st.setScale(st.scale / 1.15);
        } else if (key === '0') {
          e.preventDefault();
          window.dispatchEvent(new Event('reader:fit'));
        }
        return;
      }
      if (key === 'v') st.setTool('pointer');
      else if (key === 'h' && !ended) st.setTool('highlight');
      else if (key === 'a' && !ended) st.setTool('area');
      else if (key === 'p' && !ended) st.setTool('pin');
      else if (key === 'l') st.setTool('laser');
      else if (key === 'escape') {
        st.setTool('pointer');
        st.select(null);
        window.getSelection()?.removeAllRanges();
      } else if (key === '[' || key === ']') st.toggleSidebar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (fatal) return <Center title="Session unavailable" body={fatal} />;
  if (phase.kind === 'error') return <Center title="Could not open session" body={phase.msg} />;
  if (phase.kind === 'join') return <InlineJoin onJoined={(token) => (window as unknown as { __openSession: (t: string, h: string | null) => Promise<void> }).__openSession(token, null)} />;
  if (phase.kind === 'loading' || !pdf) return <Center title="Reader" body={phase.kind === 'loading' ? phase.msg : 'Loading…'} spinner />;
  return <Workspace pdf={pdf} />;
}

function Workspace({ pdf }: { pdf: PDFDocumentProxy }) {
  const session = useStore((s) => s.session!);
  const me = useStore((s) => s.me!);
  const token = useStore((s) => s.token!);
  const connection = useStore((s) => s.connection);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const toast = useStore((s) => s.toast);
  const toastMsg = useStore((s) => s.toastMsg);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => toastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toast, toastMsg]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-3 py-2 select-none">
        <button onClick={() => navigate('/')} className="text-sm font-semibold tracking-tight text-indigo-700 hover:underline">
          Reader
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={session.title}>
            {session.title}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${connection === 'open' ? 'bg-emerald-500' : connection === 'reconnecting' ? 'bg-amber-500' : 'bg-zinc-400'}`} />
            {connection === 'open' ? 'Live' : connection === 'reconnecting' ? 'Reconnecting…' : connection === 'closed' ? 'Disconnected' : 'Connecting…'}
            {session.endedAt ? <span className="rounded bg-zinc-200 px-1 font-medium text-zinc-700">Ended · read-only</span> : <span>· expires in {daysLeft(session.expiresAt)}d</span>}
            {session.scanned && <span className="text-amber-700">· scanned PDF: no text layer, use area highlights</span>}
          </div>
        </div>
        <Toolbar />
        <Roster />
        <a href={api.exportUrl(token)} download className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium leading-9 hover:bg-zinc-100" title="Export the discussion as Markdown">
          Export
        </a>
        {me.isHost && <HostMenu />}
        <button onClick={toggleSidebar} className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm hover:bg-zinc-100" title="Toggle sidebar ( [ )">
          {sidebarOpen ? '▸' : '◂'}
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <Viewer pdf={pdf} />
        <PageStrip />
        {sidebarOpen && <Sidebar />}
      </div>
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
          <div className="pop-in rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}

function InlineJoin({ onJoined }: { onJoined: (token: string) => void }) {
  const [name, setName] = useState(() => localStorage.getItem('reader:name') ?? '');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.join(passcode, name.trim());
      localStorage.setItem('reader:name', name.trim());
      saveSession({ sessionId: r.sessionId, token: r.token, name: name.trim(), title: r.session.title, savedAt: Date.now() });
      if (r.sessionId !== location.pathname.split('/')[2]) navigate(`/s/${r.sessionId}`);
      else onJoined(r.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col gap-3">
        <h1 className="text-lg font-semibold">Join this session</h1>
        <p className="text-sm text-zinc-600">This device isn't part of the session yet. Enter the passcode.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" maxLength={40} />
        <input value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="amber-fox-river" autoCapitalize="off" spellCheck={false} className="rounded-lg border border-zinc-300 px-3 py-2 font-mono" />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button disabled={busy || !name.trim() || !passcode.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? 'Joining…' : 'Join'}
        </button>
        <button type="button" onClick={() => navigate('/')} className="text-xs text-zinc-500 hover:underline">
          Back to home
        </button>
      </form>
    </div>
  );
}

function Center({ title, body, spinner }: { title: string; body: string; spinner?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      {spinner && <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />}
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-zinc-600">{body}</p>
      {!spinner && (
        <button onClick={() => navigate('/')} className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white">
          Back to home
        </button>
      )}
    </div>
  );
}
