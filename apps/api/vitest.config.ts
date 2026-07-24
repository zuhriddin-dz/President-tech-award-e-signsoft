import { defineConfig } from 'vitest/config';

// The integration spec talks to the real Neon DB — allow for cold starts.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
