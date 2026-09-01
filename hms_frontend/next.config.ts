import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next advertises itself in `X-Powered-By` by default. It tells an attacker which stack — and so
  // which advisories — to try, and buys us nothing. A security auditor lists it every time.
  poweredByHeader: false,
  // Compile the workspace packages from their TypeScript source (they ship no build step).
  transpilePackages: ["@hms/ui", "@hms/client", "@hms/permissions", "@hms/types", "@hms/utils"],
};

export default nextConfig;
