import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient } from '../../patient/patient.service';
import { buildDocumentBundle, HI_TYPE_META } from '../fhir/fhirBuilder';
import type { FhirBundle, FhirComposition, FhirObservation, FhirResource } from '../fhir/types';

/**
 * FHIR document bundles built from real rows (ADR-088).
 *
 * The suite writes actual clinical data through SQL and then reads the bundle back, because the
 * thing worth testing is the **mapping** — that a diagnosis keeps its ICD-10 code, that vitals come
 * out in the units a clinician reads rather than the ones our columns hold, and that an unverified
 * lab result never leaves the building.
 */

const CODE = 'ABDMFHIR';

let ready = false;
let tenantId = '';
let patientId = '';
let visitId = '';
let encounterId = '';

/** Finds a resource of a given type in the bundle. */
const find = <T extends FhirResource>(bundle: FhirBundle, type: string): T | undefined =>
  bundle.entry.find((e) => e.resource.resourceType === type)?.resource as T | undefined;
const findAll = <T extends FhirResource>(bundle: FhirBundle, type: string): T[] =>
  bundle.entry.filter((e) => e.resource.resourceType === type).map((e) => e.resource as T);

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');

  const patient = await createPatient(tenantId, {
    firstName: 'Meera',
    lastName: 'Iyer',
    gender: 'female',
    dateOfBirth: '1985-04-12',
    phone: '9812300011',
    addressLine: '4 Residency Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
  });
  patientId = patient.id;
  await pool.query(
    "UPDATE patients SET abha_address = 'meera@sbx', abha_number = '91-1111-2222-3333', abha_verified_at = now() WHERE id = $1",
    [patientId],
  );

  // A visit with a signed consultation: vitals, an ICD-10 diagnosis, two medicines, a verified lab
  // result and an unverified one, an attachment, an invoice, and an immunisation.
  const visit = await pool.query(
    `INSERT INTO visits (tenant_id, patient_id, visit_number, visit_date, status, token_number)
     VALUES ($1, $2, 'V-FHIR-0001', CURRENT_DATE, 'completed', 1) RETURNING id`,
    [tenantId, patientId],
  );
  visitId = visit.rows[0].id;

  const enc = await pool.query(
    `INSERT INTO encounters (tenant_id, visit_id, patient_id, chief_complaint, subjective, assessment, plan,
       status, signed_at)
     VALUES ($1,$2,$3,'Fever for three days','Reports fever','Viral fever','Rest and fluids',
       'signed', now()) RETURNING id`,
    [tenantId, visitId, patientId],
  );
  encounterId = enc.rows[0].id;

  // Vitals hang off the VISIT, not the encounter (ADR-113) — a desk reading exists before any
  // consultation does, so the bundle has to source them from there.
  await pool.query(
    `INSERT INTO patient_vitals (tenant_id, visit_id, patient_id, stage,
       systolic, diastolic, pulse, resp_rate, temp_c_tenths, weight_g, height_cm)
     VALUES ($1,$2,$3,'consultation',128,82,88,18,375,64500,162)`,
    [tenantId, visitId, patientId],
  );

  await pool.query(
    `INSERT INTO diagnoses (tenant_id, encounter_id, icd10_code, icd10_term, is_primary)
     VALUES ($1,$2,'J11.1','Influenza with other respiratory manifestations', true)`,
    [tenantId, encounterId],
  );

  await pool.query(
    `INSERT INTO prescriptions (tenant_id, encounter_id, visit_id, patient_id, drug_name, dose, frequency, duration, route)
     VALUES ($1,$2,$3,$4,'Paracetamol 500mg','1 tablet','Three times a day','5 days','Oral'),
            ($1,$2,$3,$4,'ORS sachet','1 sachet','As needed','3 days','Oral')`,
    [tenantId, encounterId, visitId, patientId],
  );

  const test = await pool.query(
    `INSERT INTO lab_tests (tenant_id, name, code, unit, ref_low, ref_high, price_paise)
     VALUES ($1,'Haemoglobin','718-7','g/dL','12','16', 20000) RETURNING id`,
    [tenantId],
  );
  const order = await pool.query(
    `INSERT INTO lab_orders (tenant_id, encounter_id, visit_id, patient_id, test_name, test_id, test_code, status)
     VALUES ($1,$2,$3,$4,'Haemoglobin',$5,'718-7','verified') RETURNING id`,
    [tenantId, encounterId, visitId, patientId, test.rows[0].id],
  );
  await pool.query(
    `INSERT INTO lab_results (tenant_id, lab_order_id, test_id, value, unit, ref_low, ref_high, flag, verified_at)
     VALUES ($1,$2,$3,'11.2','g/dL','12','16','low', now())`,
    [tenantId, order.rows[0].id, test.rows[0].id],
  );
  // A SECOND order whose result is deliberately NOT verified — it must never reach a bundle.
  // (One result per order: `lab_results_tenant_order_unique`.)
  const unverifiedOrder = await pool.query(
    `INSERT INTO lab_orders (tenant_id, encounter_id, visit_id, patient_id, test_name, test_id, status)
     VALUES ($1,$2,$3,$4,'Haemoglobin',$5,'resulted') RETURNING id`,
    [tenantId, encounterId, visitId, patientId, test.rows[0].id],
  );
  await pool.query(
    `INSERT INTO lab_results (tenant_id, lab_order_id, test_id, value, unit, flag)
     VALUES ($1,$2,$3,'SECRET-UNVERIFIED','g/dL','normal')`,
    [tenantId, unverifiedOrder.rows[0].id, test.rows[0].id],
  );

  const invoice = await pool.query(
    `INSERT INTO invoices (tenant_id, patient_id, visit_id, invoice_number, status, total_paise)
     VALUES ($1,$2,$3,'INV-0001','paid', 50000) RETURNING id`,
    [tenantId, patientId, visitId],
  );
  await pool.query(
    `INSERT INTO invoice_line_items (tenant_id, invoice_id, item_type, description, quantity, unit_price_paise, line_total_paise)
     VALUES ($1,$2,'consultation','Consultation fee',1,30000,30000),
            ($1,$2,'lab','Haemoglobin',1,20000,20000)`,
    [tenantId, invoice.rows[0].id],
  );

  await pool.query(
    `INSERT INTO patient_immunizations (tenant_id, patient_id, vaccine_code, vaccine_name, date_given, dose_label)
     VALUES ($1,$2,'INFLUENZA','Influenza vaccine', CURRENT_DATE, 'Dose 1')`,
    [tenantId, patientId],
  );
});

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(CODE);
});

describe('the document envelope', () => {
  test('is a FHIR document with the Composition first', async ({ skip }) => {
    if (!ready) return skip();
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'OPConsultation' });
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('document');
    // ABDM rejects a bundle whose Composition is not the first entry.
    expect(bundle.entry[0]!.resource.resourceType).toBe('Composition');
    expect(bundle.meta.profile).toContain(
      'https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle',
    );
  });

  test('every entry is referenced by its own fullUrl', async ({ skip }) => {
    if (!ready) return skip();
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'OPConsultation' });
    for (const entry of bundle.entry) {
      expect(entry.fullUrl).toBe(`urn:uuid:${entry.resource.id}`);
    }
    // No duplicate ids — a reference must resolve to exactly one resource.
    const ids = bundle.entry.map((e) => e.resource.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('carries the SNOMED code ABDM specifies for the type', async ({ skip }) => {
    if (!ready) return skip();
    for (const hiType of ['Prescription', 'OPConsultation', 'DiagnosticReport'] as const) {
      const bundle = await buildDocumentBundle(tenantId, { visitId, hiType });
      const comp = find<FhirComposition>(bundle, 'Composition')!;
      expect(comp.type.coding?.[0]?.code).toBe(HI_TYPE_META[hiType].snomed);
    }
  });

  test("the wellness type matches ABDM's exact text, since it has no code", async ({ skip }) => {
    if (!ready) return skip();
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'WellnessRecord' });
    const comp = find<FhirComposition>(bundle, 'Composition')!;
    expect(comp.type.coding).toBeUndefined();
    expect(comp.type.text).toBe('Wellness record');
  });

  test('the patient carries their ABHA identifiers and the hospital UHID', async ({ skip }) => {
    if (!ready) return skip();
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'Prescription' });
    const patient = find<never>(bundle, 'Patient') as unknown as {
      identifier: Array<{ value?: string }>;
    };
    const values = patient.identifier.map((i) => i.value);
    expect(values).toContain('meera@sbx');
    expect(values).toContain('91-1111-2222-3333');
    expect(values.some((v) => v?.startsWith('UHID-'))).toBe(true);
  });
});

describe('clinical mapping', () => {
  test('a diagnosis keeps its ICD-10 code and system', async ({ skip }) => {
    if (!ready) return skip();
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'OPConsultation' });
    const condition = find<never>(bundle, 'Condition') as unknown as {
      code: { coding: Array<{ system: string; code: string }> };
    };
    expect(condition.code.coding[0]!.system).toBe('http://hl7.org/fhir/sid/icd-10');
    expect(condition.code.coding[0]!.code).toBe('J11.1');
  });

  test('a medicine travels as text, never as an invented code', async ({ skip }) => {
    if (!ready) return skip();
    // We store a drug NAME. Guessing a SNOMED code from it would put the wrong medicine in a
    // national record — so `coding` is deliberately absent.
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'Prescription' });
    const meds = findAll<never>(bundle, 'MedicationRequest') as unknown as Array<{
      medicationCodeableConcept: { text: string; coding?: unknown };
      dosageInstruction?: Array<{ text?: string }>;
    }>;
    expect(meds).toHaveLength(2);
    expect(meds[0]!.medicationCodeableConcept.coding).toBeUndefined();
    expect(meds.map((m) => m.medicationCodeableConcept.text)).toContain('Paracetamol 500mg');
    expect(meds[0]!.dosageInstruction?.[0]?.text).toContain('Three times a day');
  });

  test('vitals are converted to the units a clinician reads', async ({ skip }) => {
    if (!ready) return skip();
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'WellnessRecord' });
    const obs = findAll<FhirObservation>(bundle, 'Observation');
    const by = (loinc: string) => obs.find((o) => o.code.coding?.[0]?.code === loinc);

    // Stored as tenths of a degree and as grams; emitted as °C and kg.
    expect(by('8310-5')?.valueQuantity?.value).toBe(37.5);
    expect(by('29463-7')?.valueQuantity?.value).toBe(64.5);
    expect(by('8302-2')?.valueQuantity?.value).toBe(162);
    expect(by('8867-4')?.valueQuantity?.value).toBe(88);
  });

  test('blood pressure is ONE observation with two components', async ({ skip }) => {
    if (!ready) return skip();
    // Systolic and diastolic emitted separately would lose the fact they were measured together.
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'WellnessRecord' });
    const bp = findAll<FhirObservation>(bundle, 'Observation').find(
      (o) => o.code.coding?.[0]?.code === '85354-9',
    )!;
    expect(bp.component).toHaveLength(2);
    expect(bp.component![0]!.valueQuantity?.value).toBe(128);
    expect(bp.component![1]!.valueQuantity?.value).toBe(82);
  });

  test('a lab result keeps its LOINC code, units and abnormal flag', async ({ skip }) => {
    if (!ready) return skip();
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'DiagnosticReport' });
    const obs = findAll<FhirObservation>(bundle, 'Observation').find(
      (o) => o.code.text === 'Haemoglobin',
    )!;
    expect(obs.code.coding?.[0]?.code).toBe('718-7');
    // A numeric result becomes a Quantity rather than a string.
    expect(obs.valueQuantity?.value).toBe(11.2);
    expect(obs.valueQuantity?.unit).toBe('g/dL');
    expect(obs.interpretation?.[0]?.coding?.[0]?.code).toBe('L');
  });

  test('an UNVERIFIED result never leaves the building', async ({ skip }) => {
    if (!ready) return skip();
    // A result nobody has signed off is a working note, not a finding.
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'DiagnosticReport' });
    expect(JSON.stringify(bundle)).not.toContain('SECRET-UNVERIFIED');
  });

  test('an invoice converts paise to rupees and itemises the lines', async ({ skip }) => {
    if (!ready) return skip();
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'Invoice' });
    const invoice = find<never>(bundle, 'Invoice') as unknown as {
      status: string;
      totalGross: { value: number; currency: string };
      lineItem: Array<{
        chargeItemCodeableConcept: { text: string };
        priceComponent: Array<{ amount: { value: number } }>;
      }>;
    };
    expect(invoice.status).toBe('balanced'); // paid
    expect(invoice.totalGross).toEqual({ value: 500, currency: 'INR' });
    expect(invoice.lineItem).toHaveLength(2);
    expect(invoice.lineItem[0]!.priceComponent[0]!.amount.value).toBe(300);
  });

  test('an immunisation carries the vaccine and dose', async ({ skip }) => {
    if (!ready) return skip();
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'ImmunizationRecord' });
    const imm = find<never>(bundle, 'Immunization') as unknown as {
      vaccineCode: { text: string };
      protocolApplied: Array<{ doseNumberString: string }>;
    };
    expect(imm.vaccineCode.text).toBe('Influenza vaccine');
    expect(imm.protocolApplied[0]!.doseNumberString).toBe('Dose 1');
  });

  test('a consultation gathers its sections', async ({ skip }) => {
    if (!ready) return skip();
    const bundle = await buildDocumentBundle(tenantId, { visitId, hiType: 'OPConsultation' });
    const titles = find<FhirComposition>(bundle, 'Composition')!.section!.map((s) => s.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Chief complaints',
        'Diagnoses',
        'Vital signs',
        'Medications',
        'Investigations',
      ]),
    );
  });
});

describe('refusing to send nothing', () => {
  test('a visit with no such record is an error, not an empty document', async ({ skip }) => {
    if (!ready) return skip();
    // A Composition with no content is a clinical record that says nothing; pushing one into a
    // patient's PHR app is worse than telling the caller there was nothing to send.
    const bare = await pool.query(
      `INSERT INTO visits (tenant_id, patient_id, visit_number, visit_date, status, token_number)
       VALUES ($1,$2,'V-FHIR-0002', CURRENT_DATE, 'checked_in', 2) RETURNING id`,
      [tenantId, patientId],
    );
    await expect(
      buildDocumentBundle(tenantId, { visitId: bare.rows[0].id, hiType: 'Prescription' }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ABDM_NOTHING_TO_SHARE' });
  });

  test('a missing visit is refused rather than guessed at', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      buildDocumentBundle(tenantId, {
        visitId: '00000000-0000-4000-8000-000000000000',
        hiType: 'Prescription',
      }),
    ).rejects.toMatchObject({ code: 'ABDM_VISIT_NOT_FOUND' });
  });
});
