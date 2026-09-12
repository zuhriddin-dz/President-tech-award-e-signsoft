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
  // this, tracing stops at apps/web and the standalone bundle boots with
  // ERR_MODULE_NOT_FOUND on the first workspace import.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),

  experimental: {
    // Self-hosted, middleware runs inside this server, which clones every
    // request body so middleware and the route handler can both read it. The
    // clone stops at this limit (default 10MB) and truncates BOTH copies with
    // only a console warning, so a 10-20MB PDF reached the API cut short even
    // though the API accepts 20MB uploads. Vercel runs middleware outside the
    // server, which is why it never hit this.
    //
    // 20MiB file cap + 1MiB for multipart framing; anything larger is still cut
    // here, and the API would refuse it anyway. A number rather than '21mb'
    // because a byte count is exactly what the limit is compared against.
    proxyClientMaxBodySize: 21 * 1024 * 1024,
  },
};

export default nextConfig;
