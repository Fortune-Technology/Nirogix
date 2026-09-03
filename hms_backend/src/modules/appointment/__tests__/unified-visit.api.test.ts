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
import { createDepartment } from '../../department/department.service';

/**
 * One workflow, two timings (ADR-115).
 *
 * The frontend now has a single form whose only real variable is *when* — but a shared form is only
 * an improvement if the two endpoints behind it genuinely accept the same answers. These tests are
 * about that symmetry, because the failure mode is quiet: a field the form offers in both halves
 * that only one endpoint stores, and a desk that loses the department it typed by choosing
 * "future".
 *
 * The other half is `arrival_type`, which exists so a scheduled follow-up is still a follow-up when
 * the patient walks in a week later. The desk that checks them in never saw the booking, so the
 * value has to travel on the appointment rather than be re-entered.
 *
 * Skips cleanly with no database.
 */

const CODE = 'UNIFIED';
const FEE_PAISE = 40000;

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};
let providerId = '';
let departmentId = '';
let patientId = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[unified-visit.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE, 'Unified Workflow Hospital');

  for (const role of ['org_admin', 'receptionist', 'doctor'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }

  providerId = (
    await createProvider(tenant.tenantId, {
      fullName: 'Dr. Kavita Rao',
      consultationFeePaise: FEE_PAISE,
      userId: sessions.doctor!.userId,
    })
  ).id;
  departmentId = (
    await createDepartment(
      tenant.tenantId,
      { code: 'CARD', name: 'Cardiology' },
      sessions.org_admin!.userId,
    )
  ).id;

  const created = await authed(sessions.receptionist!).post('/api/v1/patients').send({
    firstName: 'Imran',
    lastName: 'Sheikh',
    gender: 'male',
    dateOfBirth: '1990-06-04',
    phone: '9812345688',
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

async function clearLiveVisits() {
  await pool.query(
    `UPDATE visits SET status = 'completed'
      WHERE tenant_id = $1 AND patient_id = $2 AND status IN ('checked_in', 'in_consultation')`,
    [tenant.tenantId, patientId],
  );
}

/** Tomorrow at 10:00 local — safely in the future, and outside any roster this tenant lacks. */
function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const LONG_COMPLAINT =
  'Chest pain since three days, worse on exertion, no breathlessness, no radiation to the arm. '.repeat(
    12,
  );

describe('the same answers are accepted by both timings', () => {
  test('a future booking keeps the department the desk chose', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/appointments')
      .send({
        patientId,
        providerId,
        departmentId,
        scheduledAt: tomorrowAt(10),
        reason: 'Chest pain',
      });
    expect(res.status).toBe(201);

    const list = await authed(sessions.receptionist!).get('/api/v1/appointments');
    const found = list.body.data.find((a: { id: string }) => a.id === res.body.id);
    expect(found.departmentId).toBe(departmentId);
    expect(found.departmentName).toBe('Cardiology');
  });

  test('a chief complaint that fits one timing fits the other', async ({ skip }) => {
    if (!ready) return skip();
    // The form offers 2000 characters in both halves. An endpoint that silently accepted less
    // would lose a paragraph the moment someone switched from "right now" to "future".
    expect(LONG_COMPLAINT.length).toBeGreaterThan(300);

    const booked = await authed(sessions.receptionist!)
      .post('/api/v1/appointments')
      .send({ patientId, providerId, scheduledAt: tomorrowAt(12), reason: LONG_COMPLAINT });
    expect(booked.status).toBe(201);

    await clearLiveVisits();
    const checkedIn = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, reason: LONG_COMPLAINT });
    expect(checkedIn.status).toBe(201);
    expect(checkedIn.body.reason.length).toBe(LONG_COMPLAINT.length);
  });

  test('a retired department is refused by both, in the same way', async ({ skip }) => {
    if (!ready) return skip();
    const retired = await createDepartment(
      tenant.tenantId,
      { code: 'OLD', name: 'Retired Ward' },
      sessions.org_admin!.userId,
    );
    await pool.query('UPDATE departments SET is_active = false WHERE id = $1', [retired.id]);

    const booked = await authed(sessions.receptionist!)
      .post('/api/v1/appointments')
      .send({ patientId, providerId, departmentId: retired.id, scheduledAt: tomorrowAt(14) });
    expect(booked.status).toBe(422);

    await clearLiveVisits();
    const checkedIn = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, departmentId: retired.id });
    expect(checkedIn.status).toBe(422);
  });
});

describe('how the patient arrived', () => {
  test('an undirected check-in is a walk-in', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId });
    expect(res.status).toBe(201);
    expect(res.body.arrivalType).toBe('walk_in');
  });

  test('the desk can say it is a follow-up', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, arrivalType: 'follow_up' });
    expect(res.status).toBe(201);
    expect(res.body.arrivalType).toBe('follow_up');
  });

  test('a booked follow-up is still a follow-up when the patient arrives', async ({ skip }) => {
    if (!ready) return skip();
    const booked = await authed(sessions.receptionist!)
      .post('/api/v1/appointments')
      .send({
        patientId,
        providerId,
        departmentId,
        scheduledAt: tomorrowAt(16),
        arrivalType: 'follow_up',
      });
    expect(booked.status).toBe(201);

    await clearLiveVisits();
    // The desk checking them in sends nothing about arrival — it never saw the booking. The
    // appointment carries the intent, which is the whole reason it is stored there.
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, appointmentId: booked.body.id });
    expect(res.status).toBe(201);
    expect(res.body.arrivalType).toBe('follow_up');
    // And the department comes across with it, so the desk does not re-pick what was already chosen.
    expect(res.body.departmentId).toBe(departmentId);
  });

  test('a claimed walk-in cannot override a booking', async ({ skip }) => {
    if (!ready) return skip();
    const booked = await authed(sessions.receptionist!)
      .post('/api/v1/appointments')
      .send({ patientId, providerId, scheduledAt: tomorrowAt(17), arrivalType: 'follow_up' });

    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, appointmentId: booked.body.id, arrivalType: 'walk_in' });
    expect(res.status).toBe(201);
    // The appointment wins. A patient who booked a follow-up did not become a walk-in because a
    // client said so.
    expect(res.body.arrivalType).toBe('follow_up');
  });

  test('a referral check-in is recorded as a follow-up', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const visit = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId });
    const referral = await authed(sessions.doctor!).post('/api/v1/referrals').send({
      visitId: visit.body.id,
      patientId,
      toDepartmentId: departmentId,
      reason: 'Cardiology opinion',
    });
    expect(referral.status).toBe(201);

    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, referralId: referral.body.id });
    expect(res.status).toBe(201);
    // A patient sent on from another department is arriving for a scheduled onward consultation,
    // not off the street.
    expect(res.body.arrivalType).toBe('follow_up');
  });

  test('an invented arrival type is refused at the edge', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, arrivalType: 'emergency' });
    expect(res.status).toBe(422);
  });
});

describe('what each timing actually produces', () => {
  test('"right now" makes a queue token and a bill; "future" makes neither', async ({ skip }) => {
    if (!ready) return skip();
    const booked = await authed(sessions.receptionist!)
      .post('/api/v1/appointments')
      .send({ patientId, providerId, scheduledAt: tomorrowAt(18) });
    expect(booked.status).toBe(201);
    // Nothing is queued and nothing is owed until the patient turns up — that is the difference the
    // "when" control is really choosing between.
    expect(booked.body.tokenNumber).toBeUndefined();
    const invoices = await pool.query(
      'SELECT count(*)::int AS c FROM invoices WHERE tenant_id = $1 AND patient_id = $2',
      [tenant.tenantId, patientId],
    );
    const before = invoices.rows[0].c;

    await clearLiveVisits();
    const checkedIn = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId });
    expect(checkedIn.status).toBe(201);
    expect(checkedIn.body.tokenNumber).toBeGreaterThan(0);
    expect(checkedIn.body.invoice.totalPaise).toBe(FEE_PAISE);

    const after = await pool.query(
      'SELECT count(*)::int AS c FROM invoices WHERE tenant_id = $1 AND patient_id = $2',
      [tenant.tenantId, patientId],
    );
    expect(after.rows[0].c).toBe(before + 1);
  });
});
