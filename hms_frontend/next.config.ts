import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compile the workspace packages from their TypeScript source (they ship no build step).
  transpilePackages: ["@hms/ui", "@hms/client", "@hms/permissions", "@hms/types", "@hms/utils"],
};

export default nextConfig;
