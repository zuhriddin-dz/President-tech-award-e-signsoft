import { defineConfig } from 'vitest/config';

// Tests hit the real Neon instance (possibly cold-starting) — generous timeouts.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
