import type { PresenceState } from '@reader/shared';
import { socket } from './ws.ts';

/**
 * Local presence controller. Components write partial updates at any rate;
 * the merged state is sent at most ~30 times a second.
 */
class PresenceController {
  private state: PresenceState = { cursor: null, viewport: null, selection: null, tool: 'pointer', following: null, handRaised: false };
  private timer: number | null = null;
  private dirty = false;
  private lastSent = 0;

  update(patch: PresenceState): void {
    let changed = false;
    for (const [k, v] of Object.entries(patch) as [keyof PresenceState, unknown][]) {
      if (JSON.stringify(this.state[k]) !== JSON.stringify(v)) {
        (this.state as Record<string, unknown>)[k] = v;
        changed = true;
      }
    }
    if (changed) this.schedule();
  }

  get(): PresenceState {
    return this.state;
  }

  /** Re-send everything (after reconnect). */
  resend(): void {
    this.dirty = true;
    this.flush();
  }

  private schedule(): void {
    this.dirty = true;
    if (this.timer) return;
    const wait = Math.max(0, 33 - (performance.now() - this.lastSent));
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, wait);
  }

  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.lastSent = performance.now();
    socket.send({ t: 'presence', state: this.state });
  }
}

export const presence = new PresenceController();
