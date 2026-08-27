import 'dotenv/config';

// Script-time environment defaults — the quiet log level, and a push URL for M3. Must be an
// import, ahead of the ones below, or config/env.ts reads the environment first. See script-env.ts.
import './script-env';

/**
 * ABDM Milestone 2 self-test — `npm run abdm:m2check` (ADR-087…ADR-091).
 *
 * The M2 counterpart to `abdm:check`, and it has to work differently, because M1 and M2 are shaped
 * differently. **M1 is outbound**: we call NHA, so a connectivity check proves it. **M2 is inbound**:
 * NHA calls *us*, so there is nothing to "connect to" and nothing to click through in the Portal —
 * M2 has no screens by design. Until the bridge URL is registered, the only honest way to see M2
 * work is to **play the gateway ourselves** and watch what the code does.
 *
 * That is what this does. It drives the real services — not mocks of them — through the whole
 * chain, in order, against your local database:
 *
 *   patient → visit → care context → FHIR bundle → link → discovery → consent → transfer → revoke
 *
 * and prints, at every step, what we decided and **the exact payload we would have put on the wire
 * to ABDM**. The gateway client records instead of sending in mock mode, so those payloads are the
 * real ones, byte for byte.
 *
 * It ends by proving the refusals, which matter more than the happy path: a revoked consent must
 * send nothing. A run that reports records sent after a revoke is a failed run, not a passed one.
 *
 * **Safe to run repeatedly.** It creates its own scratch tenant, prefixed `ZZM2`, and deletes it
 * afterwards — your seeded data is untouched. It refuses to run outside development, and it refuses
 * to run against a real gateway, because it writes fictional patients.
 */

import { pool } from '../db/client';
import { cleanupTenant, makeTenant } from '../test-api';
import { grantModule } from '../modules/entitlement/entitlement.service';
import { createPatient } from '../modules/patient/patient.service';
import { upsertFacilityConfig } from '../modules/abdm/abdm.service';
import * as cc from '../modules/abdm/careContext.service';
import * as consent from '../modules/abdm/consent.service';
import * as linking from '../modules/abdm/linking.service';
import { discoverPatient } from '../modules/abdm/discovery.service';
import { buildDocumentBundle } from '../modules/abdm/fhir/fhirBuilder';
import { clearRecordedHipCalls, recordedHipCalls } from '../modules/abdm/hipGateway';
import { storeLinkToken } from '../modules/abdm/linkToken.service';
import { performTransfer, receiveHealthInformationRequest } from '../modules/abdm/dataTransfer.service';

const CODE = 'ZZM2CHECK';
const HIP_ID = 'IN0710-M2CHECK';
const PUSH_URL = 'https://hiu.example.org/data/push';
const CONSENT_ID = 'm2check-consent-1';

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

/**
 * A JWT-shaped link token whose `exp` is a chosen number of days away.
 *
 * Only the payload matters: the signature is never verified, because the claim is used solely
 * to decide when to RENEW the token, never to authorise anything.
 */
function jwtExpiringInDays(days: number): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'm2check', exp: Math.floor(Date.now() / 1000) + days * 86400 }),
  ).toString('base64url');
  return `eyJhbGciOiJSUzUxMiJ9.${payload}.signature-not-checked`;
}

/** Asserts, and keeps going — one broken step should not hide the state of the other eight. */
function check(condition: boolean, whenTrue: string, whenFalse: string): boolean {
  if (condition) ok(whenTrue);
  else bad(whenFalse);
  return condition;
}

/** Prints the last recorded gateway call, which is the actual ABDM payload. */
function showLastCall(fragment: string): void {
  const call = [...recordedHipCalls()].reverse().find((c) => c.path.includes(fragment));
  if (!call) {
    note(`(no call matching "${fragment}" was recorded)`);
    return;
  }
  note(`→ POST ${call.path}`);
  if (VERBOSE) {
    for (const line of JSON.stringify(call.body, null, 2).split('\n').slice(0, 30)) note(`   ${line}`);
  }
}

async function main(): Promise<void> {
  console.log('\nABDM Milestone 2 self-test');
  console.log('--------------------------');
  console.log(`  provider  ${process.env.ABDM_PROVIDER ?? 'mock'}`);
  console.log(`  NODE_ENV  ${process.env.NODE_ENV ?? '(unset)'}`);
  console.log(`  scratch   tenant ${CODE}, deleted at the end\n`);

  // M2 has no screens, so this script is the only way to see it work — but it writes fictional
  // patients, which is exactly what must never happen anywhere real.
  if ((process.env.NODE_ENV ?? 'development') !== 'development') {
    bad(`NODE_ENV is "${process.env.NODE_ENV}". This writes test patients and only runs in development.`);
    process.exit(1);
  }
  if (process.env.ABDM_PROVIDER === 'gateway') {
    bad('ABDM_PROVIDER=gateway would send these fictional records to the real ABDM sandbox.');
    note('Set ABDM_PROVIDER=mock. The gateway client then records each call instead of sending it,');
    note('which is what lets this print the exact payloads.');
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
    // Always, even on a thrown error — a scratch tenant left behind would block the next run.
    await pool.query('DELETE FROM abdm_consents WHERE hip_id = $1', [HIP_ID]);
    await pool.query('DELETE FROM abdm_link_tokens WHERE abha_address = $1', ['m2check@sbx']);
    await cleanupTenant(CODE);
  }

  console.log(`\n${'-'.repeat(60)}`);
  if (failed === 0) {
    console.log(`M2 is working end to end locally: ${passed} checks passed.`);
    console.log('');
    console.log('What this does NOT prove — and cannot, until the bridge URL is registered:');
    console.log('  · that ABDM can reach us (needs TLS on api-staging.nirogix.com — BACKLOG I-5)');
    console.log('  · that the four unverified inbound paths are the right ones');
    console.log('  · that Fidelius encrypts correctly (mock mode does not encrypt — it marks)');
    console.log('');
    console.log('Run with --payloads to see the full JSON we would send ABDM at each step,');
    console.log('or --logs to keep the application log alongside the report.');
  } else {
    console.log(`${failed} check(s) FAILED, ${passed} passed. M2 is not working locally.`);
  }
  console.log('');
  await pool.end();
  process.exit(failed === 0 ? 0 : 1);
}

async function run(tenantId: string): Promise<void> {
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'M2 Self-test Hospital' });

  // --- 1. A patient with a VERIFIED ABHA --------------------------------------------------
  step(1, 'A patient with a verified ABHA');
  const patient = await createPatient(tenantId, {
    firstName: 'Kavita',
    lastName: 'Sharma',
    gender: 'female',
    dateOfBirth: '1990-07-14',
    phone: '9700009999',
  });
  await pool.query(
    "UPDATE patients SET abha_address = 'm2check@sbx', abha_number = '91-1111-2222-3333', abha_verified_at = now() WHERE id = $1",
    [patient.id],
  );
  ok(`patient ${patient.uhid} created, ABHA m2check@sbx marked verified`);
  note('Only a VERIFIED ABHA is ever linkable — a typed one was never proved to be theirs.');

  // --- 2. A completed consultation --------------------------------------------------------
  step(2, 'A completed consultation, as a doctor would sign it');
  const visit = await pool.query(
    `INSERT INTO visits (tenant_id, patient_id, visit_number, visit_date, status, token_number)
     VALUES ($1,$2,'V-M2CHECK-1', CURRENT_DATE, 'completed', 1) RETURNING id`,
    [tenantId, patient.id],
  );
  const visitId = visit.rows[0].id as string;
  const encounter = await pool.query(
    `INSERT INTO encounters (tenant_id, visit_id, patient_id, chief_complaint, subjective, assessment, plan,
       vital_systolic, vital_diastolic, vital_pulse, status, signed_at)
     VALUES ($1,$2,$3,'Fever and cough','Three days of fever','Acute bronchitis','Rest, fluids, review in 5 days',
       124, 80, 84, 'signed', now()) RETURNING id`,
    [tenantId, visitId, patient.id],
  );
  await pool.query(
    `INSERT INTO diagnoses (tenant_id, encounter_id, icd10_code, icd10_term, is_primary)
     VALUES ($1,$2,'J20.9','Acute bronchitis, unspecified', true)`,
    [tenantId, encounter.rows[0].id],
  );
  ok('visit + signed encounter + ICD-10 diagnosis written');

  // --- 3. The care context ----------------------------------------------------------------
  step(3, 'The care context ABDM will see (ADR-087)');
  const reference = `m2check-${visitId}`;
  const label = cc.labelForVisit(new Date());
  const context = await cc.recordCareContext({
    tenantId,
    patientId: patient.id,
    referenceNumber: reference,
    displayLabel: label,
    hiType: 'OPConsultation',
    visitId,
  });
  ok(`recorded: "${label}"`);
  check(
    !/diabet|fever|cough|hiv|cancer|bronchitis/i.test(label),
    'the label carries a date and a setting only — no clinical information',
    `the label leaked clinical information: "${label}"`,
  );
  note('The patient reads this string in their PHR app. A diagnosis here is a disclosure.');

  let refused = false;
  try {
    cc.assertNonClinicalLabel('Diabetes follow-up 03/10/2026');
  } catch {
    refused = true;
  }
  check(refused, 'a clinical label is refused at the source, not sanitised', 'a clinical label was ACCEPTED — the guard is broken');

  // --- 4. The FHIR document ---------------------------------------------------------------
  step(4, 'The FHIR document built from those rows (ADR-088)');
  const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'OPConsultation' });
  const types = bundle.entry.map((e) => e.resource.resourceType);
  check(types[0] === 'Composition', 'Composition is first, as an ABDM document bundle requires', `first resource is ${types[0]}, not Composition`);
  ok(`${bundle.entry.length} resources: ${[...new Set(types)].join(', ')}`);
  const asText = JSON.stringify(bundle);
  check(asText.includes('J20.9'), 'the ICD-10 code survived into the bundle', 'the diagnosis code is missing from the bundle');

  // --- 5. Linking -------------------------------------------------------------------------
  //
  // Linking is genuinely asynchronous and the script models that rather than papering over it.
  // Attaching a record to somebody's national health record needs a LINK TOKEN, and acquiring one
  // is itself a round trip: we ask, NHA delivers it to our webhook. So the first attempt correctly
  // defers — and seeing it defer is the point, because a `linked: 0` here is the system working.
  step(5, 'Linking the visit to the ABHA (ADR-089)');
  clearRecordedHipCalls();

  const firstAttempt = await linking.linkPendingForPatient(tenantId, patient.id);
  check(
    firstAttempt.linked === 0 && /token/i.test(firstAttempt.reason ?? ''),
    `deferred correctly on the first attempt — "${firstAttempt.reason}"`,
    `expected to wait for a link token, got ${firstAttempt.linked} link(s)`,
  );
  note('We hold no link token yet, so it asks for one and stops. A consultation must never fail');
  note('to save because NHA was slow, which is why linking is a separate, resumable sweep.');

  // Now play the webhook: NHA delivers the token. Its `exp` is read, never assumed — NHA says
  // "about six months", and believing that instead of the claim means a link dying mid-flight.
  const token = jwtExpiringInDays(180);
  const delivered = await storeLinkToken({ abhaAddress: 'm2check@sbx', token, hipId: HIP_ID });
  check(delivered, 'link token delivered by the webhook and stored ENCRYPTED', 'the delivered token was rejected');
  const tokenRow = await pool.query('SELECT token_enc FROM abdm_link_tokens WHERE abha_address = $1', ['m2check@sbx']);
  check(
    String(tokenRow.rows[0]?.token_enc ?? '').startsWith('v1.') && !String(tokenRow.rows[0]?.token_enc).includes(token),
    'the token is unreadable at rest — it is standing permission to write to a national record',
    'the link token was stored in a readable form',
  );

  const linked = await linking.linkPendingForPatient(tenantId, patient.id);
  check(linked.linked === 1, 'one care context linked', `expected 1 link, got ${linked.linked}${linked.reason ? ` (${linked.reason})` : ''}`);
  showLastCall('link');
  note('One call per PATIENT, not per record — a visit producing four records is one notification.');

  // --- 6. Discovery -----------------------------------------------------------------------
  step(6, 'Discovery — the patient searching for their own records (ADR-090)');
  const byAbha = await discoverPatient(tenantId, { abhaAddress: 'm2check@sbx' });
  check(byAbha.patient?.id === patient.id, 'a verified ABHA address matches, conclusively', 'the ABHA address did not match the patient');

  const weak = await discoverPatient(tenantId, { mobile: '9700009999' });
  check(!weak.patient, 'a mobile number ALONE does not match — as it must not', 'a bare mobile number matched a patient, which is a disclosure risk');
  note('Demographics need mobile AND name AND year of birth together. Ambiguity means nobody.');

  const wrongName = await discoverPatient(tenantId, { mobile: '9700009999', name: 'Someone Else', yearOfBirth: 1990 });
  check(!wrongName.patient, 'right mobile, wrong name → no match', 'a mismatched name still matched');

  // --- 7. Consent -------------------------------------------------------------------------
  step(7, 'A consent artefact arriving from the consent manager (ADR-087)');
  const stored = await consent.recordConsentGrant({
    consentId: CONSENT_ID,
    abhaAddress: 'm2check@sbx',
    hipId: HIP_ID,
    hiuId: 'HIU-SPECIALIST-1',
    hiTypes: ['OPConsultation', 'Prescription'],
    accessMode: 'VIEW',
    dateRangeFrom: '2020-01-01T00:00:00.000Z',
    dateRangeTo: '2030-12-31T00:00:00.000Z',
    dataEraseAt: '2030-12-31T00:00:00.000Z',
    grantedAt: new Date().toISOString(),
    careContexts: [{ careContextReference: reference }],
  });
  check(stored?.tenantId === tenantId, 'stored against the right hospital, resolved from the facility id', 'the consent did not resolve to this hospital');

  // --- 8. The transfer --------------------------------------------------------------------
  step(8, 'A consented request for those records (ADR-091)');
  clearRecordedHipCalls();
  const accepted = await receiveHealthInformationRequest({
    hipId: HIP_ID,
    transactionId: 'm2check-txn-1',
    requestId: 'm2check-req-1',
    consentId: CONSENT_ID,
    dataPushUrl: PUSH_URL,
    hiuPublicKey: 'HIU-PUBLIC-KEY',
    hiuNonce: 'HIU-NONCE',
    careContextRefs: [reference],
    from: '2025-01-01T00:00:00.000Z',
    to: '2030-01-01T00:00:00.000Z',
  });
  check(accepted.accepted, 'request accepted and acknowledged', 'the request was not accepted');
  showLastCall('on-request');
  note('Acknowledged BEFORE any record is built — NHA allows twenty minutes, but not a held connection.');

  const row = await pool.query('SELECT id FROM abdm_data_transfers WHERE tenant_id = $1 AND transaction_id = $2', [
    tenantId,
    'm2check-txn-1',
  ]);
  const sent = await performTransfer(tenantId, row.rows[0].id);
  check(sent.sent === 1, 'one encrypted entry sent to the HIU', `expected 1 entry, got ${sent.sent}${sent.reason ? ` (${sent.reason})` : ''}`);

  const push = [...recordedHipCalls()].reverse().find((c) => c.path === PUSH_URL);
  const body = push?.body as
    | { entries: Array<{ content: string; checksum: string }>; keyMaterial: { curve: string }; pageNumber: number }
    | undefined;
  if (body) {
    check(Boolean(body.entries[0]?.checksum), 'each entry carries a checksum of the plaintext', 'an entry has no checksum');
    check(body.keyMaterial?.curve === 'Curve25519', 'key material names Curve25519, as ABDM expects', 'the key material is not Curve25519');
    const content = Buffer.from(body.entries[0]!.content, 'base64').toString('utf8');
    check(
      content.startsWith('MOCK-NOT-ENCRYPTED:'),
      'mock mode marks the payload as NOT encrypted, so it can never be mistaken for real ciphertext',
      'the mock payload is not marked — that marker is what stops a test envelope reaching a real HIU',
    );
    note('In gateway mode this is Fidelius ciphertext. There is no third option — no plaintext path.');
  } else {
    bad('nothing was pushed to the HIU');
  }
  showLastCall('notify');

  // --- 9. The refusals, which matter more than the happy path -----------------------------
  step(9, 'Revoking the consent — the check that matters most');
  await consent.revokeConsent(HIP_ID, CONSENT_ID);
  const stillThere = await pool.query('SELECT id FROM abdm_consents WHERE consent_id = $1', [CONSENT_ID]);
  check(stillThere.rowCount === 0, 'the consent artefact is DELETED, not flagged', 'the artefact still exists after revocation');

  const records = await pool.query('SELECT id FROM encounters WHERE tenant_id = $1', [tenantId]);
  check((records.rowCount ?? 0) > 0, 'the clinical record is untouched — the consent expired, not the care', 'clinical records were deleted with the consent, which is wrong');

  clearRecordedHipCalls();
  const afterRevoke = await receiveHealthInformationRequest({
    hipId: HIP_ID,
    transactionId: 'm2check-txn-2',
    requestId: 'm2check-req-2',
    consentId: CONSENT_ID,
    dataPushUrl: PUSH_URL,
    hiuPublicKey: 'HIU-PUBLIC-KEY',
    hiuNonce: 'HIU-NONCE',
    careContextRefs: [reference],
  });
  if (afterRevoke.accepted) {
    const row2 = await pool.query('SELECT id FROM abdm_data_transfers WHERE tenant_id = $1 AND transaction_id = $2', [
      tenantId,
      'm2check-txn-2',
    ]);
    const blocked = await performTransfer(tenantId, row2.rows[0].id);
    check(blocked.sent === 0, `nothing sent after revocation — "${blocked.reason}"`, `${blocked.sent} entries were sent AFTER the consent was revoked`);
    check(
      recordedHipCalls().every((c) => c.path !== PUSH_URL),
      'no data reached the HIU URL at all',
      'something was pushed to the HIU after revocation',
    );
    const notified = [...recordedHipCalls()].reverse().find((c) => c.path.includes('notify'));
    check(Boolean(notified), 'the gateway was told the flow errored, rather than left waiting', 'the refusal was silent — the HIU would wait forever');
  }

  step(10, 'An unknown facility');
  clearRecordedHipCalls();
  const unknown = await receiveHealthInformationRequest({
    hipId: 'NOT-OUR-FACILITY',
    transactionId: 'm2check-txn-3',
    consentId: CONSENT_ID,
    dataPushUrl: PUSH_URL,
    careContextRefs: [reference],
  });
  check(!unknown.accepted && recordedHipCalls().length === 0, 'dropped silently, nothing written, nothing answered', 'a request for an unregistered facility was accepted');

  void context;
}

main().catch(async (err: unknown) => {
  bad(`unexpected failure: ${(err as Error).message}`);
  console.log((err as Error).stack?.split('\n').slice(1, 6).join('\n') ?? '');
  await pool.query('DELETE FROM abdm_consents WHERE hip_id = $1', [HIP_ID]).catch(() => undefined);
  await cleanupTenant(CODE).catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
