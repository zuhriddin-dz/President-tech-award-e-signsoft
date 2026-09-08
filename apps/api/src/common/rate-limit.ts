/**
 * Rate limiting for the two unauthenticated surfaces (signing relay, public
 * verify).
 *
 * TWO LAYERS, and the split is the point:
 *
 *   SlidingWindowRateLimiter — in-process, allocation-free, always available.
 *     It is the floor: it works with no Redis, no network, and no failure mode
 *     of its own. With one API instance it IS the global limit.
 *
 *   SharedSlidingWindow — the same window in Redis, so the cap stays global
 *     once the API runs more than one replica. It FAILS OPEN to the in-process
 *     floor: a Redis blip must never turn a signing ceremony into a 404, and a
 *     rate limiter that can take the product down is a worse bug than the
 *     flood it was shedding.
 *
 * Both are keyed by a client address the caller cannot choose — see
 * `clientAddress()` in policy.ts. A forgeable key makes either layer decorative.
 */

/** A tiny in-memory sliding window, keyed by an arbitrary string. */
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

/**
 * The minimal slice of ioredis this needs. Typed structurally so nothing here
 * depends on the driver package: the client comes from the BullMQ queue we
 * already hold open, so shared limiting adds no dependency and no second
 * connection pool.
 */
export interface RateLimitRedis {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

/**
 * One round trip, one atomic decision. ZSET of request timestamps per key:
 * drop everything older than the window, count what's left, admit and record
 * only if under the cap. TTL is refreshed each call so idle keys evaporate.
 *
 * Returns 1 (allowed) or 0 (over limit). Written as a script so the
 * prune-count-admit sequence cannot interleave between replicas.
 */
const WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local used = redis.call('ZCARD', key)
if used >= max then
  redis.call('PEXPIRE', key, window)
  return 0
end
redis.call('ZADD', key, now, now .. '-' .. ARGV[4])
redis.call('PEXPIRE', key, window)
return 1
`;

/** How long a shared check may take before we stop waiting and use the floor. */
const SHARED_TIMEOUT_MS = 150;

export class SharedSlidingWindow {
  /** Bumped per call so two requests in the same millisecond get distinct members. */
  private seq = 0;

  constructor(
    private readonly name: string,
    private readonly max: number,
    private readonly windowMs: number,
    /** Resolves the shared client, or null when none is configured. */
    private readonly client: () => Promise<RateLimitRedis | null>,
    /** The floor this degrades to — always consulted, never skipped. */
    private readonly local: SlidingWindowRateLimiter,
  ) {}

  /**
   * Allowed by BOTH the local floor and (when reachable) the shared window.
   * The local check runs first and unconditionally, so the floor still applies
   * when Redis is down — and so a shared outage can only ever be MORE
   * permissive than one instance's own budget, never less.
   */
  async allow(key: string, now: number): Promise<boolean> {
    if (!this.local.allow(key, now)) return false;

    let redis: RateLimitRedis | null;
    try {
      redis = await this.client();
    } catch {
      return true; // no shared view: the floor already answered
    }
    if (!redis) return true;

    this.seq = (this.seq + 1) % 1_000_000;
    try {
      const verdict = await withTimeout(
        redis.eval(
          WINDOW_SCRIPT,
          1,
          `ratelimit:${this.name}:${key}`,
          now,
          this.windowMs,
          this.max,
          `${this.seq}`,
        ),
        SHARED_TIMEOUT_MS,
      );
      return verdict !== 0;
    } catch {
      // Unreachable, slow, or a script error: fall back to the floor's verdict,
      // which was already a yes. Never fail a real signer over telemetry.
      return true;
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('rate-limit check timed out')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
