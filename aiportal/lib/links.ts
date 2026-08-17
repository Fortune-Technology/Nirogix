/**
 * Where the rest of the Nirogix ecosystem lives, from configuration
 * (`resources/domains.md` §8). No host is hard-coded — a deployment points these at
 * `portal.nirogix.com` and `nirogix.com` without touching code.
 *
 * The AI Portal needs them because a person who lands here and cannot get in must be
 * given somewhere to go, rather than a dead end.
 */
const strip = (u: string) => u.replace(/\/$/, "");

export const PORTAL_URL = strip(process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001");
export const MARKETING_URL = strip(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
