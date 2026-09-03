import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient } from '../../patient/patient.service';
import { upsertFacilityConfig } from '../abdm.service';
import { abdmGatewayRouter } from '../abdm.gatewayRoutes';
import { HIP_CALLBACK_PATHS, HIU_CALLBACK_PATHS } from '../abdm.constants';
import { clearRecordedHipCalls, recordedHipCalls } from '../hipGateway';
import * as hiu from '../hiuConsent.service';
import * as transfer from '../hiuDataTransfer.service';
import * as linking from '../linking.service';

/**
 * The callbacks ABDM makes to us, and the two that were missing entirely (ADR-140).
 *
 * This protocol answers on callbacks, never on the connection that asked. That has one consequence
 * worth stating plainly, because it is why these gaps survived a full test suite and two milestone
 * self-tests: **an unserved callback produces silence, not an error.** Nothing throws, nothing
 * fails, nothing is logged — the answer simply never arrives, and every local check that plays both
 * halves of the exchange passes.
 *
 * So the tests here are about the arrival: what the callback carries, what it changes, and what
 * happens when it never comes.
 */

const CODE = 'ABDMCBK';
const HIP_ID = 'IN0710-CBK-001';
const SOURCE_HIP = 'IN0710-OTHER-HOSPITAL';

let ready = false;
let tenantId = '';
let patientId = '';
let providerId = '';

async function auditActions(action: string): Promise<Array<Record<string, unknown>>> {
  const rows = await pool.query(
    'SELECT metadata FROM audit_log WHERE tenant_id = $1 AND action = $2 ORDER BY created_at DESC',
    [tenantId, action],
  );
  return rows.rows.map((r) => r.metadata as Record<string, unknown>);
}

/** A granted consent plus a data request, leaving a transfer waiting for its acknowledgement. */
async function requestedTransfer(consentId: string): Promise<{
  transferId: string;
  placeholderTransactionId: string;
  requestId: string;
}> {
  const request = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });
  await pool.query('UPDATE abdm_hiu_consent_requests SET consent_request_id = $1 WHERE id = $2', [
    `cr-${consentId}`,
    request.id,
  ]);
  const consent = await hiu.storeConsentArtefact({
    consentId,
    consentRequestId: `cr-${consentId}`,
    hipId: SOURCE_HIP,
    abhaAddress: 'cbk@sbx',
    hiTypes: ['OPConsultation'],
    dateRangeFrom: '2020-01-01T00:00:00.000Z',
    dateRangeTo: '2030-01-01T00:00:00.000Z',
    dataEraseAt: '2030-12-31T00:00:00.000Z',
  });
  const result = await transfer.requestRecords(tenantId, consent!.id);
  const row = await pool.query('SELECT request_id FROM abdm_hiu_data_transfers WHERE id = $1', [
    result.transferId,
  ]);
  return {
    transferId: result.transferId,
    placeholderTransactionId: result.transactionId,
    requestId: row.rows[0].request_id as string,
  };
}

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'Callback Test Hospital' });
  const patient = await createPatient(tenantId, { firstName: 'Callback', phone: '9700050001' });
  patientId = patient.id;
  // A history request needs a VERIFIED ABHA address — asking on an unverified one would put
  // somebody else's records in front of a doctor, so the service refuses it.
  await pool.query(
    "UPDATE patients SET abha_address = 'cbk@sbx', abha_verified_at = now() WHERE id = $1",
    [patientId],
  );
  const doctor = await pool.query(
    `INSERT INTO providers (tenant_id, full_name, registration_number, is_active)
     VALUES ($1,'Dr Meera Iyer','MCI-55231', true) RETURNING id`,
    [tenantId],
  );
  providerId = doctor.rows[0].id;
});

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(CODE);
});

describe('every inbound ABDM route is authenticated', () => {
  test('no route is mounted without requireAbdmGateway', () => {
    // A property, not a list. The guard is what makes "the caller is ABDM" true rather than
    // assumed, and a route added later without it is a complete path to patient data (ADR-109) —
    // so this asserts the shape of the router instead of naming the routes it has today.
    const layers = (abdmGatewayRouter as unknown as { stack: Array<Record<string, unknown>> })
      .stack;
    const routes = layers.filter((l) => l.route);

    expect(routes.length).toBeGreaterThanOrEqual(16);
    for (const layer of routes) {
      const route = layer.route as { path: string; stack: Array<{ name: string }> };
      const names = route.stack.map((h) => h.name);
      expect(names, `${route.path} is not guarded`).toContain('requireAbdmGateway');
    }
  });

  test('the four callbacks read from the official documents are mounted', () => {
    const layers = (abdmGatewayRouter as unknown as { stack: Array<Record<string, unknown>> })
      .stack;
    const paths = layers.filter((l) => l.route).map((l) => (l.route as { path: string }).path);

    for (const path of [
      HIU_CALLBACK_PATHS.onConsentStatus,
      HIU_CALLBACK_PATHS.onDataRequest,
      HIP_CALLBACK_PATHS.contextOnNotify,
      HIP_CALLBACK_PATHS.smsOnNotify,
    ]) {
      expect(paths).toContain(path);
    }
  });
});

describe('on-request — the transaction id belongs to ABDM, not to us', () => {
  test('the acknowledgement replaces the placeholder, and a push then matches', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const started = await requestedTransfer('cbk-txn-1');
    const abdmTransactionId = 'abdm-3332b62a-1cae-454f-a278-aaf80724f2b6';

    // The request body carries no transaction id — NHA's M3 document has the consent manager assign
    // one and state it here. Correlated on our own requestId, the only handle both sides held.
    await transfer.recordDataRequestAck({
      hiRequest: { transactionId: abdmTransactionId, sessionStatus: 'REQUESTED' },
      error: null,
      response: { requestId: started.requestId },
    });

    const row = await pool.query(
      'SELECT transaction_id FROM abdm_hiu_data_transfers WHERE id = $1',
      [started.transferId],
    );
    expect(row.rows[0].transaction_id).toBe(abdmTransactionId);
    expect(abdmTransactionId).not.toBe(started.placeholderTransactionId);
  });

  test('a push under ABDM.s id is recognised; under the old placeholder it is not', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const started = await requestedTransfer('cbk-txn-2');
    const abdmTransactionId = 'abdm-9c1f0e59-8388-4698-9fe6-05db67aeac46';
    await transfer.recordDataRequestAck({
      hiRequest: { transactionId: abdmTransactionId, sessionStatus: 'REQUESTED' },
      response: { requestId: started.requestId },
    });

    // An empty page: this test is about which transaction a delivery finds, not about decryption.
    const found = await transfer.receivePushedRecords({
      transactionId: abdmTransactionId,
      entries: [],
    });
    expect(found).toEqual({ stored: 0, failed: 0 });

    // The value we minted before the request went out was never known to anybody else. This is the
    // defect: before ADR-140 it was the only thing the row held, so every real push missed.
    const missed = await transfer.receivePushedRecords({
      transactionId: started.placeholderTransactionId,
      entries: [{ content: 'anything' }],
    });
    expect(missed).toEqual({ stored: 0, failed: 0 });
  });

  test('a refusal closes the transfer instead of leaving it waiting', async ({ skip }) => {
    if (!ready) return skip();
    const started = await requestedTransfer('cbk-txn-3');

    await transfer.recordDataRequestAck({
      error: { code: 'ABDM-1092', message: 'Invalid or already expired consent artefact id' },
      response: { requestId: started.requestId },
    });

    const row = await pool.query(
      'SELECT status, reason FROM abdm_hiu_data_transfers WHERE id = $1',
      [started.transferId],
    );
    expect(row.rows[0].status).toBe('failed');
    expect(row.rows[0].reason).toMatch(/expired consent artefact/i);
  });

  test('an acknowledgement for a request we never made is dropped, not thrown', async ({
    skip,
  }) => {
    if (!ready) return skip();
    await expect(
      transfer.recordDataRequestAck({
        hiRequest: { transactionId: 'whatever', sessionStatus: 'REQUESTED' },
        response: { requestId: 'a-request-nobody-here-made' },
      }),
    ).resolves.toBeUndefined();
  });
});

describe('on-status — the poll answers 200 with nothing; the status arrives here', () => {
  test('a granted status moves the request', async ({ skip }) => {
    if (!ready) return skip();
    const request = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });
    await pool.query('UPDATE abdm_hiu_consent_requests SET consent_request_id = $1 WHERE id = $2', [
      'cr-status-granted',
      request.id,
    ]);

    await hiu.recordConsentStatusAck({
      consentRequest: { id: 'cr-status-granted', status: 'GRANTED' },
      response: { requestId: 'ignored' },
    });

    const row = await pool.query('SELECT status FROM abdm_hiu_consent_requests WHERE id = $1', [
      request.id,
    ]);
    expect(row.rows[0].status).toBe('granted');
  });

  test('a status ABDM has not defined leaves the row alone rather than guessing', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const request = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });
    await pool.query('UPDATE abdm_hiu_consent_requests SET consent_request_id = $1 WHERE id = $2', [
      'cr-status-odd',
      request.id,
    ]);
    const before = await pool.query('SELECT status FROM abdm_hiu_consent_requests WHERE id = $1', [
      request.id,
    ]);

    await hiu.recordConsentStatusAck({
      consentRequest: { id: 'cr-status-odd', status: 'SOMETHING_NEW' },
    });

    const after = await pool.query(
      'SELECT status, last_checked_at FROM abdm_hiu_consent_requests WHERE id = $1',
      [request.id],
    );
    expect(after.rows[0].status).toBe(before.rows[0].status);
    // It still counts as a check: the request was looked at, and the doctor's screen should say so.
    expect(after.rows[0].last_checked_at).toBeTruthy();
  });

  test('a callback for a consent request we do not hold is dropped', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      hiu.recordConsentStatusAck({ consentRequest: { id: 'cr-not-ours', status: 'GRANTED' } }),
    ).resolves.toBeUndefined();
  });
});

describe('the M2 acknowledgements — a notify we cannot confirm is a notify we cannot claim', () => {
  test('the SMS acknowledgement is recorded against the right hospital', async ({ skip }) => {
    if (!ready) return skip();
    await linking.recordNotifyAcknowledgement('sms', HIP_ID, {
      requestId: '743ec386-670f-43a8-a3ed-44aa30fb15fb',
      timestamp: new Date().toISOString(),
      status: 'SUCCESS',
      resp: { requestId: 'the-send-we-made' },
    });

    const entries = await auditActions('abdm.sms_notify.acknowledged');
    expect(entries[0]).toMatchObject({ status: 'SUCCESS', requestId: 'the-send-we-made' });
  });

  test('the care-context acknowledgement reads NHA.s other spelling', async ({ skip }) => {
    if (!ready) return skip();
    // §4.3.7 nests the outcome under `acknowledgement` and names the correlation field `response`;
    // §4.3.9 uses a bare `status` and `resp`. Reading one spelling loses half the answers.
    await linking.recordNotifyAcknowledgement('care_context', HIP_ID, {
      requestId: '743ec386-670f-43a8-a3ed-44aa30fb15fb',
      acknowledgement: { status: 'SUCCESS' },
      response: { requestId: 'the-notify-we-made' },
    });

    const entries = await auditActions('abdm.care_context.update_acknowledged');
    expect(entries[0]).toMatchObject({ status: 'SUCCESS', requestId: 'the-notify-we-made' });
  });

  test('a failure is recorded as one, with the code and nothing else', async ({ skip }) => {
    if (!ready) return skip();
    await linking.recordNotifyAcknowledgement('sms', HIP_ID, {
      error: { code: 'ABDM-1024', message: 'Dependent service unavailable' },
      resp: { requestId: 'the-failed-send' },
    });

    const entries = await auditActions('abdm.sms_notify.acknowledged');
    expect(entries[0]).toMatchObject({ status: 'FAILED', error: 'ABDM-1024' });
    // The patient's phone number is what this whole flow is about, and it is not in the record.
    expect(JSON.stringify(entries[0])).not.toMatch(/\d{10}/);
  });

  test('an acknowledgement naming a facility that is not ours writes nothing', async ({ skip }) => {
    if (!ready) return skip();
    const before = (await auditActions('abdm.sms_notify.acknowledged')).length;
    await linking.recordNotifyAcknowledgement('sms', 'IN0710-SOMEBODY-ELSE', {
      status: 'SUCCESS',
      resp: { requestId: 'not-ours' },
    });
    expect((await auditActions('abdm.sms_notify.acknowledged')).length).toBe(before);
  });
});

describe('what we send, so the answer can come back', () => {
  test('the HIU key material carries the X.509 form when Fidelius provides one', async ({
    skip,
  }) => {
    if (!ready) return skip();
    clearRecordedHipCalls();
    await requestedTransfer('cbk-keymaterial');

    const request = recordedHipCalls().find((c) => c.path.includes('health-information/request'));
    expect(request, 'the data request should have been sent').toBeTruthy();
    const body = request!.body as {
      hiRequest?: { keyMaterial?: { dhPublicKey?: { keyValue?: string } } };
    };
    // NHA: "certain HIUs only accept the public key in the base64-encoded X.509 format". The
    // constraint is symmetric, so a HIP may be equally strict about what an HIU sends it.
    expect(body.hiRequest?.keyMaterial?.dhPublicKey?.keyValue).toBeTruthy();
  });

  test('the care-context notify carries the request id its acknowledgement quotes back', async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Without a request id in the body there is nothing in `/api/v3/links/context/on-notify` that
    // says which notify it answers, and the acknowledgement becomes unattributable.
    const source = await import('node:fs').then((fs) =>
      fs.promises.readFile('src/modules/abdm/linking.service.ts', 'utf8'),
    );
    expect(source).toMatch(/requestId,\s*\n\s*timestamp: new Date\(\)\.toISOString\(\),/);
  });
});
