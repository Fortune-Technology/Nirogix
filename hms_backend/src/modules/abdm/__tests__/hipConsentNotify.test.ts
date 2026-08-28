import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import * as consent from '../consent.service';
import { upsertFacilityConfig } from '../abdm.service';
import { clearRecordedHipCalls, recordedHipCalls } from '../hipGateway';
import { HIP_CONSENT_ON_NOTIFY_PATH } from '../abdm.constants';

/**
 * The consent callback a HIP receives (ADR-101, M2 §6.3.1).
 *
 * These exist because the endpoint was **missing entirely** until the official M2 documentation and
 * Postman collection were read. `revokeConsent` had been implemented and unit-tested since M2
 * shipped, but nothing in production could reach it: no route carried a revocation to it. A patient
 * withdrawing consent in their PHR app changed nothing here, and the artefact went on authorising
 * transfers — while our own audit trail said the consent was still live.
 *
 * That is the failure these pin. Not "does purge work" — that was already true — but **does a
 * revocation arriving from ABDM actually cause one**, and does the acknowledgement we send back
 * describe something that really happened.
 */

const CODE = 'ABDMCN';
const HIP_ID = 'IN0710-CN-001';
const ABHA = 'consent.notify@sbx';

let ready = false;
let tenantId = '';

const artefact = (consentId: string, status = 'GRANTED') => ({
  hipId: HIP_ID,
  status,
  consentId,
  signature: 'c2lnbmF0dXJl',
  detail: {
    consentId,
    createdAt: '2026-08-01T10:00:00.000Z',
    patient: { id: ABHA },
    hiu: { id: 'SUB_HIU' },
    consentManager: { id: 'sbx' },
    purpose: { text: 'Care Management', code: 'CAREMGT' },
    hiTypes: ['OPConsultation', 'Prescription'],
    careContexts: [{ patientReference: 'P1', careContextReference: 'CC1' }],
    permission: {
      accessMode: 'VIEW',
      dateRange: { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' },
      dataEraseAt: '2027-01-01T00:00:00.000Z',
      frequency: { unit: 'HOUR', value: 1, repeats: 0 },
    },
  },
});

const liveConsentIds = async (): Promise<string[]> => {
  const { rows } = await pool.query<{ consent_id: string }>(
    'SELECT consent_id FROM abdm_consents WHERE hip_id = $1 ORDER BY consent_id',
    [HIP_ID],
  );
  return rows.map((r) => r.consent_id);
};

const auditActions = async (consentId: string): Promise<string[]> => {
  const { rows } = await pool.query<{ action: string }>(
    `SELECT action FROM audit_log
      WHERE tenant_id = $1 AND resource_type = 'abdm_consent' AND metadata->>'consentId' = $2
      ORDER BY created_at`,
    [tenantId, consentId],
  );
  return rows.map((r) => r.action);
};

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'Consent Notify Hospital' });
});

afterEach(async () => {
  if (!ready) return;
  await pool.query('DELETE FROM abdm_consents WHERE hip_id = $1', [HIP_ID]);
  clearRecordedHipCalls();
});

afterAll(async () => {
  if (!ready) return;
  await pool.query('DELETE FROM abdm_consents WHERE hip_id = $1', [HIP_ID]);
  await cleanupTenant(CODE);
});

describe('a consent granted', () => {
  test('is stored with the permission window the patient actually agreed to', async ({ skip }) => {
    if (!ready) return skip();
    expect(await consent.applyHipConsentNotification(artefact('grant-1'))).toBe('granted');

    const { rows } = await pool.query(
      'SELECT abha_address, hiu_id, purpose_code, hi_types, access_mode, date_range_from, date_range_to FROM abdm_consents WHERE consent_id = $1',
      ['grant-1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.abha_address).toBe(ABHA);
    expect(rows[0]!.hiu_id).toBe('SUB_HIU');
    expect(rows[0]!.purpose_code).toBe('CAREMGT');
    expect(rows[0]!.hi_types).toEqual(['OPConsultation', 'Prescription']);
    // The window is what every later transfer is filtered by; losing it would silently widen consent.
    expect(new Date(rows[0]!.date_range_from as string).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(new Date(rows[0]!.date_range_to as string).toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  test('a grant naming no patient is refused rather than stored against nobody', async ({ skip }) => {
    if (!ready) return skip();
    const orphan = artefact('grant-orphan');
    orphan.detail.patient = { id: '' };
    // Every transfer check matches on the ABHA address, so an artefact without one can never apply.
    // Storing it would look like consent existed while behaving as though it did not.
    expect(await consent.applyHipConsentNotification(orphan)).toBe('ignored');
    expect(await liveConsentIds()).not.toContain('grant-orphan');
  });
});

describe('a consent withdrawn', () => {
  test('REVOKED deletes the artefact — it is not flagged, it is gone', async ({ skip }) => {
    if (!ready) return skip();
    await consent.applyHipConsentNotification(artefact('rev-1'));
    expect(await liveConsentIds()).toContain('rev-1');

    expect(await consent.applyHipConsentNotification({ ...artefact('rev-1', 'REVOKED') })).toBe('revoked');
    expect(await liveConsentIds()).not.toContain('rev-1');
    // NHA checks the row is gone. An artefact retained is an authorisation we might still act on.
    expect(await auditActions('rev-1')).toEqual(['abdm.consent.granted', 'abdm.consent.revoked']);
  });

  test('EXPIRED is treated exactly like a revocation', async ({ skip }) => {
    if (!ready) return skip();
    await consent.applyHipConsentNotification(artefact('exp-1'));
    expect(await consent.applyHipConsentNotification({ ...artefact('exp-1', 'EXPIRED') })).toBe('expired');
    expect(await liveConsentIds()).not.toContain('exp-1');
    expect(await auditActions('exp-1')).toContain('abdm.consent.expired');
  });

  test('a re-sent revocation is not an error', async ({ skip }) => {
    if (!ready) return skip();
    await consent.applyHipConsentNotification(artefact('rev-twice'));
    await consent.applyHipConsentNotification({ ...artefact('rev-twice', 'REVOKED') });
    // The gateway retries. A second revocation must be a no-op, never a failure that stalls it.
    expect(await consent.applyHipConsentNotification({ ...artefact('rev-twice', 'REVOKED') })).toBe('revoked');
  });

  test('status is matched case-insensitively', async ({ skip }) => {
    if (!ready) return skip();
    await consent.applyHipConsentNotification(artefact('rev-case'));
    expect(await consent.applyHipConsentNotification({ ...artefact('rev-case', 'revoked') })).toBe('revoked');
    expect(await liveConsentIds()).not.toContain('rev-case');
  });
});

describe('what it refuses to guess', () => {
  test('an unrecognised status neither stores nor deletes', async ({ skip }) => {
    if (!ready) return skip();
    await consent.applyHipConsentNotification(artefact('unknown-1'));
    expect(await consent.applyHipConsentNotification({ ...artefact('unknown-1', 'PENDING') })).toBe('ignored');
    // Inventing a revocation destroys permission the patient still wants; inventing a grant
    // fabricates permission they never gave. Doing nothing, loudly, is the only safe third option.
    expect(await liveConsentIds()).toContain('unknown-1');
  });

  test('an unknown facility is dropped, not answered differently', async ({ skip }) => {
    if (!ready) return skip();
    const outcome = await consent.applyHipConsentNotification({ ...artefact('stranger'), hipId: 'IN-NOT-OURS' });
    // Same posture as every other gateway callback (ADR-056): this must not become a way to ask
    // which hospitals are on the platform.
    expect(outcome).toBe('unknown_facility');
  });

  test('a notification with no consent id is ignored', async ({ skip }) => {
    if (!ready) return skip();
    const anon = artefact('');
    anon.consentId = '';
    anon.detail.consentId = '';
    expect(await consent.applyHipConsentNotification(anon)).toBe('ignored');
  });
});

describe('the acknowledgement sent back to ABDM', () => {
  test('carries the inbound REQUEST-ID, which is what correlates the two halves', async ({ skip }) => {
    if (!ready) return skip();
    await consent.acknowledgeHipConsentNotification({
      requestId: 'req-abc-123',
      consentId: 'ack-1',
      hipId: HIP_ID,
      ok: true,
    });

    const call = recordedHipCalls().find((c) => c.path === HIP_CONSENT_ON_NOTIFY_PATH);
    expect(call).toBeDefined();
    const body = call!.body as { acknowledgement: { status: string; consentId: string }; response: { requestId: string } };
    expect(body.acknowledgement).toEqual({ status: 'OK', consentId: 'ack-1' });
    // Not a body field — the header. Reading it from the payload would correlate nothing.
    expect(body.response.requestId).toBe('req-abc-123');
    expect(body).not.toHaveProperty('error');
  });

  test('reports failure honestly rather than acknowledging work that did not happen', async ({ skip }) => {
    if (!ready) return skip();
    await consent.acknowledgeHipConsentNotification({
      requestId: 'req-fail',
      consentId: 'ack-2',
      hipId: HIP_ID,
      ok: false,
      errorMessage: 'Notification could not be applied',
    });

    const call = recordedHipCalls().find((c) => c.path === HIP_CONSENT_ON_NOTIFY_PATH);
    const body = call!.body as { acknowledgement: { status: string }; error?: { message: string } };
    expect(body.acknowledgement.status).toBe('ERRORED');
    expect(body.error?.message).toBe('Notification could not be applied');
  });

  test('the artefact is already gone by the time we acknowledge a revocation', async ({ skip }) => {
    if (!ready) return skip();
    await consent.applyHipConsentNotification(artefact('order-1'));
    await consent.applyHipConsentNotification({ ...artefact('order-1', 'REVOKED') });

    // Acknowledge-then-act would tell ABDM the patient's wish was honoured before it was, and the
    // ack is durable evidence. Assert the state the ack describes is true when it is sent.
    expect(await liveConsentIds()).not.toContain('order-1');
    await consent.acknowledgeHipConsentNotification({
      requestId: 'req-order',
      consentId: 'order-1',
      hipId: HIP_ID,
      ok: true,
    });
    expect(recordedHipCalls().some((c) => c.path === HIP_CONSENT_ON_NOTIFY_PATH)).toBe(true);
  });
});
