import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next advertises itself in `X-Powered-By` by default. It tells an attacker which stack — and so
  // which advisories — to try, and buys us nothing. A security auditor lists it every time.
  poweredByHeader: false,
  // Compile the workspace packages from their TypeScript source (they ship no build step).
  transpilePackages: ['@hms/ui', '@hms/client', '@hms/permissions', '@hms/types', '@hms/utils'],
  // This app serves at its own subdomain root (admin.nirogix.com), so its canonical
  // routes are /tenants, /branding, … — never /admin/*. The `/admin/*` paths are
  // Portal-era leftovers from before ADR-051 split this into its own app; every
  // internal link now uses the canonical route, and this redirect keeps old bookmarks
  // and pasted links working instead of 404ing.
  async redirects() {
    return [{ source: '/admin/:path*', destination: '/:path*', permanent: false }];
  },
};

export default nextConfig;
