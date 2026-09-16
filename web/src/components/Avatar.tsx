import { initials } from '../ids.ts';

export function Avatar({ name, color, size = 28, online = true, ring = false, title }: { name: string; color: string; size?: number; online?: boolean; ring?: boolean; title?: string }) {
  return (
    <span
      title={title ?? name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none ${ring ? 'ring-2 ring-offset-2 ring-indigo-600' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.4, background: color, opacity: online ? 1 : 0.35 }}
    >
      {initials(name)}
    </span>
  );
}
