import { useEffect, useMemo, useRef } from 'react';
import type { Annotation, PageDims, Rect } from '@reader/shared';
import { useStore } from '../store.ts';
import { laser, LASER_FADE_MS, reactions, useEmitter } from '../ephemeral.ts';
import { initials } from '../ids.ts';

const px = (r: Rect, d: PageDims) => ({ x: r.x * d.w, y: r.y * d.h, width: r.w * d.w, height: r.h * d.h });

/** Highlights, areas, remote selections and the area-drag preview, drawn in PDF point space. */
export function SvgLayer({ page, dims, dragRect }: { page: number; dims: PageDims; dragRect: Rect | null }) {
  const annotations = useStore((s) => s.annotations);
  const presence = useStore((s) => s.presence);
  const roster = useStore((s) => s.roster);
  const selected = useStore((s) => s.selectedAnnotationId);
  const showPrivate = useStore((s) => s.showPrivate);
  const tool = useStore((s) => s.tool);
  const select = useStore((s) => s.select);
  const colorOf = (id: string) => roster.find((r) => r.id === id)?.color ?? '#71717a';

  const items = useMemo(
    () => Object.values(annotations).filter((a) => a.page === page && a.kind !== 'pin' && (showPrivate || !a.private)),
    [annotations, page, showPrivate],
  );

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox={`0 0 ${dims.w} ${dims.h}`}
      preserveAspectRatio="none"
      style={{ pointerEvents: 'none', zIndex: 3 }}
    >
      {items.map((a) => (
        <g key={a.id} style={{ pointerEvents: tool === 'pointer' ? 'auto' : 'none', cursor: 'pointer' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); select(a.id === selected ? null : a.id); }}>
          {(a.selectors.find((s) => s.type === 'RectSelector') as { rects: Rect[] } | undefined)?.rects.map((r, i) => {
            const p = px(r, dims);
            return a.kind === 'highlight' ? (
              <rect key={i} {...p} fill={a.color} fillOpacity={a.id === selected ? 0.75 : 0.45} stroke={a.id === selected ? '#312e81' : a.private ? '#71717a' : 'none'} strokeWidth={1} strokeDasharray={a.private ? '3 2' : undefined} style={{ mixBlendMode: 'multiply' }} />
            ) : (
              <rect key={i} {...p} fill={a.color} fillOpacity={a.id === selected ? 0.25 : 0.12} stroke={a.color} strokeWidth={a.id === selected ? 3 : 2} strokeDasharray={a.private ? '6 3' : undefined} rx={2} />
            );
          })}
        </g>
      ))}
      {Object.entries(presence).map(([id, p]) =>
        p.selection && p.selection.page === page
          ? p.selection.rects.map((r, i) => <rect key={`${id}-${i}`} {...px(r, dims)} fill={colorOf(id)} fillOpacity={0.3} />)
          : null,
      )}
      {dragRect && <rect {...px(dragRect, dims)} fill="#4f46e5" fillOpacity={0.1} stroke="#4f46e5" strokeWidth={2} strokeDasharray="6 3" />}
    </svg>
  );
}

export function PinLayer({ page }: { page: number }) {
  const annotations = useStore((s) => s.annotations);
  const roster = useStore((s) => s.roster);
  const comments = useStore((s) => s.comments);
  const selected = useStore((s) => s.selectedAnnotationId);
  const showPrivate = useStore((s) => s.showPrivate);
  const select = useStore((s) => s.select);
  const pins = useMemo(() => Object.values(annotations).filter((a) => a.kind === 'pin' && a.page === page && (showPrivate || !a.private)), [annotations, page, showPrivate]);
  return (
    <>
      {pins.map((a) => {
        const pt = a.selectors.find((s) => s.type === 'PointSelector') as { x: number; y: number } | undefined;
        if (!pt) return null;
        const author = roster.find((r) => r.id === a.authorId);
        const n = Object.values(comments).filter((c) => c.annotationId === a.id).length;
        return (
          <button
            key={a.id}
            title={`${author?.name ?? 'Someone'}${n ? ` · ${n} comment${n > 1 ? 's' : ''}` : ''}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              select(a.id === selected ? null : a.id);
            }}
            className={`absolute -translate-x-1/2 -translate-y-full flex items-center justify-center rounded-full rounded-bl-none border-2 border-white text-[10px] font-semibold text-white shadow-md transition-transform ${
              a.id === selected ? 'scale-125 ring-2 ring-indigo-600' : 'hover:scale-110'
            }`}
            style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%`, width: 22, height: 22, background: author?.color ?? '#71717a', zIndex: 5, pointerEvents: 'auto', outline: a.private ? '2px dashed #71717a' : undefined }}
          >
            {n || ''}
          </button>
        );
      })}
    </>
  );
}

/** Remote cursors. Positions are written straight to the DOM from a rAF loop with interpolation. */
export function CursorLayer({ page }: { page: number }) {
  const roster = useStore((s) => s.roster);
  const meId = useStore((s) => s.me?.id);
  const others = roster.filter((r) => r.id !== meId);
  const refs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const cur = new Map<string, { x: number; y: number }>();
    let raf = 0;
    const loop = () => {
      const presence = useStore.getState().presence;
      let anyVisible = false;
      for (const [id, el] of refs.current) {
        const c = presence[id]?.cursor;
        if (!c || c.page !== page) {
          el.style.display = 'none';
          cur.delete(id);
          continue;
        }
        anyVisible = true;
        el.style.display = '';
        const prev = cur.get(id) ?? { x: c.x, y: c.y };
        const nx = prev.x + (c.x - prev.x) * 0.35;
        const ny = prev.y + (c.y - prev.y) * 0.35;
        cur.set(id, { x: nx, y: ny });
        el.style.left = `${nx * 100}%`;
        el.style.top = `${ny * 100}%`;
      }
      raf = anyVisible ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    kick();
    const unsub = useStore.subscribe(kick);
    return () => {
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [page]);

  return (
    <>
      {others.map((r) => (
        <div
          key={r.id}
          ref={(el) => {
            if (el) refs.current.set(r.id, el);
            else refs.current.delete(r.id);
          }}
          className="absolute pointer-events-none"
          style={{ display: 'none', zIndex: 8 }}
        >
          <svg width="18" height="22" viewBox="0 0 18 22" className="drop-shadow" style={{ display: 'block' }}>
            <path d="M2 2 L16 11 L9.5 12.5 L6 20 Z" fill={r.color} stroke="white" strokeWidth="1.5" />
          </svg>
          <span className="absolute left-4 top-4 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow" style={{ background: r.color }}>
            {r.name}
          </span>
        </div>
      ))}
    </>
  );
}

/** Where other people are looking: a coloured bar down the left edge of the visible band. */
export function ViewportLayer({ page }: { page: number }) {
  const presence = useStore((s) => s.presence);
  const roster = useStore((s) => s.roster);
  const bands: { id: string; top: number; bottom: number; color: string; name: string }[] = [];
  for (const [id, p] of Object.entries(presence)) {
    const v = p.viewport;
    if (!v || page < v.page || page > v.pageEnd) continue;
    const r = roster.find((x) => x.id === id);
    if (!r) continue;
    bands.push({ id, top: page === v.page ? v.top : 0, bottom: page === v.pageEnd ? v.bottom : 1, color: r.color, name: r.name });
  }
  return (
    <>
      {bands.map((b, i) => (
        <div key={b.id} className="absolute pointer-events-none" style={{ left: -6 - i * 5, top: `${b.top * 100}%`, height: `${Math.max(0.5, (b.bottom - b.top) * 100)}%`, width: 3, background: b.color, opacity: 0.8, borderRadius: 2, zIndex: 4 }} title={b.name}>
          {b.top > 0 && (
            <span className="absolute -left-1 -top-4 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ background: b.color }}>
              {initials(b.name)}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

export function LaserLayer({ page, dims }: { page: number; dims: PageDims }) {
  useEmitter(laser.emitter);
  const roster = useStore((s) => s.roster);
  const now = performance.now();
  const strokes = [...laser.strokes.values()].filter((s) => s.page === page);
  if (!strokes.length) return null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none" style={{ zIndex: 7 }}>
      {strokes.map((s) => {
        const age = now - s.updatedAt;
        const opacity = s.done ? Math.max(0, 1 - age / LASER_FADE_MS) : 1;
        const color = roster.find((r) => r.id === s.from)?.color ?? '#ef4444';
        return (
          <polyline key={s.id} points={s.points.map(([x, y]) => `${x * dims.w},${y * dims.h}`).join(' ')} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.3))' }} />
        );
      })}
    </svg>
  );
}

export function ReactionLayer({ page }: { page: number }) {
  useEmitter(reactions.emitter);
  const list = reactions.list.filter((r) => r.page === page);
  return (
    <>
      {list.map((r) => (
        <div key={r.id} className="reaction-float absolute pointer-events-none text-3xl" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, zIndex: 9 }}>
          {r.emoji}
        </div>
      ))}
    </>
  );
}

export type { Annotation };
