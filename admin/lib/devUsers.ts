// Development-only quick-login for the Platform Admin console (dev/staging convenience).
//
// STRICTLY non-production. These mirror the two Platform Super Admins the DEVELOPMENT seeder creates
// in the operator org (code `NIROGIX`; `hms_backend/src/scripts/seed.ts`, issue #15). The password is always the
// seeder's **published dev default** — never a real password; the emails are the real operator
// accounts the seeder provisions. There is no production credential here, and the whole array folds
// out of a production build (see the gate below), so nothing reaches production.
//
// The selector that renders these (`components/auth/QuickLogin.tsx`) is gated on the build-time
// `NEXT_PUBLIC_ENVIRONMENT` flag and returns null in production, so it never appears there. It is a
// convenience over the SAME login form + API — not a second auth path.

export interface DevUser {
  role: string;
  orgCode: string;
  orgName: string;
  email: string;
  password: string;
}

// Build-time gate, inlined as a literal (ADR-071). Enabled for `development` and `staging`; disabled
// for `production` and any other/unset value. Keep these as INLINE comparisons: routing them through
// a function call would defeat the constant-fold and ship the credential array into production.
const QUICK_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_ENVIRONMENT === "development" ||
  process.env.NEXT_PUBLIC_ENVIRONMENT === "staging";

export function isQuickLoginEnabled(): boolean {
  return QUICK_LOGIN_ENABLED;
}

const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD ?? "ChangeMe#123";

// Built ONLY when the gate is on. In a production build `QUICK_LOGIN_ENABLED` is the literal `false`,
// so the minifier folds `false ? [...] : []` to `[]` and the accounts are physically absent.
export const DEV_USERS: DevUser[] = QUICK_LOGIN_ENABLED
  ? [
      { role: "Platform Admin", orgCode: "NIROGIX", orgName: "Nirogix (Platform)", email: "jaivik@thefortunetech.com", password: DEV_PASSWORD },
      { role: "Platform Admin", orgCode: "NIROGIX", orgName: "Nirogix (Platform)", email: "nishant@thefortunetech.com", password: DEV_PASSWORD },
    ]
  : [];
