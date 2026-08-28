import { and, desc, eq, inArray } from 'drizzle-orm';
import { runWithTenant } from '../../../db/tenantContext';
import {
  abdmFacilityConfig,
  diagnoses,
  encounters,
  invoiceLineItems,
  invoices,
  labOrders,
  labResults,
  labTests,
  organizationProfile,
  patientImmunizations,
  patients,
  prescriptions,
  providers,
  visits,
} from '../../../db/schema';
import { AppError } from '../../../http/error';
import type { HiType } from '../careContext.service';
import {
  NRCES,
  compact,
  conditionResource,
  diagnosticReportResource,
  documentReferenceResource,
  encounterResource,
  immunizationResource,
  invoiceResource,
  labObservationResource,
  medicationRequestResource,
  newId,
  organizationResource,
  patientResource,
  practitionerResource,
  ref,
  urn,
  vitalsObservations,
} from './resources';
import type { FhirBundle, FhirBundleEntry, FhirComposition, FhirResource, Reference } from './types';

/**
 * Health records as ABDM document bundles (ADR-088).
 *
 * **Structured, not attachment-wrapped.** NHA accepts either a simple bundle carrying a PDF or a
 * structured bundle carrying coded data, and the usual advice is that the first is quicker. It is
 * not quicker *here*: this product renders documents in the browser (ADR-047) and stores no PDFs,
 * so a "simple" bundle would mean adding a headless-browser pipeline to manufacture an attachment —
 * while the data is already partly coded (ICD-10 on diagnoses, LOINC where the test master knows
 * it, discrete vitals). Structured is both less work and the format NHA expects everyone to reach
 * within a couple of years, so we start there and skip the detour.
 *
 * Every bundle is a FHIR **document**: `Bundle.type = "document"`, first entry a `Composition`, and
 * every other entry referenced from it. ABDM rejects a bundle whose Composition is not first, which
 * is why entries are assembled through `Doc` rather than pushed ad hoc.
 */

/** The HI types this hospital can produce, with the codes ABDM's documentation specifies. */
export const HI_TYPE_META: Record<HiType, { snomed?: string; display: string; profile: string; title: string }> = {
  Prescription: { snomed: '440545006', display: 'Prescription record', profile: 'PrescriptionRecord', title: 'Prescription' },
  DiagnosticReport: { snomed: '721981007', display: 'Diagnostic studies report', profile: 'DiagnosticReportRecord', title: 'Diagnostic report' },
  OPConsultation: { snomed: '371530004', display: 'Clinical consultation report', profile: 'OPConsultRecord', title: 'OP consultation' },
  ImmunizationRecord: { snomed: '41000179103', display: 'Immunization record', profile: 'ImmunizationRecord', title: 'Immunisation record' },
  HealthDocumentRecord: { snomed: '419891008', display: 'Record artifact', profile: 'HealthDocumentRecord', title: 'Health document' },
  // ABDM lists no SNOMED code for these two: the wellness type must match the exact text, and the
  // billing type is identified by name. Inventing a code for either would be a fabrication.
  WellnessRecord: { display: 'Wellness record', profile: 'WellnessRecord', title: 'Wellness record' },
  Invoice: { display: 'Invoice', profile: 'InvoiceRecord', title: 'Invoice' },
};

/**
 * Accumulates a document: resources in, entries and references out.
 *
 * Exists so the Composition can be written last (it references everything) but placed first (as the
 * format demands), without any caller having to remember either rule.
 */
class Doc {
  private readonly entries: FhirBundleEntry[] = [];

  add<T extends FhirResource>(resource: T): Reference {
    this.entries.push({ fullUrl: urn(resource.id), resource });
    return ref(resource.id);
  }

  addAll<T extends FhirResource>(resources: T[]): Reference[] {
    return resources.map((r) => this.add(r));
  }

  /** Seals the document: Composition first, everything else in the order it was added. */
  finish(composition: FhirComposition): FhirBundle {
    const now = new Date().toISOString();
    return {
      resourceType: 'Bundle',
      id: newId(),
      meta: { lastUpdated: now, profile: [`${NRCES}/DocumentBundle`] },
      identifier: { system: 'https://nirogix.com/abdm/bundle', value: newId() },
      type: 'document',
      timestamp: now,
      entry: [{ fullUrl: urn(composition.id), resource: composition }, ...this.entries],
    };
  }
}

/** Everything one visit holds, read once so each composer can pick what it needs. */
type ClinicalContext = Awaited<ReturnType<typeof loadContext>>;

async function loadContext(tenantId: string, visitId: string) {
  return runWithTenant(tenantId, async (tx) => {
    const visitRow = (
      await tx.select().from(visits).where(and(eq(visits.tenantId, tenantId), eq(visits.id, visitId))).limit(1)
    )[0];
    if (!visitRow) throw new AppError(404, 'ABDM_VISIT_NOT_FOUND', 'The visit for this care context no longer exists');

    const [patientRow] = await tx.select().from(patients).where(eq(patients.id, visitRow.patientId)).limit(1);
    const [org] = await tx.select().from(organizationProfile).where(eq(organizationProfile.tenantId, tenantId)).limit(1);
    const [facility] = await tx.select().from(abdmFacilityConfig).where(eq(abdmFacilityConfig.tenantId, tenantId)).limit(1);
    const [encounterRow] = await tx
      .select()
      .from(encounters)
      .where(and(eq(encounters.tenantId, tenantId), eq(encounters.visitId, visitId)))
      .orderBy(desc(encounters.createdAt))
      .limit(1);

    const providerRow = visitRow.providerId
      ? (await tx.select().from(providers).where(eq(providers.id, visitRow.providerId)).limit(1))[0]
      : undefined;

    const diagnosisRows = encounterRow
      ? await tx.select().from(diagnoses).where(eq(diagnoses.encounterId, encounterRow.id))
      : [];
    const prescriptionRows = await tx
      .select()
      .from(prescriptions)
      .where(and(eq(prescriptions.tenantId, tenantId), eq(prescriptions.visitId, visitId)));

    const orderRows = await tx
      .select()
      .from(labOrders)
      .where(and(eq(labOrders.tenantId, tenantId), eq(labOrders.visitId, visitId)));
    const resultRows = orderRows.length
      ? await tx
          .select()
          .from(labResults)
          .where(inArray(labResults.labOrderId, orderRows.map((o) => o.id)))
      : [];
    const testRows = resultRows.length
      ? await tx
          .select()
          .from(labTests)
          .where(inArray(labTests.id, resultRows.map((r) => r.testId).filter((id): id is string => Boolean(id))))
      : [];

    const [invoiceRow] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.visitId, visitId)))
      .limit(1);
    const lineRows = invoiceRow
      ? await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceRow.id))
      : [];

    const immunizationRows = await tx
      .select()
      .from(patientImmunizations)
      .where(and(eq(patientImmunizations.tenantId, tenantId), eq(patientImmunizations.patientId, visitRow.patientId)));

    return {
      visit: visitRow,
      patient: patientRow!,
      org,
      facility,
      encounter: encounterRow,
      provider: providerRow,
      diagnoses: diagnosisRows,
      prescriptions: prescriptionRows,
      labOrders: orderRows,
      labResults: resultRows,
      labTests: testRows,
      invoice: invoiceRow,
      invoiceLines: lineRows,
      immunizations: immunizationRows,
    };
  });
}

/** The three resources every document carries: who it is about, who wrote it, who holds it. */
function subjects(doc: Doc, ctx: ClinicalContext) {
  const patient = doc.add(
    patientResource({
      id: newId(),
      firstName: ctx.patient.firstName,
      lastName: ctx.patient.lastName,
      gender: ctx.patient.gender,
      dateOfBirth: ctx.patient.dateOfBirth,
      phone: ctx.patient.phone,
      email: ctx.patient.email,
      abhaAddress: ctx.patient.abhaAddress,
      abhaNumber: ctx.patient.abhaNumber,
      uhid: ctx.patient.uhid,
      addressLine: ctx.patient.addressLine,
      city: ctx.patient.city,
      state: ctx.patient.state,
      pincode: ctx.patient.pincode,
    }),
  );

  const organization = doc.add(
    organizationResource({
      id: newId(),
      name: ctx.org?.displayName ?? ctx.org?.legalName ?? 'Hospital',
      hipId: ctx.facility?.hipId,
      phone: ctx.org?.phone,
      email: ctx.org?.email,
      city: ctx.org?.city,
      state: ctx.org?.state,
      postalCode: ctx.org?.postalCode,
    }),
  );

  // A document with no named author is not a clinical record anyone can rely on, so the hospital
  // itself authors it when no individual practitioner is recorded on the visit.
  const practitioner = ctx.provider
    ? doc.add(
        practitionerResource({
          id: newId(),
          fullName: ctx.provider.fullName,
          registrationNumber: ctx.provider.registrationNumber,
          qualification: ctx.provider.qualification,
        }),
      )
    : undefined;

  const encounter = doc.add(
    encounterResource({
      id: newId(),
      subject: patient,
      start: ctx.visit.visitDate ? new Date(`${ctx.visit.visitDate}T00:00:00Z`).toISOString() : undefined,
      end: ctx.encounter?.signedAt?.toISOString(),
      finished: ctx.visit.status === 'completed' || Boolean(ctx.encounter?.signedAt),
    }),
  );

  return { patient, organization, practitioner, encounter, author: practitioner ?? organization };
}

function composition(input: {
  hiType: HiType;
  subject: Reference;
  encounter: Reference;
  author: Reference;
  custodian: Reference;
  date: string;
  sections: FhirComposition['section'];
}): FhirComposition {
  const meta = HI_TYPE_META[input.hiType];
  return compact({
    resourceType: 'Composition',
    id: newId(),
    meta: { profile: [`${NRCES}/${meta.profile}`] },
    identifier: { system: 'https://nirogix.com/abdm/composition', value: newId() },
    status: 'final',
    type: compact({
      coding: meta.snomed ? [{ system: 'http://snomed.info/sct', code: meta.snomed, display: meta.display }] : undefined,
      // The wellness type must match this text exactly — ABDM matches on it in the absence of a code.
      text: meta.display,
    }),
    subject: input.subject,
    encounter: input.encounter,
    date: input.date,
    author: [input.author],
    title: meta.title,
    custodian: input.custodian,
    section: input.sections,
  }) as FhirComposition;
}

/**
 * Builds the document bundle for one care context and one HI type.
 *
 * Refuses rather than emits an empty document: a bundle with a Composition and no content is a
 * clinical record that says nothing, and pushing one to a patient's PHR app is worse than telling
 * the caller there was nothing to send.
 */
export async function buildDocumentBundle(
  tenantId: string,
  input: { visitId: string; hiType: HiType },
): Promise<FhirBundle> {
  const ctx = await loadContext(tenantId, input.visitId);
  const doc = new Doc();
  const { patient, organization, practitioner, encounter, author } = subjects(doc, ctx);
  const date = (ctx.encounter?.signedAt ?? ctx.visit.createdAt ?? new Date()).toISOString();

  const sections = buildSections(input.hiType, doc, ctx, { patient, encounter, practitioner });
  if (!sections || sections.every((s) => (s.entry ?? []).length === 0)) {
    throw new AppError(422, 'ABDM_NOTHING_TO_SHARE', `This visit has no ${HI_TYPE_META[input.hiType].title} to share`);
  }

  return doc.finish(
    composition({
      hiType: input.hiType,
      subject: patient,
      encounter,
      author,
      custodian: organization,
      date,
      sections,
    }),
  );
}

function buildSections(
  hiType: HiType,
  doc: Doc,
  ctx: ClinicalContext,
  refs: { patient: Reference; encounter: Reference; practitioner?: Reference },
): FhirComposition['section'] {
  switch (hiType) {
    case 'Prescription':
      return [
        {
          title: 'Medications',
          code: { coding: [{ system: 'http://snomed.info/sct', code: '440545006', display: 'Prescription record' }] },
          entry: doc.addAll(medicationResources(ctx, refs)),
        },
      ];

    case 'OPConsultation': {
      // A consultation is the one document that carries several kinds of content at once, which is
      // exactly why ABDM models it as a Composition with sections rather than a flat list.
      const out: NonNullable<FhirComposition['section']> = [];
      const chief = ctx.encounter?.chiefComplaint;
      if (chief) out.push({ title: 'Chief complaints', code: { text: chief } });

      const conditions = ctx.diagnoses.map((d) =>
        conditionResource({
          id: newId(),
          subject: refs.patient,
          encounter: refs.encounter,
          icd10Code: d.icd10Code,
          icd10Term: d.icd10Term,
          recordedDate: d.createdAt?.toISOString(),
          notes: d.notes,
        }),
      );
      if (conditions.length) out.push({ title: 'Diagnoses', entry: doc.addAll(conditions) });

      const vitals = vitalsFor(ctx, refs);
      if (vitals.length) out.push({ title: 'Vital signs', entry: doc.addAll(vitals) });

      const meds = medicationResources(ctx, refs);
      if (meds.length) out.push({ title: 'Medications', entry: doc.addAll(meds) });

      const reports = diagnosticResources(doc, ctx, refs);
      if (reports.length) out.push({ title: 'Investigations', entry: reports });
      return out;
    }

    case 'DiagnosticReport': {
      const reports = diagnosticResources(doc, ctx, refs);
      return [{ title: 'Diagnostic reports', entry: reports }];
    }

    case 'ImmunizationRecord':
      return [
        {
          title: 'Immunisations',
          entry: doc.addAll(
            ctx.immunizations.map((i) =>
              immunizationResource({
                id: newId(),
                patient: refs.patient,
                vaccineName: i.vaccineName,
                vaccineCode: i.vaccineCode,
                dateGiven: i.dateGiven,
                doseLabel: i.doseLabel,
              }),
            ),
          ),
        },
      ];

    case 'WellnessRecord': {
      // Built from the vitals a consultation records. Honest about what it is: this product has no
      // standalone wellness capture, so a wellness record IS the measured vitals, nothing more.
      const vitals = vitalsFor(ctx, refs);
      return [{ title: 'Vital signs', entry: doc.addAll(vitals) }];
    }

    case 'Invoice': {
      if (!ctx.invoice) return [];
      const invoice = invoiceResource({
        id: newId(),
        subject: refs.patient,
        date: ctx.invoice.createdAt?.toISOString(),
        currency: ctx.invoice.currency,
        status: ctx.invoice.status,
        // The STORED line total, never a recomputation from unit price × quantity: the invoice the
        // patient settled is the authority, and any rounding or adjustment the billing service
        // applied has to survive into the record they can read back.
        lines: ctx.invoiceLines.map((l) => ({
          description: l.description,
          amountPaise: Number(l.lineTotalPaise ?? 0),
        })),
        totalPaise: Number(ctx.invoice.totalPaise ?? 0),
      });
      return [{ title: 'Invoice', entry: [doc.add(invoice)] }];
    }

    case 'HealthDocumentRecord': {
      // Only the report files a lab actually attached. We never fabricate a document to fill a type.
      const attachments = ctx.labResults
        .filter((r) => r.fileId)
        .map((r) =>
          documentReferenceResource({
            id: newId(),
            subject: refs.patient,
            title: testNameFor(ctx, r.testId) ?? 'Report',
            url: `/api/v1/files/${r.fileId}`,
            created: r.resultedAt?.toISOString(),
          }),
        );
      return [{ title: 'Documents', entry: doc.addAll(attachments) }];
    }
  }
}

function medicationResources(ctx: ClinicalContext, refs: { patient: Reference; encounter: Reference; practitioner?: Reference }) {
  return ctx.prescriptions.map((p) =>
    medicationRequestResource({
      id: newId(),
      subject: refs.patient,
      encounter: refs.encounter,
      requester: refs.practitioner,
      drugName: p.drugName,
      dose: p.dose,
      frequency: p.frequency,
      duration: p.duration,
      route: p.route,
      authoredOn: p.createdAt?.toISOString(),
    }),
  );
}

function vitalsFor(ctx: ClinicalContext, refs: { patient: Reference; encounter: Reference }) {
  if (!ctx.encounter) return [];
  return vitalsObservations({
    subject: refs.patient,
    encounter: refs.encounter,
    effective: (ctx.encounter.signedAt ?? ctx.encounter.createdAt)?.toISOString(),
    vitals: {
      systolic: ctx.encounter.vitalSystolic,
      diastolic: ctx.encounter.vitalDiastolic,
      pulse: ctx.encounter.vitalPulse,
      respRate: ctx.encounter.vitalRespRate,
      tempCTenths: ctx.encounter.vitalTempCTenths,
      weightG: ctx.encounter.vitalWeightG,
      heightCm: ctx.encounter.vitalHeightCm,
    },
  });
}

const testNameFor = (ctx: ClinicalContext, testId: string | null): string | undefined =>
  ctx.labTests.find((t) => t.id === testId)?.name;

/**
 * Lab results as Observations grouped under one DiagnosticReport per order.
 *
 * **Only verified results travel.** An unverified result is a working note, not a finding, and
 * publishing one to a national network invites a clinical decision on a number nobody has signed
 * off (the same rule the care-context subscriber applies at the other end).
 */
function diagnosticResources(
  doc: Doc,
  ctx: ClinicalContext,
  refs: { patient: Reference; encounter: Reference; practitioner?: Reference },
): Reference[] {
  const out: Reference[] = [];
  for (const order of ctx.labOrders) {
    const results = ctx.labResults.filter((r) => r.labOrderId === order.id && r.verifiedAt);
    if (results.length === 0) continue;

    const observations = doc.addAll(
      results.map((r) => {
        const test = ctx.labTests.find((t) => t.id === r.testId);
        return labObservationResource({
          id: newId(),
          subject: refs.patient,
          encounter: refs.encounter,
          testName: test?.name ?? 'Laboratory test',
          loincCode: test?.code,
          value: r.value,
          unit: r.unit ?? test?.unit,
          refLow: r.refLow ?? test?.refLow,
          refHigh: r.refHigh ?? test?.refHigh,
          flag: r.flag,
          effective: r.resultedAt?.toISOString(),
          notes: r.notes,
        });
      }),
    );

    const withFile = results.find((r) => r.fileId);
    out.push(
      doc.add(
        diagnosticReportResource({
          id: newId(),
          subject: refs.patient,
          encounter: refs.encounter,
          title: 'Laboratory report',
          results: observations,
          issued: results[0]?.verifiedAt?.toISOString(),
          performer: refs.practitioner,
          attachmentUrl: withFile ? `/api/v1/files/${withFile.fileId}` : undefined,
        }),
      ),
    );
  }
  return out;
}
