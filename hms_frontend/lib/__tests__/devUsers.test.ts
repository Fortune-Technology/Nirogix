import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * The quick-login gate (ADR-077, ADR-080, and the audit switch added 31/08/2026).
 *
 * This is a security control, not a convenience toggle. It decides whether a button offering
 * one-click sign-in with committed credentials is rendered on an internet-facing host — so the
 * cases below are the ones where getting it wrong is expensive, not the happy path.
 *
 * The flags are read as module-level constants so Next can fold them at build time and drop the
 * account arrays from bundles that must not carry them. That is why each case re-imports the
 * module after stubbing the environment: importing once and mutating `process.env` afterwards
 * would test nothing, because the constant is already resolved.
 */

async function gate(environment?: string, quickLogin?: string): Promise<boolean> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_ENVIRONMENT', environment ?? '');
  vi.stubEnv('NEXT_PUBLIC_QUICK_LOGIN', quickLogin ?? '');
  const { isQuickLoginEnabled } = await import('../devUsers');
  return isQuickLoginEnabled();
}

afterEach(() => vi.unstubAllEnvs());

describe('quick-login is never available in production', () => {
  test('production is refused however the switch is set', async () => {
    expect(await gate('production')).toBe(false);
    expect(await gate('production', 'off')).toBe(false);
    // The switch can only ever REMOVE the helper. Nothing turns it on in production.
    expect(await gate('production', 'on')).toBe(false);
  });

  test('an unset or misspelled environment defaults to off', async () => {
    // A typo must fail closed. `prod`, `local` and blank are all "not a canonical environment",
    // and the safe reading of that is no helper rather than a guess.
    expect(await gate(undefined)).toBe(false);
    expect(await gate('prod')).toBe(false);
    expect(await gate('local')).toBe(false);
  });
});

describe('the audit switch', () => {
  test('off hides the helper on staging, which is what an auditor is pointed at', async () => {
    expect(await gate('staging')).toBe(true);
    expect(await gate('staging', 'off')).toBe(false);
  });

  test('off hides it in development too', async () => {
    expect(await gate('development')).toBe(true);
    expect(await gate('development', 'off')).toBe(false);
  });

  test('only the exact value `off` disables it', async () => {
    // A half-set flag must not silently disable the helper for the whole QA team, and must not
    // silently enable it either. Anything that is not `off` leaves the environment in charge.
    expect(await gate('staging', '')).toBe(true);
    expect(await gate('staging', 'false')).toBe(true);
    expect(await gate('staging', 'OFF')).toBe(true);
    expect(await gate('staging', 'no')).toBe(true);
  });
});
