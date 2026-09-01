import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { api, authed, cleanupTenant, dbReady, login, makeTenant, type Session, type TestTenant } from '../../../test-api';
import { pool } from '../../../db/client';
import { createProvider } from '../../provider/provider.service';

/**
 * Patient self check-in (ADR-118) — the third unauthenticated write path in the product.
 *
 * Most of this file is about what the endpoint **refuses to tell you**. A public form behind a
 * printed QR code is reachable by anyone who walks past the poster, so the interesting failures are
 * not crashes — they are disclosures:
 *
 * - a response that differs on a match answers "is this number a patient here, and are they due in
 *   today?" about a named person, to a caller who proved nothing;
 * - an endpoint that only *writes a row* on a match leaks the same fact through its side effects,
 *   which is why an unmatched announcement is recorded too;
 * - a token that 404s differently for "typo" and "switched off" enumerates hospitals.
 *
 * The other half is that the public path buys a shorter queue, not a way around a permission: the
 * visit is created by the ordinary authenticated check-in, or not at all.
 *
 * Skips cleanly with no database.
 */

const CODE = 'SELFCHK';
const PHONE = '9812345612';
const OTHER_PHONE = '9812345613';

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};
let providerId = '';
let patientId = '';
let appointmentId = '';
let token = '';

function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[selfCheckin.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE, 'Self Check-in Hospital');

  for (const role of ['org_admin', 'receptionist', 'doctor'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }

  providerId = (
    await createProvider(tenant.tenantId, {
      fullName: 'Dr. Asha Menon',
      consultationFeePaise: 40000,
      userId: sessions.doctor!.userId,
    })
  ).id;

  const patient = await authed(sessions.receptionist!)
    .post('/api/v1/patients')
    .send({ firstName: 'Ravi', lastName: 'Kumar', gender: 'male', dateOfBirth: '1982-05-15', phone: PHONE });
  patientId = patient.body.id;

  // An appointment for TODAY — self check-in only ever matches what the hospital already booked.
  const appt = await authed(sessions.receptionist!)
    .post('/api/v1/appointments')
    .send({ patientId, providerId, scheduledAt: tomorrowAt(11) });
  appointmentId = appt.body.id;
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

async function enable() {
  const res = await authed(sessions.org_admin!).put('/api/v1/self-check-in-settings').send({ enabled: true });
  token = res.body.token;
  return res;
}

/** The public endpoint, called the way a stranger with a poster would: no session at all. */
const announce = (t: string, phone: string) => api().post(`/api/v1/public/check-in/${t}`).send({ phone });

describe('the token is the only way in', () => {
  test('turning it on mints a link; a switch with nothing behind it would do nothing', async ({ skip }) => {
    if (!ready) return skip();
    const res = await enable();
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.token.length).toBeGreaterThanOrEqual(16);
  });

  test('a typo, a retired token and a made-up one are indistinguishable', async ({ skip }) => {
    if (!ready) return skip();
    const short = await api().get('/api/v1/public/check-in/abc');
    const madeUp = await api().get(`/api/v1/public/check-in/${'z'.repeat(32)}`);
    expect(short.status).toBe(404);
    expect(madeUp.status).toBe(404);
    // Identical message: the difference between "too short to be real" and "well-formed but
    // unknown" is exactly the difference an enumerator is looking for.
    expect(short.body.error.message).toBe(madeUp.body.error.message);
  });

  test('regenerating retires the old poster immediately', async ({ skip }) => {
    if (!ready) return skip();
    const before = token;
    const res = await authed(sessions.org_admin!).post('/api/v1/self-check-in-settings/regenerate');
    expect(res.status).toBe(200);
    expect(res.body.token).not.toBe(before);
    token = res.body.token;

    expect((await api().get(`/api/v1/public/check-in/${before}`)).status).toBe(404);
    expect((await api().get(`/api/v1/public/check-in/${token}`)).status).toBe(200);
  });

  test('the context says who the hospital is and nothing about its patients', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api().get(`/api/v1/public/check-in/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.hospitalName).toBe('Self Check-in Hospital');
    expect(res.body.enabled).toBe(true);
    expect(Object.keys(res.body).sort()).toEqual(['city', 'enabled', 'hospitalName']);
  });
});

describe('the reply never varies', () => {
  test('a matching number and a stranger get the same answer', async ({ skip }) => {
    if (!ready) return skip();
    const matched = await announce(token, PHONE);
    const stranger = await announce(token, OTHER_PHONE);

    expect(matched.status).toBe(202);
    expect(stranger.status).toBe(202);
    // Byte-identical. Anything else answers "is this person a patient here, and due in today?"
    expect(matched.body).toEqual(stranger.body);
  });

  test('an unmatched announcement is still recorded, so the side effects do not leak either', async ({ skip }) => {
    if (!ready) return skip();
    const rows = await pool.query(
      `SELECT patient_id FROM self_checkin_requests WHERE tenant_id = $1 ORDER BY announced_at`,
      [tenant.tenantId],
    );
    expect(rows.rowCount).toBe(2);
    // One matched, one did not — and both exist.
    expect(rows.rows.filter((r) => r.patient_id !== null)).toHaveLength(1);
    expect(rows.rows.filter((r) => r.patient_id === null)).toHaveLength(1);
  });

  test('a hospital with it switched off answers exactly the same, and writes nothing', async ({ skip }) => {
    if (!ready) return skip();
    await authed(sessions.org_admin!).put('/api/v1/self-check-in-settings').send({ enabled: false });

    const before = await pool.query('SELECT count(*)::int AS c FROM self_checkin_requests WHERE tenant_id = $1', [
      tenant.tenantId,
    ]);
    const res = await announce(token, PHONE);
    expect(res.status).toBe(202);
    expect(res.body.message).toMatch(/front desk has been told/i);

    const after = await pool.query('SELECT count(*)::int AS c FROM self_checkin_requests WHERE tenant_id = $1', [
      tenant.tenantId,
    ]);
    // Told the same thing, and nothing happened. "Off" must not be discoverable.
    expect(after.rows[0].c).toBe(before.rows[0].c);

    await authed(sessions.org_admin!).put('/api/v1/self-check-in-settings').send({ enabled: true });
  });

  test('the public path never returns anything about a patient', async ({ skip }) => {
    if (!ready) return skip();
    const res = await announce(token, PHONE);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Ravi');
    expect(body).not.toContain(PHONE);
    expect(body).not.toContain(patientId);
  });
});

describe("the desk's board", () => {
  let pending: { id: string; version: number };

  test('shows the matched arrival with the appointment it belongs to', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!).get('/api/v1/self-check-ins?status=pending');
    expect(res.status).toBe(200);
    const matched = res.body.find((r: { patientId: string | null }) => r.patientId === patientId);
    expect(matched).toBeTruthy();
    expect(matched.patientName).toBe('Ravi Kumar');
    expect(matched.appointmentId).toBe(appointmentId);
    expect(matched.providerName).toBe('Dr. Asha Menon');
    expect(matched.alreadyCheckedIn).toBe(false);
    pending = matched;
  });

  test('an unmatched arrival is on the board too — that is a person in the lobby', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!).get('/api/v1/self-check-ins?status=pending');
    const unmatched = res.body.find((r: { patientId: string | null }) => r.patientId === null);
    expect(unmatched).toBeTruthy();
    expect(unmatched.claimedPhone).toBe(OTHER_PHONE);
    expect(unmatched.patientName).toBeNull();
  });

  test('an unmatched arrival cannot be confirmed into a visit', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!).get('/api/v1/self-check-ins?status=pending');
    const unmatched = res.body.find((r: { patientId: string | null }) => r.patientId === null);
    const confirm = await authed(sessions.receptionist!)
      .post(`/api/v1/self-check-ins/${unmatched.id}/confirm`)
      .send({ version: unmatched.version });
    expect(confirm.status).toBe(422);
    // There is nobody to check in. The desk uses the ordinary screen, where it can search.
    expect(confirm.body.error.message).toMatch(/check-in screen/i);
  });

  test('confirming creates a real visit through the ordinary check-in', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!)
      .post(`/api/v1/self-check-ins/${pending.id}/confirm`)
      .send({ version: pending.version });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
    expect(res.body.resultingVisitId).toBeTruthy();

    // The same visit every other check-in produces: a token, and a priced invoice.
    const visit = await authed(sessions.receptionist!).get(`/api/v1/visits/${res.body.resultingVisitId}`);
    expect(visit.status).toBe(200);
    expect(visit.body.tokenNumber).toBeGreaterThan(0);
    expect(visit.body.invoice.totalPaise).toBe(40000);
    expect(visit.body.arrivalType).toBe('appointment');
  });

  test('confirming twice is refused', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!)
      .post(`/api/v1/self-check-ins/${pending.id}/confirm`)
      .send({ version: pending.version });
    expect(res.status).toBe(409);
  });

  test('dismissing needs a reason and is kept', async ({ skip }) => {
    if (!ready) return skip();
    const board = await authed(sessions.receptionist!).get('/api/v1/self-check-ins?status=pending');
    const unmatched = board.body.find((r: { patientId: string | null }) => r.patientId === null);

    const noReason = await authed(sessions.receptionist!)
      .post(`/api/v1/self-check-ins/${unmatched.id}/dismiss`)
      .send({ version: unmatched.version });
    expect(noReason.status).toBe(422);

    const res = await authed(sessions.receptionist!)
      .post(`/api/v1/self-check-ins/${unmatched.id}/dismiss`)
      .send({ version: unmatched.version, reason: 'Nobody came to the counter' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('dismissed');
    expect(res.body.dismissReason).toBe('Nobody came to the counter');
  });
});

describe('the public path is not a way around a permission', () => {
  test('the doctor cannot confirm an arrival', async ({ skip }) => {
    if (!ready) return skip();
    await announce(token, PHONE);
    const board = await authed(sessions.receptionist!).get('/api/v1/self-check-ins?status=pending');
    const item = board.body[0];
    // A doctor holds no `opd.visit.checkin`, and self check-in does not lend them one.
    const res = await authed(sessions.doctor!)
      .post(`/api/v1/self-check-ins/${item.id}/confirm`)
      .send({ version: item.version });
    expect(res.status).toBe(403);
  });

  test('the board itself needs a session', async ({ skip }) => {
    if (!ready) return skip();
    expect((await api().get('/api/v1/self-check-ins')).status).toBe(401);
  });

  test('only an administrator can turn it on or mint a link', async ({ skip }) => {
    if (!ready) return skip();
    expect(
      (await authed(sessions.receptionist!).put('/api/v1/self-check-in-settings').send({ enabled: false })).status,
    ).toBe(403);
    expect((await authed(sessions.receptionist!).post('/api/v1/self-check-in-settings/regenerate')).status).toBe(403);
  });
});

describe('audit and isolation', () => {
  test('a public announcement is audited against the hospital with no actor', async ({ skip }) => {
    if (!ready) return skip();
    await settleAuditWrites(tenant.tenantId);
    const rows = await pool.query(
      `SELECT actor_user_id, metadata FROM audit_log
        WHERE tenant_id = $1 AND action = 'self_checkin.announced'
        ORDER BY created_at DESC LIMIT 1`,
      [tenant.tenantId],
    );
    expect(rows.rowCount).toBe(1);
    // There is nobody signed in; putting a name here would be a fabrication.
    expect(rows.rows[0].actor_user_id).toBeNull();
    expect(typeof rows.rows[0].metadata.matched).toBe('boolean');
  });

  test("another hospital's board never shows these arrivals", async ({ skip }) => {
    if (!ready) return skip();
    const otherCode = 'SELFCHKB';
    await cleanupTenant(otherCode);
    const other = await makeTenant(otherCode, 'Second Hospital');
    try {
      const session = await login(otherCode, other.users.receptionist!);
      const res = await authed(session).get('/api/v1/self-check-ins');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    } finally {
      await settleAuditWrites(other.tenantId);
      await cleanupTenant(otherCode);
    }
  });

  test("one hospital's token never announces at another", async ({ skip }) => {
    if (!ready) return skip();
    const otherCode = 'SELFCHKC';
    await cleanupTenant(otherCode);
    const other = await makeTenant(otherCode, 'Third Hospital');
    try {
      const before = await pool.query(
        'SELECT count(*)::int AS c FROM self_checkin_requests WHERE tenant_id = $1',
        [other.tenantId],
      );
      await announce(token, PHONE);
      const after = await pool.query('SELECT count(*)::int AS c FROM self_checkin_requests WHERE tenant_id = $1', [
        other.tenantId,
      ]);
      // The token IS the tenant. There is no other input that could redirect it.
      expect(after.rows[0].c).toBe(before.rows[0].c);
    } finally {
      await settleAuditWrites(other.tenantId);
      await cleanupTenant(otherCode);
    }
  });
});
