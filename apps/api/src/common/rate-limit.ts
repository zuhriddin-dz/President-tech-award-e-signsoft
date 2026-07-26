/**
 * A tiny in-memory sliding-window rate limiter, keyed by an arbitrary string
 * (here: the signer's client IP). Used to shed floods on the PUBLIC signing
 * surface before they cost a DB round-trip.
 *
 * ponytail: in-memory means per-process — with multiple API replicas each has
 * its own window, so the effective limit is N×perWindow. That is fine as a
 * flood-shedder (the sign app's edge limiter is the first wall); a Redis-backed
 * limiter is the upgrade when we run replicas and want an exact global cap.
 */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if this key is allowed another request right now. */
  allow(key: string, now: number): boolean {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.max) {
      this.hits.set(key, recent); // keep the pruned list; still over the limit
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Opportunistic cleanup so the map cannot grow without bound under churn.
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (v.every((t) => t <= cutoff)) this.hits.delete(k);
      }
    }
    return true;
  }
}
