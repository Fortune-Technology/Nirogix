/**
 * The slice of FHIR R4 this hospital actually emits (ADR-088).
 *
 * Hand-written rather than pulled from a package, deliberately. A full R4 type set is thousands of
 * optional fields describing resources we will never produce, and every one of them is a way to
 * write something ABDM does not expect. These types describe exactly the shapes in our bundles, so
 * the compiler enforces the subset instead of merely permitting it.
 *
 * The authority is NRCES (https://nrces.in/ndhm/fhir/r4/), not the base FHIR spec: ABDM validates
 * against their profiles, and `meta.profile` on every resource is what declares which one applies.
 */

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Reference {
  reference: string;
  display?: string;
}

export interface Identifier {
  type?: CodeableConcept;
  system?: string;
  value?: string;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface Quantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
}

/** Every resource we emit carries an id and the NRCES profile it claims to satisfy. */
export interface FhirResourceBase {
  resourceType: string;
  id: string;
  meta?: { profile?: string[]; lastUpdated?: string };
  text?: { status: 'generated' | 'extensions' | 'additional' | 'empty'; div: string };
}

export interface FhirPatient extends FhirResourceBase {
  resourceType: 'Patient';
  identifier?: Identifier[];
  name?: Array<{ text?: string; given?: string[]; family?: string }>;
  telecom?: Array<{ system: 'phone' | 'email'; value: string; use?: string }>;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  address?: Array<{ text?: string; line?: string[]; city?: string; state?: string; postalCode?: string; country?: string }>;
}

export interface FhirPractitioner extends FhirResourceBase {
  resourceType: 'Practitioner';
  identifier?: Identifier[];
  name?: Array<{ text?: string }>;
  qualification?: Array<{ code: CodeableConcept }>;
}

export interface FhirOrganization extends FhirResourceBase {
  resourceType: 'Organization';
  identifier?: Identifier[];
  name?: string;
  telecom?: Array<{ system: 'phone' | 'email' | 'url'; value: string }>;
  address?: Array<{ text?: string; city?: string; state?: string; postalCode?: string; country?: string }>;
}

export interface FhirEncounter extends FhirResourceBase {
  resourceType: 'Encounter';
  status: 'planned' | 'in-progress' | 'finished' | 'cancelled';
  class: Coding;
  subject: Reference;
  period?: Period;
}

export interface FhirCondition extends FhirResourceBase {
  resourceType: 'Condition';
  clinicalStatus?: CodeableConcept;
  code?: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  recordedDate?: string;
  note?: Array<{ text: string }>;
}

export interface FhirMedicationRequest extends FhirResourceBase {
  resourceType: 'MedicationRequest';
  status: 'active' | 'completed' | 'stopped';
  intent: 'order';
  medicationCodeableConcept: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  authoredOn?: string;
  requester?: Reference;
  dosageInstruction?: Array<{
    text?: string;
    timing?: { code?: CodeableConcept; repeat?: { boundsDuration?: Quantity } };
    route?: CodeableConcept;
  }>;
}

export interface FhirObservation extends FhirResourceBase {
  resourceType: 'Observation';
  status: 'final' | 'preliminary' | 'amended';
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  effectiveDateTime?: string;
  valueQuantity?: Quantity;
  valueString?: string;
  interpretation?: CodeableConcept[];
  referenceRange?: Array<{ low?: Quantity; high?: Quantity; text?: string }>;
  note?: Array<{ text: string }>;
  component?: Array<{ code: CodeableConcept; valueQuantity?: Quantity }>;
}

export interface FhirDiagnosticReport extends FhirResourceBase {
  resourceType: 'DiagnosticReport';
  status: 'final' | 'partial' | 'registered';
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  issued?: string;
  performer?: Reference[];
  result?: Reference[];
  conclusion?: string;
  presentedForm?: Array<{ contentType?: string; url?: string; title?: string }>;
}

export interface FhirImmunization extends FhirResourceBase {
  resourceType: 'Immunization';
  status: 'completed' | 'entered-in-error' | 'not-done';
  vaccineCode: CodeableConcept;
  patient: Reference;
  occurrenceDateTime?: string;
  protocolApplied?: Array<{ doseNumberString?: string }>;
  note?: Array<{ text: string }>;
}

export interface FhirDocumentReference extends FhirResourceBase {
  resourceType: 'DocumentReference';
  status: 'current';
  docStatus?: 'final';
  type?: CodeableConcept;
  subject: Reference;
  date?: string;
  content: Array<{ attachment: { contentType?: string; url?: string; title?: string; creation?: string } }>;
}

export interface FhirInvoice extends FhirResourceBase {
  resourceType: 'Invoice';
  status: 'issued' | 'balanced' | 'draft' | 'cancelled';
  subject: Reference;
  date?: string;
  issuer?: Reference;
  lineItem?: Array<{
    sequence: number;
    chargeItemCodeableConcept: CodeableConcept;
    priceComponent?: Array<{ type: 'base' | 'tax'; amount?: { value: number; currency: string } }>;
  }>;
  totalGross?: { value: number; currency: string };
  totalNet?: { value: number; currency: string };
}

export interface FhirCompositionSection {
  title: string;
  code?: CodeableConcept;
  entry?: Reference[];
}

export interface FhirComposition extends FhirResourceBase {
  resourceType: 'Composition';
  identifier?: Identifier;
  status: 'final';
  type: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  date: string;
  author: Reference[];
  title: string;
  custodian?: Reference;
  section?: FhirCompositionSection[];
}

export type FhirResource =
  | FhirPatient
  | FhirPractitioner
  | FhirOrganization
  | FhirEncounter
  | FhirCondition
  | FhirMedicationRequest
  | FhirObservation
  | FhirDiagnosticReport
  | FhirImmunization
  | FhirDocumentReference
  | FhirInvoice
  | FhirComposition;

export interface FhirBundleEntry {
  fullUrl: string;
  resource: FhirResource;
}

export interface FhirBundle {
  resourceType: 'Bundle';
  id: string;
  meta: { versionId?: string; lastUpdated: string; profile: string[] };
  identifier: Identifier;
  type: 'document';
  timestamp: string;
  entry: FhirBundleEntry[];
}
