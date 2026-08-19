/**
 * The accounts the E2E suite signs in as.
 *
 * These are **seeded** accounts, never hand-made staging data (test-data strategy): the
 * development set comes from `hms_backend/src/scripts/seed.ts` and the staging set from
 * `seed.staging.ts`, which is written as a deterministic contract precisely so E2E can rely
 * on it. Passwords are the seeders' non-secret defaults and are overridable by environment —
 * no real credential is ever committed here.
 */

export type RoleKey =
  | 'org_admin'
  | 'branch_admin'
  | 'doctor'
  | 'receptionist'
  | 'pharmacist'
  | 'lab_technician'
  | 'cashier';

export type Account = { orgCode: string; email: string; password: string; role: RoleKey };

const ENV = (process.env.E2E_BASE_ENV ?? 'development') as 'development' | 'staging' | 'production';

/** Development: `npm run db:seed` → CityCare Multispeciality Hospital. */
const DEV = {
  orgCode: 'CITYCARE',
  domain: 'citycare.example',
  password: process.env.E2E_PASSWORD ?? 'ChangeMe#123',
  local: {
    org_admin: 'admin',
    branch_admin: 'branchadmin',
    doctor: 'doctor',
    receptionist: 'reception',
    pharmacist: 'pharmacist',
    lab_technician: 'lab',
    cashier: 'cashier',
  } as Record<RoleKey, string>,
};

/** Staging: `npm run db:seed:staging` → QA General Hospital. */
const STAGING = {
  orgCode: 'QAHOSP',
  domain: 'qahospital.example',
  password: process.env.E2E_PASSWORD ?? 'StagingOnly#2026',
  local: {
    org_admin: 'qa.admin',
    branch_admin: 'qa.branchadmin',
    doctor: 'qa.doctor',
    receptionist: 'qa.reception',
    pharmacist: 'qa.pharmacist',
    lab_technician: 'qa.lab',
    cashier: 'qa.cashier',
  } as Record<RoleKey, string>,
};

const SET = ENV === 'staging' ? STAGING : DEV;

export function account(role: RoleKey): Account {
  return {
    orgCode: process.env.E2E_ORG_CODE ?? SET.orgCode,
    email: `${SET.local[role]}@${SET.domain}`,
    password: SET.password,
    role,
  };
}

/** Production must never run a destructive journey — specs guard on this. */
export const IS_PRODUCTION = ENV === 'production';
export const ENVIRONMENT = ENV;
