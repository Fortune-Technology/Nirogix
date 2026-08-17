/**
 * The safeguard between a seeder and the wrong database (ADR-058).
 *
 * The failure this exists to prevent is specific and unrecoverable: running the
 * development dataset against a production database, which would insert demo
 * hospitals, fake doctors and invented patients into real clinical records. There is
 * no clean undo — the rows interleave with real ones and carry real-looking UHIDs.
 *
 * So the rule is deliberately awkward: **a seeder states which environment it is for,
 * and refuses to run anywhere else.** Awkward is correct here. A seeder that quietly
 * adapts to its surroundings is a seeder that will one day adapt into production.
 */

import { env } from '../config/env';

export type SeedEnvironment = 'development' | 'staging' | 'production';

/** The env this process is actually running in, normalised. */
export function currentEnvironment(): SeedEnvironment {
  const raw = (env.NODE_ENV ?? 'development').toLowerCase();
  if (raw === 'production') return 'production';
  if (raw === 'staging') return 'staging';
  return 'development';
}

/**
 * A production database is not always labelled as one — a developer with a copied
 * `DATABASE_URL` is the realistic accident. These are the shapes worth refusing on
 * sight, regardless of what `NODE_ENV` claims.
 */
function looksLikeProductionDatabase(url: string): boolean {
  const u = url.toLowerCase();
  if (/localhost|127\.0\.0\.1|::1/.test(u)) return false;
  return /prod|production|live/.test(u) || !/staging|stage|test|dev|local/.test(u);
}

export class SeedRefused extends Error {}

/**
 * Gate a seeder. Throws rather than returning a boolean, because a caller that
 * forgets to check a boolean is exactly the accident this guards.
 *
 * `intended` is what the seeder file is written for. It must match the running
 * environment — a development seeder cannot run in staging either, since staging's
 * dataset is deterministic and demo rows would corrupt automated E2E expectations.
 */
export function requireEnvironment(intended: SeedEnvironment): void {
  const actual = currentEnvironment();

  if (actual !== intended) {
    throw new SeedRefused(
      `This is the ${intended} seeder, but NODE_ENV is "${actual}". ` +
        `Seeders never adapt to their surroundings — run the ${actual} seeder instead.`,
    );
  }

  // Belt and braces for the one direction that cannot be undone.
  if (intended !== 'production' && looksLikeProductionDatabase(env.DATABASE_URL)) {
    throw new SeedRefused(
      `Refusing to run the ${intended} seeder: DATABASE_URL does not look like a ` +
        `development or staging database. If this really is a throwaway database, ` +
        `rename it to include "dev", "local", "test" or "staging".`,
    );
  }

  if (intended === 'production' && !process.env.CONFIRM_PRODUCTION_SEED) {
    throw new SeedRefused(
      'The production seeder writes bootstrap configuration to a live database. ' +
        'Re-run with CONFIRM_PRODUCTION_SEED=yes once you have a current backup.',
    );
  }
}

/** Printed by every seeder before it writes, so the target is never ambiguous. */
export function describeTarget(intended: SeedEnvironment): string {
  const redacted = env.DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@');
  return `seeding [${intended}] → ${redacted}`;
}
