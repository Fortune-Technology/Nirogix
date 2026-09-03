import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { authed, cleanupTenant, dbReady, login, makeTenant, type Session, type TestTenant } from '../../../test-api';
import { pool } from '../../../db/client';
import { createProvider } from '../../provider/provider.service';
import { createDrug, receiveStock } from '../../pharmacy/pharmacy.service';

/**
 * Correcting a signed consultation (ADR-134), over HTTP, by the roles that really do it.
 *
 * The rule this suite exists to hold: **the signed note is never silently overwritten.** Before
 * the amendment path there were only two possible behaviours and both were wrong — refuse the
 * correction and leave a real clinical need with nowhere to go, or let the edit through and lose
 * what was actually signed. So what is asserted is not "can a doctor edit after signing" but the
 * shape of the record afterwards: the original preserved, a reason recorded, the person named,
 * and the changed fields listed.
 *
 * The permission boundary is asserted with the same weight. `emr.encounter.amend` is a separate
 * key from `emr.encounter.write` precisely so a hospital can let everyone write notes and choose
 * who may reopen a closed one; a receptionist holding neither, and a role holding only write,
 * must both be refused — and the encounter must be unmoved behind the refusal.
 *
 * Skips cleanly when no database is reachable, as the other API suites do.
 */

const CODE = 'AMEND';
const FEE_PAISE = 40000; // ₹400 consultation
const DRUG_PRICE_PAISE = 900;

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};

let providerId = '';
let drugId = '';
let patientId = '';
let visitId = '';
let encounterId = '';
let version = 0;

/** See critical-path.api: audit rows land after the response, and `audit_log` is RESTRICT. */
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

async function auditActions(tenantId: string, resourceId: string): Promise<string[]> {
  const rows = await pool.query<{ action: string }>(
    'SELECT action FROM audit_log WHERE tenant_id = $1 AND resource_id = $2 ORDER BY created_at ASC',
    [tenantId, resourceId],
  );
  return rows.rows.map((r) => r.action);
}

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[amendment.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE, 'Amendment Test Hospital');

  for (const role of ['receptionist', 'doctor', 'cashier', 'org_admin', 'pharmacist'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }

  providerId = (
    await createProvider(tenant.tenantId, {
      fullName: 'Dr. Kavita Nair',
      consultationFeePaise: FEE_PAISE,
      userId: sessions.doctor!.userId,
    })
  ).id;
  drugId = (await createDrug(tenant.tenantId, { name: 'Paracetamol 650 mg', unit: 'tablet', unitPricePaise: DRUG_PRICE_PAISE }))!.id;
  await receiveStock(tenant.tenantId, drugId, { batchNo: 'AM-1', expiryDate: '2027-12-31', quantity: 50 });

  // A patient, checked in, fee paid, consulted and signed — the state every test below starts from.
  patientId = (
    await authed(sessions.receptionist!)
      .post('/api/v1/patients')
      .send({ firstName: 'Ramesh', lastName: 'Kulkarni', gender: 'male', dateOfBirth: '1979-09-02', phone: '9812345699' })
  ).body.id;

  const checkedIn = await authed(sessions.receptionist!)
    .post('/api/v1/visits/check-in')
    .send({ patientId, providerId, reason: 'Cough for a week' });
  visitId = checkedIn.body.id;

  await authed(sessions.cashier!)
    .post(`/api/v1/invoices/${checkedIn.body.invoice.id}/payments`)
    .send({ amountPaise: FEE_PAISE, method: 'cash', idempotencyKey: 'amend-fee' });

  const opened = await authed(sessions.doctor!).post('/api/v1/encounters/open').send({ visitId });
  encounterId = opened.body.id;

  await authed(sessions.doctor!)
    .put(`/api/v1/encounters/${encounterId}`)
    .send({
      version: opened.body.version,
      chiefComplaint: 'Cough for a week',
      subjective: 'Dry cough, worse at night. No fever.',
      objective: 'Chest clear. Throat mildly congested.',
      assessment: 'Acute bronchitis',
      plan: 'Symptomatic treatment, review in five days',
      diagnoses: [{ icd10Code: 'J20.9', icd10Term: 'Acute bronchitis, unspecified', isPrimary: true }],
      prescriptions: [{ drugId, drugName: 'Paracetamol 650 mg', dose: '650 mg', frequency: 'TDS', duration: '5 days' }],
      labOrders: [],
    });

  const signed = await authed(sessions.doctor!).post(`/api/v1/encounters/${encounterId}/sign`);
  version = signed.body.version;
}, 180_000);

afterAll(async () => {
  if (!ready || !tenant) return;
  await settleAuditWrites(tenant.tenantId);
  await cleanupTenant(CODE);
});

describe('1 — a signed consultation is closed to ordinary editing', () => {
  test('the signature stands, and the doctor who wrote it cannot simply save over it', async ({ skip }) => {
    if (!ready) return skip();
    const chart = await authed(sessions.doctor!).get(`/api/v1/encounters/${encounterId}`);
    expect(chart.body.status).toBe('signed');
    expect(chart.body.wasSigned).toBe(true);
    expect(chart.body.amendments).toEqual([]);
    expect(chart.body.openAmendment).toBeNull();

    const edit = await authed(sessions.doctor!)
      .put(`/api/v1/encounters/${encounterId}`)
      .send({ version, assessment: 'rewritten in place', diagnoses: [], prescriptions: [], labOrders: [] });
    expect(edit.status).toBe(409);
    // The refusal has to point at the way through, or it is just a wall.
    expect(edit.body.error.message).toMatch(/amend/i);

    const reread = await authed(sessions.doctor!).get(`/api/v1/encounters/${encounterId}`);
    expect(reread.body.assessment).toBe('Acute bronchitis');
    expect(reread.body.version).toBe(version);
  });
});

describe('2 — reopening is its own permission, and its own act', () => {
  test('a receptionist cannot amend, and the consultation does not move', async ({ skip }) => {
    if (!ready) return skip();
    const attempt = await authed(sessions.receptionist!)
      .post(`/api/v1/encounters/${encounterId}/amend`)
      .send({ reason: 'The front desk would like to change the diagnosis' });
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe('FORBIDDEN');

    const chart = await authed(sessions.doctor!).get(`/api/v1/encounters/${encounterId}`);
    expect(chart.body.status).toBe('signed');
    expect(chart.body.amendments).toEqual([]);
  });

  test('a reason is required, and a keystroke is not a reason', async ({ skip }) => {
    if (!ready) return skip();
    const empty = await authed(sessions.doctor!).post(`/api/v1/encounters/${encounterId}/amend`).send({});
    expect(empty.status).toBe(422);

    const tooShort = await authed(sessions.doctor!)
      .post(`/api/v1/encounters/${encounterId}/amend`)
      .send({ reason: 'typo' });
    expect(tooShort.status).toBe(422);

    const chart = await authed(sessions.doctor!).get(`/api/v1/encounters/${encounterId}`);
    expect(chart.body.status).toBe('signed');
  });

  test('the doctor reopens it: the note becomes editable and the reason is on the record', async ({ skip }) => {
    if (!ready) return skip();
    const amended = await authed(sessions.doctor!)
      .post(`/api/v1/encounters/${encounterId}/amend`)
      .send({ reason: 'Cough is productive, not dry — the subjective note was wrong.' });
    expect(amended.status).toBe(200);
    expect(amended.body.status).toBe('amending');
    // Still a signed record, and still says when it was signed — this is not a fresh draft.
    expect(amended.body.wasSigned).toBe(true);
    expect(amended.body.signedAt).toBeTruthy();

    expect(amended.body.openAmendment).toBeTruthy();
    expect(amended.body.openAmendment.status).toBe('open');
    expect(amended.body.openAmendment.reason).toMatch(/productive/);
    expect(amended.body.openAmendment.amendedByName).toBeTruthy();
    expect(amended.body.openAmendment.completedAt).toBeNull();
    version = amended.body.version;
  });

  test('a second amendment cannot be opened on top of the first', async ({ skip }) => {
    if (!ready) return skip();
    const again = await authed(sessions.org_admin!)
      .post(`/api/v1/encounters/${encounterId}/amend`)
      .send({ reason: 'The administrator would like a second reason on this record.' });
    expect(again.status).toBe(409);

    const chart = await authed(sessions.doctor!).get(`/api/v1/encounters/${encounterId}`);
    expect(chart.body.amendments.length).toBe(1);
  });

  test("someone else's open amendment is not a door into the note", async ({ skip }) => {
    if (!ready) return skip();
    // The administrator holds every permission; what stops them here is that the reason on the
    // record is the doctor's, and editing through it would attribute their change to that reason.
    const edit = await authed(sessions.org_admin!)
      .put(`/api/v1/encounters/${encounterId}`)
      .send({ version, assessment: 'administrator edit', diagnoses: [], prescriptions: [], labOrders: [] });
    expect(edit.status).toBe(403);
    expect(edit.body.error.message).toMatch(/another user/i);
  });
});

describe('3 — a note being amended has not left the hospital', () => {
  test("it is still in the patient's history while the correction is in progress", async ({ skip }) => {
    if (!ready) return skip();
    const history = await authed(sessions.doctor!).get(`/api/v1/patients/${patientId}/encounters`);
    expect(history.status).toBe(200);
    expect(history.body.some((h: { id: string }) => h.id === encounterId)).toBe(true);
  });

  test('its prescription is still waiting at the pharmacy counter', async ({ skip }) => {
    if (!ready) return skip();
    const pending = await authed(sessions.pharmacist!).get('/api/v1/prescriptions/pending');
    expect(pending.status).toBe(200);
    expect(pending.body.length).toBe(1);
    expect(pending.body[0].drugName).toBe('Paracetamol 650 mg');
  });
});

describe('4 — the correction, and what it leaves behind', () => {
  test('the doctor saves the correction like any other edit', async ({ skip }) => {
    if (!ready) return skip();
    const saved = await authed(sessions.doctor!)
      .put(`/api/v1/encounters/${encounterId}`)
      .send({
        version,
        chiefComplaint: 'Cough for a week',
        subjective: 'Productive cough with yellow sputum, worse at night. No fever.',
        objective: 'Chest clear. Throat mildly congested.',
        assessment: 'Acute bronchitis',
        plan: 'Symptomatic treatment, review in five days',
        diagnoses: [{ icd10Code: 'J20.9', icd10Term: 'Acute bronchitis, unspecified', isPrimary: true }],
        prescriptions: [{ drugId, drugName: 'Paracetamol 650 mg', dose: '650 mg', frequency: 'TDS', duration: '5 days' }],
        labOrders: [],
      });
    expect(saved.status).toBe(200);
    expect(saved.body.status).toBe('amending');
    expect(saved.body.subjective).toMatch(/Productive/);
    version = saved.body.version;
  });

  test('an amendment with a correction in it cannot be quietly discarded', async ({ skip }) => {
    if (!ready) return skip();
    const cancel = await authed(sessions.doctor!).post(`/api/v1/encounters/${encounterId}/amend/cancel`);
    expect(cancel.status).toBe(409);
    expect(cancel.body.error.message).toMatch(/sign it/i);

    const chart = await authed(sessions.doctor!).get(`/api/v1/encounters/${encounterId}`);
    expect(chart.body.status).toBe('amending');
    expect(chart.body.subjective).toMatch(/Productive/);
  });

  test('re-signing locks the note and records exactly which parts changed', async ({ skip }) => {
    if (!ready) return skip();
    const signed = await authed(sessions.doctor!).post(`/api/v1/encounters/${encounterId}/sign`);
    expect(signed.status).toBe(200);
    expect(signed.body.status).toBe('signed');
    expect(signed.body.openAmendment).toBeNull();

    expect(signed.body.amendments.length).toBe(1);
    const [record] = signed.body.amendments;
    expect(record.status).toBe('completed');
    expect(record.completedAt).toBeTruthy();
    // The subjective note was corrected and nothing else — not "the note changed".
    expect(record.changedFields).toEqual(['subjective']);
    expect(record.reason).toMatch(/productive/i);
    version = signed.body.version;
  });

  test('the visit was completed once, by the first signature, and the amendment did not redo it', async ({ skip }) => {
    if (!ready) return skip();
    const visit = await authed(sessions.doctor!).get(`/api/v1/visits/${visitId}`);
    expect(visit.body.status).toBe('completed');

    const actions = await auditActions(tenant.tenantId, encounterId);
    expect(actions.filter((a) => a === 'encounter.sign').length).toBe(1);
    expect(actions).toContain('encounter.amend_open');
    expect(actions).toContain('encounter.amend_sign');
  });
});

describe('5 — an amendment that changes nothing still says so', () => {
  test('reopened, re-signed untouched, and recorded as exactly that', async ({ skip }) => {
    if (!ready) return skip();
    const opened = await authed(sessions.org_admin!)
      .post(`/api/v1/encounters/${encounterId}/amend`)
      .send({ reason: 'Reviewed after a complaint; checking the record against the notes.' });
    expect(opened.status).toBe(200);
    expect(opened.body.status).toBe('amending');

    const signed = await authed(sessions.org_admin!).post(`/api/v1/encounters/${encounterId}/sign`);
    expect(signed.status).toBe(200);
    expect(signed.body.status).toBe('signed');
    expect(signed.body.amendments.length).toBe(2);

    // Newest first. "Nobody changed anything" is a real answer, not an absent one.
    const latest = signed.body.amendments[0];
    expect(latest.status).toBe('completed');
    expect(latest.changedFields).toEqual([]);
    expect(latest.reason).toMatch(/complaint/i);
    version = signed.body.version;
  });
});

describe('6 — an amendment opened by mistake', () => {
  test('discards cleanly while nothing has been edited, and the trail keeps that it happened', async ({ skip }) => {
    if (!ready) return skip();
    const opened = await authed(sessions.doctor!)
      .post(`/api/v1/encounters/${encounterId}/amend`)
      .send({ reason: 'Opened this by mistake — meant the next patient on the list.' });
    expect(opened.status).toBe(200);

    const cancelled = await authed(sessions.doctor!).post(`/api/v1/encounters/${encounterId}/amend/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('signed');
    expect(cancelled.body.openAmendment).toBeNull();

    // Three rows now, and the discarded one is still one of them (invariant #6).
    expect(cancelled.body.amendments.length).toBe(3);
    expect(cancelled.body.amendments[0].status).toBe('cancelled');

    // The note is untouched by the round trip.
    expect(cancelled.body.subjective).toMatch(/Productive/);
    expect(cancelled.body.assessment).toBe('Acute bronchitis');
    expect(cancelled.body.prescriptions.length).toBe(1);
  });
});
