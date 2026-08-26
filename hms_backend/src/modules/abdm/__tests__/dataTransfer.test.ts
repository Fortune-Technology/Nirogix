import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient } from '../../patient/patient.service';
import { upsertFacilityConfig } from '../abdm.service';
import * as cc from '../careContext.service';
import * as consent from '../consent.service';
import { clearRecordedHipCalls, recordedHipCalls } from '../hipGateway';
import { contentChecksum } from '../cipher';
import { performTransfer, receiveHealthInformationRequest } from '../dataTransfer.service';

/**
 * Sending health records to a consented HIU (ADR-091).
 *
 * This is the flow where a mistake discloses a patient's clinical history to a third party, so the
 * suite is written around the refusals rather than the happy path: a revoked consent, a HI type the
 * patient did not agree to, a care context belonging to somebody else, a window outside the
 * consented range. Each of those must end in **nothing sent** and a gateway told the flow errored.
 *
 * The gateway and the HIU are both recorded rather than called — every M2 hop is asynchronous and
 * neither endpoint exists for us yet — so what is asserted is the half we control: what we decide,
 * and exactly what we would put on the wire.
 */

const CODE = 'ABDMXFER';
const HIP_ID = 'IN0710-XFER-001';
const PUSH_URL = 'https://hiu.example.org/data/push';

let ready = false;
let tenantId = '';
let patientId = '';
let otherPatientId = '';
let visitRef = '';
let otherRef = '';

/** The consent the patient granted: two record types, this year, this HIU. */
const grant = (consentId: string, over: Partial<consent.ConsentNotification> = {}): consent.ConsentNotification => ({
  consentId,
  abhaAddress: 'xfer@sbx',
  hipId: HIP_ID,
  hiuId: 'HIU-CLINIC-1',
  hiTypes: ['OPConsultation', 'Prescription'],
  accessMode: 'VIEW',
  dateRangeFrom: '2026-01-01T00:00:00.000Z',
  dateRangeTo: '2026-12-31T00:00:00.000Z',
  dataEraseAt: '2027-01-01T00:00:00.000Z',
  grantedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

/** A request as the gateway would forward it. */
const request = (consentId: string, over: Partial<Parameters<typeof receiveHealthInformationRequest>[0]> = {}) => ({
  hipId: HIP_ID,
  transactionId: `txn-${consentId}`,
  requestId: `req-${consentId}`,
  consentId,
  dataPushUrl: PUSH_URL,
  hiuPublicKey: 'HIU-PUBLIC-KEY',
  hiuNonce: 'HIU-NONCE',
  careContextRefs: [visitRef],
  from: '2026-02-01T00:00:00.000Z',
  to: '2026-11-30T00:00:00.000Z',
  ...over,
});

/** Runs a request through to completion, skipping the queue the controller would use. */
async function transfer(input: Parameters<typeof receiveHealthInformationRequest>[0]) {
  await receiveHealthInformationRequest(input);
  const row = await pool.query('SELECT id FROM abdm_data_transfers WHERE tenant_id = $1 AND transaction_id = $2', [
    tenantId,
    input.transactionId,
  ]);
  return performTransfer(tenantId, row.rows[0].id);
}

/** What we would have put on the wire to the HIU. */
const pushes = () => recordedHipCalls().filter((c) => c.path === PUSH_URL);
const gatewayCalls = (fragment: string) => recordedHipCalls().filter((c) => c.path.includes(fragment));

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'Transfer Test Hospital' });

  const patient = await createPatient(tenantId, {
    firstName: 'Anita',
    lastName: 'Rao',
    gender: 'female',
    dateOfBirth: '1988-03-11',
    phone: '9700003333',
  });
  patientId = patient.id;
  await pool.query("UPDATE patients SET abha_address = 'xfer@sbx', abha_verified_at = now() WHERE id = $1", [patientId]);

  // A real signed consultation, so the bundle built from it is a real bundle.
  const visit = await pool.query(
    `INSERT INTO visits (tenant_id, patient_id, visit_number, visit_date, status, token_number)
     VALUES ($1,$2,'V-XFER-0001', CURRENT_DATE, 'completed', 1) RETURNING id`,
    [tenantId, patientId],
  );
  const visitId = visit.rows[0].id;
  const enc = await pool.query(
    `INSERT INTO encounters (tenant_id, visit_id, patient_id, chief_complaint, assessment, plan, status, signed_at)
     VALUES ($1,$2,$3,'Cough','Acute bronchitis','Rest and fluids','signed', now()) RETURNING id`,
    [tenantId, visitId, patientId],
  );
  // A coded diagnosis, because a consultation carrying only free text produces no FHIR resources
  // and the builder rightly refuses to send an empty document.
  await pool.query(
    `INSERT INTO diagnoses (tenant_id, encounter_id, icd10_code, icd10_term, is_primary)
     VALUES ($1,$2,'J20.9','Acute bronchitis, unspecified', true)`,
    [tenantId, enc.rows[0].id],
  );

  visitRef = '44444444-4444-4444-8444-444444444444';
  await cc.recordCareContext({
    tenantId,
    patientId,
    referenceNumber: visitRef,
    displayLabel: cc.labelForVisit('2026-06-10'),
    hiType: 'OPConsultation',
    visitId,
  });
  await pool.query("UPDATE abdm_care_contexts SET status = 'linked' WHERE reference_number = $1", [visitRef]);

  // A second patient's context, which no consent in this suite covers.
  const other = await createPatient(tenantId, { firstName: 'Someone', lastName: 'Else', phone: '9700004444' });
  otherPatientId = other.id;
  const otherVisit = await pool.query(
    `INSERT INTO visits (tenant_id, patient_id, visit_number, visit_date, status, token_number)
     VALUES ($1,$2,'V-XFER-0002', CURRENT_DATE, 'completed', 2) RETURNING id`,
    [tenantId, otherPatientId],
  );
  const otherEnc = await pool.query(
    `INSERT INTO encounters (tenant_id, visit_id, patient_id, chief_complaint, assessment, status, signed_at)
     VALUES ($1,$2,$3,'Headache','Migraine','signed', now()) RETURNING id`,
    [tenantId, otherVisit.rows[0].id, otherPatientId],
  );
  await pool.query(
    `INSERT INTO diagnoses (tenant_id, encounter_id, icd10_code, icd10_term, is_primary)
     VALUES ($1,$2,'G43.9','Migraine, unspecified', true)`,
    [tenantId, otherEnc.rows[0].id],
  );
  otherRef = '55555555-5555-4555-8555-555555555555';
  await cc.recordCareContext({
    tenantId,
    patientId: otherPatientId,
    referenceNumber: otherRef,
    displayLabel: cc.labelForVisit('2026-06-11'),
    hiType: 'OPConsultation',
    visitId: otherVisit.rows[0].id,
  });
  await pool.query("UPDATE abdm_care_contexts SET status = 'linked' WHERE reference_number = $1", [otherRef]);
});

afterAll(async () => {
  if (!ready) return;
  await pool.query('DELETE FROM abdm_consents WHERE hip_id = $1', [HIP_ID]);
  await cleanupTenant(CODE);
});

beforeEach(() => clearRecordedHipCalls());

describe('accepting a request', () => {
  test('is acknowledged immediately, before any record is built', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(grant('xfer-ack'));
    const accepted = await receiveHealthInformationRequest(request('xfer-ack'));

    expect(accepted.accepted).toBe(true);
    // NHA expects a prompt ACKNOWLEDGED; a gateway held open while we build FHIR for a year of
    // records would time out on a transfer that was going to succeed.
    const ack = gatewayCalls('hip/on-request')[0];
    expect((ack?.body as { hiRequest: { sessionStatus: string } }).hiRequest.sessionStatus).toBe('ACKNOWLEDGED');
    expect(pushes()).toHaveLength(0);
  });

  test('a request for an unknown facility is dropped, not acknowledged', async ({ skip }) => {
    if (!ready) return skip();
    // The facility id is the only identifier on an inbound callback we can trust at all.
    const result = await receiveHealthInformationRequest(request('xfer-nofac', { hipId: 'NOT-A-FACILITY' }));
    expect(result.accepted).toBe(false);
    expect(recordedHipCalls()).toHaveLength(0);
  });

  test('the same request arriving twice is one transfer', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(grant('xfer-dupe'));
    await receiveHealthInformationRequest(request('xfer-dupe'));
    await receiveHealthInformationRequest(request('xfer-dupe'));

    const rows = await pool.query('SELECT id FROM abdm_data_transfers WHERE tenant_id = $1 AND transaction_id = $2', [
      tenantId,
      'txn-xfer-dupe',
    ]);
    expect(rows.rowCount).toBe(1);
  });

  test('a deadline is set from the SLA, so lateness is measurable', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(grant('xfer-sla'));
    await receiveHealthInformationRequest(request('xfer-sla'));

    const row = await pool.query('SELECT deadline_at FROM abdm_data_transfers WHERE transaction_id = $1', ['txn-xfer-sla']);
    expect(new Date(row.rows[0].deadline_at).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('sending records', () => {
  test('a consented request sends encrypted entries with a checksum of the plaintext', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(grant('xfer-ok'));
    const result = await transfer(request('xfer-ok'));

    expect(result.sent).toBe(1);
    const body = pushes()[0]?.body as {
      entries: Array<{ careContextReference: string; content: string; checksum: string }>;
      keyMaterial: { curve: string };
      pageNumber: number;
      pageCount: number;
    };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.careContextReference).toBe(visitRef);
    expect(body.keyMaterial.curve).toBe('Curve25519');
    expect(body.pageNumber).toBe(1);
    expect(body.pageCount).toBe(1);

    // The checksum is of what the HIU will hold AFTER decrypting, which is the only way it can
    // verify the decryption worked.
    const plaintext = Buffer.from(body.entries[0]!.content, 'base64').toString('utf8').replace('MOCK-NOT-ENCRYPTED:', '');
    expect(body.entries[0]!.checksum).toBe(contentChecksum(plaintext));
    expect(JSON.parse(plaintext).resourceType).toBe('Bundle');
  });

  test('the gateway is told the flow completed, per care context', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(grant('xfer-notify'));
    await transfer(request('xfer-notify'));

    const notify = gatewayCalls('health-information/notify')[0];
    const body = notify?.body as {
      notification: { statusNotification: { sessionStatus: string; statusResponses: Array<{ hiStatus: string }> } };
    };
    expect(body.notification.statusNotification.sessionStatus).toBe('TRANSFERRED');
    expect(body.notification.statusNotification.statusResponses[0]!.hiStatus).toBe('OK');
  });

  test('the transfer is recorded as completed with what was sent', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(grant('xfer-record'));
    await transfer(request('xfer-record'));

    const row = await pool.query('SELECT status, entries_sent, completed_at FROM abdm_data_transfers WHERE transaction_id = $1', [
      'txn-xfer-record',
    ]);
    expect(row.rows[0].status).toBe('transferred');
    expect(row.rows[0].entries_sent).toBe(1);
    expect(row.rows[0].completed_at).toBeTruthy();
  });

  test('an already-transferred request is not sent twice', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(grant('xfer-once'));
    await transfer(request('xfer-once'));
    const row = await pool.query('SELECT id FROM abdm_data_transfers WHERE transaction_id = $1', ['txn-xfer-once']);

    clearRecordedHipCalls();
    const again = await performTransfer(tenantId, row.rows[0].id);
    expect(again.sent).toBe(0);
    expect(pushes()).toHaveLength(0);
  });
});

describe('refusing to send', () => {
  test('a consent revoked after the request arrived stops the transfer', async ({ skip }) => {
    if (!ready) return skip();
    // The whole reason consent is re-checked at send time rather than at request time: a patient can
    // revoke in the seconds between, and the artefact we hold NOW is the only one that matters.
    await consent.recordConsentGrant(grant('xfer-revoked'));
    await receiveHealthInformationRequest(request('xfer-revoked'));
    await consent.revokeConsent(HIP_ID, 'xfer-revoked');

    const row = await pool.query('SELECT id FROM abdm_data_transfers WHERE transaction_id = $1', ['txn-xfer-revoked']);
    clearRecordedHipCalls();
    const result = await performTransfer(tenantId, row.rows[0].id);

    expect(result.sent).toBe(0);
    expect(pushes()).toHaveLength(0);
    expect(result.reason).toMatch(/No consent artefact/);
  });

  test('a refusal still tells the gateway, rather than leaving the HIU waiting', async ({ skip }) => {
    if (!ready) return skip();
    const result = await transfer(request('xfer-noconsent'));

    expect(result.sent).toBe(0);
    const body = gatewayCalls('health-information/notify')[0]?.body as {
      notification: { statusNotification: { sessionStatus: string; statusResponses: Array<{ hiStatus: string }> } };
    };
    expect(body.notification.statusNotification.sessionStatus).toBe('FAILED');
    expect(body.notification.statusNotification.statusResponses[0]!.hiStatus).toBe('ERRORED');
  });

  test('a care context the consent does not name is not sent', async ({ skip }) => {
    if (!ready) return skip();
    // The consent names one patient's contexts. Asking for another patient's must send nothing —
    // the request says what the HIU wants, the consent says what they may have.
    await consent.recordConsentGrant(
      grant('xfer-scope', { careContexts: [{ careContextReference: visitRef }] } as Partial<consent.ConsentNotification>),
    );
    const result = await transfer(request('xfer-scope', { careContextRefs: [otherRef] }));

    expect(result.sent).toBe(0);
    expect(pushes()).toHaveLength(0);
    expect(result.reason).toMatch(/covered by the consent/);
  });

  test('a record type outside the consent is skipped, not sent', async ({ skip }) => {
    if (!ready) return skip();
    // The patient consented to prescriptions only; the context holds a consultation.
    await consent.recordConsentGrant(grant('xfer-hitype', { hiTypes: ['Prescription'] }));
    const result = await transfer(request('xfer-hitype'));

    expect(result.sent).toBe(0);
    expect(pushes()).toHaveLength(0);
  });

  test('a window outside the consented range is refused', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(grant('xfer-window'));
    const result = await transfer(request('xfer-window', { from: '2025-01-01T00:00:00.000Z' }));

    expect(result.sent).toBe(0);
    expect(result.reason).toMatch(/starts before the consented range/);
  });

  test('an expired consent is refused with its own reason', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(grant('xfer-expired', { dataEraseAt: '2020-01-01T00:00:00.000Z' }));
    const result = await transfer(request('xfer-expired'));

    // "Expired" and "never granted" are different incidents; an auditor must be able to tell them
    // apart from the record alone.
    expect(result.reason).toMatch(/expired/);
  });

  test('every refusal is audited with the reason', async ({ skip }) => {
    if (!ready) return skip();
    await transfer(request('xfer-audit'));

    const audit = await pool.query(
      "SELECT metadata FROM audit_log WHERE tenant_id = $1 AND action = 'abdm.transfer.refused' ORDER BY created_at DESC LIMIT 1",
      [tenantId],
    );
    expect(audit.rows[0].metadata.reason).toBeTruthy();
  });
});
