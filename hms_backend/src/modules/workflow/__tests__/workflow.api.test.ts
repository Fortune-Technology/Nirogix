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
import { pool } from '../../../db/client';
import { createProvider } from '../../provider/provider.service';

/**
 * Per-hospital workflow configuration and the vitals it governs (ADR-113), over HTTP.
 *
 * The three things worth protecting, in order of how expensive getting them wrong would be:
 *
 * 1. **A hospital that configures nothing behaves exactly as it did before this shipped.** The
 *    defaults are the old behaviour, and a migration that quietly moved a payment gate or changed
 *    who takes a blood pressure would be a change nobody asked for.
 * 2. **The configuration is enforced on the server, not merely rendered.** A client that sends
 *    desk vitals to a hospital which does not collect them is refused; so is one that invents a
 *    vitals-room stage the hospital does not run.
 * 3. **Readings accumulate rather than overwrite.** Two clinicians disagreeing about a blood
 *    pressure is a real situation, and losing the earlier number is losing evidence.
 *
 * Skips cleanly with no database, as the other API suites do.
 */

const CODE = 'WFCONFIG';
const FEE_PAISE = 50000;

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};
let providerId = '';
let patientId = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[workflow.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE, 'Workflow Config Hospital');

  for (const role of ['org_admin', 'receptionist', 'doctor', 'cashier', 'pharmacist'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }

  providerId = (
    await createProvider(tenant.tenantId, {
      fullName: 'Dr. Anita Sharma',
      consultationFeePaise: FEE_PAISE,
      userId: sessions.doctor!.userId,
    })
  ).id;

  const created = await authed(sessions.receptionist!).post('/api/v1/patients').send({
    firstName: 'Rakesh',
    lastName: 'Nair',
    gender: 'male',
    dateOfBirth: '1979-02-11',
    phone: '9812345699',
  });
  patientId = created.body.id;
}, 180_000);

async function settleAuditWrites(tenantId: string): Promise<void> {
  let previous = -1;
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = await pool.query('SELECT count(*)::int AS c FROM audit_log WHERE tenant_id = $1', [
      tenantId,
    ]);
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

/** Sets the organization-wide configuration, reading the current version first. */
async function setConfig(body: Record<string, unknown>) {
  const current = await authed(sessions.org_admin!).get('/api/v1/workflow-config');
  return authed(sessions.org_admin!)
    .put('/api/v1/workflow-config')
    .send({ version: current.body.version, ...body });
}

/** Checks a patient in and returns the visit, so each test starts from a live visit of its own. */
async function checkIn(extra: Record<string, unknown> = {}) {
  return authed(sessions.receptionist!)
    .post('/api/v1/visits/check-in')
    .send({ patientId, providerId, reason: 'Routine review', ...extra });
}

/** Frees the patient for the next check-in — one live visit per patient per day is the rule. */
async function closeVisit(visitId: string) {
  await pool.query(`UPDATE visits SET status = 'completed' WHERE id = $1`, [visitId]);
}

/**
 * Closes every live visit this patient has. Called before a block that checks in again: a test
 * that failed part-way must not leave the next one failing on a rule it was not testing.
 */
async function clearLiveVisits() {
  await pool.query(
    `UPDATE visits SET status = 'completed'
      WHERE tenant_id = $1 AND patient_id = $2 AND status IN ('checked_in', 'in_consultation')`,
    [tenant.tenantId, patientId],
  );
}

describe('a hospital that has configured nothing', () => {
  test('is told so, and is given exactly the behaviour it had before this existed', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const res = await authed(sessions.org_admin!).get('/api/v1/workflow-config');
    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);
    expect(res.body.vitalsMode).toBe('consultation_only');
    expect(res.body.paymentTiming).toBe('before_consultation');
    // Nothing is required of anyone until a hospital says otherwise.
    expect(res.body.vitalsRequiredParams).toEqual([]);
  });

  test('refuses desk vitals, because it has not asked for them', async ({ skip }) => {
    if (!ready) return skip();
    const res = await checkIn({ vitals: { systolic: 120, diastolic: 80 } });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/does not record vitals at check-in/i);
  });
});

describe('vitals at the front desk', () => {
  test('the desk can record them once the hospital asks for them', async ({ skip }) => {
    if (!ready) return skip();
    const saved = await setConfig({
      vitalsMode: 'during_checkin',
      vitalsRequiredParams: ['bloodPressure'],
      vitalsOptionalParams: ['pulse', 'tempC', 'weightKg'],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.isDefault).toBe(false);

    const res = await checkIn({ vitals: { systolic: 128, diastolic: 84, pulse: 76 } });
    expect(res.status).toBe(201);

    const vitals = await authed(sessions.receptionist!).get(`/api/v1/visits/${res.body.id}/vitals`);
    expect(vitals.status).toBe(200);
    expect(vitals.body).toHaveLength(1);
    expect(vitals.body[0].systolic).toBe(128);
    expect(vitals.body[0].pulse).toBe(76);
    expect(vitals.body[0].stage).toBe('check_in');
    // Who took the reading is part of the reading.
    expect(vitals.body[0].recordedBy).toBe(sessions.receptionist!.userId);

    await closeVisit(res.body.id);
  });

  test('a required vital is refused before anything is created, not after', async ({ skip }) => {
    if (!ready) return skip();
    const before = await pool.query('SELECT count(*)::int AS c FROM visits WHERE tenant_id = $1', [
      tenant.tenantId,
    ]);
    const res = await checkIn({ vitals: { pulse: 80 } }); // no blood pressure
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/blood pressure/i);

    // The refusal must not leave a half-made check-in behind — that is the whole reason the check
    // happens up front rather than after the visit and its invoice exist.
    const after = await pool.query('SELECT count(*)::int AS c FROM visits WHERE tenant_id = $1', [
      tenant.tenantId,
    ]);
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });

  test('a physically impossible reading is refused as the typo it is', async ({ skip }) => {
    if (!ready) return skip();
    // 1200/80 is a decimal point in the wrong place, not a patient.
    const res = await checkIn({ vitals: { systolic: 1200, diastolic: 80 } });
    expect(res.status).toBe(422);
  });

  test('half a blood pressure is not a blood pressure', async ({ skip }) => {
    if (!ready) return skip();
    const res = await checkIn({ vitals: { systolic: 130 } });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/systolic and the diastolic|blood pressure/i);
  });
});

describe('the vitals queue', () => {
  let visitId = '';

  test('a checked-in patient is waiting on it', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    await setConfig({
      vitalsMode: 'after_checkin',
      vitalsRequiredParams: [],
      vitalsOptionalParams: ['bloodPressure', 'pulse', 'tempC'],
    });
    const res = await checkIn();
    expect(res.status).toBe(201);
    visitId = res.body.id;

    const queue = await authed(sessions.receptionist!).get('/api/v1/vitals/queue');
    expect(queue.status).toBe(200);
    const entry = queue.body.find((e: { visitId: string }) => e.visitId === visitId);
    expect(entry).toBeTruthy();
    expect(entry.latestVitals).toBeNull();
  });

  test('recording moves the entry to done without taking it off the list', async ({ skip }) => {
    if (!ready) return skip();
    const rec = await authed(sessions.receptionist!)
      .post('/api/v1/vitals')
      .send({ visitId, stage: 'pre_consultation', systolic: 118, diastolic: 76, tempC: 37.2 });
    expect(rec.status).toBe(201);
    // Stored in tenths, reported in the unit a clinician reads.
    expect(rec.body.tempC).toBe(37.2);

    const queue = await authed(sessions.receptionist!).get('/api/v1/vitals/queue');
    const entry = queue.body.find((e: { visitId: string }) => e.visitId === visitId);
    expect(entry.latestVitals.systolic).toBe(118);

    // `?pending=true` is the nurse's working list: only what is still to do.
    const pending = await authed(sessions.receptionist!).get('/api/v1/vitals/queue?pending=true');
    expect(pending.body.find((e: { visitId: string }) => e.visitId === visitId)).toBeUndefined();
  });

  test('a re-take is a new reading; the earlier one is kept', async ({ skip }) => {
    if (!ready) return skip();
    const again = await authed(sessions.receptionist!)
      .post('/api/v1/vitals')
      .send({ visitId, stage: 'pre_consultation', systolic: 124, diastolic: 80 });
    expect(again.status).toBe(201);

    const all = await authed(sessions.doctor!).get(`/api/v1/visits/${visitId}/vitals`);
    expect(all.body).toHaveLength(2);
    // Newest first, so the consultation shows the latest without having to sort.
    expect(all.body[0].systolic).toBe(124);
    expect(all.body[1].systolic).toBe(118);
  });

  test('a stage this hospital does not run is refused', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/vitals')
      .send({ visitId, stage: 'check_in', pulse: 70 });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/does not record vitals at check-in/i);
  });

  test('the cashier cannot record a clinical reading', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.cashier!)
      .post('/api/v1/vitals')
      .send({ visitId, stage: 'pre_consultation', pulse: 70 });
    expect(res.status).toBe(403);
  });

  test('the consultation opens already showing what the vitals room took', async ({ skip }) => {
    if (!ready) return skip();
    // Settle the fee so the default payment gate lets the consultation open.
    const visit = await authed(sessions.receptionist!).get(`/api/v1/visits/${visitId}`);
    if (visit.body.invoice) {
      await authed(sessions.cashier!)
        .post(`/api/v1/invoices/${visit.body.invoice.id}/payments`)
        .send({
          amountPaise: visit.body.invoice.balancePaise,
          method: 'cash',
          idempotencyKey: `wf-test-${visitId}`,
        });
    }
    const enc = await authed(sessions.doctor!).post('/api/v1/encounters/open').send({ visitId });
    expect(enc.status).toBe(200);
    expect(enc.body.vitals.systolic).toBe(124);
    expect(enc.body.vitalsHistory).toHaveLength(2);
    expect(enc.body.vitalsHistory[0].stage).toBe('pre_consultation');

    await closeVisit(visitId);
  });
});

describe('payment timing', () => {
  test('after_consultation lifts the gate, and the balance is still owed', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    await setConfig({
      paymentTiming: 'after_consultation',
      vitalsMode: 'consultation_only',
      vitalsOptionalParams: [],
    });

    const res = await checkIn();
    expect(res.status).toBe(201);
    const visitId = res.body.id;
    expect(res.body.invoice.balancePaise).toBe(FEE_PAISE);

    // The consultation opens with the fee outstanding — that is the whole point of the setting.
    const enc = await authed(sessions.doctor!).post('/api/v1/encounters/open').send({ visitId });
    expect(enc.status).toBe(200);

    // Nothing was written off. The bill is still there, and still unpaid.
    const visit = await authed(sessions.cashier!).get(`/api/v1/visits/${visitId}`);
    expect(visit.body.invoice.balancePaise).toBe(FEE_PAISE);

    await closeVisit(visitId);
  });

  test('restoring the gate blocks the consultation again', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    await setConfig({ paymentTiming: 'before_consultation' });

    const res = await checkIn();
    const visitId = res.body.id;
    const enc = await authed(sessions.doctor!).post('/api/v1/encounters/open').send({ visitId });
    expect(enc.status).toBe(409);
    expect(enc.body.error.message).toMatch(/unpaid/i);

    await closeVisit(visitId);
  });
});

describe('the configuration itself', () => {
  test('a vital cannot be both required and merely offered', async ({ skip }) => {
    if (!ready) return skip();
    const res = await setConfig({
      vitalsMode: 'during_checkin',
      vitalsRequiredParams: ['pulse'],
      vitalsOptionalParams: ['pulse'],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/both required and optional/i);
  });

  test('nothing can be required when vitals are switched off', async ({ skip }) => {
    if (!ready) return skip();
    const res = await setConfig({
      vitalsMode: 'disabled',
      vitalsRequiredParams: ['pulse'],
      vitalsOptionalParams: [],
    });
    expect(res.status).toBe(422);
  });

  test('a stale version is refused rather than overwriting someone else', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.org_admin!)
      .put('/api/v1/workflow-config')
      .send({ version: 1, paymentTiming: 'at_checkin' });
    expect(res.status).toBe(409);
  });

  test('the front desk may read the configuration but not change it', async ({ skip }) => {
    if (!ready) return skip();
    // The name of this test was always right and its first assertion was always wrong: it refused
    // the READ as well, and the desk's own check-in form is drawn from this configuration — where
    // vitals are taken, when the fee is due, the hospital's own consultation and case words. So a
    // receptionist opening the booking screen met a 403 against the settings that describe it
    // (ADR-129).
    //
    // Reading is not deciding, and that is the boundary: GET is open to the roles whose screens
    // are built from it, PUT stays `platform.workflow.manage` — the administrator's alone.
    expect((await authed(sessions.receptionist!).get('/api/v1/workflow-config')).status).toBe(200);
    expect(
      (await authed(sessions.receptionist!).put('/api/v1/workflow-config').send({ version: 1 }))
        .status,
    ).toBe(403);
  });

  test('a role with no reason to read the workflow still cannot', async ({ skip }) => {
    if (!ready) return skip();
    // The read key went to the roles whose screens consume it, not to everyone (ADR-129). A
    // pharmacist reaches none of those screens, so the boundary is still a boundary.
    expect((await authed(sessions.pharmacist!).get('/api/v1/workflow-config')).status).toBe(403);
  });

  test('a branch override does not disturb the organization default', async ({ skip }) => {
    if (!ready) return skip();
    const branch = await authed(sessions.org_admin!)
      .post('/api/v1/branches')
      .send({ code: 'WF-B2', name: 'Second Hospital' });
    expect(branch.status).toBe(201);
    const branchId = branch.body.id;

    const inherited = await authed(sessions.org_admin!).get(
      `/api/v1/workflow-config?branchId=${branchId}`,
    );
    expect(inherited.status).toBe(200);
    expect(inherited.body.inheritedFromOrganization).toBe(true);
    // A branch creating its first override sends its own version, not the organization's.
    expect(inherited.body.version).toBe(1);

    const saved = await authed(sessions.org_admin!)
      .put(`/api/v1/workflow-config?branchId=${branchId}`)
      .send({ version: 1, vitalsMode: 'after_checkin' });
    expect(saved.status).toBe(200);
    expect(saved.body.inheritedFromOrganization).toBe(false);
    expect(saved.body.vitalsMode).toBe('after_checkin');

    // The organization is untouched — an override is an override, not an edit of the parent.
    const org = await authed(sessions.org_admin!).get('/api/v1/workflow-config');
    expect(org.body.vitalsMode).not.toBe('after_checkin');
  });

  test('the change is audited with what it was and what it became', async ({ skip }) => {
    if (!ready) return skip();
    await settleAuditWrites(tenant.tenantId);
    const rows = await pool.query(
      `SELECT metadata FROM audit_log
        WHERE tenant_id = $1 AND action = 'workflow.config.updated'
        ORDER BY created_at DESC LIMIT 1`,
      [tenant.tenantId],
    );
    expect(rows.rowCount).toBeGreaterThan(0);
    const metadata = rows.rows[0].metadata;
    expect(metadata.before).toBeTruthy();
    expect(metadata.after).toBeTruthy();
    expect(metadata.scope).toBeTruthy();
  });
});
