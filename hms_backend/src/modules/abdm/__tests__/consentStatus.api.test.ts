import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { authed, cleanupTenant, dbReady, login, makeTenant, type Session, type TestTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { pool } from '../../../db/client';

/**
 * Consent status for the front desk (ADR-120).
 *
 * The interesting property is **what this endpoint does not return**. `GET /abdm/history/:patientId`
 * hands back whole request rows — the requesting doctor's name and registration number, the
 * health-information types asked for, the date range — which is right for a clinician reviewing
 * what they asked for and wrong for a receptionist who only needs to know whether anything is
 * outstanding.
 *
 * So the tests assert absences as much as values: no source hospital (a name like "oncology centre"
 * is a diagnosis by implication), no record counts (a proxy for how ill somebody has been), no
 * requesting clinician. And they assert the split holds in the other direction too: the desk's new
 * permission must not have quietly become a way to read the records.
 *
 * Skips cleanly with no database.
 */

const CODE = 'CONSENTST';

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};
let patientId = '';
let abhaPatientId = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[consentStatus.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE, 'Consent Status Hospital');
  // ABDM is not a default module — a hospital opts into it.
  await grantModule(tenant.tenantId, 'abdm');

  for (const role of ['org_admin', 'receptionist', 'doctor', 'pharmacist'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }

  const plain = await authed(sessions.receptionist!)
    .post('/api/v1/patients')
    .send({ firstName: 'Anil', lastName: 'Kulkarni', gender: 'male', dateOfBirth: '1966-02-02', phone: '9812345621' });
  patientId = plain.body.id;

  const withAbha = await authed(sessions.receptionist!)
    .post('/api/v1/patients')
    .send({
      firstName: 'Sneha',
      lastName: 'Desai',
      gender: 'female',
      dateOfBirth: '1988-09-09',
      phone: '9812345622',
      abhaNumber: '91-1234-5678-9012',
    });
  abhaPatientId = withAbha.body.id;
}, 180_000);

async function settleAuditWrites(tenantId: string): Promise<void> {
  let previous = -1;
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = await pool.query('SELECT count(*)::int AS c FROM audit_log WHERE tenant_id = $1', [tenantId]);
    const current = Number(rows.rows[0].c);
    if (current === previous) return;
    previous = current;
  }
}

afterAll(async () => {
  if (!ready || !tenant) return;
  await settleAuditWrites(tenant.tenantId);
  await cleanupTenant(CODE);
});

const statusFor = (session: Session, id: string) =>
  authed(session).get(`/api/v1/abdm/history/${id}/consent-status`);

/** A request row, written directly — driving the real ABDM flow needs a gateway. */
async function seedRequest(status: string, patient = abhaPatientId): Promise<void> {
  await pool.query(
    `INSERT INTO abdm_hiu_consent_requests
       (tenant_id, patient_id, abha_address, requester_name, requester_registration_number, status)
     VALUES ($1, $2, 'sneha@sbx', 'Dr. Very Identifiable', 'REG-SECRET-99', $3)`,
    [tenant.tenantId, patient, status],
  );
}

describe('the front desk can see the state', () => {
  test('a patient with no ABHA cannot have anything requested', async ({ skip }) => {
    if (!ready) return skip();
    const res = await statusFor(sessions.receptionist!, patientId);
    expect(res.status).toBe(200);
    expect(res.body.canRequest).toBe(false);
    expect(res.body.awaitingPatient).toBe(0);
    expect(res.body.active).toBe(0);
  });

  test('a patient with a verified ABHA can', async ({ skip }) => {
    if (!ready) return skip();
    const res = await statusFor(sessions.receptionist!, abhaPatientId);
    expect(res.body.canRequest).toBe(true);
    expect(res.body.latestStatus).toBeNull();
  });

  test('a request waiting on the patient shows as waiting', async ({ skip }) => {
    if (!ready) return skip();
    await seedRequest('requested');
    const res = await statusFor(sessions.receptionist!, abhaPatientId);
    expect(res.body.awaitingPatient).toBe(1);
    expect(res.body.latestStatus).toBe('requested');
    expect(res.body.latestRequestedAt).toBeTruthy();
  });

  test('a decline is reported as a decline, not a failure', async ({ skip }) => {
    if (!ready) return skip();
    await seedRequest('denied');
    const res = await statusFor(sessions.receptionist!, abhaPatientId);
    expect(res.body.declined).toBe(1);
    // A patient saying no is a decision. It must not be counted with technical failures, or a desk
    // will keep retrying something the patient already refused.
    expect(res.body.failed).toBe(0);
  });

  test('a send that never reached ABDM is reported separately', async ({ skip }) => {
    if (!ready) return skip();
    await seedRequest('failed');
    const res = await statusFor(sessions.receptionist!, abhaPatientId);
    expect(res.body.failed).toBe(1);
    expect(res.body.declined).toBe(1);
  });

  test('granted with nothing usable left reads as lapsed', async ({ skip }) => {
    if (!ready) return skip();
    await seedRequest('granted');
    const res = await statusFor(sessions.receptionist!, abhaPatientId);
    // The request says granted; no consent artefact survives. That is the state a doctor may want
    // to act on, and it would be invisible if only the request status were reported.
    expect(res.body.lapsed).toBe(1);
    expect(res.body.active).toBe(0);
  });
});

describe('what it refuses to tell the desk', () => {
  test('🔒 no requesting clinician, no source hospital, no record counts', async ({ skip }) => {
    if (!ready) return skip();
    const res = await statusFor(sessions.receptionist!, abhaPatientId);
    const body = JSON.stringify(res.body);

    // The seeded request carries a very identifiable doctor. None of it may travel.
    expect(body).not.toContain('Very Identifiable');
    expect(body).not.toContain('REG-SECRET-99');
    // Nor the patient's ABHA address, which is an identifier in its own right.
    expect(body).not.toContain('sneha@sbx');

    // The shape is closed: exactly these keys, so a future field cannot leak in unnoticed.
    expect(Object.keys(res.body).sort()).toEqual([
      'active',
      'activeUntil',
      'awaitingPatient',
      'canRequest',
      'declined',
      'failed',
      'lapsed',
      'latestRequestedAt',
      'latestStatus',
    ]);
  });

  test('🔒 the desk still cannot read the requests themselves', async ({ skip }) => {
    if (!ready) return skip();
    // This is the whole point of splitting the permission: seeing that something is pending must
    // not become a way to read what was asked for.
    const res = await authed(sessions.receptionist!).get(`/api/v1/abdm/history/${abhaPatientId}`);
    expect(res.status).toBe(403);
  });

  test('🔒 nor the records', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!).get(`/api/v1/abdm/history/${abhaPatientId}/timeline`);
    expect(res.status).toBe(403);
  });

  test('🔒 nor ask for them — that carries a named clinician to the patient', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/abdm/history/request')
      .send({ patientId: abhaPatientId });
    expect(res.status).toBe(403);
  });

  test('🔒 a role with no ABDM permission at all sees nothing', async ({ skip }) => {
    if (!ready) return skip();
    expect((await statusFor(sessions.pharmacist!, abhaPatientId)).status).toBe(403);
  });
});

describe('the doctor keeps the fuller view', () => {
  test('the doctor sees both the status and the requests', async ({ skip }) => {
    if (!ready) return skip();
    expect((await statusFor(sessions.doctor!, abhaPatientId)).status).toBe(200);
    const requests = await authed(sessions.doctor!).get(`/api/v1/abdm/history/${abhaPatientId}`);
    expect(requests.status).toBe(200);
    // The requesting clinician IS visible here — the fuller view is exactly what the narrow one
    // exists to avoid handing the desk.
    expect(JSON.stringify(requests.body)).toContain('Very Identifiable');
  });
});

describe('the capability makes it switchable per hospital', () => {
  test('a hospital without external history gets 403 on every M3 route', async ({ skip }) => {
    if (!ready) return skip();
    // A capability with no row is enabled by default, so switching it off means writing a
    // disabling row — which is how a hospital actually turns one off.
    await pool.query(
      `INSERT INTO tenant_capability_entitlements (tenant_id, module, capability, status, disabled_at, reason)
       VALUES ($1, 'abdm', 'abdm.external_history', 'DISABLED', now(), 'Test: hospital has not bought M3')`,
      [tenant.tenantId],
    );
    try {
      // Status, requests and the timeline all go, together — a hospital entitled to ABDM for ABHA
      // verification alone must not silently gain a national records pull.
      expect((await statusFor(sessions.doctor!, abhaPatientId)).status).toBe(403);
      expect((await authed(sessions.doctor!).get(`/api/v1/abdm/history/${abhaPatientId}`)).status).toBe(403);
      expect(
        (await authed(sessions.doctor!).get(`/api/v1/abdm/history/${abhaPatientId}/timeline`)).status,
      ).toBe(403);
    } finally {
      await pool.query(
        `DELETE FROM tenant_capability_entitlements
          WHERE tenant_id = $1 AND capability = 'abdm.external_history'`,
        [tenant.tenantId],
      );
    }
  });
});
