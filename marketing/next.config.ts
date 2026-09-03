import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next advertises itself in `X-Powered-By` by default. It tells an attacker which stack — and so
  // which advisories — to try, and buys us nothing. A security auditor lists it every time.
  poweredByHeader: false,
  // Share the @hms/ui design system and the shared utilities (both compiled from TS source).
  // `@hms/utils` is what `proxy.ts` builds this site's security headers from (ADR-082).
  transpilePackages: ['@hms/ui', '@hms/utils'],
};

export default nextConfig;
