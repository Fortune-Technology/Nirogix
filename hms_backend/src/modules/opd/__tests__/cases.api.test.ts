import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { authed, cleanupTenant, dbReady, login, makeTenant, type Session, type TestTenant } from '../../../test-api';
import { pool } from '../../../db/client';
import { createProvider } from '../../provider/provider.service';
import { createDepartment } from '../../department/department.service';

/**
 * Treatment cases (ADR-116) — the episode a run of visits belongs to.
 *
 * What is worth protecting here is mostly about **not losing a patient's history**, which is the
 * expensive failure:
 *
 * - a case attached to the wrong patient files a visit under a stranger's episode;
 * - a case opened by a check-in that then fails leaves an orphan nobody will ever close;
 * - a case closed while the patient is in the waiting room lets a doctor open a consultation on an
 *   episode already declared finished;
 * - and a second case opened for the same episode splits the history in two with no way back.
 *
 * The one thing deliberately NOT enforced is "one open case per patient". A diabetic being managed
 * long-term who breaks an ankle genuinely has two, so the product surfaces what is open rather than
 * refusing the second.
 *
 * Skips cleanly with no database.
 */

const CODE = 'CASES';
const FEE_PAISE = 30000;

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};
let providerId = '';
let departmentId = '';
let patientId = '';
let otherPatientId = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[cases.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE, 'Cases Hospital');

  for (const role of ['org_admin', 'receptionist', 'doctor', 'pharmacist'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }

  providerId = (
    await createProvider(tenant.tenantId, {
      fullName: 'Dr. Sanjay Verma',
      consultationFeePaise: FEE_PAISE,
      userId: sessions.doctor!.userId,
    })
  ).id;
  departmentId = (
    await createDepartment(tenant.tenantId, { code: 'ORTH', name: 'Orthopaedics' }, sessions.org_admin!.userId)
  ).id;

  const a = await authed(sessions.receptionist!)
    .post('/api/v1/patients')
    .send({ firstName: 'Deepa', lastName: 'Menon', gender: 'female', dateOfBirth: '1984-03-19', phone: '9812345677' });
  patientId = a.body.id;

  const b = await authed(sessions.receptionist!)
    .post('/api/v1/patients')
    .send({ firstName: 'Arjun', lastName: 'Pillai', gender: 'male', dateOfBirth: '1975-11-02', phone: '9812345666' });
  otherPatientId = b.body.id;
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

async function clearLiveVisits(pid = patientId) {
  await pool.query(
    `UPDATE visits SET status = 'completed'
      WHERE tenant_id = $1 AND patient_id = $2 AND status IN ('checked_in', 'in_consultation')`,
    [tenant.tenantId, pid],
  );
}

let caseId = '';
let caseVersion = 0;

describe('opening a case', () => {
  test('gets a readable number and starts open', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/cases')
      .send({ patientId, title: 'Fracture right tibia', departmentId, providerId });
    expect(res.status).toBe(201);
    expect(res.body.caseNumber).toMatch(/^C-\d{6}$/);
    expect(res.body.status).toBe('open');
    expect(res.body.title).toBe('Fracture right tibia');
    expect(res.body.visitCount).toBe(0);
    caseId = res.body.id;
    caseVersion = res.body.version;
  });

  test('a second open case for the same patient is allowed, not refused', async ({ skip }) => {
    if (!ready) return skip();
    // A long-term condition and a fresh injury are genuinely separate episodes. The product
    // surfaces what is already open rather than deciding for the hospital.
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/cases')
      .send({ patientId, title: 'Diabetes management' });
    expect(res.status).toBe(201);

    const open = await authed(sessions.receptionist!).get(`/api/v1/cases?patientId=${patientId}&status=open`);
    expect(open.body).toHaveLength(2);
  });

  test('an untitled case is refused — it would be unpickable later', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!).post('/api/v1/cases').send({ patientId, title: '' });
    expect(res.status).toBe(422);
  });

  test('the pharmacist cannot open or read cases', async ({ skip }) => {
    if (!ready) return skip();
    expect((await authed(sessions.pharmacist!).get(`/api/v1/cases?patientId=${patientId}`)).status).toBe(403);
    expect(
      (await authed(sessions.pharmacist!).post('/api/v1/cases').send({ patientId, title: 'Nope' })).status,
    ).toBe(403);
  });
});

describe('checking in under a case', () => {
  test('the visit is filed under the case, and the case counts it', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, caseId, arrivalType: 'follow_up' });
    expect(res.status).toBe(201);
    expect(res.body.caseId).toBe(caseId);
    expect(res.body.caseTitle).toBe('Fracture right tibia');
    // The case knows where it is being run, so the desk does not have to re-pick.
    expect(res.body.providerId).toBe(providerId);
    expect(res.body.departmentId).toBe(departmentId);

    const c = await authed(sessions.receptionist!).get(`/api/v1/cases/${caseId}`);
    expect(c.body.visitCount).toBe(1);
    expect(c.body.lastVisitDate).toBeTruthy();
  });

  test("another patient's case is refused", async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits(otherPatientId);
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId: otherPatientId, caseId });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/different patient/i);
  });

  test('sending both an existing case and a new one is refused rather than guessed', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, caseId, newCase: { title: 'Something else' } });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/not both/i);
  });

  test('check-in can open a case in the same breath', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const before = await pool.query('SELECT count(*)::int AS c FROM patient_cases WHERE tenant_id = $1', [
      tenant.tenantId,
    ]);
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, newCase: { title: 'Antenatal care', notes: 'First trimester' } });
    expect(res.status).toBe(201);
    expect(res.body.caseTitle).toBe('Antenatal care');

    const after = await pool.query('SELECT count(*)::int AS c FROM patient_cases WHERE tenant_id = $1', [
      tenant.tenantId,
    ]);
    expect(after.rows[0].c).toBe(before.rows[0].c + 1);
  });

  test('a failed check-in leaves no orphan case behind', async ({ skip }) => {
    if (!ready) return skip();
    // The patient is already checked in today, so this is refused *after* the point a case would
    // have been created. The case and the visit share one transaction precisely so this cannot
    // leave an episode nobody will ever close.
    const before = await pool.query('SELECT count(*)::int AS c FROM patient_cases WHERE tenant_id = $1', [
      tenant.tenantId,
    ]);
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, newCase: { title: 'Should never exist' } });
    expect(res.status).toBe(409);

    const after = await pool.query('SELECT count(*)::int AS c FROM patient_cases WHERE tenant_id = $1', [
      tenant.tenantId,
    ]);
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });

  test('a visit with no case is still a normal visit', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId });
    expect(res.status).toBe(201);
    // Most consultations are one-offs. Forcing a case on every walk-in would fill the chart with
    // one-visit episodes nobody ever closes.
    expect(res.body.caseId).toBeNull();
  });
});

describe('closing and reopening', () => {
  test('a case with a live visit under it cannot be closed', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const visit = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, caseId });
    expect(visit.status).toBe(201);

    const current = await authed(sessions.doctor!).get(`/api/v1/cases/${caseId}`);
    const res = await authed(sessions.doctor!)
      .post(`/api/v1/cases/${caseId}/close`)
      .send({ version: current.body.version, closeReason: 'Treatment completed' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/still open under this case/i);

    await clearLiveVisits();
  });

  test('closing needs a reason, and keeps the visits', async ({ skip }) => {
    if (!ready) return skip();
    const current = await authed(sessions.doctor!).get(`/api/v1/cases/${caseId}`);
    const visitsBefore = current.body.visitCount;

    const noReason = await authed(sessions.doctor!)
      .post(`/api/v1/cases/${caseId}/close`)
      .send({ version: current.body.version });
    expect(noReason.status).toBe(422);

    const res = await authed(sessions.doctor!)
      .post(`/api/v1/cases/${caseId}/close`)
      .send({ version: current.body.version, closeReason: 'Fracture healed, discharged' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
    expect(res.body.closeReason).toBe('Fracture healed, discharged');
    expect(res.body.visitCount).toBe(visitsBefore);
    caseVersion = res.body.version;
  });

  test('a closed case cannot take a new visit', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, caseId });
    expect(res.status).toBe(409);
    // Attaching a visit to a closed case is how an episode quietly comes back to life without
    // anybody deciding to reopen it.
    expect(res.body.error.message).toMatch(/closed/i);
  });

  test('closing twice is refused', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.doctor!)
      .post(`/api/v1/cases/${caseId}/close`)
      .send({ version: caseVersion, closeReason: 'Again' });
    expect(res.status).toBe(409);
  });

  test('reopening keeps every visit already under the case', async ({ skip }) => {
    if (!ready) return skip();
    const before = await authed(sessions.doctor!).get(`/api/v1/cases/${caseId}`);
    const res = await authed(sessions.doctor!)
      .post(`/api/v1/cases/${caseId}/reopen`)
      .send({ version: before.body.version });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
    expect(res.body.closeReason).toBeNull();
    expect(res.body.visitCount).toBe(before.body.visitCount);
    caseVersion = res.body.version;
  });

  test('a stale version is refused rather than overwriting someone else', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.doctor!)
      .patch(`/api/v1/cases/${caseId}`)
      .send({ version: 1, title: 'Stale write' });
    expect(res.status).toBe(409);
  });

  test('a case is never deleted — there is no route to try', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.org_admin!).delete(`/api/v1/cases/${caseId}`);
    // Invariant #6: clinical records are closed, never removed.
    expect([404, 405]).toContain(res.status);
  });
});

describe('the audit trail', () => {
  test('opening, closing and reopening are all recorded, with the reason', async ({ skip }) => {
    if (!ready) return skip();
    await settleAuditWrites(tenant.tenantId);
    const rows = await pool.query(
      `SELECT action, metadata FROM audit_log
        WHERE tenant_id = $1 AND action LIKE 'case.%'
        ORDER BY created_at`,
      [tenant.tenantId],
    );
    const actions = rows.rows.map((r) => r.action);
    expect(actions).toContain('case.opened');
    expect(actions).toContain('case.closed');
    expect(actions).toContain('case.reopened');

    const closed = rows.rows.find((r) => r.action === 'case.closed');
    expect(closed.metadata.closeReason).toBeTruthy();
    // Reopening erases the close reason from the row, so the audit entry is the only place it
    // survives — which is exactly when someone wants to read it.
    const reopened = rows.rows.find((r) => r.action === 'case.reopened');
    expect(reopened.metadata.previousCloseReason).toBeTruthy();
  });
});

describe('tenant isolation', () => {
  test("another hospital's case is not reachable by id", async ({ skip }) => {
    if (!ready) return skip();
    const otherCode = 'CASESB';
    await cleanupTenant(otherCode);
    const other = await makeTenant(otherCode, 'Second Cases Hospital');
    try {
      const session = await login(otherCode, other.users.receptionist!);
      const res = await authed(session).get(`/api/v1/cases/${caseId}`);
      expect(res.status).toBe(404);
      const list = await authed(session).get('/api/v1/cases');
      expect(list.body).toHaveLength(0);
    } finally {
      await settleAuditWrites(other.tenantId);
      await cleanupTenant(otherCode);
    }
  });
});
