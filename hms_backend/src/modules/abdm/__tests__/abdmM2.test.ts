import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient } from '../../patient/patient.service';
import * as cc from '../careContext.service';
import * as consent from '../consent.service';
import { upsertFacilityConfig } from '../abdm.service';

/**
 * ABDM Milestone 2 — care contexts and consent artefacts (ADR-087).
 *
 * Two things are being pinned here above all: that **nothing clinical can reach a care-context
 * label**, and that a revoked or expired consent is genuinely **deleted** rather than flagged. Both
 * are certification cases, and both are the kind of rule that decays silently without a test.
 */

const CODE = 'ABDMM2';
const HIP_ID = 'IN0710-M2-001';

let ready = false;
let tenantId = '';
let patientId = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'M2 Test Hospital' });
  patientId = (await createPatient(tenantId, { firstName: 'Care', lastName: 'Context', phone: '9700000001' })).id;
});

afterAll(async () => {
  if (!ready) return;
  await pool.query('DELETE FROM abdm_consents WHERE hip_id = $1', [HIP_ID]);
  await cleanupTenant(CODE);
});

describe('care contexts', () => {
  test('the label is date and setting only — never clinical', async ({ skip }) => {
    if (!ready) return skip();
    expect(cc.labelForVisit('2026-10-03')).toBe('OPD records from 03/10/2026');
    // The platform's date format (ADR-046) reaches ABDM too — the patient reads this in their app.
    expect(cc.labelForVisit('2026-01-09', 'IPD')).toBe('IPD records from 09/01/2026');
  });

  test('a clinical label is refused outright, not scrubbed', async ({ skip }) => {
    if (!ready) return skip();
    // The HIE-CM is data blind by design: a diagnosis in a display label is a disclosure that
    // cannot be taken back, so this fails loudly at the source instead of being sanitised.
    for (const label of ['Diabetes follow-up 03/10/2026', 'OPD records — HIV screening', 'Report: positive']) {
      expect(() => cc.assertNonClinicalLabel(label)).toThrowError(/must not contain clinical information/);
    }
    expect(() => cc.assertNonClinicalLabel('OPD records from 03/10/2026')).not.toThrow();
  });

  test('one care context per visit, accumulating its HI types', async ({ skip }) => {
    if (!ready) return skip();
    const ref = '11111111-1111-4111-8111-111111111111';
    await cc.recordCareContext({
      tenantId,
      patientId,
      referenceNumber: ref,
      displayLabel: cc.labelForVisit('2026-10-03'),
      hiType: 'OPConsultation',
    });
    await cc.recordCareContext({
      tenantId,
      patientId,
      referenceNumber: ref,
      displayLabel: cc.labelForVisit('2026-10-03'),
      hiType: 'DiagnosticReport',
    });
    // The same event arriving twice must not duplicate the type.
    await cc.recordCareContext({
      tenantId,
      patientId,
      referenceNumber: ref,
      displayLabel: cc.labelForVisit('2026-10-03'),
      hiType: 'DiagnosticReport',
    });

    const rows = (await cc.listCareContexts(tenantId, patientId)).filter((r) => r.referenceNumber === ref);
    expect(rows).toHaveLength(1);
    expect([...rows[0]!.hiTypes].sort()).toEqual(['DiagnosticReport', 'OPConsultation']);
  });

  test('only a VERIFIED ABHA makes a context linkable', async ({ skip }) => {
    if (!ready) return skip();
    // A hand-typed ABHA was never proved (ADR-084). Linking national records on the strength of an
    // unverified string would attach one person's records to another person's identity.
    const typed = await createPatient(tenantId, {
      firstName: 'Typed',
      phone: '9700000002',
      abhaNumber: '11-1111-1111-1111',
    });
    await cc.recordCareContext({
      tenantId,
      patientId: typed.id,
      referenceNumber: '22222222-2222-4222-8222-222222222222',
      displayLabel: cc.labelForVisit('2026-10-04'),
      hiType: 'Prescription',
    });

    const linkable = await cc.listLinkableCareContexts(tenantId);
    expect(linkable.some((r) => r.careContext.patientId === typed.id)).toBe(false);
  });

  test('a link failure is recorded, not swallowed', async ({ skip }) => {
    if (!ready) return skip();
    const ref = '33333333-3333-4333-8333-333333333333';
    const created = await cc.recordCareContext({
      tenantId,
      patientId,
      referenceNumber: ref,
      displayLabel: cc.labelForVisit('2026-10-05'),
      hiType: 'Invoice',
    });
    await cc.markLinkResult(tenantId, created.id, { linked: false, error: 'gateway refused' });

    const after = (await cc.listCareContexts(tenantId, patientId)).find((r) => r.id === created.id)!;
    expect(after.status).toBe('failed');
    expect(after.lastError).toBe('gateway refused');
    expect(after.linkAttempts).toBe(1);
  });
});

describe('consent artefacts', () => {
  const artefact = (consentId: string, over: Partial<consent.ConsentNotification> = {}): consent.ConsentNotification => ({
    consentId,
    abhaAddress: 'm2patient@sbx',
    hipId: HIP_ID,
    hiuId: 'HIU-CLINIC-1',
    hiTypes: ['Prescription', 'OPConsultation'],
    accessMode: 'VIEW',
    dateRangeFrom: '2026-01-01T00:00:00.000Z',
    dateRangeTo: '2026-12-31T00:00:00.000Z',
    dataEraseAt: '2027-01-01T00:00:00.000Z',
    grantedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  });

  test('a grant is stored against the right hospital, resolved from the facility id', async ({ skip }) => {
    if (!ready) return skip();
    const saved = await consent.recordConsentGrant(artefact('consent-1'));
    expect(saved?.tenantId).toBe(tenantId);
    expect(saved?.hiTypes).toEqual(['Prescription', 'OPConsultation']);
  });

  test('an unknown facility is dropped, not stored', async ({ skip }) => {
    if (!ready) return skip();
    // Same posture as the Scan-and-Share callback: never a different answer for an unknown facility.
    expect(await consent.recordConsentGrant(artefact('consent-nope', { hipId: 'NOT-A-FACILITY' }))).toBeNull();
  });

  test('re-notification updates rather than duplicating', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(artefact('consent-2'));
    await consent.recordConsentGrant(artefact('consent-2', { hiTypes: ['Prescription'] }));
    const held = (await consent.listConsents(tenantId)).filter((c) => c.consentId === 'consent-2');
    expect(held).toHaveLength(1);
    expect(held[0]!.hiTypes).toEqual(['Prescription']);
  });

  test('REVOKE deletes the artefact and keeps the audit event', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(artefact('consent-revoke'));
    expect(await consent.revokeConsent(HIP_ID, 'consent-revoke')).toBe(true);

    // Gone from the table — NHA's test case checks exactly this, and a flag would not satisfy it.
    const rows = await pool.query('SELECT 1 FROM abdm_consents WHERE consent_id = $1', ['consent-revoke']);
    expect(rows.rowCount).toBe(0);

    // But the history survives: invariant #6 is about the audit trail, not the authorisation.
    const audit = await pool.query(
      "SELECT metadata FROM audit_log WHERE tenant_id = $1 AND action = 'abdm.consent.revoked'",
      [tenantId],
    );
    expect(audit.rowCount).toBeGreaterThan(0);
    expect(audit.rows[0].metadata.consentId).toBe('consent-revoke');
  });

  test('revoking twice is not an error', async ({ skip }) => {
    if (!ready) return skip();
    // A re-sent revocation must not fail — the desired state is already true.
    expect(await consent.revokeConsent(HIP_ID, 'consent-revoke')).toBe(false);
  });

  test('EXPIRY deletes it too', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(artefact('consent-expire'));
    await consent.expireConsent(HIP_ID, 'consent-expire');
    const rows = await pool.query('SELECT 1 FROM abdm_consents WHERE consent_id = $1', ['consent-expire']);
    expect(rows.rowCount).toBe(0);
  });

  test('expiry is swept proactively, not only when we are told', async ({ skip }) => {
    if (!ready) return skip();
    // Relying on the callback alone would leave a live authorisation behind whenever one is missed.
    await consent.recordConsentGrant(
      artefact('consent-stale', { dataEraseAt: '2020-01-01T00:00:00.000Z' }),
    );
    const purged = await consent.purgeExpiredConsents(tenantId);
    expect(purged).toBeGreaterThan(0);
    const rows = await pool.query('SELECT 1 FROM abdm_consents WHERE consent_id = $1', ['consent-stale']);
    expect(rows.rowCount).toBe(0);
  });

  test('ABHA opt-out clears the identity and every consent, but keeps the chart', async ({ skip }) => {
    if (!ready) return skip();
    const patient = await createPatient(tenantId, { firstName: 'Opted', lastName: 'Out', phone: '9700000003' });
    await pool.query(
      "UPDATE patients SET abha_address = $1, abha_number = '91-0000-0000-0001', abha_verified_at = now() WHERE id = $2",
      ['optout@sbx', patient.id],
    );
    await consent.recordConsentGrant(artefact('consent-optout', { abhaAddress: 'optout@sbx' }));

    const result = await consent.handleAbhaOptOut(HIP_ID, 'optout@sbx');
    expect(result.consents).toBe(1);
    expect(result.patients).toBe(1);

    // The identity is gone; the clinical record is NOT — it is the hospital's own (invariant #6).
    const row = await pool.query('SELECT abha_address, abha_number, status FROM patients WHERE id = $1', [patient.id]);
    expect(row.rows[0].abha_address).toBeNull();
    expect(row.rows[0].abha_number).toBeNull();
    expect(row.rows[0].status).toBe('active');
  });
});

describe('the consent gate every transfer passes', () => {
  const base = { consentId: 'gate-1', hiuId: 'HIU-CLINIC-1' };

  beforeAll(async () => {
    if (!ready) return;
    await consent.recordConsentGrant({
      consentId: 'gate-1',
      abhaAddress: 'gate@sbx',
      hipId: HIP_ID,
      hiuId: 'HIU-CLINIC-1',
      hiTypes: ['Prescription'],
      dateRangeFrom: '2026-01-01T00:00:00.000Z',
      dateRangeTo: '2026-06-30T00:00:00.000Z',
      dataEraseAt: '2027-01-01T00:00:00.000Z',
    });
  });

  test('allows what the patient agreed to', async ({ skip }) => {
    if (!ready) return skip();
    const check = await consent.checkConsentForTransfer(tenantId, {
      ...base,
      hiTypes: ['Prescription'],
      from: new Date('2026-02-01'),
      to: new Date('2026-03-01'),
    });
    expect(check.allowed).toBe(true);
  });

  test('refuses a record type outside the consent', async ({ skip }) => {
    if (!ready) return skip();
    const check = await consent.checkConsentForTransfer(tenantId, { ...base, hiTypes: ['DiagnosticReport'] });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('DiagnosticReport');
  });

  test('refuses a window wider than the consent', async ({ skip }) => {
    if (!ready) return skip();
    // The request must sit INSIDE the granted range, not merely overlap it.
    const early = await consent.checkConsentForTransfer(tenantId, { ...base, from: new Date('2025-12-01') });
    expect(early.allowed).toBe(false);
    const late = await consent.checkConsentForTransfer(tenantId, { ...base, to: new Date('2026-08-01') });
    expect(late.allowed).toBe(false);
  });

  test('refuses a different requester', async ({ skip }) => {
    if (!ready) return skip();
    const check = await consent.checkConsentForTransfer(tenantId, { ...base, hiuId: 'HIU-SOMEONE-ELSE' });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('different requester');
  });

  test('refuses when the artefact is gone — the fail-closed case', async ({ skip }) => {
    if (!ready) return skip();
    // Revoked, expired or never granted all look the same here, and all mean no.
    const check = await consent.checkConsentForTransfer(tenantId, { consentId: 'never-existed' });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('No consent artefact');
  });

  test('refuses an expired consent even if everything else fits', async ({ skip }) => {
    if (!ready) return skip();
    const check = await consent.checkConsentForTransfer(tenantId, {
      ...base,
      hiTypes: ['Prescription'],
      now: new Date('2028-01-01'),
    });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('expired');
  });
});
