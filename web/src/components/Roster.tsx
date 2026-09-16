import { useState } from 'react';
import { useStore } from '../store.ts';
import { Avatar } from './Avatar.tsx';
import { api } from '../api.ts';

export function Roster() {
  const roster = useStore((s) => s.roster);
  const me = useStore((s) => s.me);
  const following = useStore((s) => s.following);
  const setFollowing = useStore((s) => s.setFollowing);
  const spotlight = useStore((s) => s.spotlight);
  const token = useStore((s) => s.token);
  const toast = useStore((s) => s.toastMsg);
  const [open, setOpen] = useState<string | null>(null);

  const remove = async (id: string) => {
    if (!token) return;
    try {
      await api.removeParticipant(token, id);
    } catch (e) {
      toast((e as Error).message);
    }
    setOpen(null);
  };

  return (
    <div className="flex items-center -space-x-1">
      {roster.map((r) => {
        const isMe = r.id === me?.id;
        return (
          <div key={r.id} className="relative">
            <button
              onClick={() => {
                if (isMe) return;
                if (me?.isHost) setOpen(open === r.id ? null : r.id);
                else setFollowing(following === r.id ? null : r.id);
              }}
              className="relative rounded-full transition hover:z-10 hover:scale-110"
              title={isMe ? `${r.name} (you)` : r.online ? `${r.name}${following === r.id ? ' · following' : ' · click to follow'}` : `${r.name} · offline`}
            >
              <Avatar name={r.name} color={r.color} online={r.online} ring={following === r.id} />
              {r.isHost && <span className="absolute -top-1 -right-1 text-[10px]" title="Host">👑</span>}
              {spotlight === r.id && <span className="absolute -bottom-1 -right-1 text-[10px]" title="Spotlighting">🔦</span>}
            </button>
            {open === r.id && !isMe && (
              <div className="absolute right-0 top-9 z-30 w-40 rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-lg" onMouseLeave={() => setOpen(null)}>
                <div className="px-2 py-1 text-xs font-medium text-zinc-500">{r.name}</div>
                {r.online && (
                  <button
                    onClick={() => {
                      setFollowing(following === r.id ? null : r.id);
                      setOpen(null);
                    }}
                    className="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100"
                  >
                    {following === r.id ? 'Stop following' : 'Follow'}
                  </button>
                )}
                <button onClick={() => remove(r.id)} className="block w-full rounded px-2 py-1 text-left text-rose-600 hover:bg-rose-50">
                  Remove from session
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
