/** Tiny fixed-window rate limiter kept in memory. Good enough for one process. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private limit: number, private windowMs: number) {}

  /** Returns true if the key is allowed another hit. */
  hit(key: string): boolean {
    const now = Date.now();
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    e.count++;
    return e.count <= this.limit;
  }

  sweep(): void {
    const now = Date.now();
    for (const [k, e] of this.hits) if (e.resetAt <= now) this.hits.delete(k);
  }
}
