/**
 * The platform admin console's origin, from configuration (ADR-051).
 *
 * The Portal trusts exactly one sender for a support-session token: the admin app.
 * While the two shared an origin this was a `window.location.origin` check; now that
 * the frontends are split, the allowed origin is named here and nowhere else, so a
 * deployment can point it at `https://admin.nirogix.com` without touching code.
 *
 * This is the only thing the Portal knows about the admin console, and the value is
 * used solely to *restrict* who may hand it a session — never to reach out to it.
 */
export const ADMIN_ORIGIN = (process.env.NEXT_PUBLIC_ADMIN_ORIGIN ?? "http://localhost:3002").replace(/\/$/, "");
