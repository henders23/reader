import { useMemo } from 'react';
import { useStore } from '../store.ts';
import { annotationY } from '../actions.ts';
import { presence as localPresence } from '../presence.ts';

const W = 44;

/** A vertical strip of tiny pages showing where everyone is and where the annotations are. */
export function PageStrip() {
  const dims = useStore((s) => s.session!.pageDims);
  const presence = useStore((s) => s.presence);
  const roster = useStore((s) => s.roster);
  const meId = useStore((s) => s.me?.id);
  const me = roster.find((r) => r.id === meId);
  const annotations = useStore((s) => s.annotations);
  const currentPage = useStore((s) => s.currentPage);
  const scrollTo = useStore((s) => s.scrollTo);
  const myViewport = localPresence.get().viewport;

  const marks = useMemo(() => {
    const m = new Map<number, { y: number; color: string }[]>();
    for (const a of Object.values(annotations)) {
      const list = m.get(a.page) ?? [];
      list.push({ y: annotationY(a), color: a.color });
      m.set(a.page, list);
    }
    return m;
  }, [annotations]);

  const bands = (page: number) => {
    const out: { color: string; top: number; bottom: number; me: boolean }[] = [];
    const add = (v: { page: number; top: number; pageEnd: number; bottom: number } | null | undefined, color: string, isMe: boolean) => {
      if (!v || page < v.page || page > v.pageEnd) return;
      out.push({ color, top: page === v.page ? v.top : 0, bottom: page === v.pageEnd ? v.bottom : 1, me: isMe });
    };
    add(myViewport, me?.color ?? '#71717a', true);
    for (const [id, p] of Object.entries(presence)) add(p.viewport, roster.find((r) => r.id === id)?.color ?? '#71717a', false);
    return out;
  };

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-l border-zinc-200 bg-zinc-100 py-3 px-2 select-none">
      {dims.map((d, i) => {
        const page = i + 1;
        const h = Math.max(24, Math.round((d.h / d.w) * W));
        return (
          <button
            key={page}
            onClick={() => scrollTo(page, 0)}
            className={`relative shrink-0 rounded-sm border bg-white shadow-sm transition ${page === currentPage ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-zinc-300 hover:border-zinc-400'}`}
            style={{ width: W, height: h }}
            title={`Page ${page}`}
          >
            {bands(page).map((b, j) => (
              <span
                key={j}
                className="absolute rounded-sm"
                style={{
                  left: b.me ? 0 : undefined,
                  right: b.me ? 0 : 1 + (j - 1) * 3,
                  width: b.me ? '100%' : 2,
                  top: `${b.top * 100}%`,
                  height: `${Math.max(4, (b.bottom - b.top) * 100)}%`,
                  background: b.color,
                  opacity: b.me ? 0.15 : 0.9,
                }}
              />
            ))}
            {(marks.get(page) ?? []).map((m, j) => (
              <span key={j} className="absolute left-1 h-[3px] w-3 rounded-full" style={{ top: `${m.y * 100}%`, background: m.color, opacity: 0.9 }} />
            ))}
            <span className="absolute inset-x-0 bottom-0.5 text-center text-[9px] leading-none text-zinc-400">{page}</span>
          </button>
        );
      })}
    </div>
  );
}
