import { randomUUID } from 'node:crypto';
import type {
  CodeableConcept,
  FhirCondition,
  FhirDiagnosticReport,
  FhirDocumentReference,
  FhirEncounter,
  FhirImmunization,
  FhirInvoice,
  FhirMedicationRequest,
  FhirObservation,
  FhirOrganization,
  FhirPatient,
  FhirPractitioner,
  Reference,
} from './types';

/**
 * Our clinical rows, expressed as FHIR R4 resources (ADR-088).
 *
 * Each builder is a pure mapping from one of our tables to one NRCES-profiled resource. Two rules
 * hold throughout:
 *
 * - **Never invent a code.** Where we hold a real code — ICD-10 on a diagnosis, LOINC on a lab test
 *   — it is emitted with its system. Where we hold only a name, the resource carries `text` and no
 *   `coding`, which is valid FHIR and honest. Guessing a SNOMED code from a drug name would produce
 *   a document that looks more machine-readable than it is, and a wrong code in a national health
 *   record is worse than an absent one.
 * - **Never emit an empty field.** Optional values are omitted rather than sent as null or "",
 *   because a present-but-empty element is a claim that we measured something and found nothing.
 */

export const NRCES = 'https://nrces.in/ndhm/fhir/r4/StructureDefinition';
const SNOMED = 'http://snomed.info/sct';
const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10';

/** `urn:uuid:…` — how a document bundle references its own entries. */
export const urn = (id: string): string => `urn:uuid:${id}`;
export const ref = (id: string, display?: string): Reference => ({ reference: urn(id), display });
export const newId = (): string => randomUUID();

/** Drops undefined/empty keys so a resource never carries a field it has nothing to say about. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const [k, v] of Object.entries(obj)) {
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) delete obj[k as keyof T];
  }
  return obj;
}

/** ABDM's vocabulary is male/female/other; ours is the same words, plus the unknown FHIR needs. */
function fhirGender(gender?: string | null): FhirPatient['gender'] {
  const g = (gender ?? '').toLowerCase();
  if (g === 'male' || g === 'm') return 'male';
  if (g === 'female' || g === 'f') return 'female';
  if (g === 'other' || g === 'o') return 'other';
  return 'unknown';
}

/** Phone and email, omitted entirely when absent rather than sent as empty entries. */
function telecomFor(input: { phone?: string | null; email?: string | null }): FhirPatient['telecom'] {
  const telecom: NonNullable<FhirPatient['telecom']> = [];
  if (input.phone) telecom.push({ system: 'phone', value: input.phone, use: 'mobile' });
  if (input.email) telecom.push({ system: 'email', value: input.email });
  return telecom.length > 0 ? telecom : undefined;
}

export function patientResource(input: {
  id: string;
  firstName: string;
  lastName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  abhaAddress?: string | null;
  abhaNumber?: string | null;
  uhid: string;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}): FhirPatient {
  const name = [input.firstName, input.lastName].filter(Boolean).join(' ');
  const identifier: FhirPatient['identifier'] = [
    {
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR', display: 'Medical record number' }] },
      value: input.uhid,
    },
  ];
  // The ABHA address is the identifier ABDM actually routes on; the number is the national id.
  if (input.abhaAddress) identifier.push({ system: 'https://healthid.ndhm.gov.in', value: input.abhaAddress });
  if (input.abhaNumber) identifier.push({ system: 'https://healthid.abdm.gov.in', value: input.abhaNumber });

  return compact({
    resourceType: 'Patient',
    id: input.id,
    meta: { profile: [`${NRCES}/Patient`] },
    identifier,
    name: [compact({ text: name, given: [input.firstName], family: input.lastName ?? undefined })],
    telecom: telecomFor(input),
    gender: fhirGender(input.gender),
    birthDate: input.dateOfBirth ?? undefined,
    address:
      input.addressLine || input.city
        ? [
            compact({
              text: [input.addressLine, input.city, input.state, input.pincode].filter(Boolean).join(', '),
              line: input.addressLine ? [input.addressLine] : undefined,
              city: input.city ?? undefined,
              state: input.state ?? undefined,
              postalCode: input.pincode ?? undefined,
              country: 'India',
            }),
          ]
        : undefined,
  }) as FhirPatient;
}

export function practitionerResource(input: {
  id: string;
  fullName: string;
  registrationNumber?: string | null;
  qualification?: string | null;
}): FhirPractitioner {
  return compact({
    resourceType: 'Practitioner',
    id: input.id,
    meta: { profile: [`${NRCES}/Practitioner`] },
    // A medical registration number is the identifier the ecosystem checks a prescriber against.
    identifier: input.registrationNumber
      ? [
          {
            type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MD', display: 'Medical License number' }] },
            system: 'https://doctor.ndhm.gov.in',
            value: input.registrationNumber,
          },
        ]
      : undefined,
    name: [{ text: input.fullName }],
    qualification: input.qualification ? [{ code: { text: input.qualification } }] : undefined,
  }) as FhirPractitioner;
}

export function organizationResource(input: {
  id: string;
  name: string;
  hipId?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): FhirOrganization {
  return compact({
    resourceType: 'Organization',
    id: input.id,
    meta: { profile: [`${NRCES}/Organization`] },
    // The HFR facility id — the same identifier ABDM routes on elsewhere in this module.
    identifier: input.hipId
      ? [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'PRN', display: 'Provider number' }] }, system: 'https://facility.ndhm.gov.in', value: input.hipId }]
      : undefined,
    name: input.name,
    telecom: [
      input.phone ? { system: 'phone' as const, value: input.phone } : undefined,
      input.email ? { system: 'email' as const, value: input.email } : undefined,
    ].filter(Boolean) as FhirOrganization['telecom'],
    address:
      input.city || input.state
        ? [compact({ city: input.city ?? undefined, state: input.state ?? undefined, postalCode: input.postalCode ?? undefined, country: 'India' })]
        : undefined,
  }) as FhirOrganization;
}

export function encounterResource(input: { id: string; subject: Reference; start?: string; end?: string; finished: boolean }): FhirEncounter {
  return compact({
    resourceType: 'Encounter',
    id: input.id,
    meta: { profile: [`${NRCES}/Encounter`] },
    status: input.finished ? 'finished' : 'in-progress',
    // Ambulatory: everything this product records today is outpatient (no IPD module yet).
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: input.subject,
    period: compact({ start: input.start, end: input.end }),
  }) as FhirEncounter;
}

/** A diagnosis. ICD-10 is real and stored, so it is emitted with its system. */
export function conditionResource(input: {
  id: string;
  subject: Reference;
  encounter?: Reference;
  icd10Code: string;
  icd10Term: string;
  recordedDate?: string;
  notes?: string | null;
}): FhirCondition {
  return compact({
    resourceType: 'Condition',
    id: input.id,
    meta: { profile: [`${NRCES}/Condition`] },
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    code: { coding: [{ system: ICD10, code: input.icd10Code, display: input.icd10Term }], text: input.icd10Term },
    subject: input.subject,
    encounter: input.encounter,
    recordedDate: input.recordedDate,
    note: input.notes ? [{ text: input.notes }] : undefined,
  }) as FhirCondition;
}

/**
 * A prescribed medicine.
 *
 * `medicationCodeableConcept` carries **text only**: we store a drug name, not a coded product, and
 * inventing a SNOMED or ATC code from a name is how the wrong medicine ends up in a national record.
 */
export function medicationRequestResource(input: {
  id: string;
  subject: Reference;
  encounter?: Reference;
  requester?: Reference;
  drugName: string;
  dose?: string | null;
  frequency?: string | null;
  duration?: string | null;
  route?: string | null;
  authoredOn?: string;
}): FhirMedicationRequest {
  const instruction = [input.dose, input.frequency, input.duration].filter(Boolean).join(' · ');
  return compact({
    resourceType: 'MedicationRequest',
    id: input.id,
    meta: { profile: [`${NRCES}/MedicationRequest`] },
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: { text: input.drugName },
    subject: input.subject,
    encounter: input.encounter,
    authoredOn: input.authoredOn,
    requester: input.requester,
    dosageInstruction: instruction || input.route ? [compact({ text: instruction || undefined, route: input.route ? { text: input.route } : undefined })] : undefined,
  }) as FhirMedicationRequest;
}

/** A lab result. LOINC where the test master knows it, plain text where it does not. */
export function labObservationResource(input: {
  id: string;
  subject: Reference;
  encounter?: Reference;
  testName: string;
  loincCode?: string | null;
  value: string;
  unit?: string | null;
  refLow?: string | null;
  refHigh?: string | null;
  flag?: string | null;
  effective?: string;
  notes?: string | null;
}): FhirObservation {
  const numeric = Number(input.value);
  const isNumeric = input.value.trim() !== '' && Number.isFinite(numeric);
  return compact({
    resourceType: 'Observation',
    id: input.id,
    meta: { profile: [`${NRCES}/Observation`] },
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    code: compact({
      coding: input.loincCode ? [{ system: LOINC, code: input.loincCode, display: input.testName }] : undefined,
      text: input.testName,
    }),
    subject: input.subject,
    encounter: input.encounter,
    effectiveDateTime: input.effective,
    // A numeric result becomes a Quantity; anything else stays a string rather than being coerced.
    valueQuantity: isNumeric ? compact({ value: numeric, unit: input.unit ?? undefined }) : undefined,
    valueString: isNumeric ? undefined : input.value,
    interpretation: interpretationFor(input.flag),
    referenceRange:
      input.refLow || input.refHigh
        ? [compact({ text: [input.refLow, input.refHigh].filter(Boolean).join(' – ') })]
        : undefined,
    note: input.notes ? [{ text: input.notes }] : undefined,
  }) as FhirObservation;
}

/** Our `normal | low | high | critical` flag, in HL7's interpretation vocabulary. */
function interpretationFor(flag?: string | null): CodeableConcept[] | undefined {
  const map: Record<string, { code: string; display: string }> = {
    normal: { code: 'N', display: 'Normal' },
    low: { code: 'L', display: 'Low' },
    high: { code: 'H', display: 'High' },
    critical: { code: 'AA', display: 'Critical abnormal' },
  };
  const hit = map[(flag ?? '').toLowerCase()];
  return hit ? [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', ...hit }] }] : undefined;
}

/** The vitals we store as discrete columns, each with its real LOINC code. */
const VITALS: Array<{ key: string; loinc: string; display: string; unit?: string; ucum?: string }> = [
  { key: 'pulse', loinc: '8867-4', display: 'Heart rate', unit: 'beats/minute', ucum: '/min' },
  { key: 'respRate', loinc: '9279-1', display: 'Respiratory rate', unit: 'breaths/minute', ucum: '/min' },
  { key: 'temperature', loinc: '8310-5', display: 'Body temperature', unit: 'C', ucum: 'Cel' },
  { key: 'weight', loinc: '29463-7', display: 'Body weight', unit: 'kg', ucum: 'kg' },
  { key: 'height', loinc: '8302-2', display: 'Body height', unit: 'cm', ucum: 'cm' },
];

export type VitalsInput = {
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  respRate?: number | null;
  /** Stored as tenths of a degree — 375 means 37.5 °C. */
  tempCTenths?: number | null;
  /** Stored in grams. */
  weightG?: number | null;
  heightCm?: number | null;
};

/**
 * Vitals as Observations.
 *
 * Blood pressure is one Observation with two components, which is how LOINC models it — emitting
 * systolic and diastolic as unrelated readings loses the fact that they were taken together.
 * Our storage units (tenths of a degree, grams) are converted here, at the boundary, so the
 * document carries the units a clinician reads rather than the ones our columns happen to hold.
 */
export function vitalsObservations(input: {
  subject: Reference;
  encounter?: Reference;
  effective?: string;
  vitals: VitalsInput;
}): FhirObservation[] {
  const out: FhirObservation[] = [];
  const { vitals } = input;

  if (vitals.systolic != null || vitals.diastolic != null) {
    out.push(
      compact({
        resourceType: 'Observation',
        id: newId(),
        meta: { profile: [`${NRCES}/Observation`] },
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        code: { coding: [{ system: LOINC, code: '85354-9', display: 'Blood pressure panel' }], text: 'Blood pressure' },
        subject: input.subject,
        encounter: input.encounter,
        effectiveDateTime: input.effective,
        component: [
          vitals.systolic != null
            ? { code: { coding: [{ system: LOINC, code: '8480-6', display: 'Systolic blood pressure' }] }, valueQuantity: { value: vitals.systolic, unit: 'mm[Hg]', system: UCUM, code: 'mm[Hg]' } }
            : undefined,
          vitals.diastolic != null
            ? { code: { coding: [{ system: LOINC, code: '8462-4', display: 'Diastolic blood pressure' }] }, valueQuantity: { value: vitals.diastolic, unit: 'mm[Hg]', system: UCUM, code: 'mm[Hg]' } }
            : undefined,
        ].filter(Boolean) as FhirObservation['component'],
      }) as FhirObservation,
    );
  }

  const values: Record<string, number | null | undefined> = {
    pulse: vitals.pulse,
    respRate: vitals.respRate,
    temperature: vitals.tempCTenths == null ? null : vitals.tempCTenths / 10,
    weight: vitals.weightG == null ? null : vitals.weightG / 1000,
    height: vitals.heightCm,
  };

  for (const vital of VITALS) {
    const value = values[vital.key];
    if (value == null) continue;
    out.push(
      compact({
        resourceType: 'Observation',
        id: newId(),
        meta: { profile: [`${NRCES}/Observation`] },
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        code: { coding: [{ system: LOINC, code: vital.loinc, display: vital.display }], text: vital.display },
        subject: input.subject,
        encounter: input.encounter,
        effectiveDateTime: input.effective,
        valueQuantity: compact({ value, unit: vital.unit, system: UCUM, code: vital.ucum }),
      }) as FhirObservation,
    );
  }
  return out;
}

export function diagnosticReportResource(input: {
  id: string;
  subject: Reference;
  encounter?: Reference;
  title: string;
  results: Reference[];
  issued?: string;
  performer?: Reference;
  attachmentUrl?: string | null;
}): FhirDiagnosticReport {
  return compact({
    resourceType: 'DiagnosticReport',
    id: input.id,
    meta: { profile: [`${NRCES}/DiagnosticReportLab`] },
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
    code: { text: input.title },
    subject: input.subject,
    encounter: input.encounter,
    issued: input.issued,
    performer: input.performer ? [input.performer] : undefined,
    result: input.results,
    // The uploaded report, when the lab attached one — the picture beside the numbers.
    presentedForm: input.attachmentUrl ? [{ url: input.attachmentUrl, title: input.title }] : undefined,
  }) as FhirDiagnosticReport;
}

export function immunizationResource(input: {
  id: string;
  patient: Reference;
  vaccineName: string;
  vaccineCode?: string | null;
  dateGiven: string;
  doseLabel?: string | null;
  notes?: string | null;
}): FhirImmunization {
  return compact({
    resourceType: 'Immunization',
    id: input.id,
    meta: { profile: [`${NRCES}/Immunization`] },
    status: 'completed',
    // Our catalogue code is ours, not a national vocabulary — so it travels as text.
    vaccineCode: { text: input.vaccineName },
    patient: input.patient,
    occurrenceDateTime: input.dateGiven,
    protocolApplied: input.doseLabel ? [{ doseNumberString: input.doseLabel }] : undefined,
    note: input.notes ? [{ text: input.notes }] : undefined,
  }) as FhirImmunization;
}

export function documentReferenceResource(input: {
  id: string;
  subject: Reference;
  title: string;
  contentType?: string | null;
  url: string;
  created?: string;
}): FhirDocumentReference {
  return compact({
    resourceType: 'DocumentReference',
    id: input.id,
    meta: { profile: [`${NRCES}/DocumentReference`] },
    status: 'current',
    docStatus: 'final',
    type: { coding: [{ system: SNOMED, code: '419891008', display: 'Record artifact' }], text: input.title },
    subject: input.subject,
    date: input.created,
    content: [{ attachment: compact({ contentType: input.contentType ?? undefined, url: input.url, title: input.title, creation: input.created }) }],
  }) as FhirDocumentReference;
}

/** Money is stored in paise; FHIR wants a decimal amount, so the conversion happens here. */
const rupees = (paise: number): number => Math.round(paise) / 100;

type PriceComponent = NonNullable<NonNullable<FhirInvoice['lineItem']>[number]['priceComponent']>[number];

export function invoiceResource(input: {
  id: string;
  subject: Reference;
  issuer?: Reference;
  date?: string;
  currency: string;
  status: string;
  lines: Array<{ description: string; amountPaise: number; taxPaise?: number }>;
  totalPaise: number;
  totalNetPaise?: number;
}): FhirInvoice {
  return compact({
    resourceType: 'Invoice',
    id: input.id,
    meta: { profile: [`${NRCES}/Invoice`] },
    status: input.status === 'paid' ? 'balanced' : input.status === 'void' ? 'cancelled' : 'issued',
    subject: input.subject,
    date: input.date,
    issuer: input.issuer,
    lineItem: input.lines.map((line, i) => {
      const priceComponent: PriceComponent[] = [
        { type: 'base', amount: { value: rupees(line.amountPaise), currency: input.currency } },
      ];
      // Tax is a separate component, not folded into the base — an invoice a patient can check.
      if (line.taxPaise) priceComponent.push({ type: 'tax', amount: { value: rupees(line.taxPaise), currency: input.currency } });
      return { sequence: i + 1, chargeItemCodeableConcept: { text: line.description }, priceComponent };
    }),
    totalGross: { value: rupees(input.totalPaise), currency: input.currency },
    totalNet: input.totalNetPaise != null ? { value: rupees(input.totalNetPaise), currency: input.currency } : undefined,
  }) as FhirInvoice;
}
