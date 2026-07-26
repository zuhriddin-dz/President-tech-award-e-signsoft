import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The browser only ever talks to this app; /api/* is the BFF proxy route.
  poweredByHeader: false,
};

export default nextConfig;
