import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next advertises itself in `X-Powered-By` by default. It tells an attacker which stack — and so
  // which advisories — to try, and buys us nothing. A security auditor lists it every time.
  poweredByHeader: false,
  // Compile the workspace packages from their TypeScript source (they ship no build step).
  transpilePackages: ["@hms/ui", "@hms/client", "@hms/permissions", "@hms/types", "@hms/utils"],
  // Self-registration, online booking and self check-in were three identical-looking tabs for
  // one mechanism; they are now three sections of /hospital-setup/public-access (ADR-124). The
  // old paths are kept as permanent redirects rather than deleted: they are in bookmarks, in
  // documentation, and printed on the back of QR posters.
  async redirects() {
    return [
      { source: "/hospital-setup/patient-registration", destination: "/hospital-setup/public-access", permanent: true },
      { source: "/hospital-setup/online-booking", destination: "/hospital-setup/public-access", permanent: true },
      { source: "/hospital-setup/self-check-in", destination: "/hospital-setup/public-access", permanent: true },
    ];
  },
};

export default nextConfig;
