import { useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation, Comment, Tag } from '@reader/shared';
import { HIGHLIGHT_COLORS, TAGS, TAG_LABELS } from '@reader/shared';
import { useStore } from '../store.ts';
import { addComment, annotationQuote, annotationY, deleteAnnotation, deleteComment, editComment, resolveComment, updateAnnotation } from '../actions.ts';
import { Avatar } from './Avatar.tsx';
import { Markdown } from './Markdown.tsx';
import { timeAgo } from '../ids.ts';

export function Sidebar() {
  const mode = useStore((s) => s.sidebarMode);
  const setMode = useStore((s) => s.setSidebarMode);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const showPrivate = useStore((s) => s.showPrivate);
  const setShowPrivate = useStore((s) => s.setShowPrivate);
  const roster = useStore((s) => s.roster);
  const annotations = useStore((s) => s.annotations);
  const comments = useStore((s) => s.comments);
  const selected = useStore((s) => s.selectedAnnotationId);

  const list = useMemo(() => {
    const byAnn = new Map<string, Comment[]>();
    for (const c of Object.values(comments)) byAnn.set(c.annotationId, [...(byAnn.get(c.annotationId) ?? []), c]);
    let items = Object.values(annotations).filter((a) => showPrivate || !a.private);
    if (filters.authorId) items = items.filter((a) => a.authorId === filters.authorId);
    if (filters.tag) items = items.filter((a) => a.tag === filters.tag);
    if (filters.hideResolved) items = items.filter((a) => !(byAnn.get(a.id) ?? []).some((c) => !c.parentId && c.resolvedAt));
    if (mode === 'position') items.sort((a, b) => a.page - b.page || annotationY(a) - annotationY(b) || a.createdAt - b.createdAt);
    else items.sort((a, b) => lastActivity(b, byAnn) - lastActivity(a, byAnn));
    return items.map((a) => ({ a, thread: (byAnn.get(a.id) ?? []).sort((x, y) => x.createdAt - y.createdAt) }));
  }, [annotations, comments, filters, mode, showPrivate]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected) return;
    listRef.current?.querySelector(`[data-ann="${selected}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-200 bg-white lg:w-96">
      <div className="flex items-center gap-1 border-b border-zinc-200 p-2">
        <button onClick={() => setMode('position')} className={`rounded-md px-2.5 py-1 text-xs font-medium ${mode === 'position' ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>
          By position
        </button>
        <button onClick={() => setMode('time')} className={`rounded-md px-2.5 py-1 text-xs font-medium ${mode === 'time' ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>
          Activity
        </button>
        <span className="ml-auto text-xs text-zinc-500">{list.length}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 px-2 py-1.5 text-xs">
        <select value={filters.authorId ?? ''} onChange={(e) => setFilters({ authorId: e.target.value || null })} className="rounded border border-zinc-300 px-1 py-0.5">
          <option value="">Everyone</option>
          {roster.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select value={filters.tag ?? ''} onChange={(e) => setFilters({ tag: (e.target.value || null) as Tag | null })} className="rounded border border-zinc-300 px-1 py-0.5">
          <option value="">All tags</option>
          {TAGS.map((t) => (
            <option key={t} value={t}>
              {TAG_LABELS[t]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={filters.hideResolved} onChange={(e) => setFilters({ hideResolved: e.target.checked })} /> Hide resolved
        </label>
        <label className="flex items-center gap-1" title="Your private notes">
          <input type="checkbox" checked={showPrivate} onChange={(e) => setShowPrivate(e.target.checked)} /> Private
        </label>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {list.length === 0 && (
          <div className="p-6 text-center text-sm text-zinc-500">
            <p className="font-medium text-zinc-700">Nothing here yet.</p>
            <p className="mt-1">Select text to highlight it, or use the pin tool to start a discussion anywhere on the page.</p>
          </div>
        )}
        {list.map(({ a, thread }) => (
          <AnnotationCard key={a.id} a={a} thread={thread} expanded={selected === a.id} />
        ))}
      </div>
    </aside>
  );
}

function lastActivity(a: Annotation, byAnn: Map<string, Comment[]>): number {
  return Math.max(a.createdAt, ...(byAnn.get(a.id) ?? []).map((c) => c.createdAt));
}

function AnnotationCard({ a, thread, expanded }: { a: Annotation; thread: Comment[]; expanded: boolean }) {
  const roster = useStore((s) => s.roster);
  const me = useStore((s) => s.me);
  const select = useStore((s) => s.select);
  const scrollTo = useStore((s) => s.scrollTo);
  const ended = useStore((s) => !!s.session?.endedAt);
  const author = roster.find((r) => r.id === a.authorId);
  const quote = annotationQuote(a);
  const mine = a.authorId === me?.id;
  const resolved = thread.some((c) => !c.parentId && c.resolvedAt);

  return (
    <div
      data-ann={a.id}
      className={`border-b border-zinc-100 ${expanded ? 'bg-indigo-50/40' : 'hover:bg-zinc-50'}`}
    >
      <button
        className="block w-full px-3 py-2.5 text-left"
        onClick={() => {
          select(expanded ? null : a.id);
          scrollTo(a.page, annotationY(a));
        }}
      >
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Avatar name={author?.name ?? '?'} color={author?.color ?? '#71717a'} size={18} />
          <span className="font-medium text-zinc-700">{author?.name ?? 'Someone'}</span>
          <span>p.{a.page}</span>
          <span>· {timeAgo(a.createdAt)}</span>
          {a.private && <span className="rounded bg-zinc-200 px-1 text-[10px] uppercase tracking-wide">private</span>}
          {resolved && <span className="text-emerald-600">✓</span>}
          <span className="ml-auto flex items-center gap-1">
            {a.tag && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">{TAG_LABELS[a.tag]}</span>}
            {thread.length > 0 && <span className="text-zinc-500">💬 {thread.length}</span>}
          </span>
        </div>
        <div className="mt-1.5 flex gap-2">
          <span className="mt-0.5 w-1 shrink-0 rounded-full" style={{ background: a.color }} />
          {quote ? (
            <p className={`text-sm text-zinc-800 ${expanded ? '' : 'line-clamp-3'}`}>{quote}</p>
          ) : (
            <p className="text-sm italic text-zinc-500">{a.kind === 'area' ? 'Area highlight' : 'Pinned comment'}</p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          {mine && !ended && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
              {HIGHLIGHT_COLORS.map((c) => (
                <button key={c} onClick={() => updateAnnotation(a.id, { color: c })} className={`h-4 w-4 rounded-full border-2 ${c === a.color ? 'border-zinc-800' : 'border-transparent'}`} style={{ background: c }} />
              ))}
              <select value={a.tag ?? ''} onChange={(e) => updateAnnotation(a.id, { tag: (e.target.value || null) as Tag | null })} className="rounded border border-zinc-300 px-1 py-0.5">
                <option value="">No tag</option>
                {TAGS.map((t) => (
                  <option key={t} value={t}>
                    {TAG_LABELS[t]}
                  </option>
                ))}
              </select>
              <button onClick={() => updateAnnotation(a.id, { private: !a.private })} className="rounded border border-zinc-300 px-1.5 py-0.5 hover:bg-white" title={a.private ? 'Make visible to everyone' : 'Make private'}>
                {a.private ? 'Share' : 'Make private'}
              </button>
              <button onClick={() => confirm('Delete this annotation and its thread?') && deleteAnnotation(a.id)} className="ml-auto text-rose-600 hover:underline">
                Delete
              </button>
            </div>
          )}
          {!mine && me?.isHost && !ended && (
            <div className="mb-2 text-right text-xs">
              <button onClick={() => confirm('Delete this annotation and its thread?') && deleteAnnotation(a.id)} className="text-rose-600 hover:underline">
                Delete (host)
              </button>
            </div>
          )}
          <Thread annotation={a} thread={thread} />
        </div>
      )}
    </div>
  );
}

function Thread({ annotation, thread }: { annotation: Annotation; thread: Comment[] }) {
  const ended = useStore((s) => !!s.session?.endedAt);
  const tops = thread.filter((c) => !c.parentId);
  const replies = (id: string) => thread.filter((c) => c.parentId === id);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {tops.map((c) => (
        <div key={c.id} className={`rounded-lg border p-2 ${c.resolvedAt ? 'border-emerald-200 bg-emerald-50/40' : 'border-zinc-200 bg-white'}`}>
          <CommentView c={c} canResolve />
          {replies(c.id).map((r) => (
            <div key={r.id} className="ml-4 mt-2 border-l-2 border-zinc-200 pl-2">
              <CommentView c={r} />
            </div>
          ))}
          {!ended &&
            (replyTo === c.id ? (
              <div className="mt-2 ml-4">
                <Composer placeholder="Reply…" onSubmit={(body) => { addComment(annotation.id, body, c.id); setReplyTo(null); }} onCancel={() => setReplyTo(null)} autoFocus />
              </div>
            ) : (
              <button onClick={() => setReplyTo(c.id)} className="mt-1 text-xs text-indigo-600 hover:underline">
                Reply
              </button>
            ))}
        </div>
      ))}
      {!ended && (annotation.private ? (
        <Composer placeholder="Add a private note… (Markdown + $LaTeX$)" onSubmit={(body) => addComment(annotation.id, body)} autoFocus={tops.length === 0} />
      ) : (
        <Composer placeholder={tops.length ? 'Add to the discussion…' : 'Start the discussion… (Markdown + $LaTeX$, @name to mention)'} onSubmit={(body) => addComment(annotation.id, body)} autoFocus={tops.length === 0} />
      ))}
    </div>
  );
}

function CommentView({ c, canResolve }: { c: Comment; canResolve?: boolean }) {
  const roster = useStore((s) => s.roster);
  const me = useStore((s) => s.me);
  const ended = useStore((s) => !!s.session?.endedAt);
  const author = roster.find((r) => r.id === c.authorId);
  const [editing, setEditing] = useState(false);
  const mine = c.authorId === me?.id;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <Avatar name={author?.name ?? '?'} color={author?.color ?? '#71717a'} size={16} />
        <span className="font-medium text-zinc-700">{author?.name ?? 'Someone'}</span>
        <span>{timeAgo(c.createdAt)}</span>
        {c.editedAt && <span>(edited)</span>}
        {!ended && (
          <span className="ml-auto flex gap-2">
            {canResolve && (
              <button onClick={() => resolveComment(c.id, !c.resolvedAt)} className="hover:underline" title={c.resolvedAt ? 'Reopen' : 'Mark resolved'}>
                {c.resolvedAt ? 'Reopen' : 'Resolve'}
              </button>
            )}
            {mine && (
              <button onClick={() => setEditing(true)} className="hover:underline">
                Edit
              </button>
            )}
            {(mine || me?.isHost) && (
              <button onClick={() => confirm('Delete this comment?') && deleteComment(c.id)} className="text-rose-600 hover:underline">
                Delete
              </button>
            )}
          </span>
        )}
      </div>
      {editing ? (
        <div className="mt-1">
          <Composer initial={c.body} onSubmit={(body) => { editComment(c.id, body); setEditing(false); }} onCancel={() => setEditing(false)} autoFocus />
        </div>
      ) : (
        <Markdown text={c.body} className="mt-1" />
      )}
    </div>
  );
}

export function Composer({ onSubmit, onCancel, placeholder, initial = '', autoFocus }: { onSubmit: (body: string) => void; onCancel?: () => void; placeholder?: string; initial?: string; autoFocus?: boolean }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const submit = () => {
    const body = value.trim();
    if (!body) return;
    onSubmit(body);
    setValue('');
  };
  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel?.();
          e.stopPropagation();
        }}
        placeholder={placeholder}
        rows={value.split('\n').length > 2 ? 4 : 2}
        className="w-full resize-y rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
        <span>⌘/Ctrl+Enter</span>
        <span className="flex gap-2">
          {onCancel && (
            <button onClick={onCancel} className="rounded px-2 py-1 hover:bg-zinc-100">
              Cancel
            </button>
          )}
          <button onClick={submit} disabled={!value.trim()} className="rounded bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
            Post
          </button>
        </span>
      </div>
    </div>
  );
}
