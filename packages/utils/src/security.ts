// Browser security headers, in one place for all five frontends (ADR-082,
// SECURITY-AUDIT.md M-1).
//
// Every app shipped helmet's defaults from the API and nothing of its own, so there was no
// Content-Security-Policy anywhere: an injected script would have run, and a page could be
// framed by anything the browser allowed. A policy per app would have drifted within a
// release, so the policy is built here and each app supplies only what genuinely differs —
// the origins it calls, and whether it can carry a nonce.
//
// Two shapes, deliberately:
// - **Nonce mode** (the four authenticated apps). A per-request nonce plus `strict-dynamic`,
//   so only scripts this server marked may run and everything they load inherits that trust.
//   It costs per-request rendering, which those apps do anyway — they render a session.
// - **Static mode** (marketing). Statically rendered pages cannot carry a per-request nonce,
//   and Next's own hydration payload is inline, so scripts fall back to `'unsafe-inline'`
//   while every other directive stays strict. The trade is stated rather than hidden: the
//   marketing site renders no user input, has no authenticated surface and holds no session,
//   so its realistic CSP win is "no script from anywhere else", which this keeps. Any page
//   there that starts accepting input should move to nonce mode.

export type CspOptions = {
  /** Per-request nonce. Omit for statically rendered apps (see the note above). */
  nonce?: string;
  /**
   * This app's own backend origins. They are added to `connect-src` (the API calls) and to
   * `img-src`, because tenant logos and lab-report images are served from the API behind a
   * short-lived signed token — and in development that origin is plain `http://localhost`,
   * which the blanket `https:` allowance does not cover.
   */
  connectSrc?: readonly string[];
  /** Development relaxes what the bundler and HMR need, and never upgrades to HTTPS. */
  development?: boolean;
};

/** The directives that never vary by app. */
function baseDirectives(): Record<string, string[]> {
  return {
    'default-src': ["'self'"],
    // Images arrive as signed, short-lived URLs from object storage on hosts that cannot be
    // enumerated ahead of time; `https:` keeps that working. An image is not executable, and
    // the strict `script-src` is what actually matters here.
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'media-src': ["'self'", 'data:', 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    // Next injects inline <style> for critical CSS, so this cannot be tightened without
    // giving up static optimisation. Inline STYLE is not a script-execution vector.
    'style-src': ["'self'", "'unsafe-inline'"],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    // Clickjacking: no one embeds a Nirogix surface in a frame.
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
}

export function buildContentSecurityPolicy(options: CspOptions = {}): string {
  const { nonce, connectSrc = [], development = false } = options;
  const directives = baseDirectives();

  directives['script-src'] = nonce
    ? // `strict-dynamic` lets the nonced Next bootstrap load its own chunks; a script an
      // attacker injects has no nonce and is not loaded by one, so it never executes.
      ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]
    : ["'self'", "'unsafe-inline'"];
  if (development) {
    // The dev bundler evaluates code it generates; production never needs this.
    directives['script-src'].push("'unsafe-eval'");
  }

  directives['connect-src'] = [
    "'self'",
    ...connectSrc,
    ...(development ? ['ws:', 'wss:'] : []),
  ].filter(Boolean);

  // The same origins for images: the API serves a tenant's logo and a lab report's
  // attachments itself, over http on a developer's machine.
  directives['img-src'] = [...directives['img-src']!, ...connectSrc];

  const serialised = Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');

  // Only meaningful where TLS terminates; in development it would break http://localhost.
  return development ? serialised : `${serialised}; upgrade-insecure-requests`;
}

/**
 * Headers every Nirogix frontend sends, independent of CSP. Set once per app in
 * `next.config.ts` (they are static, so they need no per-request work).
 *
 * `X-Frame-Options` duplicates `frame-ancestors` on purpose — it is what older browsers
 * understand — and `Permissions-Policy` turns off the device APIs none of these apps use,
 * so an injected iframe or script cannot quietly reach for a camera or a location.
 */
export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=(), browsing-topics=(), payment=()',
  },
];

/**
 * The origin part of a URL, for a `connect-src` entry. Returns null for anything that is not
 * an absolute URL, so a missing or relative environment value cannot widen the policy.
 */
export function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
