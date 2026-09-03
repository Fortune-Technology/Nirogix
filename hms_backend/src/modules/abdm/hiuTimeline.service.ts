import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  abdmHiuConsentRequests,
  abdmHiuConsents,
  abdmHiuRecords,
  type AbdmHiuRecord,
} from '../../db/schema';

/**
 * One patient's history from everywhere else, as a doctor reads it (ADR-094).
 *
 * A patient who has been to four hospitals has four sets of records that mean nothing separately —
 * a prescription from March is only useful beside the diagnosis from February. So this merges every
 * source into **one chronological timeline** rather than a tab per hospital, which is also what
 * ABDM's "longitudinal record" requirement asks for.
 *
 * Two rules govern it, and both are about restraint:
 *
 * - **A record whose consent is gone is never rendered**, and that is enforced by the query itself
 *   — joined through the consent and filtered on the **clock**, not on a status column and not on
 *   the sweep having run. Deleting the row is the sweep's job; making it invisible the moment the
 *   permission lapses is this file's, and neither depends on the other.
 * - **Nothing clinical is computed here.** An abnormal lab value is surfaced only when the source
 *   hospital's own FHIR says it is abnormal. Deciding that ourselves would be interpreting somebody
 *   else's investigation from a display layer, which is not a judgement this code is entitled to
 *   make. Everything below extracts and arranges; none of it concludes.
 *
 * Parsing is deliberately defensive: these bundles are written by other people's systems and may
 * legitimately carry shapes we have never seen. An unrecognised resource is skipped, never fatal —
 * losing one line of detail is recoverable, losing the whole record because of a missing field is
 * not.
 */

/** One thing that happened, from one hospital, on one date. */
export interface TimelineEntry {
  id: string;
  /** The clinical date, which is what the timeline sorts on. Null sorts last. */
  date: string | null;
  hiType: string;
  /** Which hospital it came from, so the doctor can weigh it. */
  sourceHipId: string | null;
  careContextReference: string | null;
  /** A short heading, e.g. "OP consultation" or "Complete Blood Count". */
  title: string;
  /** The hospital's own author/organisation, where the bundle names one. */
  author: string | null;
  /** Structured detail, ready to render without the UI parsing FHIR. */
  details: TimelineDetail[];
  /**
   * True only when the SOURCE flagged something abnormal — never our own inference.
   * Drives an attention marker in the UI, nothing more.
   */
  hasAbnormalFinding: boolean;
  receivedAt: string;
}

/** One labelled line inside an entry. `emphasis` is the source's flag, not our judgement. */
export interface TimelineDetail {
  group: string;
  label: string;
  value: string;
  emphasis?: 'abnormal';
}

type Json = Record<string, unknown>;
const asJson = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const asArray = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** FHIR says the same thing three ways; this reads whichever the source used. */
function codeText(node: unknown): string {
  const n = asJson(node);
  const direct = str(n.text);
  if (direct) return direct;
  for (const coding of asArray(n.coding)) {
    const display = str(coding.display) || str(coding.code);
    if (display) return display;
  }
  return '';
}

/** A human-readable value from whichever `value[x]` the source populated. */
function valueText(node: Json): string {
  const quantity = asJson(node.valueQuantity);
  if (Object.keys(quantity).length > 0) {
    const value = quantity.value ?? '';
    const unit = str(quantity.unit) || str(quantity.code);
    return `${String(value)}${unit ? ` ${unit}` : ''}`.trim();
  }
  const concept = codeText(node.valueCodeableConcept);
  if (concept) return concept;
  if (typeof node.valueString === 'string') return node.valueString;
  if (typeof node.valueBoolean === 'boolean') return node.valueBoolean ? 'Yes' : 'No';
  return '';
}

/**
 * Whether the SOURCE flagged this observation as outside its own reference range.
 *
 * FHIR's `interpretation` codes: H(igh), L(ow), A(bnormal), HH/LL (critical), and their spellings.
 * Read literally — we never compare a value against a range ourselves, because the range that
 * matters belongs to the laboratory that ran the test, not to us.
 */
function isAbnormal(observation: Json): boolean {
  for (const interpretation of asArray(observation.interpretation)) {
    for (const coding of asArray(asJson(interpretation).coding)) {
      const code = str(asJson(coding).code).toUpperCase();
      if (['H', 'L', 'A', 'AA', 'HH', 'LL', 'ABNORMAL', 'HIGH', 'LOW', 'CRITICAL'].includes(code))
        return true;
    }
    const text = str(asJson(interpretation).text).toLowerCase();
    if (/abnormal|high|low|critical|positive/.test(text)) return true;
  }
  return false;
}

/** Every resource in a bundle, whatever nesting the source used. */
function resources(bundle: Json): Json[] {
  return asArray(bundle.entry)
    .map((e) => asJson(asJson(e).resource))
    .filter((r) => Object.keys(r).length > 0);
}

const byType = (all: Json[], type: string): Json[] =>
  all.filter((r) => str(r.resourceType) === type);

/**
 * Turns one stored bundle into one timeline entry.
 *
 * Exported so a test can drive it with a bundle the database never held — the mapping is the part
 * worth pinning, and it should be assertable without a round trip.
 */
export function toTimelineEntry(record: AbdmHiuRecord): TimelineEntry {
  const bundle = asJson(record.content);
  const all = resources(bundle);
  const composition = byType(all, 'Composition')[0] ?? {};

  const details: TimelineDetail[] = [];
  let abnormal = false;

  // Conditions — the diagnoses, with whatever coding the source attached.
  for (const condition of byType(all, 'Condition')) {
    const text = codeText(condition.code);
    if (text) details.push({ group: 'Diagnoses', label: 'Diagnosis', value: text });
  }

  // Medications, from either shape a source may use.
  for (const medication of [
    ...byType(all, 'MedicationRequest'),
    ...byType(all, 'MedicationStatement'),
  ]) {
    const name = codeText(medication.medicationCodeableConcept);
    const instruction = asArray(medication.dosageInstruction)
      .map((d) => str(asJson(d).text))
      .filter(Boolean)
      .join('; ');
    if (name) {
      details.push({ group: 'Medicines', label: name, value: instruction || 'As directed' });
    }
  }

  // Observations — vitals and lab values alike. The source's abnormal flag rides along.
  for (const observation of byType(all, 'Observation')) {
    const label = codeText(observation.code);
    const value = valueText(observation);
    if (!label || !value) continue;
    const flagged = isAbnormal(observation);
    if (flagged) abnormal = true;
    details.push({
      group: 'Findings',
      label,
      value,
      ...(flagged ? { emphasis: 'abnormal' as const } : {}),
    });
  }

  // Diagnostic reports — the conclusion the laboratory itself drew.
  for (const report of byType(all, 'DiagnosticReport')) {
    const label = codeText(report.code) || 'Report';
    const conclusion = str(report.conclusion) || codeText(report.conclusionCode);
    if (conclusion) details.push({ group: 'Reports', label, value: conclusion });
  }

  for (const immunisation of byType(all, 'Immunization')) {
    const vaccine = codeText(immunisation.vaccineCode);
    if (vaccine) {
      details.push({
        group: 'Immunisations',
        label: vaccine,
        value: str(immunisation.occurrenceDateTime) || 'Given',
      });
    }
  }

  // Procedures and allergies are surfaced when present; both change what a doctor prescribes.
  for (const procedure of byType(all, 'Procedure')) {
    const text = codeText(procedure.code);
    if (text) details.push({ group: 'Procedures', label: 'Procedure', value: text });
  }
  for (const allergy of byType(all, 'AllergyIntolerance')) {
    const text = codeText(allergy.code);
    // Always emphasised: an allergy is the one line whose being missed causes direct harm.
    if (text)
      details.push({ group: 'Allergies', label: 'Allergy', value: text, emphasis: 'abnormal' });
  }

  const organisation = byType(all, 'Organization')[0];
  const practitioner = byType(all, 'Practitioner')[0];

  return {
    id: record.id,
    date: record.recordDate?.toISOString() ?? str(composition.date) ?? null,
    hiType: record.hiType,
    sourceHipId: record.sourceHipId,
    careContextReference: record.careContextReference,
    title: codeText(composition.type) || str(composition.title) || readableType(record.hiType),
    author: practitionerName(practitioner) || str(asJson(organisation).name) || null,
    details,
    hasAbnormalFinding: abnormal,
    receivedAt: record.receivedAt.toISOString(),
  };
}

function practitionerName(practitioner?: Json): string {
  if (!practitioner) return '';
  const name = asArray(practitioner.name)[0];
  if (!name) return '';
  const text = str(asJson(name).text);
  if (text) return text;
  const given = asArray(asJson(name).given).join(' ');
  return [given, str(asJson(name).family)].filter(Boolean).join(' ');
}

/** ABDM's identifiers are not sentences; this is what a human reads when the bundle has no title. */
function readableType(hiType: string): string {
  const labels: Record<string, string> = {
    OPConsultation: 'OP consultation',
    Prescription: 'Prescription',
    DiagnosticReport: 'Diagnostic report',
    DischargeSummary: 'Discharge summary',
    ImmunizationRecord: 'Immunisation record',
    HealthDocumentRecord: 'Health document',
    WellnessRecord: 'Wellness record',
  };
  return labels[hiType] ?? hiType;
}

export interface TimelineOptions {
  hiTypes?: string[];
  sourceHipId?: string;
  now?: Date;
}

/**
 * The patient's external history, newest first, merged across every hospital.
 *
 * The consent join is the security boundary, not a convenience: a record is returned only while a
 * **granted, unexpired** consent still covers it. Expiry is measured against the clock passed in, so
 * a record becomes invisible the instant its permission lapses — before the sweep runs, and whether
 * or not the revocation callback ever arrived.
 */
export async function patientTimeline(
  tenantId: string,
  patientId: string,
  options: TimelineOptions = {},
): Promise<TimelineEntry[]> {
  const now = options.now ?? new Date();

  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ record: abdmHiuRecords })
      .from(abdmHiuRecords)
      .innerJoin(abdmHiuConsents, eq(abdmHiuConsents.id, abdmHiuRecords.consentId))
      .innerJoin(abdmHiuConsentRequests, eq(abdmHiuConsentRequests.id, abdmHiuConsents.requestId))
      .where(
        and(
          eq(abdmHiuRecords.tenantId, tenantId),
          eq(abdmHiuRecords.patientId, patientId),
          // The record must belong to this patient's own request, not merely to this tenant.
          eq(abdmHiuConsentRequests.patientId, patientId),
          eq(abdmHiuConsents.status, 'granted'),
          // Measured against the clock, so a lapsed permission hides its records immediately.
          or(isNull(abdmHiuConsents.dataEraseAt), gt(abdmHiuConsents.dataEraseAt, now)),
        ),
      )
      .orderBy(desc(abdmHiuRecords.recordDate)),
  );

  let entries = rows.map((r) => toTimelineEntry(r.record));
  if (options.hiTypes?.length) entries = entries.filter((e) => options.hiTypes!.includes(e.hiType));
  if (options.sourceHipId) entries = entries.filter((e) => e.sourceHipId === options.sourceHipId);

  // Undated records sort last rather than being dropped: a record without a usable date is still a
  // record, and hiding it would be a silent omission from a clinical history.
  return entries.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return b.receivedAt.localeCompare(a.receivedAt);
  });
}

/**
 * What the doctor is shown above the timeline.
 *
 * Counts and provenance only. It deliberately does **not** summarise the clinical content: an
 * automatically generated "key findings" line would be a clinical claim this code has no standing to
 * make, and one wrong summary read in a hurry is worse than no summary at all. It says how much
 * there is, where it came from, and whether anything is flagged — the doctor reads the rest.
 */
export async function timelineSummary(
  tenantId: string,
  patientId: string,
  options: TimelineOptions = {},
): Promise<{
  total: number;
  sources: string[];
  byType: Record<string, number>;
  abnormalCount: number;
  earliest: string | null;
  latest: string | null;
}> {
  const entries = await patientTimeline(tenantId, patientId, options);
  const dated = entries.filter((e) => e.date).map((e) => e.date!);
  const byType: Record<string, number> = {};
  for (const entry of entries) byType[entry.hiType] = (byType[entry.hiType] ?? 0) + 1;

  return {
    total: entries.length,
    sources: [...new Set(entries.map((e) => e.sourceHipId).filter((h): h is string => Boolean(h)))],
    byType,
    abnormalCount: entries.filter((e) => e.hasAbnormalFinding).length,
    earliest: dated.length ? dated[dated.length - 1]! : null,
    latest: dated.length ? dated[0]! : null,
  };
}
