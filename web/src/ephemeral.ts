import { useEffect, useState } from 'react';

/** Tiny emitter for high-frequency ephemeral state that should not live in the main store. */
export class Emitter {
  private listeners = new Set<() => void>();
  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  emit(): void {
    for (const l of this.listeners) l();
  }
}

export function useEmitter(e: Emitter): number {
  const [v, set] = useState(0);
  useEffect(() => e.subscribe(() => set((x) => x + 1)), [e]);
  return v;
}

// ---- laser strokes ----
export interface Stroke {
  id: string;
  from: string;
  page: number;
  points: [number, number][];
  updatedAt: number;
  done: boolean;
}

export const LASER_FADE_MS = 2500;

class Laser {
  strokes = new Map<string, Stroke>();
  emitter = new Emitter();
  private timer: number | null = null;

  upsert(s: Omit<Stroke, 'updatedAt'>): void {
    this.strokes.set(s.id, { ...s, updatedAt: performance.now() });
    this.emitter.emit();
    this.tick();
  }

  private tick(): void {
    if (this.timer) return;
    this.timer = window.setInterval(() => {
      const now = performance.now();
      let changed = false;
      for (const [id, s] of this.strokes) {
        if (now - s.updatedAt > LASER_FADE_MS + 200) {
          this.strokes.delete(id);
          changed = true;
        }
      }
      if (changed || this.strokes.size) this.emitter.emit();
      if (!this.strokes.size && this.timer) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
    }, 50);
  }
}
export const laser = new Laser();

// ---- floating reactions ----
export interface Reaction {
  id: string;
  from: string;
  emoji: string;
  page: number;
  x: number;
  y: number;
}

class Reactions {
  list: Reaction[] = [];
  emitter = new Emitter();
  add(r: Reaction): void {
    this.list = [...this.list, r];
    this.emitter.emit();
    window.setTimeout(() => {
      this.list = this.list.filter((x) => x.id !== r.id);
      this.emitter.emit();
    }, 1900);
  }
}
export const reactions = new Reactions();
