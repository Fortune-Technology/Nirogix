import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Share the @hms/ui design system and the shared utilities (both compiled from TS source).
  // `@hms/utils` is what `proxy.ts` builds this site's security headers from (ADR-082).
  transpilePackages: ["@hms/ui", "@hms/utils"],
};

export default nextConfig;
