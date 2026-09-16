import type { Tool } from '@reader/shared';
import { HIGHLIGHT_COLORS } from '@reader/shared';
import { useStore } from '../store.ts';
import { socket } from '../ws.ts';
import { reactions } from '../ephemeral.ts';
import { presence } from '../presence.ts';
import { newId } from '../ids.ts';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'pointer', label: 'Select (V)', key: 'V', icon: '↖' },
  { id: 'highlight', label: 'Highlight (H)', key: 'H', icon: '▬' },
  { id: 'area', label: 'Area (A)', key: 'A', icon: '▭' },
  { id: 'pin', label: 'Pin comment (P)', key: 'P', icon: '📍' },
  { id: 'laser', label: 'Laser (L)', key: 'L', icon: '✦' },
];

const EMOJI = ['👍', '❓', '💡', '😮', '✅', '😂'];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const color = useStore((s) => s.color);
  const setColor = useStore((s) => s.setColor);
  const scale = useStore((s) => s.scale);
  const setScale = useStore((s) => s.setScale);
  const spotlight = useStore((s) => s.spotlight);
  const me = useStore((s) => s.me);
  const ended = useStore((s) => !!s.session?.endedAt);
  const currentPage = useStore((s) => s.currentPage);
  const pageCount = useStore((s) => s.session?.pageCount ?? 0);

  const react = (emoji: string) => {
    const p = presence.get();
    const at = p.cursor ?? { page: p.viewport?.page ?? currentPage, x: 0.5, y: p.viewport ? Math.min(0.9, p.viewport.top + 0.3) : 0.5 };
    reactions.add({ id: newId(), from: me!.id, emoji, ...at });
    socket.send({ t: 'react', emoji, ...at });
  };

  const spotlighting = spotlight === me?.id;

  return (
    <div className="flex items-center gap-1 text-sm">
      <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-0.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            disabled={ended && t.id !== 'pointer' && t.id !== 'laser'}
            title={t.label}
            className={`flex h-8 w-8 items-center justify-center rounded-md text-base disabled:opacity-30 ${tool === t.id ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-100'}`}
          >
            {t.icon}
          </button>
        ))}
      </div>
      <div className="ml-1 flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-1.5 py-1">
        {HIGHLIGHT_COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} className={`h-5 w-5 rounded-full border-2 ${c === color ? 'border-zinc-800' : 'border-transparent'}`} style={{ background: c }} title="Highlight colour" />
        ))}
      </div>
      <div className="ml-1 flex items-center rounded-lg border border-zinc-200 bg-white p-0.5">
        <button onClick={() => setScale(scale / 1.15)} className="h-8 w-8 rounded-md hover:bg-zinc-100" title="Zoom out">
          −
        </button>
        <button onClick={() => window.dispatchEvent(new Event('reader:fit'))} className="h-8 min-w-12 rounded-md px-1 text-xs tabular-nums hover:bg-zinc-100" title="Fit width">
          {Math.round(scale * 100)}%
        </button>
        <button onClick={() => setScale(scale * 1.15)} className="h-8 w-8 rounded-md hover:bg-zinc-100" title="Zoom in">
          +
        </button>
      </div>
      <span className="ml-1 hidden text-xs tabular-nums text-zinc-500 lg:inline">
        p. {currentPage}/{pageCount}
      </span>
      <div className="ml-1 hidden items-center rounded-lg border border-zinc-200 bg-white p-0.5 md:flex">
        {EMOJI.map((e) => (
          <button key={e} onClick={() => react(e)} className="h-8 w-8 rounded-md text-base hover:bg-zinc-100" title="React">
            {e}
          </button>
        ))}
      </div>
      <button
        onClick={() => socket.send({ t: 'spotlight', on: !spotlighting })}
        className={`ml-1 h-9 rounded-lg border px-2.5 text-xs font-medium ${spotlighting ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-zinc-200 bg-white hover:bg-zinc-100'}`}
        title="Bring everyone to where you are reading"
      >
        {spotlighting ? '🔦 Stop spotlight' : '🔦 Spotlight'}
      </button>
    </div>
  );
}
