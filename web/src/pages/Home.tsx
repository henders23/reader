import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, forgetSession, loadSaved, saveSession } from '../api.ts';
import { navigate } from '../App.tsx';
import { timeAgo } from '../ids.ts';

const NAME_KEY = 'reader:name';

export function Home() {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [passcode, setPasscode] = useState(() => new URLSearchParams(location.search).get('code') ?? '');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<{ where: 'create' | 'join'; msg: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [savedVersion, bump] = useState(0);
  const saved = useMemo(() => Object.values(loadSaved()).sort((a, b) => b.savedAt - a.savedAt), [savedVersion]);

  useEffect(() => localStorage.setItem(NAME_KEY, name), [name]);

  const needName = () => {
    if (!name.trim()) {
      setError({ where: busy ?? 'create', msg: 'Please enter your name first' });
      return false;
    }
    return true;
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError({ where: 'create', msg: 'Choose a PDF to read' });
    setBusy('create');
    if (!needName()) return setBusy(null);
    try {
      const r = await api.createSession(file, name.trim(), title.trim());
      saveSession({ sessionId: r.sessionId, token: r.token, hostKey: r.hostKey, name: name.trim(), title: r.session.title, passcode: r.passcode, savedAt: Date.now() });
      navigate(`/s/${r.sessionId}`);
    } catch (err) {
      setError({ where: 'create', msg: err instanceof ApiError ? err.message : 'Upload failed' });
    } finally {
      setBusy(null);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy('join');
    if (!needName()) return setBusy(null);
    try {
      const r = await api.join(passcode, name.trim());
      saveSession({ sessionId: r.sessionId, token: r.token, name: name.trim(), title: r.session.title, savedAt: Date.now() });
      navigate(`/s/${r.sessionId}`);
    } catch (err) {
      setError({ where: 'join', msg: err instanceof ApiError ? err.message : 'Could not join' });
    } finally {
      setBusy(null);
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  return (
    <div className="min-h-full flex flex-col items-center px-4 py-10">
      <header className="w-full max-w-4xl mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reader</h1>
          <p className="text-zinc-600 mt-1">Read a paper together. Share a passcode, see each other's cursors, leave anchored comments.</p>
        </div>
      </header>

      <div className="w-full max-w-4xl mb-6">
        <label className="block text-sm font-medium text-zinc-700 mb-1">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How others will see you"
          className="w-full sm:w-80 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          maxLength={40}
        />
      </div>

      <div className="w-full max-w-4xl grid gap-6 md:grid-cols-2">
        <form onSubmit={create} className="rounded-2xl bg-white border border-zinc-200 p-6 shadow-sm flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">Start a session</h2>
            <p className="text-sm text-zinc-600">Upload a PDF. You'll get a passcode to share.</p>
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition ${
              dragging ? 'border-indigo-500 bg-indigo-50' : 'border-zinc-300 hover:border-zinc-400'
            }`}
          >
            {file ? (
              <span className="font-medium text-zinc-800">{file.name}</span>
            ) : (
              <span className="text-zinc-600">Drop a PDF here or click to choose</span>
            )}
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional; taken from the PDF if blank)"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            maxLength={200}
          />
          {error?.where === 'create' && <p className="text-sm text-rose-600">{error.msg}</p>}
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy === 'create' ? 'Uploading…' : 'Create session'}
          </button>
        </form>

        <form onSubmit={join} className="rounded-2xl bg-white border border-zinc-200 p-6 shadow-sm flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">Join a session</h2>
            <p className="text-sm text-zinc-600">Enter the passcode the host gave you.</p>
          </div>
          <input
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="amber-fox-river"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="rounded-lg border border-zinc-300 px-3 py-3 font-mono text-lg tracking-wide focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {error?.where === 'join' && <p className="text-sm text-rose-600">{error.msg}</p>}
          <button
            type="submit"
            disabled={busy !== null || !passcode.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy === 'join' ? 'Joining…' : 'Join'}
          </button>
        </form>
      </div>

      {saved.length > 0 && (
        <section className="w-full max-w-4xl mt-10">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2">Your sessions on this device</h2>
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {saved.map((s) => (
              <li key={s.sessionId} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.title}</div>
                  <div className="text-xs text-zinc-500">
                    {s.hostKey ? 'Host' : 'Participant'} · as {s.name} · {timeAgo(s.savedAt)}
                    {s.passcode ? ` · passcode ${s.passcode}` : ''}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => navigate(`/s/${s.sessionId}`)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">
                    Open
                  </button>
                  <button
                    onClick={() => {
                      forgetSession(s.sessionId);
                      bump((v) => v + 1);
                    }}
                    className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
                  >
                    Forget
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-auto pt-10 text-xs text-zinc-500">Sessions expire automatically and delete their PDF. Export the discussion before then.</footer>
    </div>
  );
}
