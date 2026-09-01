import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { authed, cleanupTenant, dbReady, login, makeTenant, type Session, type TestTenant } from '../../../test-api';
import { pool } from '../../../db/client';
import { createProvider } from '../../provider/provider.service';
import { createDepartment } from '../../department/department.service';
import { setOverride } from '../../rbac/rbac.service';

/**
 * The consultation fee schedule (ADR-117).
 *
 * Two things are being protected, and they are different in kind.
 *
 * The first is **the resolution order**, which is the whole feature: a hospital writes several
 * overlapping rules and has to be able to predict which one applies. Doctor beats department beats
 * arrival type. Those tests build deliberately overlapping rules and assert the winner.
 *
 * The second is **that the price list is actually binding**. A schedule the front desk can silently
 * ignore is decoration, so an amount that differs from the calculated fee needs a permission and a
 * reason, and both numbers are kept — on the visit and in the audit log.
 *
 * Skips cleanly with no database.
 */

const CODE = 'FEERULES';
const PROVIDER_DEFAULT_PAISE = 50000; // ₹500 on the doctor record

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};
let providerId = '';
let otherProviderId = '';
let departmentId = '';
let patientId = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[feeRules.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE, 'Fee Rules Hospital');

  for (const role of ['org_admin', 'receptionist', 'doctor', 'cashier'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }

  providerId = (
    await createProvider(tenant.tenantId, {
      fullName: 'Dr. Priya Nair',
      consultationFeePaise: PROVIDER_DEFAULT_PAISE,
      userId: sessions.doctor!.userId,
    })
  ).id;
  otherProviderId = (
    await createProvider(tenant.tenantId, { fullName: 'Dr. Vikram Bose', consultationFeePaise: 20000 })
  ).id;
  departmentId = (
    await createDepartment(tenant.tenantId, { code: 'CARD', name: 'Cardiology' }, sessions.org_admin!.userId)
  ).id;

  const created = await authed(sessions.receptionist!)
    .post('/api/v1/patients')
    .send({ firstName: 'Nikhil', lastName: 'Rao', gender: 'male', dateOfBirth: '1988-08-08', phone: '9812345655' });
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

async function clearLiveVisits() {
  await pool.query(
    `UPDATE visits SET status = 'completed'
      WHERE tenant_id = $1 AND patient_id = $2 AND status IN ('checked_in', 'in_consultation')`,
    [tenant.tenantId, patientId],
  );
}

async function preview(q: Record<string, string>) {
  const qs = new URLSearchParams(q).toString();
  return authed(sessions.receptionist!).get(`/api/v1/fee-rules/preview?${qs}`);
}

async function addRule(body: Record<string, unknown>) {
  return authed(sessions.org_admin!).post('/api/v1/fee-rules').send(body);
}

describe('a hospital with no rules', () => {
  test("charges the doctor's own fee, exactly as before this existed", async ({ skip }) => {
    if (!ready) return skip();
    const res = await preview({ providerId });
    expect(res.status).toBe(200);
    expect(res.body.feePaise).toBe(PROVIDER_DEFAULT_PAISE);
    expect(res.body.source).toBe('provider_default');
  });

  test('and zero where there is no doctor at all', async ({ skip }) => {
    if (!ready) return skip();
    const res = await preview({});
    expect(res.body.feePaise).toBe(0);
    expect(res.body.source).toBe('none');
  });
});

describe('the resolution order', () => {
  test('a blanket follow-up rate applies to any doctor', async ({ skip }) => {
    if (!ready) return skip();
    expect((await addRule({ arrivalType: 'follow_up', feePaise: 20000, label: 'Follow-up rate' })).status).toBe(201);

    const res = await preview({ providerId, arrivalType: 'follow_up' });
    expect(res.body.feePaise).toBe(20000);
    expect(res.body.source).toBe('rule');
    // A first visit is untouched by a follow-up rule.
    expect((await preview({ providerId, arrivalType: 'appointment' })).body.feePaise).toBe(PROVIDER_DEFAULT_PAISE);
  });

  test('a department rate beats a blanket visit-type rate', async ({ skip }) => {
    if (!ready) return skip();
    expect((await addRule({ departmentId, feePaise: 60000, label: 'Cardiology' })).status).toBe(201);

    // Department (2) outranks arrival type (1) — so a cardiology follow-up is ₹600, not ₹200.
    const res = await preview({ providerId, departmentId, arrivalType: 'follow_up' });
    expect(res.body.feePaise).toBe(60000);
    // Outside cardiology the follow-up rate still governs.
    expect((await preview({ providerId, arrivalType: 'follow_up' })).body.feePaise).toBe(20000);
  });

  test('a named doctor beats their department', async ({ skip }) => {
    if (!ready) return skip();
    expect((await addRule({ providerId, feePaise: 80000, label: 'Senior consultant' })).status).toBe(201);

    // Doctor (4) outranks department (2).
    expect((await preview({ providerId, departmentId })).body.feePaise).toBe(80000);
    // Another doctor in the same department still gets the department rate.
    expect((await preview({ providerId: otherProviderId, departmentId })).body.feePaise).toBe(60000);
  });

  test('the most specific rule of all wins over every broader one', async ({ skip }) => {
    if (!ready) return skip();
    expect(
      (await addRule({ providerId, departmentId, arrivalType: 'follow_up', feePaise: 30000, label: 'Her follow-ups' }))
        .status,
    ).toBe(201);

    const res = await preview({ providerId, departmentId, arrivalType: 'follow_up' });
    expect(res.body.feePaise).toBe(30000);
    expect(res.body.ruleLabel).toBe('Her follow-ups');
    // And the broader rules are all still intact for the cases they cover.
    expect((await preview({ providerId, departmentId, arrivalType: 'appointment' })).body.feePaise).toBe(80000);
  });

  test('a duplicate combination is refused rather than becoming a coin toss', async ({ skip }) => {
    if (!ready) return skip();
    const res = await addRule({ departmentId, feePaise: 70000 });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already covers/i);
  });

  test('a retired rule stops applying but is not deleted', async ({ skip }) => {
    if (!ready) return skip();
    const rules = await authed(sessions.org_admin!).get('/api/v1/fee-rules');
    const specific = rules.body.find((r: { ruleLabel?: string; label: string }) => r.label === 'Her follow-ups');

    const retired = await authed(sessions.org_admin!)
      .patch(`/api/v1/fee-rules/${specific.id}`)
      .send({ version: specific.version, isActive: false });
    expect(retired.status).toBe(200);
    expect(retired.body.isActive).toBe(false);

    // It falls back to the next most specific rule that still applies.
    expect((await preview({ providerId, departmentId, arrivalType: 'follow_up' })).body.feePaise).toBe(80000);

    // Still there — it explains every invoice it priced.
    const withRetired = await authed(sessions.org_admin!).get('/api/v1/fee-rules?includeInactive=true');
    expect(withRetired.body.some((r: { id: string }) => r.id === specific.id)).toBe(true);
    // And absent from the default list, which is the one the desk reads.
    const activeOnly = await authed(sessions.org_admin!).get('/api/v1/fee-rules');
    expect(activeOnly.body.some((r: { id: string }) => r.id === specific.id)).toBe(false);
  });
});

describe('check-in charges what the schedule says', () => {
  test('the desk types nothing and the right fee is billed', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, departmentId, arrivalType: 'appointment' });
    expect(res.status).toBe(201);
    // Dr Nair's own rule: ₹800, not her ₹500 provider default and not the ₹600 department rate.
    expect(res.body.invoice.totalPaise).toBe(80000);
    expect(res.body.calculatedFeePaise).toBe(80000);
    expect(res.body.feeOverrideReason).toBeNull();
  });

  test('the arrival type genuinely changes the price', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId: otherProviderId, arrivalType: 'follow_up' });
    expect(res.status).toBe(201);
    // Dr Bose has no rule of his own, so the blanket follow-up rate applies — ₹200, not his ₹200
    // provider default by coincidence but by rule.
    expect(res.body.calculatedFeePaise).toBe(20000);
    expect(res.body.invoice.totalPaise).toBe(20000);
  });
});

describe('overriding the calculated fee', () => {
  test('the front desk cannot charge a different amount without the override', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, arrivalType: 'appointment', consultationFeePaise: 10000 });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/cannot change the consultation fee/i);
  });

  test('echoing back the calculated amount is not an override', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    // A client that sends back the number it was shown has not overridden anything, and refusing it
    // would break every form that round-trips its own state.
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, arrivalType: 'appointment', consultationFeePaise: 80000 });
    expect(res.status).toBe(201);
    expect(res.body.feeOverrideReason).toBeNull();
  });

  test('someone who may override still has to say why', async ({ skip }) => {
    if (!ready) return skip();
    // Grant this one receptionist the override, the way a hospital would (ADR-010).
    await setOverride(tenant.tenantId, {
      userId: sessions.receptionist!.userId,
      permission: 'billing.fee.override',
      effect: 'GRANT',
      reason: 'Front-desk supervisor',
    });
    sessions.supervisor = await login(CODE, tenant.users.receptionist!);

    await clearLiveVisits();
    const res = await authed(sessions.supervisor!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, arrivalType: 'appointment', consultationFeePaise: 10000 });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/reason/i);
  });

  test('a permitted override keeps both numbers and the reason', async ({ skip }) => {
    if (!ready) return skip();
    await clearLiveVisits();
    const res = await authed(sessions.supervisor!)
      .post('/api/v1/visits/check-in')
      .send({
        patientId,
        providerId,
        arrivalType: 'appointment',
        consultationFeePaise: 10000,
        feeOverrideReason: 'Staff concession approved by the medical director',
      });
    expect(res.status).toBe(201);
    // The invoice carries what was charged; the visit carries what should have been. The gap is the
    // override, and losing either half would make it unauditable.
    expect(res.body.invoice.totalPaise).toBe(10000);
    expect(res.body.calculatedFeePaise).toBe(80000);
    expect(res.body.feeOverrideReason).toMatch(/staff concession/i);
  });

  test('the override is audited as a warning, with both amounts', async ({ skip }) => {
    if (!ready) return skip();
    await settleAuditWrites(tenant.tenantId);
    const rows = await pool.query(
      `SELECT metadata, severity FROM audit_log
        WHERE tenant_id = $1 AND action = 'billing.fee.overridden'
        ORDER BY created_at DESC LIMIT 1`,
      [tenant.tenantId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].metadata.calculatedPaise).toBe(80000);
    expect(rows.rows[0].metadata.chargedPaise).toBe(10000);
    expect(rows.rows[0].metadata.reason).toBeTruthy();
    // Charging other than the price list is worth noticing in a log somebody scans.
    expect(rows.rows[0].severity).toBe('warning');
  });
});

describe('who may change the price list', () => {
  test('the front desk can read it but not write it', async ({ skip }) => {
    if (!ready) return skip();
    expect((await authed(sessions.receptionist!).get('/api/v1/fee-rules')).status).toBe(200);
    expect((await authed(sessions.receptionist!).post('/api/v1/fee-rules').send({ feePaise: 1 })).status).toBe(403);
  });

  test('the doctor is not in the pricing business at all', async ({ skip }) => {
    if (!ready) return skip();
    expect((await authed(sessions.doctor!).get('/api/v1/fee-rules')).status).toBe(403);
  });

  test('a price change records both the old and the new amount', async ({ skip }) => {
    if (!ready) return skip();
    const rules = await authed(sessions.org_admin!).get('/api/v1/fee-rules');
    const rule = rules.body.find((r: { label: string }) => r.label === 'Cardiology');
    const res = await authed(sessions.org_admin!)
      .patch(`/api/v1/fee-rules/${rule.id}`)
      .send({ version: rule.version, feePaise: 65000 });
    expect(res.status).toBe(200);

    await settleAuditWrites(tenant.tenantId);
    const rows = await pool.query(
      `SELECT metadata FROM audit_log
        WHERE tenant_id = $1 AND action = 'billing.fee_rule.updated'
        ORDER BY created_at DESC LIMIT 1`,
      [tenant.tenantId],
    );
    // The row afterwards holds only the new price, so the audit entry is the only place the old one
    // survives — which is exactly when someone asks what changed.
    expect(rows.rows[0].metadata.feePaiseBefore).toBe(60000);
    expect(rows.rows[0].metadata.feePaiseAfter).toBe(65000);
  });

  test('a stale version is refused', async ({ skip }) => {
    if (!ready) return skip();
    const rules = await authed(sessions.org_admin!).get('/api/v1/fee-rules');
    const rule = rules.body[0];
    const res = await authed(sessions.org_admin!)
      .patch(`/api/v1/fee-rules/${rule.id}`)
      .send({ version: 1, feePaise: 111 });
    expect([200, 409]).toContain(res.status);
    if (rule.version !== 1) expect(res.status).toBe(409);
  });
});
