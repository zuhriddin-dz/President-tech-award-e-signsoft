import { describe, expect, it } from 'vitest';
import { SlidingWindowRateLimiter } from './rate-limit.js';

describe('SlidingWindowRateLimiter', () => {
  it('allows up to max within the window, then blocks', () => {
    const rl = new SlidingWindowRateLimiter(3, 1000);
    const t = 10_000;
    expect(rl.allow('ip', t)).toBe(true);
    expect(rl.allow('ip', t + 1)).toBe(true);
    expect(rl.allow('ip', t + 2)).toBe(true);
    expect(rl.allow('ip', t + 3)).toBe(false); // 4th in-window request blocked
  });

  it('lets requests through again once the window slides past old hits', () => {
    const rl = new SlidingWindowRateLimiter(2, 1000);
    expect(rl.allow('ip', 0)).toBe(true);
    expect(rl.allow('ip', 500)).toBe(true);
    expect(rl.allow('ip', 900)).toBe(false);
    // 1200ms: the hits at 0 and 500 are now >1000ms in one case, 500 still counts
    expect(rl.allow('ip', 1600)).toBe(true); // both old hits aged out
  });

  it('tracks keys independently', () => {
    const rl = new SlidingWindowRateLimiter(1, 1000);
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('b', 0)).toBe(true);
    expect(rl.allow('a', 1)).toBe(false);
  });
});
