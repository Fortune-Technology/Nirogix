// Environment-aware quick-login accounts for the Portal sign-in (issue #7, ADR-077).
//
// STRICTLY non-production, and STRICTLY environment-true: the list shown always mirrors the
// seeder that actually populated the environment's database (ADR-058 — one seeder per
// environment), so the cards on screen are accounts that really exist there:
//
//   development → `hms_backend/src/scripts/seed.ts`         (CITYCARE demo hospital + the two
//                 Platform Admins, published dev default password)
//   staging     → `hms_backend/src/scripts/seed.staging.ts` (QA General Hospital / QAHOSP,
//                 deterministic QA password committed in that seeder)
//   production  → nothing, ever
//
// NO list, in ANY environment, contains a platform-operator account (ADR-080, widening
// ADR-077): the Portal is the hospital-staff surface, and operator credentials — real on
// staging/production, even the synthetic dev default — are never displayed, hinted, or
// pre-filled through it. Operators sign in on the Admin console by typing their credentials.
//
// The selector that renders these (`components/auth/QuickLogin.tsx`) is gated on the environment
// (`isQuickLoginEnabled`) and returns null in production, so it never appears there. This is a
// convenience over the SAME login form + API — not a second auth path.
//
// If a seeder's accounts change, update the matching list here (single source for the UI); the
// seeders remain authoritative for what actually exists in each database.

export interface DevUser {
  /** Human role label shown on the card. */
  role: string;
  orgCode: string;
  /** Organisation shown on the card so you never sign in as the wrong tenant. */
  orgName: string;
  email: string;
  password: string;
}

// **Build-time gates, inlined as literals.** `NEXT_PUBLIC_ENVIRONMENT` is one of the three
// canonical environments — `development` | `staging` | `production` (ADR-071). It is replaced
// with a string literal at build, so each comparison folds to a constant and the minifier drops
// every list the build's environment does not use — a staging bundle physically contains no dev
// account, a dev bundle no staging account, a production bundle neither.
//
// Keep these as INLINE literal comparisons: routing them through a function call would defeat
// the constant-fold and ship credential arrays into bundles they must not reach.
const IS_DEVELOPMENT = process.env.NEXT_PUBLIC_ENVIRONMENT === 'development';
const IS_STAGING = process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging';

/**
 * An explicit off switch, for when a non-production environment is being looked at by someone
 * outside the team.
 *
 * The environment gate above is the right default and stays: staging is a QA surface, and typing
 * one of six seeded accounts by hand fifty times a day helps nobody. But staging is also
 * internet-facing, and it is what an external security auditor is pointed at — where a button
 * offering one-click sign-in with committed credentials is a finding, however synthetic those
 * credentials are and however loudly the dialog says so.
 *
 * So this is set to `off` for the duration of an audit, and unset afterwards. It is deliberately a
 * separate flag rather than lying about `NEXT_PUBLIC_ENVIRONMENT`: pretending staging is production
 * would also switch the seeded account LIST, the reseed hint and the labelling — hiding the button
 * by making four other things wrong.
 *
 * Inline literal, like the two above, so the comparison folds at build time and the account arrays
 * are dropped from the bundle entirely rather than merely going unrendered.
 */
const QUICK_LOGIN_OFF = process.env.NEXT_PUBLIC_QUICK_LOGIN === 'off';

/** True only for a non-production build that has not explicitly switched the helper off. */
export function isQuickLoginEnabled(): boolean {
  return !QUICK_LOGIN_OFF && (IS_DEVELOPMENT || IS_STAGING);
}

/** Which environment's account list this build carries — drives the dialog's labelling. */
export const QUICK_LOGIN_ENVIRONMENT: 'development' | 'staging' | null = IS_DEVELOPMENT
  ? 'development'
  : IS_STAGING
    ? 'staging'
    : null;

// Dev-time sanity check (ADR-071): catch a mis-set environment value (a typo like `local`/`prod`)
// early. Folds away entirely in a production build (NODE_ENV==='production'), so no cost there.
if (process.env.NODE_ENV !== 'production') {
  const configured = process.env.NEXT_PUBLIC_ENVIRONMENT;
  if (configured && configured !== 'development' && configured !== 'staging' && configured !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      `[env] NEXT_PUBLIC_ENVIRONMENT="${configured}" is not a canonical environment ` +
      `(development | staging | production). The quick-login switcher stays disabled.`,
    );
  }
}

// The dev-seed password (TESTING_CREDENTIALS.md) — a known synthetic value, never a real secret.
const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD ?? 'ChangeMe#123';

// The staging seeder's deterministic QA password — already committed in
// `hms_backend/src/scripts/seed.staging.ts` (ADR-058); mirrored here, never a real secret.
const STAGING_PASSWORD = 'StagingOnly#2026';

// Exactly one list survives the build (see the gate comment above).
export const DEV_USERS: DevUser[] = IS_DEVELOPMENT
  ? [
    // Hospital roles only — never a platform operator (ADR-080).
    { role: 'Org Admin', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'admin@citycare.example', password: DEV_PASSWORD },
    { role: 'Branch Admin', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'branchadmin@citycare.example', password: DEV_PASSWORD },
    { role: 'Doctor', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'doctor@citycare.example', password: DEV_PASSWORD },
    { role: 'Receptionist', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'reception@citycare.example', password: DEV_PASSWORD },
    { role: 'Pharmacist', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'pharmacist@citycare.example', password: DEV_PASSWORD },
    { role: 'Lab Technician', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'lab@citycare.example', password: DEV_PASSWORD },
    { role: 'Cashier', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'cashier@citycare.example', password: DEV_PASSWORD },
  ]
  : IS_STAGING
    ? [
      // The staging seeder's QA hospital (`seed.staging.ts` — QAHOSP). No operator account here.
      { role: 'Org Admin', orgCode: 'QAHOSP', orgName: 'QA General Hospital', email: 'qa.admin@qahospital.example', password: STAGING_PASSWORD },
      { role: 'Branch Admin', orgCode: 'QAHOSP', orgName: 'QA General Hospital', email: 'qa.branchadmin@qahospital.example', password: STAGING_PASSWORD },
      { role: 'Doctor', orgCode: 'QAHOSP', orgName: 'QA General Hospital', email: 'qa.doctor@qahospital.example', password: STAGING_PASSWORD },
      { role: 'Receptionist', orgCode: 'QAHOSP', orgName: 'QA General Hospital', email: 'qa.reception@qahospital.example', password: STAGING_PASSWORD },
      { role: 'Pharmacist', orgCode: 'QAHOSP', orgName: 'QA General Hospital', email: 'qa.pharmacist@qahospital.example', password: STAGING_PASSWORD },
      { role: 'Lab Technician', orgCode: 'QAHOSP', orgName: 'QA General Hospital', email: 'qa.lab@qahospital.example', password: STAGING_PASSWORD },
      { role: 'Cashier', orgCode: 'QAHOSP', orgName: 'QA General Hospital', email: 'qa.cashier@qahospital.example', password: STAGING_PASSWORD },
    ]
    : [];
