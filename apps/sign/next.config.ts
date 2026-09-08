import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The browser only ever talks to this app; /api/* is the BFF proxy route.
  poweredByHeader: false,

  // Self-hosting on a single VM: `standalone` emits a server bundle with only
  // the files actually traced as reachable, so the runtime image ships a few
  // MB of app instead of the whole pnpm store. Vercel ignores this setting, so
  // it stays safe to deploy either way.
  output: 'standalone',

  // In a pnpm workspace the traced files live ABOVE this directory (the store
  // is at the repo root, and @docflow/contracts is a sibling package). Without
  // this, tracing stops at apps/sign and the standalone bundle boots with
  // ERR_MODULE_NOT_FOUND on the first workspace import.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
};

export default nextConfig;
