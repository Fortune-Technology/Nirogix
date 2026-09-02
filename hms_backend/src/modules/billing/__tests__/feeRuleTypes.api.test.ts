import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { authed, cleanupTenant, dbReady, login, makeTenant, type Session, type TestTenant } from '../../../test-api';
import { pool } from '../../../db/client';
import { createProvider } from '../../provider/provider.service';

/**
 * Consultation type and case type as pricing dimensions (ADR-121).
 *
 * Three properties are worth protecting here, and they fail in different ways.
 *
 * **The vocabulary is the hospital's, and it is closed.** A type nobody configured cannot reach a
 * fee rule, a case or a visit — otherwise the schedule would price a word no screen can explain.
 *
 * **The case decides the case type, not the caller.** A corporate rate is a contract, so the price
 * has to come from the case row. A body claiming `caseType: 'Corporate'` must change nothing, and
 * the test that matters here is the one that proves a client cannot buy itself a discount.
 *
 * **Removing a word must not strand a price.** A rule pricing a type that no longer exists can
 * never match again, and would go on being displayed as this hospital's policy while quietly doing
 * nothing.
 *
 * Skips cleanly with no database.
 */

const CODE = 'FEETYPES';
const DOCTOR_DEFAULT_PAISE = 60000; // ₹600 on the doctor record

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};
let providerId = '';
let patientId = '';
let configVersion = 1;

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[feeRuleTypes.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE, 'Fee Types Hospital');

  for (const role of ['org_admin', 'receptionist', 'doctor'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }

  providerId = (
    await createProvider(tenant.tenantId, {
      fullName: 'Dr. Meera Iyer',
      consultationFeePaise: DOCTOR_DEFAULT_PAISE,
      userId: sessions.doctor!.userId,
    })
  ).id;

  const created = await authed(sessions.receptionist!)
    .post('/api/v1/patients')
    .send({ firstName: 'Rohit', lastName: 'Menon', gender: 'male', dateOfBirth: '1979-04-04', phone: '9812345677' });
  patientId = created.body.id;
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

/** The walk-in duplicate guard refuses a second live visit for the same patient. */
async function clearLiveVisits() {
  await pool.query(
    `UPDATE visits SET status = 'completed'
      WHERE tenant_id = $1 AND patient_id = $2 AND status IN ('checked_in', 'in_consultation')`,
    [tenant.tenantId, patientId],
  );
}

async function setVocabulary(body: Record<string, unknown>) {
  const res = await authed(sessions.org_admin!)
    .put('/api/v1/workflow-config')
    .send({ version: configVersion, ...body });
  if (res.status === 200) configVersion = res.body.version;
  return res;
}

async function preview(q: Record<string, string>) {
  return authed(sessions.receptionist!).get(`/api/v1/fee-rules/preview?${new URLSearchParams(q).toString()}`);
}

async function addRule(body: Record<string, unknown>) {
  return authed(sessions.org_admin!).post('/api/v1/fee-rules').send(body);
}

async function checkIn(body: Record<string, unknown>) {
  await clearLiveVisits();
  return authed(sessions.receptionist!)
    .post('/api/v1/visits/check-in')
    .send({ patientId, providerId, ...body });
}

describe('a hospital that has configured nothing', () => {
  test('has no vocabulary, so neither question is asked', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.org_admin!).get('/api/v1/workflow-config');
    expect(res.status).toBe(200);
    expect(res.body.consultationTypes).toEqual([]);
    expect(res.body.caseTypes).toEqual([]);
  });

  test('and a rule cannot invent one', async ({ skip }) => {
    if (!ready) return skip();
    const res = await addRule({ consultationType: 'Teleconsultation', feePaise: 30000 });
    expect(res.status).toBe(422);
    // The message has to say what to do, not only that it failed.
    expect(res.body.error.message).toMatch(/has not set up consultation types/i);
  });
});

describe('the vocabulary the hospital does configure', () => {
  test('is saved, tidied and given back', async ({ skip }) => {
    if (!ready) return skip();
    const res = await setVocabulary({
      consultationTypes: ['Teleconsultation', ' Procedure ', 'Review', 'review', ''],
      caseTypes: ['Corporate', 'Insurance'],
    });
    expect(res.status).toBe(200);
    // Trimmed, blanks dropped, and "review" recognised as the "Review" already in the list.
    expect(res.body.consultationTypes).toEqual(['Teleconsultation', 'Procedure', 'Review']);
    expect(res.body.caseTypes).toEqual(['Corporate', 'Insurance']);
  });

  test('and a rule can price one', async ({ skip }) => {
    if (!ready) return skip();
    expect((await addRule({ consultationType: 'Teleconsultation', feePaise: 30000 })).status).toBe(201);
    const res = await preview({ providerId, consultationType: 'Teleconsultation' });
    expect(res.body.feePaise).toBe(30000);
    expect(res.body.source).toBe('rule');
    // Any other consultation still falls through to the doctor's own fee.
    expect((await preview({ providerId })).body.feePaise).toBe(DOCTOR_DEFAULT_PAISE);
  });

  test('written in any case, stored in the hospital\'s spelling', async ({ skip }) => {
    if (!ready) return skip();
    const res = await addRule({ caseType: 'corporate', feePaise: 0, label: 'Billed to the employer' });
    expect(res.status).toBe(201);
    expect(res.body.caseType).toBe('Corporate');
  });

  test('but never a word outside it', async ({ skip }) => {
    if (!ready) return skip();
    const res = await addRule({ caseType: 'Charity', feePaise: 0 });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/Corporate/);
  });
});

describe('the resolution order across five dimensions', () => {
  test('case type outranks consultation type', async ({ skip }) => {
    if (!ready) return skip();
    // Both rules match a corporate teleconsultation. The corporate arrangement is the contract, and
    // it is meant to hold whatever kind of consultation happens inside it.
    const res = await preview({ providerId, consultationType: 'Teleconsultation', caseType: 'Corporate' });
    expect(res.body.feePaise).toBe(0);
  });

  test('and a named doctor outranks both', async ({ skip }) => {
    if (!ready) return skip();
    expect((await addRule({ providerId, feePaise: 90000, label: 'Senior consultant' })).status).toBe(201);
    const res = await preview({ providerId, consultationType: 'Teleconsultation', caseType: 'Corporate' });
    expect(res.body.feePaise).toBe(90000);
  });

  test('unless a rule names the doctor AND the case type', async ({ skip }) => {
    if (!ready) return skip();
    expect((await addRule({ providerId, caseType: 'Corporate', feePaise: 45000 })).status).toBe(201);
    expect((await preview({ providerId, caseType: 'Corporate' })).body.feePaise).toBe(45000);
    // The broader doctor rule still applies to everything else.
    expect((await preview({ providerId })).body.feePaise).toBe(90000);
  });

  test('two rules matching on exactly the same combination are refused', async ({ skip }) => {
    if (!ready) return skip();
    const res = await addRule({ providerId, caseType: 'Corporate', feePaise: 55000 });
    expect(res.status).toBe(409);
    // But the same doctor with a different type is a different rule, not a duplicate.
    expect((await addRule({ providerId, caseType: 'Insurance', feePaise: 70000 })).status).toBe(201);
  });
});

describe('what check-in actually charges', () => {
  test('a consultation type reaches the visit and prices it', async ({ skip }) => {
    if (!ready) return skip();
    // No case, so the doctor+consultation-type combination is not covered by any corporate rule.
    expect((await addRule({ providerId, consultationType: 'Procedure', feePaise: 25000 })).status).toBe(201);
    const res = await checkIn({ consultationType: 'Procedure' });
    expect(res.status).toBe(201);
    expect(res.body.consultationType).toBe('Procedure');
    expect(res.body.calculatedFeePaise).toBe(25000);
  });

  test('a type this hospital does not use is refused, and nothing is created', async ({ skip }) => {
    if (!ready) return skip();
    const before = await pool.query('SELECT count(*)::int AS c FROM visits WHERE tenant_id = $1', [tenant.tenantId]);
    const res = await checkIn({ consultationType: 'Home visit' });
    expect(res.status).toBe(422);
    const after = await pool.query('SELECT count(*)::int AS c FROM visits WHERE tenant_id = $1', [tenant.tenantId]);
    // Checked before the transaction opens: a rejected type must not leave a visit, a case or an
    // invoice behind.
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });

  test('a new case carries its type, and the case type prices the visit', async ({ skip }) => {
    if (!ready) return skip();
    const res = await checkIn({
      newCase: { title: 'Annual employee health check', caseType: 'Corporate' },
    });
    expect(res.status).toBe(201);
    expect(res.body.caseType).toBe('Corporate');
    // Doctor + Corporate = ₹450, not the doctor's ₹900 and not the blanket corporate ₹0.
    expect(res.body.calculatedFeePaise).toBe(45000);
  });

  test('🔒 and a later visit under that case is priced the same, without being asked again', async ({ skip }) => {
    if (!ready) return skip();
    const cases = await authed(sessions.receptionist!).get(`/api/v1/cases?patientId=${patientId}&status=open`);
    const corporate = cases.body.find((c: { caseType: string | null }) => c.caseType === 'Corporate');
    expect(corporate).toBeTruthy();

    const res = await checkIn({ caseId: corporate.id, arrivalType: 'follow_up' });
    expect(res.status).toBe(201);
    // The point of putting the type on the case: the third follow-up cannot drift onto another rate.
    expect(res.body.caseType).toBe('Corporate');
    expect(res.body.calculatedFeePaise).toBe(45000);
  });

  test('🔒 a caller cannot claim a case type to buy a cheaper visit', async ({ skip }) => {
    if (!ready) return skip();
    // `caseType` is not a field on the check-in body at all. Sending one must be inert — not an
    // error the desk has to understand, and certainly not a discount.
    const res = await checkIn({ caseType: 'Corporate', consultationType: 'Review' });
    expect(res.status).toBe(201);
    expect(res.body.caseType).toBeNull();
    // Priced as an ordinary consultation with this doctor, exactly as if nothing had been sent.
    expect(res.body.calculatedFeePaise).toBe(90000);
  });
});

describe('removing a word from the vocabulary', () => {
  test('is refused while an active rule still prices it', async ({ skip }) => {
    if (!ready) return skip();
    const res = await setVocabulary({ consultationTypes: ['Review'], caseTypes: ['Corporate', 'Insurance'] });
    expect(res.status).toBe(422);
    // Naming the types is what makes this actionable rather than a wall.
    expect(res.body.error.message).toMatch(/Teleconsultation|Procedure/);
  });

  test('and allowed once those rules are retired', async ({ skip }) => {
    if (!ready) return skip();
    const rules = await authed(sessions.org_admin!).get('/api/v1/fee-rules');
    const stale = rules.body.filter((r: { consultationType: string | null }) =>
      ['Teleconsultation', 'Procedure'].includes(r.consultationType ?? ''),
    );
    expect(stale.length).toBeGreaterThan(0);
    for (const r of stale) {
      const retired = await authed(sessions.org_admin!)
        .patch(`/api/v1/fee-rules/${r.id}`)
        .send({ version: r.version, isActive: false });
      expect(retired.status).toBe(200);
    }

    const res = await setVocabulary({ consultationTypes: ['Review'], caseTypes: ['Corporate', 'Insurance'] });
    expect(res.status).toBe(200);
    expect(res.body.consultationTypes).toEqual(['Review']);
  });

  test('and the visits already recorded under it keep their word', async ({ skip }) => {
    if (!ready) return skip();
    // Invariant #6 in spirit: configuration changed, history did not. A visit that happened as a
    // procedure did happen as a procedure.
    const rows = await pool.query(
      `SELECT count(*)::int AS c FROM visits WHERE tenant_id = $1 AND consultation_type = 'Procedure'`,
      [tenant.tenantId],
    );
    expect(rows.rows[0].c).toBeGreaterThan(0);
  });
});
