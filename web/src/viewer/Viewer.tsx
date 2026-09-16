import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Rect, Tag } from '@reader/shared';
import { HIGHLIGHT_COLORS, TAGS, TAG_LABELS } from '@reader/shared';
import type { PDFDocumentProxy } from '../pdf.ts';
import { useStore } from '../store.ts';
import { presence } from '../presence.ts';
import { socket } from '../ws.ts';
import { laser } from '../ephemeral.ts';
import { newId } from '../ids.ts';
import { createArea, createHighlight, createPin } from '../actions.ts';
import { getSelectionInfo, type SelectionInfo } from './selection.ts';
import { Page } from './Page.tsx';

const GAP = 16;
const PAD = 24;

export function Viewer({ pdf }: { pdf: PDFDocumentProxy }) {
  const dims = useStore((s) => s.session!.pageDims);
  const scale = useStore((s) => s.scale);
  const setScale = useStore((s) => s.setScale);
  const tool = useStore((s) => s.tool);
  const following = useStore((s) => s.following);
  const setFollowing = useStore((s) => s.setFollowing);
  const spotlight = useStore((s) => s.spotlight);
  const scrollTarget = useStore((s) => s.scrollTarget);
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const select = useStore((s) => s.select);
  const ended = useStore((s) => !!s.session?.endedAt);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ top: 0, height: 0 });
  const [sel, setSel] = useState<SelectionInfo | null>(null);
  const [popover, setPopover] = useState<SelectionInfo | null>(null);
  const [drag, setDrag] = useState<{ page: number; x0: number; y0: number; x1: number; y1: number } | null>(null);
  const fitted = useRef(false);
  const prevScale = useRef(scale);
  const programmatic = useRef(0);
  const laserStroke = useRef<{ id: string; page: number; points: [number, number][]; lastSent: number } | null>(null);

  // ---- layout ----
  const layout = useMemo(() => {
    const heights = dims.map((d) => Math.round(d.h * scale));
    const tops: number[] = [];
    let y = PAD;
    for (const h of heights) {
      tops.push(y);
      y += h + GAP;
    }
    const maxWidth = Math.max(...dims.map((d) => Math.round(d.w * scale)));
    return { heights, tops, total: y + PAD - GAP, maxWidth };
  }, [dims, scale]);

  const fitWidth = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxW = Math.max(...dims.map((d) => d.w));
    setScale(Math.min(2.5, Math.max(0.4, (el.clientWidth - 2 * PAD - 24) / maxW)));
  }, [dims, setScale]);

  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    fitWidth();
  }, [fitWidth]);

  useEffect(() => {
    window.addEventListener('reader:fit', fitWidth);
    return () => window.removeEventListener('reader:fit', fitWidth);
  }, [fitWidth]);

  // Keep the same document position when zooming.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || prevScale.current === scale) return;
    const ratio = scale / prevScale.current;
    prevScale.current = scale;
    if (el.scrollTop === 0) return; // at the top (e.g. initial fit): stay there
    programmatic.current = performance.now();
    el.scrollTop = (el.scrollTop + el.clientHeight / 2 - PAD) * ratio - el.clientHeight / 2 + PAD;
  }, [scale]);

  // ---- scroll: visible range, current page, viewport presence ----
  const pageAt = useCallback(
    (y: number) => {
      const { tops, heights } = layout;
      for (let i = 0; i < tops.length; i++) if (y < tops[i] + heights[i] + GAP) return i;
      return tops.length - 1;
    },
    [layout],
  );

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const height = el.clientHeight;
    setScrollState((s) => (s.top === top && s.height === height ? s : { top, height }));
    const { tops, heights } = layout;
    const first = pageAt(top);
    const last = pageAt(top + height);
    const frac = (i: number, y: number) => Math.min(1, Math.max(0, (y - tops[i]) / heights[i]));
    presence.update({ viewport: { page: first + 1, top: frac(first, top), pageEnd: last + 1, bottom: frac(last, top + height) } });
    setCurrentPage(pageAt(top + height * 0.4) + 1);
  }, [layout, pageAt, setCurrentPage]);

  useEffect(() => {
    onScroll();
    const ro = new ResizeObserver(onScroll);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [onScroll]);

  // User-initiated scrolling breaks follow mode.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const breakFollow = () => {
      if (useStore.getState().following) setFollowing(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) breakFollow();
    };
    el.addEventListener('wheel', breakFollow, { passive: true });
    el.addEventListener('touchmove', breakFollow, { passive: true });
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', breakFollow);
      el.removeEventListener('touchmove', breakFollow);
      el.removeEventListener('keydown', onKey);
    };
  }, [setFollowing]);

  const scrollToDoc = useCallback(
    (page: number, frac: number, offset = 0) => {
      const el = containerRef.current;
      if (!el) return;
      programmatic.current = performance.now();
      el.scrollTo({ top: layout.tops[page - 1] + frac * layout.heights[page - 1] - offset, behavior: 'smooth' });
    },
    [layout],
  );

  // Follow someone's viewport.
  const followedViewport = useStore((s) => (s.following ? s.presence[s.following]?.viewport : null));
  useEffect(() => {
    if (!following || !followedViewport) return;
    scrollToDoc(followedViewport.page, followedViewport.top);
  }, [following, followedViewport, scrollToDoc]);

  useEffect(() => {
    presence.update({ following, tool });
  }, [following, tool]);

  // Sidebar asked us to scroll to an annotation.
  useEffect(() => {
    if (!scrollTarget) return;
    const el = containerRef.current;
    scrollToDoc(scrollTarget.page, scrollTarget.y, (el?.clientHeight ?? 0) / 3);
  }, [scrollTarget, scrollToDoc]);

  // Ctrl/Cmd + wheel zooms.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale(useStore.getState().scale * (e.deltaY < 0 ? 1.1 : 0.9));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setScale]);

  // ---- cursor presence ----
  const pagePoint = (e: { clientX: number; clientY: number; target: EventTarget | null }) => {
    const pageEl = (e.target as Element | null)?.closest?.('[data-page]') as HTMLElement | null;
    if (!pageEl) return null;
    const r = pageEl.getBoundingClientRect();
    return { page: Number(pageEl.dataset.page), x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), pageEl };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const p = pagePoint(e);
    presence.update({ cursor: p ? { page: p.page, x: p.x, y: p.y } : null });
    if (drag && p) setDrag({ ...drag, x1: p.page === drag.page ? p.x : drag.x1, y1: p.page === drag.page ? p.y : drag.y1 });
    if (laserStroke.current && p && p.page === laserStroke.current.page) {
      const s = laserStroke.current;
      s.points.push([p.x, p.y]);
      if (s.points.length > 500) s.points.shift();
      laser.upsert({ id: s.id, from: useStore.getState().me!.id, page: s.page, points: [...s.points], done: false });
      if (performance.now() - s.lastSent > 40) {
        s.lastSent = performance.now();
        socket.send({ t: 'laser', id: s.id, page: s.page, points: s.points, done: false });
      }
    }
  };

  const onMouseLeave = () => presence.update({ cursor: null });

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const p = pagePoint(e);
    if (!p) return;
    if (tool === 'area' && !ended) {
      e.preventDefault();
      setDrag({ page: p.page, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    } else if (tool === 'laser') {
      e.preventDefault();
      laserStroke.current = { id: newId(), page: p.page, points: [[p.x, p.y]], lastSent: 0 };
    }
  };

  const onClickPage = (e: React.MouseEvent) => {
    const p = pagePoint(e);
    if (!p) return;
    if (tool === 'pin' && !ended) {
      const a = createPin(p.page, p.x, p.y);
      select(a.id);
    } else if (tool === 'pointer' && !(e.target as Element).closest('button, svg g')) {
      if (!window.getSelection()?.toString()) select(null);
    }
  };

  useEffect(() => {
    const onUp = () => {
      if (drag) {
        const rect: Rect = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
        setDrag(null);
        if (rect.w > 0.01 && rect.h > 0.01) select(createArea(drag.page, rect).id);
      }
      const s = laserStroke.current;
      if (s) {
        laserStroke.current = null;
        laser.upsert({ id: s.id, from: useStore.getState().me!.id, page: s.page, points: [...s.points], done: true });
        socket.send({ t: 'laser', id: s.id, page: s.page, points: s.points, done: true });
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [drag, select]);

  // ---- text selection ----
  useEffect(() => {
    let raf = 0;
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const info = getSelectionInfo();
        setSel(info);
        presence.update({ selection: info ? { page: info.page, rects: info.rects } : null });
        if (!info) setPopover(null);
      });
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('.sel-popover')) return;
      // Let the browser finish adjusting the selection first.
      setTimeout(() => {
        const info = getSelectionInfo();
        if (!info || ended) return;
        if (tool === 'highlight') {
          select(createHighlight(info).id);
          window.getSelection()?.removeAllRanges();
        } else if (tool === 'pointer') setPopover(info);
      }, 0);
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [tool, ended, select]);

  const finishHighlight = (opts: { color?: string; tag?: Tag | null; private?: boolean; comment?: boolean }) => {
    if (!popover) return;
    const a = createHighlight(popover, opts);
    setPopover(null);
    window.getSelection()?.removeAllRanges();
    select(a.id);
  };

  // ---- render window ----
  const range = useMemo(() => {
    const { top, height } = scrollState;
    const from = pageAt(top - height);
    const to = pageAt(top + 2 * height);
    return { from, to };
  }, [scrollState, pageAt]);

  const dragRectFor = (page: number): Rect | null =>
    drag && drag.page === page ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) } : null;

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 overflow-auto outline-none tool-${tool}`}
      tabIndex={0}
      onScroll={onScroll}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      onClick={onClickPage}
      style={{ background: '#e4e4e7' }}
    >
      <div className="relative mx-auto" style={{ height: layout.total, width: layout.maxWidth + 2 * PAD }}>
        {dims.map((d, i) => (
          <div key={i} className="absolute left-1/2 -translate-x-1/2" style={{ top: layout.tops[i] }}>
            <Page pdf={pdf} pageNumber={i + 1} dims={d} scale={scale} active={i >= range.from && i <= range.to} dragRect={dragRectFor(i + 1)} />
          </div>
        ))}
      </div>

      {popover && sel && <SelectionPopover info={popover} container={containerRef.current} onPick={finishHighlight} />}

      {(following || (spotlight && spotlight !== useStore.getState().me?.id)) && <FollowBanner />}
    </div>
  );
}

function SelectionPopover({ info, container, onPick }: { info: SelectionInfo; container: HTMLDivElement | null; onPick: (o: { color?: string; tag?: Tag | null; private?: boolean }) => void }) {
  const color = useStore((s) => s.color);
  const setColor = useStore((s) => s.setColor);
  const tag = useStore((s) => s.tag);
  const setTag = useStore((s) => s.setTag);
  if (!container) return null;
  const cr = container.getBoundingClientRect();
  const left = Math.min(cr.width - 320, Math.max(8, info.anchorRect.left - cr.left + container.scrollLeft));
  const top = info.anchorRect.bottom - cr.top + container.scrollTop + 8;
  return (
    <div className="sel-popover pop-in absolute z-20 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl" style={{ left, top, width: 312 }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        {HIGHLIGHT_COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full border-2 ${c === color ? 'border-zinc-800' : 'border-transparent'}`} style={{ background: c }} title="Colour" />
        ))}
        <select value={tag ?? ''} onChange={(e) => setTag((e.target.value || null) as Tag | null)} className="ml-auto rounded-md border border-zinc-300 px-1.5 py-1 text-xs">
          <option value="">No tag</option>
          {TAGS.map((t) => (
            <option key={t} value={t}>
              {TAG_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => onPick({})} className="flex-1 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
          Highlight
        </button>
        <button onClick={() => onPick({ private: true })} className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs hover:bg-zinc-50" title="Only you can see private notes">
          Private note
        </button>
      </div>
    </div>
  );
}

function FollowBanner() {
  const following = useStore((s) => s.following);
  const spotlight = useStore((s) => s.spotlight);
  const roster = useStore((s) => s.roster);
  const setFollowing = useStore((s) => s.setFollowing);
  const id = following ?? spotlight;
  const who = roster.find((r) => r.id === id);
  if (!who) return null;
  const isSpot = spotlight === id;
  return (
    <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2 text-sm text-white shadow-lg" style={{ background: who.color }}>
        <span>
          {following ? 'Following' : 'Spotlight by'} <b>{who.name}</b>
          {isSpot && following ? ' (spotlight)' : ''}
        </span>
        {following ? (
          <button onClick={() => setFollowing(null)} className="rounded-full bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">
            Stop
          </button>
        ) : (
          <button onClick={() => setFollowing(id)} className="rounded-full bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">
            Rejoin
          </button>
        )}
      </div>
    </div>
  );
}
