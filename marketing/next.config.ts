import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Share the @hms/ui design system (compiled from its TS source).
  transpilePackages: ["@hms/ui"],
};

export default nextConfig;
