import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  authed,
  cleanupTenant,
  dbReady,
  login,
  makeTenant,
  type Session,
  type TestTenant,
} from '../../../test-api';
import { grantModule, setModuleStatus } from '../../entitlement/entitlement.service';

/**
 * Role and permission enforcement through the API (testcases.md §2 RBAC-*, manual guide §13).
 *
 * `rbac.test.ts` proves grant resolution in the service. This proves the chain the routes
 * actually run — authenticated → module entitled → permission → logic — by calling the
 * endpoints as each real role. The permission sets asserted here are the system role
 * definitions in `@hms/permissions`, so a change there that silently widens a role's reach
 * fails this suite.
 *
 * The distinction between "not entitled" (403 MODULE_NOT_ENTITLED, a tenant-level fact) and
 * "not permitted" (403, a user-level fact) is tested explicitly: they are different failures
 * and collapsing them would hide a billing/entitlement bug behind a permission error.
 */

const CODE = 'APIRBAC';
let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[permissions.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE);
  for (const role of [
    'receptionist',
    'doctor',
    'pharmacist',
    'lab_technician',
    'cashier',
  ] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }
}, 120_000);

afterAll(async () => {
  if (ready) await cleanupTenant(CODE);
});

const newPatient = (name: string) => ({
  firstName: name,
  lastName: 'Rbac',
  gender: 'other' as const,
});

describe('read permission (PATIENT_VIEW)', () => {
  // Every clinical/counter role holds PATIENT_VIEW — they all need to find the patient.
  test.each(['receptionist', 'doctor', 'pharmacist', 'lab_technician', 'cashier'])(
    '%s can list patients',
    async (role) => {
      if (!ready) return;
      const res = await authed(sessions[role]!).get('/api/v1/patients');
      expect(res.status).toBe(200);
    },
  );
});

describe('write permission (PATIENT_CREATE)', () => {
  test('receptionist and doctor may create a patient', async ({ skip }) => {
    if (!ready) return skip();
    const byReception = await authed(sessions.receptionist!)
      .post('/api/v1/patients')
      .send(newPatient('Reception'));
    const byDoctor = await authed(sessions.doctor!)
      .post('/api/v1/patients')
      .send(newPatient('Doctor'));
    expect(byReception.status).toBe(201);
    expect(byDoctor.status).toBe(201);
  });

  test.each(['pharmacist', 'lab_technician', 'cashier'])(
    '%s holds PATIENT_VIEW but is refused PATIENT_CREATE — reading is not writing',
    async (role) => {
      if (!ready) return;
      const res = await authed(sessions[role]!)
        .post('/api/v1/patients')
        .send(newPatient('ShouldNotExist'));
      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
      // The refusal must not leak which permission key was missing.
      expect(JSON.stringify(res.body)).not.toContain('patient.create');
    },
  );

  test('a refused create really did not write the row', async ({ skip }) => {
    if (!ready) return skip();
    await authed(sessions.pharmacist!).post('/api/v1/patients').send(newPatient('ShouldNotExist'));
    const list = await authed(sessions.receptionist!).get('/api/v1/patients?search=ShouldNotExist');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('ShouldNotExist');
  });
});

describe('cross-module refusal', () => {
  test('a cashier cannot reach pharmacy dispensing, and a pharmacist cannot reach billing', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const cashierAtPharmacy = await authed(sessions.cashier!).get('/api/v1/drugs');
    const pharmacistAtBilling = await authed(sessions.pharmacist!).get('/api/v1/invoices');
    expect(cashierAtPharmacy.status).toBe(403);
    expect(pharmacistAtBilling.status).toBe(403);
  });

  test('the roles that own those modules are allowed through', async ({ skip }) => {
    if (!ready) return skip();
    const pharmacistAtPharmacy = await authed(sessions.pharmacist!).get('/api/v1/drugs');
    const cashierAtBilling = await authed(sessions.cashier!).get('/api/v1/invoices');
    expect(pharmacistAtPharmacy.status).toBe(200);
    expect(cashierAtBilling.status).toBe(200);
  });
});

describe('unauthenticated access', () => {
  test('protected endpoints are 401 without a session, never 200 and never 403', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const { api } = await import('../../../test-api');
    for (const url of ['/api/v1/patients', '/api/v1/invoices', '/api/v1/drugs']) {
      const res = await api().get(url);
      expect(res.status).toBe(401);
    }
  });
});

describe('module entitlement precedes permission', () => {
  test('revoking the tenant’s patient module refuses even a permitted user, with a distinct code', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const before = await authed(sessions.receptionist!).get('/api/v1/patients');
    expect(before.status).toBe(200);

    await setModuleStatus(tenant.tenantId, 'patient', 'SUSPENDED');
    try {
      const during = await authed(sessions.receptionist!).get('/api/v1/patients');
      expect(during.status).toBe(403);
      // A tenant-level fact, not a user-level one — the codes must stay distinguishable.
      expect(during.body.error.code).toBe('MODULE_NOT_ENTITLED');
    } finally {
      // Reactivation goes through grantModule — setModuleStatus only moves a module to a
      // non-active state, so it cannot be used to restore one.
      await grantModule(tenant.tenantId, 'patient', { reason: 'test restore' });
    }

    const after = await authed(sessions.receptionist!).get('/api/v1/patients');
    expect(after.status).toBe(200);
  });
});
