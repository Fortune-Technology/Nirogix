import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient } from '../../patient/patient.service';
import { upsertFacilityConfig } from '../abdm.service';
import { clearRecordedHipCalls, recordedHipCalls } from '../hipGateway';
import { contentChecksum } from '../cipher';
import * as hiu from '../hiuConsent.service';
import * as transfer from '../hiuDataTransfer.service';

/**
 * Reading another hospital's records (ADR-093).
 *
 * The receive path is where M3 is most exposed: the payload arrives from a stranger, on a connection
 * we did not open, encrypted with keys we generated minutes earlier. So most of this suite is about
 * what happens when the push is **wrong** — a bad checksum, an unreadable entry, a transaction we
 * never started, a consent revoked while the data was in flight.
 *
 * The rule being pinned throughout: **nothing is stored that we could not decrypt and verify.** A
 * doctor shown a partial history has no way to know it is partial, so a corrupted entry is dropped
 * and counted, never stored hopefully.
 */

const CODE = 'ABDMHIUX';
const HIP_ID = 'IN0710-HIUX-001';
const SOURCE_HIP = 'IN0710-OTHER-HOSPITAL';

let ready = false;
let tenantId = '';
let patientId = '';
let providerId = '';

/** A FHIR-ish bundle, as a source hospital would send it. */
const bundle = (date = '2026-03-04T10:00:00.000Z') => ({
  resourceType: 'Bundle',
  timestamp: date,
  entry: [{ resource: { resourceType: 'Composition', date, type: { text: 'OP Consultation Document' } } }],
});

/** The mock cipher's envelope — the exact inverse of what `decryptFromHip` unwraps. */
const sealed = (plaintext: string) => Buffer.from(`MOCK-NOT-ENCRYPTED:${plaintext}`).toString('base64');

/** A granted consent plus a data request, leaving a transfer waiting for its push. */
async function readyToReceive(consentId: string): Promise<{ transactionId: string; consentRowId: string }> {
  const request = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });
  await pool.query('UPDATE abdm_hiu_consent_requests SET consent_request_id = $1 WHERE id = $2', [
    `cr-${consentId}`,
    request.id,
  ]);
  const consent = await hiu.storeConsentArtefact({
    consentId,
    consentRequestId: `cr-${consentId}`,
    hipId: SOURCE_HIP,
    abhaAddress: 'hiux@sbx',
    hiTypes: ['OPConsultation'],
    dateRangeFrom: '2020-01-01T00:00:00.000Z',
    dateRangeTo: '2030-01-01T00:00:00.000Z',
    dataEraseAt: '2030-12-31T00:00:00.000Z',
  });
  const result = await transfer.requestRecords(tenantId, consent!.id);
  return { transactionId: result.transactionId, consentRowId: consent!.id };
}

const storedRecords = async (): Promise<number> =>
  (await pool.query('SELECT count(*)::int AS n FROM abdm_hiu_records WHERE tenant_id = $1', [tenantId])).rows[0].n;

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'HIU Transfer Test' });

  const patient = await createPatient(tenantId, { firstName: 'Sunil', lastName: 'Nair', phone: '9700007777' });
  patientId = patient.id;
  await pool.query("UPDATE patients SET abha_address = 'hiux@sbx', abha_verified_at = now() WHERE id = $1", [patientId]);

  const doctor = await pool.query(
    `INSERT INTO providers (tenant_id, full_name, registration_number, is_active)
     VALUES ($1,'Dr Priya Nair','MCI-99887', true) RETURNING id`,
    [tenantId],
  );
  providerId = doctor.rows[0].id;
});

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(CODE);
});

beforeEach(() => clearRecordedHipCalls());

describe('asking for records', () => {
  test('a fresh key pair is generated and its private half stored encrypted', async ({ skip }) => {
    if (!ready) return skip();
    const { transactionId } = await readyToReceive('hiux-keys-1');

    const row = await pool.query(
      'SELECT private_key_enc, public_key, nonce FROM abdm_hiu_data_transfers WHERE transaction_id = $1',
      [transactionId],
    );
    // A readable private key is standing ability to decrypt somebody's medical history.
    expect(row.rows[0].private_key_enc).toMatch(/^v1\./);
    expect(row.rows[0].public_key).toBeTruthy();
    expect(row.rows[0].nonce).toBeTruthy();
  });

  test('key pairs are per request, never reused', async ({ skip }) => {
    if (!ready) return skip();
    const a = await readyToReceive('hiux-keys-2');
    const b = await readyToReceive('hiux-keys-3');
    const rows = await pool.query(
      'SELECT private_key_enc FROM abdm_hiu_data_transfers WHERE transaction_id = ANY($1)',
      [[a.transactionId, b.transactionId]],
    );
    // One compromise should expose one document set, not every transfer ever made.
    expect(rows.rows[0].private_key_enc).not.toBe(rows.rows[1].private_key_enc);
  });

  test('the request carries our PUBLIC key and our own push URL', async ({ skip }) => {
    if (!ready) return skip();
    await readyToReceive('hiux-req-1');
    const body = recordedHipCalls().find((c) => c.path.includes('health-information/request'))?.body as {
      hiRequest: { dataPushUrl: string; keyMaterial: { curve: string; dhPublicKey: { keyValue: string } } };
    };
    expect(body.hiRequest.dataPushUrl).toBe('https://api-test.example.org/api-hiu/data/notification');
    expect(body.hiRequest.keyMaterial.curve).toBe('Curve25519');
    expect(body.hiRequest.keyMaterial.dhPublicKey.keyValue).not.toContain('PRIVATE');
  });

  test('an expired consent cannot be used to ask', async ({ skip }) => {
    if (!ready) return skip();
    const request = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });
    await pool.query('UPDATE abdm_hiu_consent_requests SET consent_request_id = $1 WHERE id = $2', ['cr-dead', request.id]);
    const consent = await hiu.storeConsentArtefact({
      consentId: 'hiux-dead',
      consentRequestId: 'cr-dead',
      hipId: SOURCE_HIP,
      abhaAddress: 'hiux@sbx',
      hiTypes: ['OPConsultation'],
      dataEraseAt: '2020-01-01T00:00:00.000Z',
    });
    await expect(transfer.requestRecords(tenantId, consent!.id)).rejects.toThrow(/expired/i);
  });
});

describe('receiving records', () => {
  test('a verified entry is decrypted, checked and stored', async ({ skip }) => {
    if (!ready) return skip();
    const { transactionId } = await readyToReceive('hiux-ok-1');
    const before = await storedRecords();
    const plaintext = JSON.stringify(bundle());

    const result = await transfer.receivePushedRecords({
      transactionId,
      pageNumber: 1,
      pageCount: 1,
      entries: [{ content: sealed(plaintext), checksum: contentChecksum(plaintext), careContextReference: 'cc-1' }],
      keyMaterial: { dhPublicKey: { keyValue: 'HIP-PUBLIC' }, nonce: 'HIP-NONCE' },
    });

    expect(result).toEqual({ stored: 1, failed: 0 });
    expect(await storedRecords()).toBe(before + 1);

    const row = await pool.query(
      'SELECT hi_type, source_hip_id, record_date FROM abdm_hiu_records WHERE care_context_reference = $1',
      ['cc-1'],
    );
    // Read from the bundle's own Composition, so the timeline can sort and attribute honestly.
    expect(row.rows[0].hi_type).toBe('OPConsultation');
    expect(row.rows[0].source_hip_id).toBe(SOURCE_HIP);
    expect(row.rows[0].record_date).toBeTruthy();
  });

  test('a checksum mismatch is DISCARDED, not stored', async ({ skip }) => {
    if (!ready) return skip();
    const { transactionId } = await readyToReceive('hiux-bad-1');
    const before = await storedRecords();

    const result = await transfer.receivePushedRecords({
      transactionId,
      pageCount: 1,
      entries: [{ content: sealed(JSON.stringify(bundle())), checksum: 'not-the-right-checksum', careContextReference: 'cc-bad' }],
      keyMaterial: { dhPublicKey: { keyValue: 'HIP-PUBLIC' }, nonce: 'HIP-NONCE' },
    });

    // What we hold must be what was sent; rendering anything else to a clinician is worse than
    // rendering nothing.
    expect(result).toEqual({ stored: 0, failed: 1 });
    expect(await storedRecords()).toBe(before);
  });

  test('an unreadable entry does not lose the good ones beside it', async ({ skip }) => {
    if (!ready) return skip();
    const { transactionId } = await readyToReceive('hiux-mixed-1');
    const good = JSON.stringify(bundle());

    const result = await transfer.receivePushedRecords({
      transactionId,
      pageCount: 1,
      entries: [
        { content: sealed(good), checksum: contentChecksum(good), careContextReference: 'cc-good' },
        { content: 'not-even-base64-of-an-envelope', checksum: 'x', careContextReference: 'cc-broken' },
        { careContextReference: 'cc-link-only', link: 'https://elsewhere.example/report.pdf' },
      ],
      keyMaterial: { dhPublicKey: { keyValue: 'HIP-PUBLIC' }, nonce: 'HIP-NONCE' },
    });

    expect(result.stored).toBe(1);
    expect(result.failed).toBe(2);
    const status = await pool.query('SELECT status, reason FROM abdm_hiu_data_transfers WHERE transaction_id = $1', [
      transactionId,
    ]);
    // Reported honestly rather than as a clean success — the doctor must be able to tell.
    expect(status.rows[0].status).toBe('partial');
    expect(status.rows[0].reason).toMatch(/could not be read/);
  });

  test('records pushed for an unknown transaction are discarded', async ({ skip }) => {
    if (!ready) return skip();
    const before = await storedRecords();
    const result = await transfer.receivePushedRecords({
      transactionId: 'a-transaction-we-never-started',
      entries: [{ content: sealed('{}'), checksum: contentChecksum('{}') }],
    });
    expect(result).toEqual({ stored: 0, failed: 0 });
    expect(await storedRecords()).toBe(before);
  });

  test('records arriving after a revoke are dropped unread', async ({ skip }) => {
    if (!ready) return skip();
    const { transactionId } = await readyToReceive('hiux-revoked-1');
    const before = await storedRecords();

    // Revoked while the data was in flight — the permission that would justify storing them is gone.
    await hiu.handleConsentNotification({ consentId: 'hiux-revoked-1', status: 'REVOKED' });
    clearRecordedHipCalls();

    const plaintext = JSON.stringify(bundle());
    const result = await transfer.receivePushedRecords({
      transactionId,
      entries: [{ content: sealed(plaintext), checksum: contentChecksum(plaintext), careContextReference: 'cc-late' }],
      keyMaterial: { dhPublicKey: { keyValue: 'HIP-PUBLIC' }, nonce: 'HIP-NONCE' },
    });

    expect(result.stored).toBe(0);
    expect(await storedRecords()).toBe(before);
  });

  test('a completed transfer is notified to ABDM as the HIU', async ({ skip }) => {
    if (!ready) return skip();
    const { transactionId } = await readyToReceive('hiux-notify-1');
    clearRecordedHipCalls();
    const plaintext = JSON.stringify(bundle());

    await transfer.receivePushedRecords({
      transactionId,
      pageCount: 1,
      entries: [{ content: sealed(plaintext), checksum: contentChecksum(plaintext), careContextReference: 'cc-n' }],
      keyMaterial: { dhPublicKey: { keyValue: 'HIP-PUBLIC' }, nonce: 'HIP-NONCE' },
    });

    const notify = recordedHipCalls().find((c) => c.path.includes('health-information/notify'));
    const body = notify?.body as {
      notification: { notifier: { type: string }; statusNotification: { statusResponses: Array<{ hiStatus: string }> } };
    };
    // The one field that differs from M2's notify: here we are the HIU, not the HIP.
    expect(body.notification.notifier.type).toBe('HIU');
    expect(body.notification.statusNotification.statusResponses[0]!.hiStatus).toBe('DELIVERED');
  });

  test('a multi-page delivery only completes on the last page', async ({ skip }) => {
    if (!ready) return skip();
    const { transactionId } = await readyToReceive('hiux-paged-1');
    const plaintext = JSON.stringify(bundle());
    const page = (n: number) => ({
      transactionId,
      pageNumber: n,
      pageCount: 2,
      entries: [{ content: sealed(plaintext), checksum: contentChecksum(plaintext), careContextReference: `cc-p${n}` }],
      keyMaterial: { dhPublicKey: { keyValue: 'HIP-PUBLIC' }, nonce: 'HIP-NONCE' },
    });

    await transfer.receivePushedRecords(page(1));
    let status = await pool.query('SELECT status FROM abdm_hiu_data_transfers WHERE transaction_id = $1', [transactionId]);
    // Still receiving: telling ABDM it is done here would end a flow that has more to deliver.
    expect(status.rows[0].status).toBe('receiving');

    await transfer.receivePushedRecords(page(2));
    status = await pool.query(
      'SELECT status, entries_stored FROM abdm_hiu_data_transfers WHERE transaction_id = $1',
      [transactionId],
    );
    expect(status.rows[0].status).toBe('delivered');
    expect(status.rows[0].entries_stored).toBe(2);
  });
});

describe('purge reaches the pulled records', () => {
  test('revoking destroys the records AND the keys that could read them', async ({ skip }) => {
    if (!ready) return skip();
    const { transactionId } = await readyToReceive('hiux-purge-1');
    const plaintext = JSON.stringify(bundle());
    await transfer.receivePushedRecords({
      transactionId,
      pageCount: 1,
      entries: [{ content: sealed(plaintext), checksum: contentChecksum(plaintext), careContextReference: 'cc-purge' }],
      keyMaterial: { dhPublicKey: { keyValue: 'HIP-PUBLIC' }, nonce: 'HIP-NONCE' },
    });

    await hiu.handleConsentNotification({ consentId: 'hiux-purge-1', status: 'REVOKED' });

    const records = await pool.query('SELECT id FROM abdm_hiu_records WHERE care_context_reference = $1', ['cc-purge']);
    expect(records.rowCount).toBe(0);
    // The key cascades too, so nothing left behind could decrypt a later re-delivery.
    const keys = await pool.query('SELECT id FROM abdm_hiu_data_transfers WHERE transaction_id = $1', [transactionId]);
    expect(keys.rowCount).toBe(0);
  });
});
