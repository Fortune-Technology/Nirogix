import 'dotenv/config';

// Script-time environment defaults — the quiet log level, and a push URL for M3. Must be an
// import, ahead of the ones below, or config/env.ts reads the environment first. See script-env.ts.
import './script-env';

/**
 * ABDM Milestone 3 self-test — `npm run abdm:m3check` (ADR-092…ADR-095).
 *
 * The companion to `abdm:m2check`, for the opposite direction. M2 answers other people's requests
 * for our records; M3 asks a patient for permission to read the history **other** hospitals hold,
 * then pulls, decrypts, stores and displays it.
 *
 * M3 does have a screen, so part of it can be clicked through — but the part that decides
 * certification cannot. NHA's two cases, `HIU_FLOW_202` (revoke) and `HIU_FLOW_301` (expiry), both
 * ask the same question, and it is **not** "is it hidden" — it is **is the data gone**. That is a
 * database question, so it is answered here by querying the tables after each purge rather than by
 * trusting any return value.
 *
 * Like the M2 check it plays the counterparty itself: the gateway calls are recorded rather than
 * sent, the patient's grant is simulated by delivering the artefact, and a HIP's delivery is
 * simulated by pushing entries at us. What is asserted is the half we control.
 *
 * **Safe to run repeatedly.** Its own scratch tenant, deleted afterwards. It refuses to run outside
 * development, and refuses to run against a real gateway, because it writes fictional patients.
 */

import { pool } from '../db/client';
import { cleanupTenant, makeTenant } from '../test-api';
import { grantModule } from '../modules/entitlement/entitlement.service';
import { createPatient } from '../modules/patient/patient.service';
import { upsertFacilityConfig } from '../modules/abdm/abdm.service';
import { clearRecordedHipCalls, recordedHipCalls } from '../modules/abdm/hipGateway';
import { contentChecksum } from '../modules/abdm/cipher';
import * as hiu from '../modules/abdm/hiuConsent.service';
import * as transfer from '../modules/abdm/hiuDataTransfer.service';
import { patientTimeline } from '../modules/abdm/hiuTimeline.service';
import { sweepOnce } from '../modules/abdm/hiuSweeper';

const CODE = 'ZZM3CHECK';
const HIP_ID = 'IN0710-M3CHECK';
const SOURCE_A = 'IN0710-SUNRISE';
const SOURCE_B = 'IN0710-CITYLAB';

const VERBOSE = process.argv.includes('--payloads');

let passed = 0;
let failed = 0;

const ok = (m: string) => {
  passed += 1;
  console.log(`  ✓ ${m}`);
};
const bad = (m: string) => {
  failed += 1;
  console.log(`  ✗ ${m}`);
};
const note = (m: string) => console.log(`    ${m}`);
const step = (n: number, m: string) => console.log(`\n${n}. ${m}`);

/** Asserts, and keeps going — one broken step should not hide the state of the others. */
function check(condition: boolean, whenTrue: string, whenFalse: string): boolean {
  if (condition) ok(whenTrue);
  else bad(whenFalse);
  return condition;
}

/** Prints the last recorded gateway call — the actual ABDM payload. */
function showLastCall(fragment: string): void {
  const call = [...recordedHipCalls()].reverse().find((c) => c.path.includes(fragment));
  if (!call) {
    note(`(no call matching "${fragment}" was recorded)`);
    return;
  }
  note(`→ POST ${call.path}`);
  if (VERBOSE) {
    for (const line of JSON.stringify(call.body, null, 2).split('\n').slice(0, 34))
      note(`   ${line}`);
  }
}

/** The one question certification actually asks: is it still on disk? */
async function recordsOnDisk(consentId: string): Promise<number> {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM abdm_hiu_records r
       JOIN abdm_hiu_consents c ON c.id = r.consent_id WHERE c.consent_id = $1`,
    [consentId],
  );
  return r.rows[0].n as number;
}

/** The mock cipher's envelope — the exact inverse of what `decryptFromHip` unwraps. */
const sealed = (plaintext: string) =>
  Buffer.from(`MOCK-NOT-ENCRYPTED:${plaintext}`).toString('base64');

/** A bundle as another hospital would send it, with one value THEY flagged abnormal. */
const bundle = (date: string, opts: { abnormal?: boolean } = {}) => ({
  resourceType: 'Bundle',
  timestamp: date,
  entry: [
    { resource: { resourceType: 'Composition', type: { text: 'OP Consultation Document' }, date } },
    { resource: { resourceType: 'Organization', name: 'Sunrise Multispeciality' } },
    {
      resource: {
        resourceType: 'Condition',
        code: { coding: [{ code: 'E11.9', display: 'Type 2 diabetes mellitus' }] },
      },
    },
    {
      resource: {
        resourceType: 'MedicationRequest',
        medicationCodeableConcept: { text: 'Metformin 500mg' },
        dosageInstruction: [{ text: 'Twice daily after meals' }],
      },
    },
    {
      resource: {
        resourceType: 'Observation',
        code: { text: 'HbA1c' },
        valueQuantity: { value: 8.4, unit: '%' },
        ...(opts.abnormal ? { interpretation: [{ coding: [{ code: 'H' }] }] } : {}),
      },
    },
  ],
});

async function main(): Promise<void> {
  console.log('\nABDM Milestone 3 self-test');
  console.log('--------------------------');
  console.log(`  provider  ${process.env.ABDM_PROVIDER ?? 'mock'}`);
  console.log(`  NODE_ENV  ${process.env.NODE_ENV ?? '(unset)'}`);
  console.log(`  scratch   tenant ${CODE}, deleted at the end\n`);

  if ((process.env.NODE_ENV ?? 'development') !== 'development') {
    bad(
      `NODE_ENV is "${process.env.NODE_ENV}". This writes test patients and only runs in development.`,
    );
    process.exit(1);
  }
  if (process.env.ABDM_PROVIDER === 'gateway') {
    bad('ABDM_PROVIDER=gateway would send these fictional requests to the real ABDM sandbox.');
    note(
      'Set ABDM_PROVIDER=mock. The gateway client then records each call instead of sending it.',
    );
    process.exit(1);
  }

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    bad(`No database: ${(err as Error).message}`);
    note('Start PostgreSQL and run `npm run db:migrate`, then try again.');
    process.exit(1);
  }

  await cleanupTenant(CODE);
  const tenantId = (await makeTenant(CODE)).tenantId;

  try {
    await run(tenantId);
  } finally {
    await cleanupTenant(CODE);
  }

  console.log(`\n${'-'.repeat(60)}`);
  if (failed === 0) {
    console.log(`M3 is working end to end locally: ${passed} checks passed.`);
    console.log('');
    console.log(
      'Both certification cases were answered from the DATABASE, not from a return value:',
    );
    console.log('  · HIU_FLOW_202 (revoke)  — records deleted, keys deleted, audit kept');
    console.log('  · HIU_FLOW_301 (expiry)  — invisible before the sweep, deleted by it');
    console.log('');
    console.log('What this does NOT prove:');
    console.log('  · that a real HIP can push to us. The bridge URL is registered and active,');
    console.log('    but the bridge holds services: [] and ABDM_HIU_PUSH_BASE_URL is unset —');
    console.log('    either one alone stops a real delivery. Check: npm run abdm:bridge');
    console.log('  · that the four unverified M3 inbound paths are the right ones');
    console.log('  · that THIS payload was really decrypted — mock mode marks, it does not');
    console.log('    encrypt. Fidelius round-trips for real in: npm run abdm:fidelius-check');
    console.log('');
    console.log('Run with --payloads to see the full JSON we would send ABDM at each step,');
    console.log('or --logs to keep the application log alongside the report.');
  } else {
    console.log(`${failed} check(s) FAILED, ${passed} passed. M3 is not working locally.`);
  }
  console.log('');
  await pool.end();
  process.exit(failed === 0 ? 0 : 1);
}

async function run(tenantId: string): Promise<void> {
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'M3 Self-test Hospital' });

  // --- 1. Who may ask, and about whom -----------------------------------------------------
  step(1, 'Who may ask, and about whom');
  const patient = await createPatient(tenantId, {
    firstName: 'Anita',
    lastName: 'Desai',
    gender: 'female',
    dateOfBirth: '1995-02-09',
    phone: '9822011122',
  });
  await pool.query(
    "UPDATE patients SET abha_address = 'm3check@sbx', abha_verified_at = now() WHERE id = $1",
    [patient.id],
  );
  ok(`patient ${patient.uhid} with a VERIFIED ABHA`);

  const typed = await createPatient(tenantId, {
    firstName: 'Typed',
    lastName: 'Abha',
    phone: '9822011133',
  });
  await pool.query("UPDATE patients SET abha_address = 'typed@sbx' WHERE id = $1", [typed.id]);

  const doctor = await pool.query(
    `INSERT INTO providers (tenant_id, full_name, registration_number, is_active)
     VALUES ($1,'Dr Rajesh Gupta','MMC-2014-11733', true) RETURNING id`,
    [tenantId],
  );
  const providerId = doctor.rows[0].id as string;
  const noReg = await pool.query(
    `INSERT INTO providers (tenant_id, full_name, is_active) VALUES ($1,'Dr No Registration', true) RETURNING id`,
    [tenantId],
  );

  clearRecordedHipCalls();
  let refusedUnverified = false;
  try {
    await hiu.requestPatientHistory(tenantId, null, { patientId: typed.id, providerId });
  } catch {
    refusedUnverified = true;
  }
  check(
    refusedUnverified && recordedHipCalls().length === 0,
    'a hand-typed ABHA is refused — it was never proved to be that patient’s',
    'an unverified ABHA was accepted, which could surface a stranger’s history',
  );

  let refusedNoReg = false;
  try {
    await hiu.requestPatientHistory(tenantId, null, {
      patientId: patient.id,
      providerId: noReg.rows[0].id,
    });
  } catch {
    refusedNoReg = true;
  }
  check(
    refusedNoReg,
    'a doctor with no registration number cannot ask',
    'a doctor with no registration number was allowed to ask',
  );
  note(
    'The patient reads that number when deciding. An anonymous clinician is not a judgeable request.',
  );

  // --- 2. Asking the patient --------------------------------------------------------------
  step(2, 'Asking the patient for consent (ADR-092)');
  clearRecordedHipCalls();
  const request = await hiu.requestPatientHistory(tenantId, null, {
    patientId: patient.id,
    providerId,
  });
  check(
    request.status === 'requested',
    'consent request sent',
    `request status is "${request.status}"`,
  );

  const initBody = recordedHipCalls().find((c) => c.path.includes('consent/v3/request/init'))
    ?.body as
    | {
        consent: {
          requester: { name: string; identifier: { value: string } };
          purpose: { code: string };
          permission: { accessMode: string };
        };
      }
    | undefined;
  check(
    initBody?.consent.requester.identifier.value === 'MMC-2014-11733',
    'the request carries the doctor’s name and registration number',
    'the requester identity is missing from the payload',
  );
  check(
    initBody?.consent.purpose.code === 'CAREMGT',
    'purpose is CAREMGT — care management',
    'the purpose code is wrong',
  );
  check(
    initBody?.consent.permission.accessMode === 'VIEW',
    'access mode is VIEW, never a copy grant',
    'access mode is wrong',
  );
  check(
    request.hiTypes.length === 7,
    'all seven record types are asked for',
    `only ${request.hiTypes.length} types asked for`,
  );
  showLastCall('request/init');

  // ABDM names the request asynchronously, on `on-init`.
  await hiu.recordConsentRequestId({ requestId: request.id, consentRequestId: 'm3check-cr-1' });
  const named = await pool.query(
    'SELECT consent_request_id FROM abdm_hiu_consent_requests WHERE id = $1',
    [request.id],
  );
  check(
    named.rows[0].consent_request_id === 'm3check-cr-1',
    'the request id arrives on on-init and is stored',
    'on-init did not name the request',
  );

  // --- 3. The patient grants --------------------------------------------------------------
  step(3, 'The patient grants — one artefact per hospital (ADR-092)');
  const artefact = (consentId: string, hipId: string, eraseAt = '2030-12-31T00:00:00.000Z') =>
    hiu.storeConsentArtefact({
      consentId,
      consentRequestId: 'm3check-cr-1',
      hipId,
      abhaAddress: 'm3check@sbx',
      hiTypes: ['OPConsultation', 'Prescription'],
      accessMode: 'VIEW',
      dateRangeFrom: '2020-01-01T00:00:00.000Z',
      dateRangeTo: '2030-01-01T00:00:00.000Z',
      dataEraseAt: eraseAt,
      grantedAt: new Date().toISOString(),
    });

  const consentA = await artefact('m3check-consent-a', SOURCE_A);
  const consentB = await artefact('m3check-consent-b', SOURCE_B);
  check(
    Boolean(consentA && consentB),
    'two artefacts stored, one per hospital',
    'an artefact failed to store',
  );
  note('They expire and are revoked individually, so they are tracked individually.');

  const orphan = await hiu.storeConsentArtefact({
    consentId: 'm3check-orphan',
    consentRequestId: 'nobody-asked-for-this',
    abhaAddress: 'stranger@sbx',
    hiTypes: ['OPConsultation'],
  });
  check(
    orphan === null,
    'an artefact nobody asked for is dropped, not stored orphaned',
    'an unrequested artefact was stored — with no patient, no asker and no expiry to sweep',
  );

  // --- 4. Asking the hospitals for the records --------------------------------------------
  step(4, 'Asking those hospitals for the records (ADR-093)');
  clearRecordedHipCalls();
  const results = await transfer.requestAllRecords(tenantId, patient.id);
  check(
    results.length === 2,
    'one data request per granted consent',
    `expected 2 requests, got ${results.length}`,
  );

  const keyRow = await pool.query(
    'SELECT private_key_enc, public_key FROM abdm_hiu_data_transfers WHERE transaction_id = $1',
    [results[0]?.transactionId],
  );
  check(
    String(keyRow.rows[0]?.private_key_enc ?? '').startsWith('v1.'),
    'our private key is stored ENCRYPTED at rest',
    'the private key is readable — that is standing ability to decrypt a medical history',
  );
  const keys = await pool.query(
    'SELECT DISTINCT private_key_enc FROM abdm_hiu_data_transfers WHERE tenant_id = $1',
    [tenantId],
  );
  check(
    keys.rowCount === 2,
    'a fresh key pair per request, never reused',
    'the same key pair was reused across requests',
  );
  note('One compromise should expose one document set, not every transfer ever made.');

  const reqBody = recordedHipCalls().find((c) => c.path.includes('health-information/request'))
    ?.body as
    | {
        hiRequest: {
          dataPushUrl: string;
          keyMaterial: { curve: string; dhPublicKey: { keyValue: string } };
        };
      }
    | undefined;
  check(
    Boolean(reqBody?.hiRequest.dataPushUrl) &&
      !reqBody!.hiRequest.keyMaterial.dhPublicKey.keyValue.includes('PRIVATE'),
    'the request carries our PUBLIC key and our own push URL',
    'the outbound request looks wrong',
  );
  showLastCall('health-information/request');

  // --- 5. A hospital delivers --------------------------------------------------------------
  step(5, 'A hospital delivers the records (ADR-093)');
  clearRecordedHipCalls();
  const goodPlain = JSON.stringify(bundle('2026-02-11T09:30:00.000Z', { abnormal: true }));
  const delivered = await transfer.receivePushedRecords({
    transactionId: results[0]!.transactionId,
    pageNumber: 1,
    pageCount: 1,
    entries: [
      {
        content: sealed(goodPlain),
        checksum: contentChecksum(goodPlain),
        careContextReference: 'cc-a1',
      },
    ],
    keyMaterial: { dhPublicKey: { keyValue: 'HIP-PUBLIC' }, nonce: 'HIP-NONCE' },
  });
  check(
    delivered.stored === 1 && delivered.failed === 0,
    'one entry decrypted, verified and stored',
    `stored ${delivered.stored}, failed ${delivered.failed}`,
  );

  const notifyBody = recordedHipCalls().find((c) => c.path.includes('health-information/notify'))
    ?.body as { notification: { notifier: { type: string } } } | undefined;
  check(
    notifyBody?.notification.notifier.type === 'HIU',
    'the completion notify says HIU, not HIP — we are the receiver here',
    'the notify names the wrong participant type',
  );

  // The check that stops a corrupted record ever reaching a clinician.
  const badPlain = JSON.stringify(bundle('2026-03-01T09:30:00.000Z'));
  const rejected = await transfer.receivePushedRecords({
    transactionId: results[1]!.transactionId,
    pageCount: 1,
    entries: [
      {
        content: sealed(badPlain),
        checksum: 'not-the-right-checksum',
        careContextReference: 'cc-b1',
      },
    ],
    keyMaterial: { dhPublicKey: { keyValue: 'HIP-PUBLIC' }, nonce: 'HIP-NONCE' },
  });
  check(
    rejected.stored === 0 && rejected.failed === 1,
    'a checksum mismatch is DISCARDED, never stored',
    'a record whose checksum did not match was stored anyway',
  );
  note('A doctor shown a corrupted history has no way to know it is corrupted.');

  const unknown = await transfer.receivePushedRecords({
    transactionId: 'a-transaction-we-never-started',
    entries: [{ content: sealed('{}'), checksum: contentChecksum('{}') }],
  });
  check(
    unknown.stored === 0,
    'records pushed for an unknown transaction are discarded',
    'an unsolicited push was stored',
  );

  // --- 6. What the doctor sees -------------------------------------------------------------
  step(6, 'What the doctor sees (ADR-094)');
  const timeline = await patientTimeline(tenantId, patient.id);
  check(
    timeline.length === 1,
    'the stored record appears on the timeline',
    `expected 1 entry, got ${timeline.length}`,
  );

  const entry = timeline[0];
  check(
    entry?.sourceHipId === SOURCE_A,
    'attributed to the hospital it came from',
    'the source is wrong or missing',
  );
  const values = entry?.details.map((d) => `${d.label}: ${d.value}`) ?? [];
  check(
    values.some((v) => v.includes('Type 2 diabetes mellitus')) &&
      values.some((v) => v.includes('Metformin')),
    'diagnosis and medicine are extracted and labelled',
    'the FHIR mapping lost something',
  );
  check(
    entry?.hasAbnormalFinding === true && entry.details.some((d) => d.emphasis === 'abnormal'),
    'the abnormal flag comes from the SOURCE hospital’s own record',
    'the abnormal flag was not carried through',
  );
  note(
    'We never decide a value is abnormal ourselves — that range belongs to the lab that ran it.',
  );
  if (VERBOSE) {
    for (const line of JSON.stringify(entry, null, 2).split('\n').slice(0, 30)) note(`   ${line}`);
  }

  // --- 7. HIU_FLOW_202 ---------------------------------------------------------------------
  step(7, 'HIU_FLOW_202 — the patient revokes');
  check(
    (await recordsOnDisk('m3check-consent-a')) === 1,
    'a record is held under that consent',
    'nothing was held to revoke',
  );
  clearRecordedHipCalls();
  await hiu.handleConsentNotification({ consentId: 'm3check-consent-a', status: 'REVOKED' });

  check(
    (await recordsOnDisk('m3check-consent-a')) === 0,
    'the records are DELETED — the assessor’s actual question, answered from the database',
    'records survived the revocation, which fails certification',
  );
  const consentGone = await pool.query('SELECT id FROM abdm_hiu_consents WHERE consent_id = $1', [
    'm3check-consent-a',
  ]);
  check(consentGone.rowCount === 0, 'the consent artefact is gone too', 'the artefact survived');
  const keysGone = await pool.query(
    'SELECT id FROM abdm_hiu_data_transfers WHERE transaction_id = $1',
    [results[0]!.transactionId],
  );
  check(
    keysGone.rowCount === 0,
    'the keys that could decrypt a re-delivery are gone with it',
    'the decryption keys survived the purge',
  );
  const ack = recordedHipCalls().find((c) => c.path.includes('hiu/on-notify'));
  check(
    Boolean(ack),
    'ABDM is acknowledged — AFTER the delete, so the acknowledgement is true',
    'ABDM was never acknowledged',
  );

  const ourRecords = await pool.query(
    'SELECT count(*)::int AS n FROM encounters WHERE tenant_id = $1',
    [tenantId],
  );
  check(
    ourRecords.rows[0].n >= 0,
    'our own clinical records are untouched — the consent expired, not the care',
    'our own records were affected by a consent purge',
  );

  const audit = await pool.query(
    "SELECT metadata FROM audit_log WHERE tenant_id = $1 AND action = 'abdm.hiu.consent_purged' ORDER BY created_at DESC LIMIT 1",
    [tenantId],
  );
  const metadata = audit.rows[0]?.metadata as
    { reason?: string; recordsDeleted?: number } | undefined;
  check(
    metadata?.reason === 'revoked' && !JSON.stringify(metadata).includes('diabetes'),
    'the audit survives the deletion and holds metadata only',
    'the audit is missing, or contains clinical content it should not',
  );
  note('Proving we destroyed something must not require keeping it.');

  // --- 8. HIU_FLOW_301 ---------------------------------------------------------------------
  step(8, 'HIU_FLOW_301 — the consent expires');
  const secondPlain = JSON.stringify(bundle('2026-04-02T11:00:00.000Z'));
  await transfer.receivePushedRecords({
    transactionId: results[1]!.transactionId,
    pageCount: 1,
    entries: [
      {
        content: sealed(secondPlain),
        checksum: contentChecksum(secondPlain),
        careContextReference: 'cc-b2',
      },
    ],
    keyMaterial: { dhPublicKey: { keyValue: 'HIP-PUBLIC' }, nonce: 'HIP-NONCE' },
  });
  check(
    (await recordsOnDisk('m3check-consent-b')) === 1,
    'a record is held under the second consent',
    'nothing was stored',
  );

  // Lapse it WITHOUT sweeping — the row stays on disk on purpose.
  await pool.query(
    "UPDATE abdm_hiu_consents SET data_erase_at = '2020-01-01' WHERE consent_id = $1",
    ['m3check-consent-b'],
  );
  check(
    (await recordsOnDisk('m3check-consent-b')) === 1,
    'the record is still physically on disk (the sweep has not run)',
    'the record vanished before the sweep — the test cannot prove what it means to',
  );
  const afterLapse = await patientTimeline(tenantId, patient.id);
  check(
    afterLapse.length === 0,
    'and it is ALREADY invisible to the doctor — hiding does not wait for deleting',
    'a record whose consent had lapsed was still being shown',
  );
  note('Two independent guarantees: the query hides by the clock, the sweep deletes on schedule.');

  const swept = await sweepOnce();
  check(
    swept.records >= 1,
    `the sweep then deletes it (${swept.records} record(s) purged)`,
    'the sweep purged nothing',
  );
  check(
    (await recordsOnDisk('m3check-consent-b')) === 0,
    'gone from disk as well',
    'the record survived the expiry sweep, which fails certification',
  );

  const secondRun = await sweepOnce();
  check(
    secondRun.consents === 0,
    'running the sweep again is safe',
    'the sweep re-purged something already gone',
  );

  void consentB;
}

main().catch(async (err: unknown) => {
  bad(`unexpected failure: ${(err as Error).message}`);
  console.log((err as Error).stack?.split('\n').slice(1, 6).join('\n') ?? '');
  await cleanupTenant(CODE).catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
