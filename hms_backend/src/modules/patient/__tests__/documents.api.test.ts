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
 * Documents attached to a patient (ADR-119).
 *
 * The failure that matters is a document filed against the wrong person — a referral letter on a
 * stranger's chart is both a privacy breach and a clinical hazard, and nothing downstream would
 * catch it. So the tests concentrate on the three ids this endpoint accepts and the three ways each
 * could be wrong: a file from another hospital, a visit belonging to someone else, a case belonging
 * to someone else.
 *
 * The other half is that the front desk can genuinely do this. Reception holds `file.document.view`
 * and `file.document.upload` already, because a referral letter handed over at the counter is
 * front-desk work — and the panel is useless if the person standing at the counter cannot use it.
 *
 * Skips cleanly with no database.
 */

const CODE = 'PATDOCS';

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};
let patientId = '';
let otherPatientId = '';
let providerId = '';
let visitId = '';
let caseId = '';
let fileId = '';

/** A tiny PNG — the upload path sniffs content, so the bytes have to be a real image. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function uploadFile(session: Session, name = 'referral.png'): Promise<string> {
  const res = await authed(session).post('/api/v1/files').attach('file', PNG, name);
  expect(res.status).toBe(201);
  return res.body.id;
}

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[documents.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE, 'Documents Hospital');

  for (const role of ['org_admin', 'receptionist', 'doctor', 'pharmacist'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }

  providerId = (
    await createProvider(tenant.tenantId, { fullName: 'Dr. Neha Joshi', consultationFeePaise: 0 })
  ).id;

  const a = await authed(sessions.receptionist!).post('/api/v1/patients').send({
    firstName: 'Suresh',
    lastName: 'Bhat',
    gender: 'male',
    dateOfBirth: '1970-01-20',
    phone: '9812345601',
  });
  patientId = a.body.id;

  const b = await authed(sessions.receptionist!).post('/api/v1/patients').send({
    firstName: 'Latha',
    lastName: 'Nair',
    gender: 'female',
    dateOfBirth: '1991-07-07',
    phone: '9812345602',
  });
  otherPatientId = b.body.id;

  const kase = await authed(sessions.receptionist!)
    .post('/api/v1/cases')
    .send({ patientId, title: 'Knee replacement follow-up' });
  caseId = kase.body.id;

  const visit = await authed(sessions.receptionist!)
    .post('/api/v1/visits/check-in')
    .send({ patientId, providerId, caseId });
  visitId = visit.body.id;

  fileId = await uploadFile(sessions.receptionist!);
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

describe('attaching', () => {
  let documentId = '';
  let documentVersion = 0;

  test('the front desk can attach a document to a patient', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!)
      .post(`/api/v1/patients/${patientId}/documents`)
      .send({
        fileId,
        title: 'Referral from Dr Rao',
        documentType: 'referral_letter',
        visitId,
        caseId,
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Referral from Dr Rao');
    expect(res.body.documentType).toBe('referral_letter');
    expect(res.body.caseNumber).toMatch(/^C-\d{6}$/);
    // The filename and size come from the file store, which is the only thing that knows them.
    expect(res.body.filename).toBe('referral.png');
    expect(res.body.size).toBeGreaterThan(0);
    documentId = res.body.id;
    documentVersion = res.body.version;
  });

  test('an untitled attachment falls back to the filename', async ({ skip }) => {
    if (!ready) return skip();
    const anotherFile = await uploadFile(sessions.receptionist!, 'scan-2024.png');
    const res = await authed(sessions.receptionist!)
      .post(`/api/v1/patients/${patientId}/documents`)
      .send({ fileId: anotherFile });
    expect(res.status).toBe(201);
    // A list of untitled rows is unusable; the filename is a worse title than a real one and a much
    // better one than nothing.
    expect(res.body.title).toBe('scan-2024.png');
    expect(res.body.documentType).toBe('other');
  });

  test('🔒 a visit belonging to someone else is refused', async ({ skip }) => {
    if (!ready) return skip();
    const another = await uploadFile(sessions.receptionist!);
    const res = await authed(sessions.receptionist!)
      .post(`/api/v1/patients/${otherPatientId}/documents`)
      .send({ fileId: another, visitId });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/different patient/i);
  });

  test('🔒 a case belonging to someone else is refused', async ({ skip }) => {
    if (!ready) return skip();
    const another = await uploadFile(sessions.receptionist!);
    const res = await authed(sessions.receptionist!)
      .post(`/api/v1/patients/${otherPatientId}/documents`)
      .send({ fileId: another, caseId });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/different patient/i);
  });

  test('🔒 a file from another hospital cannot be attached here', async ({ skip }) => {
    if (!ready) return skip();
    const otherCode = 'PATDOCSB';
    await cleanupTenant(otherCode);
    const other = await makeTenant(otherCode, 'Other Documents Hospital');
    try {
      const session = await login(otherCode, other.users.receptionist!);
      const foreignFileId = await uploadFile(session);

      const res = await authed(sessions.receptionist!)
        .post(`/api/v1/patients/${patientId}/documents`)
        .send({ fileId: foreignFileId });
      // The file store is shared infrastructure. RLS protects the row, but only because the service
      // actually goes and looks for it under this tenant.
      expect(res.status).toBe(404);
    } finally {
      await settleAuditWrites(other.tenantId);
      await cleanupTenant(otherCode);
    }
  });

  test('a made-up file id is refused', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!)
      .post(`/api/v1/patients/${patientId}/documents`)
      .send({ fileId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(404);
  });

  test('the attachment is audited with what it was attached to', async ({ skip }) => {
    if (!ready) return skip();
    await settleAuditWrites(tenant.tenantId);
    const rows = await pool.query(
      `SELECT metadata FROM audit_log
        WHERE tenant_id = $1 AND action = 'patient.document.attached'
        ORDER BY created_at LIMIT 1`,
      [tenant.tenantId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].metadata.patientId).toBe(patientId);
    expect(rows.rows[0].metadata.documentType).toBe('referral_letter');
  });

  test('archiving needs a reason, keeps the row, and hides it from the default list', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const noReason = await authed(sessions.receptionist!)
      .post(`/api/v1/patients/${patientId}/documents/${documentId}/archive`)
      .send({ version: documentVersion });
    expect(noReason.status).toBe(422);

    const res = await authed(sessions.receptionist!)
      .post(`/api/v1/patients/${patientId}/documents/${documentId}/archive`)
      .send({ version: documentVersion, reason: 'Attached to the wrong chart' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('archived');
    expect(res.body.archiveReason).toBe('Attached to the wrong chart');

    const active = await authed(sessions.receptionist!).get(
      `/api/v1/patients/${patientId}/documents`,
    );
    expect(active.body.some((d: { id: string }) => d.id === documentId)).toBe(false);

    // Kept, never deleted: that it was once attached is part of the record (invariant #6).
    const all = await authed(sessions.receptionist!).get(
      `/api/v1/patients/${patientId}/documents?includeArchived=true`,
    );
    expect(all.body.some((d: { id: string }) => d.id === documentId)).toBe(true);
  });

  test('archiving twice is refused', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!)
      .post(`/api/v1/patients/${patientId}/documents/${documentId}/archive`)
      .send({ version: documentVersion + 1, reason: 'Again' });
    expect(res.status).toBe(409);
  });
});

describe('reading', () => {
  test('the list can be narrowed to one case', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!).get(
      `/api/v1/patients/${patientId}/documents?caseId=${caseId}&includeArchived=true`,
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((d: { caseId: string | null }) => d.caseId === caseId)).toBe(true);
  });

  test('the doctor sees the same documents', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.doctor!).get(`/api/v1/patients/${patientId}/documents`);
    expect(res.status).toBe(200);
  });

  test('🔒 the pharmacist holds no file permission and is refused', async ({ skip }) => {
    if (!ready) return skip();
    expect(
      (await authed(sessions.pharmacist!).get(`/api/v1/patients/${patientId}/documents`)).status,
    ).toBe(403);
    expect(
      (
        await authed(sessions.pharmacist!)
          .post(`/api/v1/patients/${patientId}/documents`)
          .send({ fileId })
      ).status,
    ).toBe(403);
  });

  test("🔒 another hospital cannot read this patient's documents", async ({ skip }) => {
    if (!ready) return skip();
    const otherCode = 'PATDOCSC';
    await cleanupTenant(otherCode);
    const other = await makeTenant(otherCode, 'Third Documents Hospital');
    try {
      const session = await login(otherCode, other.users.receptionist!);
      const res = await authed(session).get(`/api/v1/patients/${patientId}/documents`);
      // The patient is not theirs, so there is nothing to return — and nothing to confirm either.
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) expect(res.body).toHaveLength(0);
    } finally {
      await settleAuditWrites(other.tenantId);
      await cleanupTenant(otherCode);
    }
  });
});
