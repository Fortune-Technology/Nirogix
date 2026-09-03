import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, originOf, SECURITY_HEADERS } from '../security';

// The CSP is a security control, so its shape is asserted rather than eyeballed
// (ADR-082, SECURITY-AUDIT.md M-1).

function directive(csp: string, name: string): string | undefined {
  return csp
    .split('; ')
    .find((part) => part === name || part.startsWith(`${name} `))
    ?.replace(`${name} `, '');
}

describe('buildContentSecurityPolicy', () => {
  it('locks down the directives that do not vary by app', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc' });
    expect(directive(csp, 'default-src')).toBe("'self'");
    expect(directive(csp, 'object-src')).toBe("'none'");
    expect(directive(csp, 'frame-ancestors')).toBe("'none'");
    expect(directive(csp, 'frame-src')).toBe("'none'");
    expect(directive(csp, 'base-uri')).toBe("'self'");
    expect(directive(csp, 'form-action')).toBe("'self'");
  });

  it('uses the nonce and strict-dynamic when one is supplied, and never unsafe-inline', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'r4nd0m' });
    const scripts = directive(csp, 'script-src')!;
    expect(scripts).toContain("'nonce-r4nd0m'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it('falls back to unsafe-inline only where there is no nonce (the static marketing site)', () => {
    const scripts = directive(buildContentSecurityPolicy(), 'script-src')!;
    expect(scripts).toContain("'unsafe-inline'");
    expect(scripts).not.toContain('nonce');
  });

  it('allows the bundler what it needs in development, and nothing extra in production', () => {
    expect(
      directive(buildContentSecurityPolicy({ nonce: 'n', development: true }), 'script-src'),
    ).toContain("'unsafe-eval'");
    expect(directive(buildContentSecurityPolicy({ nonce: 'n' }), 'script-src')).not.toContain(
      "'unsafe-eval'",
    );
  });

  it("adds the app's own API origin to connect-src, and websockets only in development", () => {
    const prod = buildContentSecurityPolicy({
      nonce: 'n',
      connectSrc: ['https://api.nirogix.com'],
    });
    expect(directive(prod, 'connect-src')).toBe("'self' https://api.nirogix.com");

    const dev = buildContentSecurityPolicy({
      nonce: 'n',
      connectSrc: ['http://localhost:4000'],
      development: true,
    });
    expect(directive(dev, 'connect-src')).toContain('ws:');
  });

  it("allows images from the app's own API origin, not only https", () => {
    // The API serves tenant logos and report attachments behind a signed token, and on a
    // developer's machine that origin is plain http — caught by loading the Portal for real.
    const csp = buildContentSecurityPolicy({
      nonce: 'n',
      connectSrc: ['http://localhost:4000'],
      development: true,
    });
    expect(directive(csp, 'img-src')).toContain('http://localhost:4000');
    expect(directive(csp, 'img-src')).toContain("'self'");
  });

  it('upgrades insecure requests everywhere except development', () => {
    expect(buildContentSecurityPolicy({ nonce: 'n' })).toContain('upgrade-insecure-requests');
    expect(buildContentSecurityPolicy({ nonce: 'n', development: true })).not.toContain(
      'upgrade-insecure-requests',
    );
  });
});

describe('originOf', () => {
  it('reduces a URL to its origin', () => {
    expect(originOf('https://api.nirogix.com/api/v1')).toBe('https://api.nirogix.com');
    expect(originOf('http://localhost:4000/api/v1')).toBe('http://localhost:4000');
  });

  it('returns null rather than widening the policy on a missing or relative value', () => {
    expect(originOf(undefined)).toBeNull();
    expect(originOf('')).toBeNull();
    expect(originOf('/api/v1')).toBeNull();
    expect(originOf('not a url')).toBeNull();
  });
});

describe('SECURITY_HEADERS', () => {
  it('carries the clickjacking, sniffing and referrer protections every app needs', () => {
    const byKey = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]));
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    // Dictation (ADR-070) is the one device capability the product actually uses.
    expect(byKey['Permissions-Policy']).toContain('microphone=(self)');
    expect(byKey['Permissions-Policy']).toContain('camera=()');
  });
});
