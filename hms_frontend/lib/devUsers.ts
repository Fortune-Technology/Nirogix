// Development-only quick-login accounts (dev/staging convenience — issue #7).
//
// STRICTLY non-production. These mirror the accounts created by the DEVELOPMENT seeder
// (`hms_backend/src/scripts/seed.ts`) and documented in `TESTING_CREDENTIALS.md`. Every value
// here is a **known synthetic dev credential**, never a real one: the emails use the RFC-2606
// reserved `.example` TLD (which can never be a real address) and the password is the seeder's
// published dev default. There is no production credential anywhere in this file.
//
// The selector that renders these (`components/auth/QuickLogin.tsx`) is gated on the environment
// (`isQuickLoginEnabled`) and returns null in production, so it never appears there. This is a
// convenience over the SAME login form + API — not a second auth path.
//
// If the seeder's accounts change, update this list (it is the single source for the UI); the
// dev seeder remains authoritative for what actually exists in the database.

export interface DevUser {
  /** Human role label shown on the card. */
  role: string;
  orgCode: string;
  /** Organisation shown on the card so you never sign in as the wrong tenant. */
  orgName: string;
  email: string;
  password: string;
}

// **Build-time gate, inlined as a literal.** `NEXT_PUBLIC_ENVIRONMENT` is one of the three
// canonical environments — `development` | `staging` | `production` (ADR-071; `local` is retired
// in favour of `development`). It is replaced with a string literal at build, so
// `QUICK_LOGIN_ENABLED` folds to a constant. Enabled for `development` (a developer's machine) and
// `staging` (shared QA/demo, where the switcher is intended); disabled for `production` and any
// other/unset value. We deliberately do NOT gate on NODE_ENV: `next build`/`next start` run with
// NODE_ENV=production even on staging, so NODE_ENV cannot distinguish staging from production —
// this explicit flag can.
//
// Keep these as INLINE literal comparisons: routing them through a function call would defeat the
// constant-fold and ship the credential array (below) into the production bundle.
const QUICK_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'development' ||
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging';

/** True only when the build was made for a non-production environment. */
export function isQuickLoginEnabled(): boolean {
  return QUICK_LOGIN_ENABLED;
}

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

// The list is built ONLY when the gate is on. In a production build `QUICK_LOGIN_ENABLED` is the
// literal `false`, so the minifier constant-folds `false ? [...] : []` to `[]` and drops the
// whole account array — the dev credentials are physically absent from the production bundle,
// not merely un-rendered. (Verified by grepping the built chunks — see DONE.md.)
export const DEV_USERS: DevUser[] = QUICK_LOGIN_ENABLED
  ? [

    { role: 'Org Admin', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'admin@citycare.example', password: DEV_PASSWORD },
    { role: 'Branch Admin', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'branchadmin@citycare.example', password: DEV_PASSWORD },
    { role: 'Doctor', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'doctor@citycare.example', password: DEV_PASSWORD },
    { role: 'Receptionist', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'reception@citycare.example', password: DEV_PASSWORD },
    { role: 'Pharmacist', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'pharmacist@citycare.example', password: DEV_PASSWORD },
    { role: 'Lab Technician', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'lab@citycare.example', password: DEV_PASSWORD },
    { role: 'Cashier', orgCode: 'CITYCARE', orgName: 'CityCare Hospital', email: 'cashier@citycare.example', password: DEV_PASSWORD },
    // A second hospital, for cross-tenant / isolation testing.
    { role: 'Org Admin', orgCode: 'SUNRISE', orgName: 'Sunrise Diagnostics', email: 'admin@sunrise.example', password: DEV_PASSWORD },
  ]
  : [];
