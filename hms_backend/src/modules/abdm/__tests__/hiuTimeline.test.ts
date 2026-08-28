import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient } from '../../patient/patient.service';
import { upsertFacilityConfig } from '../abdm.service';
import * as hiu from '../hiuConsent.service';
import { patientTimeline, timelineSummary, toTimelineEntry } from '../hiuTimeline.service';
import type { AbdmHiuRecord } from '../../../db/schema';

/**
 * The unified history a doctor reads (ADR-094).
 *
 * Two things are pinned here. **The merge**: four hospitals become one chronological feed, because a
 * prescription from March is only useful beside the diagnosis from February. And **the boundary**: a
 * record whose consent has lapsed must vanish from the feed *immediately*, measured against the
 * clock — before the purge sweep runs, and whether or not the revocation callback ever arrived. The
 * sweep deletes; this hides. Neither may depend on the other having happened.
 *
 * The mapping tests drive `toTimelineEntry` directly with bundles the database never held, because
 * the parsing is the part worth asserting and it should not need a round trip to check.
 */

const CODE = 'ABDMTL';
const HIP_ID = 'IN0710-TL-001';

let ready = false;
let tenantId = '';
let patientId = '';
let providerId = '';

/** A stored record, built by hand so the mapping can be asserted without the wire. */
const asRecord = (content: unknown, over: Partial<AbdmHiuRecord> = {}): AbdmHiuRecord =>
  ({
    id: '00000000-0000-4000-8000-000000000001',
    tenantId,
    consentId: '00000000-0000-4000-8000-000000000002',
    patientId,
    sourceHipId: 'IN0710-SOURCE',
    careContextReference: 'cc-1',
    hiType: 'OPConsultation',
    content,
    recordDate: new Date('2026-03-04T10:00:00.000Z'),
    checksum: null,
    receivedAt: new Date('2026-03-05T10:00:00.000Z'),
    ...over,
  }) as AbdmHiuRecord;

/** Grants a consent, then stores one record under it as if a HIP had delivered it. */
async function storeRecord(input: {
  consentId: string;
  hipId: string;
  hiType?: string;
  date?: string;
  content?: unknown;
  dataEraseAt?: string;
}): Promise<string> {
  const request = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });
  await pool.query('UPDATE abdm_hiu_consent_requests SET consent_request_id = $1 WHERE id = $2', [
    `cr-${input.consentId}`,
    request.id,
  ]);
  const consent = await hiu.storeConsentArtefact({
    consentId: input.consentId,
    consentRequestId: `cr-${input.consentId}`,
    hipId: input.hipId,
    abhaAddress: 'tl@sbx',
    hiTypes: ['OPConsultation'],
    dataEraseAt: input.dataEraseAt ?? '2030-12-31T00:00:00.000Z',
  });
  await pool.query(
    `INSERT INTO abdm_hiu_records (tenant_id, consent_id, patient_id, source_hip_id, care_context_reference, hi_type, content, record_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      tenantId,
      consent!.id,
      patientId,
      input.hipId,
      `cc-${input.consentId}`,
      input.hiType ?? 'OPConsultation',
      JSON.stringify(input.content ?? { resourceType: 'Bundle', entry: [] }),
      input.date ?? '2026-03-04T10:00:00.000Z',
    ],
  );
  return consent!.id;
}

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'Timeline Test' });

  const patient = await createPatient(tenantId, { firstName: 'Devi', lastName: 'Krishnan', phone: '9700008888' });
  patientId = patient.id;
  await pool.query("UPDATE patients SET abha_address = 'tl@sbx', abha_verified_at = now() WHERE id = $1", [patientId]);

  const doctor = await pool.query(
    `INSERT INTO providers (tenant_id, full_name, registration_number, is_active)
     VALUES ($1,'Dr Ravi Kumar','MCI-55443', true) RETURNING id`,
    [tenantId],
  );
  providerId = doctor.rows[0].id;
});

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(CODE);
});

describe('reading a bundle', () => {
  test('diagnoses, medicines and findings come out labelled', async ({ skip }) => {
    if (!ready) return skip();
    const entry = toTimelineEntry(
      asRecord({
        resourceType: 'Bundle',
        entry: [
          { resource: { resourceType: 'Composition', type: { text: 'OP Consultation Document' }, date: '2026-03-04' } },
          { resource: { resourceType: 'Condition', code: { coding: [{ code: 'J20.9', display: 'Acute bronchitis' }] } } },
          {
            resource: {
              resourceType: 'MedicationRequest',
              medicationCodeableConcept: { text: 'Amoxicillin 500mg' },
              dosageInstruction: [{ text: 'Twice daily for 5 days' }],
            },
          },
          {
            resource: {
              resourceType: 'Observation',
              code: { text: 'Body temperature' },
              valueQuantity: { value: 38.2, unit: 'Cel' },
            },
          },
        ],
      }),
    );

    expect(entry.title).toBe('OP Consultation Document');
    expect(entry.details).toContainEqual({ group: 'Diagnoses', label: 'Diagnosis', value: 'Acute bronchitis' });
    expect(entry.details).toContainEqual({ group: 'Medicines', label: 'Amoxicillin 500mg', value: 'Twice daily for 5 days' });
    expect(entry.details).toContainEqual({ group: 'Findings', label: 'Body temperature', value: '38.2 Cel' });
    expect(entry.hasAbnormalFinding).toBe(false);
  });

  test("abnormality is the SOURCE's flag, never our own arithmetic", async ({ skip }) => {
    if (!ready) return skip();
    // Two identical-looking values. Only the one the laboratory flagged is marked — deciding that
    // ourselves would be interpreting somebody else's investigation from a display layer.
    const entry = toTimelineEntry(
      asRecord({
        resourceType: 'Bundle',
        entry: [
          {
            resource: {
              resourceType: 'Observation',
              code: { text: 'Haemoglobin' },
              valueQuantity: { value: 8.1, unit: 'g/dL' },
              interpretation: [{ coding: [{ code: 'L' }] }],
            },
          },
          {
            resource: {
              resourceType: 'Observation',
              code: { text: 'Platelet count' },
              valueQuantity: { value: 8.1, unit: 'g/dL' },
            },
          },
        ],
      }),
    );

    const flagged = entry.details.filter((d) => d.emphasis === 'abnormal');
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.label).toBe('Haemoglobin');
    expect(entry.hasAbnormalFinding).toBe(true);
  });

  test('an allergy is always emphasised', async ({ skip }) => {
    if (!ready) return skip();
    // The one line whose being missed causes direct harm.
    const entry = toTimelineEntry(
      asRecord({
        resourceType: 'Bundle',
        entry: [{ resource: { resourceType: 'AllergyIntolerance', code: { text: 'Penicillin' } } }],
      }),
    );
    expect(entry.details[0]).toEqual({ group: 'Allergies', label: 'Allergy', value: 'Penicillin', emphasis: 'abnormal' });
  });

  test('an unfamiliar resource is skipped, never fatal', async ({ skip }) => {
    if (!ready) return skip();
    // Other people's systems legitimately send shapes we have never seen. Losing one line of detail
    // is recoverable; losing the record over a missing field is not.
    const entry = toTimelineEntry(
      asRecord({
        resourceType: 'Bundle',
        entry: [
          { resource: { resourceType: 'SomethingWeHaveNeverSeen', mystery: true } },
          { resource: { resourceType: 'Condition', code: { text: 'Migraine' } } },
          { resource: null },
          { notAResourceAtAll: 1 },
        ],
      }),
    );
    expect(entry.details).toHaveLength(1);
    expect(entry.details[0]!.value).toBe('Migraine');
  });

  test('a bundle with no title falls back to a readable type', async ({ skip }) => {
    if (!ready) return skip();
    const entry = toTimelineEntry(asRecord({ resourceType: 'Bundle', entry: [] }, { hiType: 'DischargeSummary' }));
    expect(entry.title).toBe('Discharge summary');
  });

  test('the author comes from the practitioner, then the organisation', async ({ skip }) => {
    if (!ready) return skip();
    const entry = toTimelineEntry(
      asRecord({
        resourceType: 'Bundle',
        entry: [
          { resource: { resourceType: 'Organization', name: 'City Hospital' } },
          { resource: { resourceType: 'Practitioner', name: [{ given: ['Asha'], family: 'Menon' }] } },
        ],
      }),
    );
    expect(entry.author).toBe('Asha Menon');
  });
});

describe('the merged timeline', () => {
  test('four hospitals become one feed, newest first', async ({ skip }) => {
    if (!ready) return skip();
    await storeRecord({ consentId: 'tl-a', hipId: 'HOSP-A', date: '2026-01-10T00:00:00.000Z' });
    await storeRecord({ consentId: 'tl-b', hipId: 'HOSP-B', date: '2026-05-20T00:00:00.000Z' });
    await storeRecord({ consentId: 'tl-c', hipId: 'HOSP-C', date: '2026-03-15T00:00:00.000Z' });

    const timeline = await patientTimeline(tenantId, patientId);
    // Merged, not siloed by source — the whole point of a longitudinal record.
    expect(timeline.map((e) => e.sourceHipId)).toEqual(['HOSP-B', 'HOSP-C', 'HOSP-A']);
  });

  test('a lapsed consent hides its records IMMEDIATELY, before any sweep', async ({ skip }) => {
    if (!ready) return skip();
    await storeRecord({ consentId: 'tl-lapse', hipId: 'HOSP-LAPSE', date: '2026-06-01T00:00:00.000Z' });
    expect((await patientTimeline(tenantId, patientId)).some((e) => e.sourceHipId === 'HOSP-LAPSE')).toBe(true);

    // The row is still on disk — the sweep has not run. It must already be invisible.
    await pool.query("UPDATE abdm_hiu_consents SET data_erase_at = '2020-01-01' WHERE consent_id = $1", ['tl-lapse']);
    const stillStored = await pool.query('SELECT count(*)::int AS n FROM abdm_hiu_records WHERE care_context_reference = $1', [
      'cc-tl-lapse',
    ]);
    expect(stillStored.rows[0].n).toBe(1);

    expect((await patientTimeline(tenantId, patientId)).some((e) => e.sourceHipId === 'HOSP-LAPSE')).toBe(false);
  });

  test('a revoked consent takes its records out of the feed', async ({ skip }) => {
    if (!ready) return skip();
    await storeRecord({ consentId: 'tl-revoke', hipId: 'HOSP-REVOKE', date: '2026-07-01T00:00:00.000Z' });
    await hiu.handleConsentNotification({ consentId: 'tl-revoke', status: 'REVOKED' });

    const timeline = await patientTimeline(tenantId, patientId);
    expect(timeline.some((e) => e.sourceHipId === 'HOSP-REVOKE')).toBe(false);
  });

  test('an undated record sorts last rather than disappearing', async ({ skip }) => {
    if (!ready) return skip();
    await pool.query(
      `INSERT INTO abdm_hiu_records (tenant_id, consent_id, patient_id, source_hip_id, care_context_reference, hi_type, content, record_date)
       SELECT $1, c.id, $2, 'HOSP-UNDATED', 'cc-undated', 'HealthDocumentRecord', $3, NULL
         FROM abdm_hiu_consents c WHERE c.consent_id = 'tl-a'`,
      [tenantId, patientId, JSON.stringify({ resourceType: 'Bundle', entry: [] })],
    );
    const timeline = await patientTimeline(tenantId, patientId);
    // A record without a usable date is still a record; hiding it would be a silent omission.
    expect(timeline.some((e) => e.sourceHipId === 'HOSP-UNDATED')).toBe(true);
    expect(timeline[timeline.length - 1]!.sourceHipId).toBe('HOSP-UNDATED');
  });

  test('filters narrow the feed without changing the rules', async ({ skip }) => {
    if (!ready) return skip();
    const bySource = await patientTimeline(tenantId, patientId, { sourceHipId: 'HOSP-B' });
    expect(bySource.every((e) => e.sourceHipId === 'HOSP-B')).toBe(true);

    const byType = await patientTimeline(tenantId, patientId, { hiTypes: ['HealthDocumentRecord'] });
    expect(byType.every((e) => e.hiType === 'HealthDocumentRecord')).toBe(true);
  });

  test('the summary counts and attributes, and never interprets', async ({ skip }) => {
    if (!ready) return skip();
    const summary = await timelineSummary(tenantId, patientId);

    expect(summary.total).toBeGreaterThan(0);
    expect(summary.sources).toContain('HOSP-B');
    expect(summary.latest).toBeTruthy();
    // Counts and provenance only — a generated "key findings" line would be a clinical claim this
    // code has no standing to make.
    expect(Object.keys(summary)).toEqual(['total', 'sources', 'byType', 'abnormalCount', 'earliest', 'latest']);
  });

  test('another patient sees none of it', async ({ skip }) => {
    if (!ready) return skip();
    const other = await createPatient(tenantId, { firstName: 'Someone', lastName: 'Else', phone: '9700009111' });
    expect(await patientTimeline(tenantId, other.id)).toHaveLength(0);
  });
});
