import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { api, cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient } from '../../patient/patient.service';
import { upsertFacilityConfig } from '../abdm.service';
import { recordCareContext, labelForVisit, listCareContexts } from '../careContext.service';
import { clearRecordedHipCalls, recordedHipCalls } from '../hipGateway';
import { linkTokenExpiry, linkTokenFor, requestLinkToken, storeLinkToken } from '../linkToken.service';
import * as linking from '../linking.service';

/**
 * HIP-initiated linking (ADR-089).
 *
 * The gateway is mocked, which is the only honest option: every M2 flow is asynchronous and the
 * bridge URL does not exist yet. What IS testable — and what these assert — is the half we control:
 * the payload shape, when we refuse to call at all, how a link token's life is read, and what
 * happens when ABDM later says the link failed.
 */

const CODE = 'ABDMLINK';
const HIP_ID = 'IN0710-LINK-001';

let ready = false;
let tenantId = '';
let verifiedPatientId = '';
let unverifiedPatientId = '';

/** A JWT-shaped token whose `exp` is a chosen number of days away. Only the payload matters here. */
function tokenExpiringInDays(days: number): string {
  const payload = Buffer.from(JSON.stringify({ sub: 'x', exp: Math.floor(Date.now() / 1000) + days * 86400 })).toString('base64url');
  return `eyJhbGciOiJSUzUxMiJ9.${payload}.signature-not-checked`;
}

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'Link Test Hospital' });

  const verified = await createPatient(tenantId, {
    firstName: 'Linked',
    lastName: 'Patient',
    gender: 'female',
    dateOfBirth: '1990-05-05',
    phone: '9700001111',
  });
  verifiedPatientId = verified.id;
  await pool.query(
    "UPDATE patients SET abha_address = 'linked@sbx', abha_number = '91-4444-5555-6666', abha_verified_at = now() WHERE id = $1",
    [verifiedPatientId],
  );

  // Same ABHA string, never verified — the case that must never be linked.
  const unverified = await createPatient(tenantId, { firstName: 'Typed', phone: '9700002222' });
  unverifiedPatientId = unverified.id;
  await pool.query("UPDATE patients SET abha_address = 'typed@sbx' WHERE id = $1", [unverifiedPatientId]);
});

afterAll(async () => {
  if (!ready) return;
  await pool.query('DELETE FROM abdm_link_tokens WHERE tenant_id = $1', [tenantId]);
  await cleanupTenant(CODE);
});

beforeEach(() => clearRecordedHipCalls());

describe('link token lifetime', () => {
  test("expiry is read from the token's own claim, not assumed", async ({ skip }) => {
    if (!ready) return skip();
    // NHA says "about six months". Believing that instead of reading `exp` means a link failing at
    // the moment a patient is waiting for their record.
    const exp = linkTokenExpiry(tokenExpiringInDays(180));
    expect(exp).toBeInstanceOf(Date);
    expect(exp!.getTime()).toBeGreaterThan(Date.now());
  });

  test('an unreadable token yields no expiry rather than throwing', async ({ skip }) => {
    if (!ready) return skip();
    expect(linkTokenExpiry('not-a-jwt')).toBeNull();
    expect(linkTokenExpiry('')).toBeNull();
  });

  test('a delivered token is stored encrypted and comes back decrypted', async ({ skip }) => {
    if (!ready) return skip();
    const token = tokenExpiringInDays(180);
    expect(await storeLinkToken({ abhaAddress: 'linked@sbx', token, hipId: HIP_ID })).toBe(true);

    const row = await pool.query('SELECT token_enc, expires_at FROM abdm_link_tokens WHERE abha_address = $1', ['linked@sbx']);
    expect(row.rows[0].token_enc).toMatch(/^v1\./);
    expect(row.rows[0].token_enc).not.toContain(token);
    expect(row.rows[0].expires_at).toBeTruthy();

    expect(await linkTokenFor(tenantId, 'linked@sbx')).toBe(token);
  });

  test('a token inside the renewal margin counts as absent', async ({ skip }) => {
    if (!ready) return skip();
    // Starting a link with a token that expires in hours risks it dying mid-flight, so the caller
    // is told there is none and asks for a fresh one.
    await storeLinkToken({ abhaAddress: 'expiring@sbx', token: tokenExpiringInDays(0.5), hipId: HIP_ID });
    expect(await linkTokenFor(tenantId, 'expiring@sbx')).toBeNull();
  });

  test('a token for an unknown facility is dropped', async ({ skip }) => {
    if (!ready) return skip();
    expect(await storeLinkToken({ abhaAddress: 'x@sbx', token: tokenExpiringInDays(90), hipId: 'NOT-A-FACILITY' })).toBe(false);
  });
});

describe('requesting a link token', () => {
  test('refuses an unverified ABHA', async ({ skip }) => {
    if (!ready) return skip();
    // Asking a national registry to trust a hand-typed identifier would be our error, not the
    // patient's (ADR-084).
    const result = await requestLinkToken(tenantId, { patientId: unverifiedPatientId, hipId: HIP_ID });
    expect(result.requested).toBe(false);
    expect(result.reason).toContain('not been verified');
    expect(recordedHipCalls()).toHaveLength(0);
  });

  test('sends the demographics from the chart', async ({ skip }) => {
    if (!ready) return skip();
    await pool.query('DELETE FROM abdm_link_tokens WHERE abha_address = $1', ['linked@sbx']);
    const result = await requestLinkToken(tenantId, { patientId: verifiedPatientId, hipId: HIP_ID });
    expect(result.requested).toBe(true);

    const call = recordedHipCalls().at(-1)!;
    expect(call.path).toBe('/api/hiecm/v3/token/generate-token');
    expect(call.body).toMatchObject({
      abhaAddress: 'linked@sbx',
      gender: 'F',
      name: 'Linked Patient',
      yearOfBirth: 1990,
    });
    expect(call.headers['X-HIP-ID']).toBe(HIP_ID);
  });

  test('does not ask twice while a request is outstanding', async ({ skip }) => {
    if (!ready) return skip();
    // The webhook is the only thing that resolves it; asking again just adds another callback.
    clearRecordedHipCalls();
    const second = await requestLinkToken(tenantId, { patientId: verifiedPatientId, hipId: HIP_ID });
    expect(second.requested).toBe(false);
    expect(second.reason).toContain('already outstanding');
    expect(recordedHipCalls()).toHaveLength(0);
  });
});

describe('the link payload', () => {
  test('one context with three HI types becomes three blocks, not three contexts', async ({ skip }) => {
    if (!ready) return skip();
    const blocks = linking.toPatientBlocks(
      [
        {
          referenceNumber: 'visit-1',
          displayLabel: 'OPD records from 03/10/2026',
          hiTypes: ['Prescription', 'DiagnosticReport', 'Invoice'],
        } as never,
      ],
      'UHID-000001',
    );
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.hiType).sort()).toEqual(['DiagnosticReport', 'Invoice', 'Prescription']);
    // Every block points back at the same care context — the fan-out is a wire format only.
    for (const block of blocks) {
      expect(block.careContexts).toEqual([{ referenceNumber: 'visit-1', display: 'OPD records from 03/10/2026' }]);
      expect(block.count).toBe(1);
    }
  });

  test('carries no clinical information', async ({ skip }) => {
    if (!ready) return skip();
    // The HIE-CM is data blind: the payload may contain a date and a setting, and nothing else.
    const blocks = linking.toPatientBlocks(
      [{ referenceNumber: 'v', displayLabel: labelForVisit('2026-10-03'), hiTypes: ['Prescription'] } as never],
      'UHID-1',
    );
    expect(JSON.stringify(blocks)).toBe(
      JSON.stringify([
        {
          referenceNumber: 'UHID-1',
          display: 'UHID-1',
          hiType: 'Prescription',
          count: 1,
          careContexts: [{ referenceNumber: 'v', display: 'OPD records from 03/10/2026' }],
        },
      ]),
    );
  });
});

describe('linking a patient', () => {
  beforeEach(async () => {
    if (!ready) return;
    await pool.query('DELETE FROM abdm_care_contexts WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM abdm_link_tokens WHERE tenant_id = $1', [tenantId]);
    clearRecordedHipCalls();
  });

  test('waits for a token rather than failing, and asks for one', async ({ skip }) => {
    if (!ready) return skip();
    await recordCareContext({
      tenantId,
      patientId: verifiedPatientId,
      referenceNumber: 'visit-token-wait',
      displayLabel: labelForVisit('2026-10-03'),
      hiType: 'Prescription',
    });

    const result = await linking.linkPendingForPatient(tenantId, verifiedPatientId);
    expect(result.linked).toBe(0);
    expect(result.reason).toContain('Waiting for a link token');
    // And it asked — otherwise the context would sit pending for ever.
    expect(recordedHipCalls().at(-1)!.path).toBe('/api/hiecm/v3/token/generate-token');
  });

  test('links every pending context in ONE call once a token exists', async ({ skip }) => {
    if (!ready) return skip();
    await storeLinkToken({ abhaAddress: 'linked@sbx', token: tokenExpiringInDays(120), hipId: HIP_ID });
    for (const ref of ['visit-a', 'visit-b']) {
      await recordCareContext({
        tenantId,
        patientId: verifiedPatientId,
        referenceNumber: ref,
        displayLabel: labelForVisit('2026-10-03'),
        hiType: 'OPConsultation',
      });
    }

    const result = await linking.linkPendingForPatient(tenantId, verifiedPatientId);
    expect(result.linked).toBe(2);

    // One call, not one per context: a visit producing four records should notify the patient once.
    const linkCalls = recordedHipCalls().filter((c) => c.path === '/api/hiecm/hip/v3/link/carecontext');
    expect(linkCalls).toHaveLength(1);
    expect(linkCalls[0]!.headers['X-LINK-TOKEN']).toBeTruthy();
    expect(linkCalls[0]!.headers['X-HIP-ID']).toBe(HIP_ID);

    const contexts = await listCareContexts(tenantId, verifiedPatientId);
    expect(contexts.every((c) => c.status === 'linked')).toBe(true);
  });

  test('never links a patient whose ABHA was only typed', async ({ skip }) => {
    if (!ready) return skip();
    await recordCareContext({
      tenantId,
      patientId: unverifiedPatientId,
      referenceNumber: 'visit-unverified',
      displayLabel: labelForVisit('2026-10-03'),
      hiType: 'Prescription',
    });

    const result = await linking.linkPendingForPatient(tenantId, unverifiedPatientId);
    expect(result.linked).toBe(0);
    expect(result.reason).toContain('no verified ABHA');
    expect(recordedHipCalls()).toHaveLength(0);
  });

  test('the sweep is safe to run twice', async ({ skip }) => {
    if (!ready) return skip();
    await storeLinkToken({ abhaAddress: 'linked@sbx', token: tokenExpiringInDays(120), hipId: HIP_ID });
    await recordCareContext({
      tenantId,
      patientId: verifiedPatientId,
      referenceNumber: 'visit-sweep',
      displayLabel: labelForVisit('2026-10-03'),
      hiType: 'Invoice',
    });

    const first = await linking.linkPendingCareContexts(tenantId);
    expect(first.linked).toBe(1);
    // Nothing pending the second time, so nothing is re-linked.
    const second = await linking.linkPendingCareContexts(tenantId);
    expect(second.linked).toBe(0);
  });
});

describe('when ABDM says the link failed', () => {
  test('the context goes back to pending so the sweep retries', async ({ skip }) => {
    if (!ready) return skip();
    await pool.query('DELETE FROM abdm_care_contexts WHERE tenant_id = $1', [tenantId]);
    await storeLinkToken({ abhaAddress: 'linked@sbx', token: tokenExpiringInDays(120), hipId: HIP_ID });
    await recordCareContext({
      tenantId,
      patientId: verifiedPatientId,
      referenceNumber: 'visit-callback',
      displayLabel: labelForVisit('2026-10-03'),
      hiType: 'Prescription',
    });
    await linking.linkPendingForPatient(tenantId, verifiedPatientId);

    const result = await linking.recordLinkCallback({
      hipId: HIP_ID,
      abhaAddress: 'linked@sbx',
      error: 'Link token expired',
    });
    expect(result.updated).toBe(1);

    // Pending, not failed: most link failures are transient, and the record itself is fine.
    const context = (await listCareContexts(tenantId, verifiedPatientId))[0]!;
    expect(context.status).toBe('pending');
    expect(context.lastError).toBe('Link token expired');
  });

  test('a success confirmation does not move the linked timestamp', async ({ skip }) => {
    if (!ready) return skip();
    const before = (await listCareContexts(tenantId, verifiedPatientId))[0];
    await linking.recordLinkCallback({ hipId: HIP_ID, abhaAddress: 'linked@sbx', status: 'Successfully Linked care context' });
    const after = (await listCareContexts(tenantId, verifiedPatientId))[0];
    expect(after?.linkedAt?.toISOString()).toBe(before?.linkedAt?.toISOString());
  });
});

describe('the SMS fallback', () => {
  beforeEach(() => clearRecordedHipCalls());

  test('texts a patient who never gave us an ABHA', async ({ skip }) => {
    if (!ready) return skip();
    const result = await linking.notifyPatientBySms(tenantId, { patientId: unverifiedPatientId });
    expect(result.sent).toBe(true);
    const call = recordedHipCalls().at(-1)!;
    expect(call.path).toBe('/api/hiecm/hip/v3/link/patient/links/sms/notify2');
    expect(call.body).toMatchObject({ notification: { hip: { id: HIP_ID }, phoneNo: '9700002222' } });
  });

  test('does not text a patient whose records are already linked', async ({ skip }) => {
    if (!ready) return skip();
    // Pointless and intrusive: their records reach the app directly.
    const result = await linking.notifyPatientBySms(tenantId, { patientId: verifiedPatientId });
    expect(result.sent).toBe(false);
    expect(recordedHipCalls()).toHaveLength(0);
  });

  test('the audit records that we texted, never the number', async ({ skip }) => {
    if (!ready) return skip();
    const rows = await pool.query(
      "SELECT metadata FROM audit_log WHERE tenant_id = $1 AND action = 'abdm.sms_notify.sent' ORDER BY created_at DESC LIMIT 1",
      [tenantId],
    );
    expect(rows.rowCount).toBe(1);
    expect(JSON.stringify(rows.rows[0].metadata)).not.toContain('9700002222');
  });
});

describe('the callbacks ABDM posts to us', () => {
  test('a delivered link token is accepted and stored', async ({ skip }) => {
    if (!ready) return skip();
    const token = tokenExpiringInDays(150);
    const res = await api()
      .post('/api/v3/hip/token/on-generate-token')
      .set('X-HIP-ID', HIP_ID)
      .send({ abhaAddress: 'callback@sbx', linkToken: token, response: { requestId: 'r-1' } });
    expect(res.status).toBe(202);
    expect(await linkTokenFor(tenantId, 'callback@sbx')).toBe(token);
  });

  test('an unknown facility gets the same 202 — no probing', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api()
      .post('/api/v3/hip/token/on-generate-token')
      .set('X-HIP-ID', 'NOT-A-FACILITY')
      .send({ abhaAddress: 'nobody@sbx', linkToken: tokenExpiringInDays(30) });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
  });

  test('a malformed callback is refused', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api().post('/api/v3/hip/token/on-generate-token').set('X-HIP-ID', HIP_ID).send({ nope: true });
    expect(res.status).toBe(422);
  });

  test('a link-failure callback is accepted', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api()
      .post('/api/v3/link/on_carecontext')
      .set('X-HIP-ID', HIP_ID)
      .send({ abhaAddress: 'linked@sbx', error: { code: 1000, message: 'Invalid link token' } });
    expect(res.status).toBe(202);
  });
});
