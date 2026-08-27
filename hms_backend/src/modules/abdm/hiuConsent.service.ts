import { and, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { db } from '../../db/client';
import {
  abdmHiuConsentRequests,
  abdmHiuConsents,
  abdmHiuRecords,
  patients,
  providers,
  type AbdmHiuConsent,
  type AbdmHiuConsentRequest,
} from '../../db/schema';
import { AppError } from '../../http/error';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { writeAudit } from '../audit/audit.service';
import { HIU_CONSENT_PATHS, HIU_CALLBACK_PATHS } from './abdm.constants';
import { hipPost } from './hipGateway';
import { getFacilityConfig } from './abdm.service';

/**
 * Asking a patient to let us read their history elsewhere (ADR-092).
 *
 * The mirror of M2, and the obligations run the opposite way. M2 governs what we may **disclose**;
 * this governs what we must **destroy**. Everything below follows from that:
 *
 * - **A consent that is not `granted` yields nothing, ever.** Expiry is checked against the clock at
 *   the moment of reading, not against a status column somebody remembered to update. A missed
 *   callback must not become a licence to keep reading.
 * - **Revocation and expiry delete the records themselves**, not a flag on them. The certification
 *   test checks the data is gone, and a hidden row is not gone.
 * - **The audit trail survives the deletion** and holds metadata only. Proving we destroyed
 *   something must not require keeping it.
 * - **One request fans out into many consents**, one per hospital holding records. They are tracked
 *   individually because they expire and are revoked individually.
 *
 * Nothing here fetches a record — that is slice 2. This is the permission layer, and it is built
 * first so the purge exists before there is anything to purge.
 */

/** The record types a doctor-initiated history pull asks for. All seven ABDM defines. */
export const HIU_HI_TYPES = [
  'OPConsultation',
  'Prescription',
  'DiagnosticReport',
  'DischargeSummary',
  'ImmunizationRecord',
  'HealthDocumentRecord',
  'WellnessRecord',
] as const;

/**
 * Care Management — the purpose code for a doctor reading a patient's history to treat them.
 *
 * The only code we send, deliberately (ADR-092). `PATRQT` belongs to a patient-initiated pull, which
 * has no screen yet; `DSRCH` (research) would need an ethics and governance framework this product
 * does not have, and offering a purpose we cannot govern is a liability rather than a feature.
 */
const PURPOSE_CODE = 'CAREMGT';
const PURPOSE_TEXT = 'Care Management';

/** How long we keep a pulled history before destroying it, unless the patient sets it shorter. */
const DEFAULT_ERASE_AFTER_DAYS = 30;

export type RequestHistoryInput = {
  patientId: string;
  /** The doctor asking. Their name and registration number reach the patient's app. */
  providerId: string;
  hiTypes?: string[];
  from?: Date;
  to?: Date;
  dataEraseAt?: Date;
};

/**
 * Asks the patient, through their consent manager, for permission to read their history.
 *
 * Returns as soon as ABDM acknowledges. The request id itself arrives later on `on-init`, which is
 * why the row exists in a `pending` state first — a request we have sent but cannot yet name is a
 * real state, and pretending otherwise would mean losing the request if the callback is slow.
 */
export async function requestPatientHistory(
  tenantId: string,
  actorUserId: string | null,
  input: RequestHistoryInput,
): Promise<AbdmHiuConsentRequest> {
  const patient = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'No such patient');

  // A hand-typed ABHA was never proved to belong to this person. Asking a national consent manager
  // to act on it would put somebody else's history in front of this doctor.
  if (!patient.abhaAddress || !patient.abhaVerifiedAt) {
    throw new AppError(
      422,
      'ABDM_ABHA_NOT_VERIFIED',
      'This patient has no verified ABHA address, so their history cannot be requested',
    );
  }

  const provider = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(providers)
      .where(and(eq(providers.tenantId, tenantId), eq(providers.id, input.providerId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!provider) throw new AppError(404, 'PROVIDER_NOT_FOUND', 'No such doctor');

  // The registration number is what the PATIENT reads when deciding whether to grant. Sending a
  // request without it asks somebody to trust an anonymous clinician, so it is refused here rather
  // than defaulted to something meaningless.
  if (!provider.registrationNumber?.trim()) {
    throw new AppError(
      422,
      'ABDM_REGISTRATION_NUMBER_REQUIRED',
      'Add this doctor’s medical registration number before requesting a patient’s history — the patient sees it when deciding whether to consent',
    );
  }

  const hiTypes = input.hiTypes?.length ? input.hiTypes : [...HIU_HI_TYPES];
  const to = input.to ?? new Date();
  const from = input.from ?? new Date(Date.UTC(to.getUTCFullYear() - 5, to.getUTCMonth(), to.getUTCDate()));
  const dataEraseAt = input.dataEraseAt ?? new Date(Date.now() + DEFAULT_ERASE_AFTER_DAYS * 86400_000);

  const saved = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(abdmHiuConsentRequests)
      .values({
        tenantId,
        patientId: patient.id,
        abhaAddress: patient.abhaAddress!,
        requesterProviderId: provider.id,
        requesterName: provider.fullName,
        requesterRegistrationNumber: provider.registrationNumber!.trim(),
        hiTypes,
        purposeCode: PURPOSE_CODE,
        dateRangeFrom: from,
        dateRangeTo: to,
        dataEraseAt,
      })
      .returning();
    return rows[0]!;
  });

  const facility = await getFacilityConfig(tenantId);
  try {
    await hipPost(
      HIU_CONSENT_PATHS.requestInit,
      {
        consent: {
          purpose: { text: PURPOSE_TEXT, code: PURPOSE_CODE },
          patient: { id: patient.abhaAddress },
          hiu: { id: facility?.hipId },
          requester: {
            name: provider.fullName,
            identifier: {
              type: 'REGNO',
              value: provider.registrationNumber!.trim(),
              system: 'https://www.nmc.org.in',
            },
          },
          hiTypes,
          permission: {
            accessMode: 'VIEW',
            dateRange: { from: from.toISOString(), to: to.toISOString() },
            dataEraseAt: dataEraseAt.toISOString(),
            // A single pull. A standing permission to re-read somebody's history is a much larger
            // ask than one consultation needs, so it is not requested by default.
            frequency: { unit: 'HOUR', value: 1, repeats: 0 },
          },
        },
      },
      { hipId: facility?.hipId },
    );
    await setRequestStatus(tenantId, saved.id, 'requested');
  } catch (err) {
    await setRequestStatus(tenantId, saved.id, 'failed', (err as Error).message);
    throw err;
  }

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'abdm.hiu.consent_requested',
    resourceType: 'patient',
    resourceId: patient.id,
    severity: 'notice',
    // Which record types and how far back, never the ABHA address or the records themselves.
    metadata: { hiTypes, from: from.toISOString(), to: to.toISOString(), purpose: PURPOSE_CODE },
  });

  return { ...saved, status: 'requested' };
}

/** ABDM naming the request on `on-init`. Until this lands the request has our id but not theirs. */
export async function recordConsentRequestId(input: {
  tenantId?: string;
  requestId?: string;
  consentRequestId: string;
}): Promise<boolean> {
  // The callback carries ABDM's `requestId` (echoing ours) rather than a facility id, so the row is
  // found by the correlation id we sent, then the tenant comes from the row itself.
  const rows = await db
    .select()
    .from(abdmHiuConsentRequests)
    .where(eq(abdmHiuConsentRequests.id, input.requestId ?? ''))
    .limit(1);
  const request = rows[0];
  if (!request) {
    logger.warn({ consentRequestId: input.consentRequestId }, 'Consent request id for an unknown request');
    return false;
  }

  await runWithTenant(request.tenantId, (tx) =>
    tx
      .update(abdmHiuConsentRequests)
      .set({ consentRequestId: input.consentRequestId, lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(abdmHiuConsentRequests.id, request.id)),
  );
  return true;
}

/**
 * Asks ABDM where a request got to.
 *
 * The fallback for a callback that never arrived, and the thing that drives "waiting for the
 * patient…" in the Portal. A request stuck in `requested` forever is indistinguishable from one the
 * patient ignored, so the doctor is shown the truth either way.
 */
export async function pollConsentRequest(tenantId: string, requestId: string): Promise<AbdmHiuConsentRequest | null> {
  const request = await loadRequest(tenantId, requestId);
  if (!request?.consentRequestId) return request;

  const facility = await getFacilityConfig(tenantId);
  const response = (await hipPost(
    HIU_CONSENT_PATHS.requestStatus,
    { consentRequestId: request.consentRequestId },
    { hipId: facility?.hipId },
  )) as { consentRequest?: { status?: string } } | null;

  const status = response?.consentRequest?.status?.toLowerCase();
  const mapped = status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : status === 'expired' ? 'expired' : null;
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(abdmHiuConsentRequests)
      .set({ ...(mapped ? { status: mapped } : {}), lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(abdmHiuConsentRequests.id, request.id)),
  );
  return loadRequest(tenantId, requestId);
}

/** Asks ABDM for a granted artefact. The artefact itself arrives on `on-fetch`. */
export async function fetchConsentArtefact(tenantId: string, consentId: string): Promise<void> {
  const facility = await getFacilityConfig(tenantId);
  await hipPost(HIU_CONSENT_PATHS.fetch, { consentId }, { hipId: facility?.hipId });
}

export type FetchedArtefact = {
  consentId: string;
  consentRequestId?: string;
  hipId?: string;
  hiuId?: string;
  consentManagerId?: string;
  abhaAddress: string;
  purposeCode?: string;
  purposeText?: string;
  hiTypes: string[];
  careContexts?: unknown;
  accessMode?: string;
  dateRangeFrom?: string;
  dateRangeTo?: string;
  dataEraseAt?: string;
  frequencyUnit?: string;
  frequencyValue?: number;
  frequencyRepeats?: number;
  signature?: string;
  grantedAt?: string;
};

/**
 * Stores a granted artefact against the request that caused it.
 *
 * An artefact we cannot tie back to a request is **dropped**, not stored orphaned: we would have no
 * patient to attach records to, no doctor who asked, and no expiry to sweep — and a consent nobody
 * can account for is worse than one we never received.
 */
export async function storeConsentArtefact(artefact: FetchedArtefact): Promise<AbdmHiuConsent | null> {
  const rows = await db
    .select()
    .from(abdmHiuConsentRequests)
    .where(eq(abdmHiuConsentRequests.consentRequestId, artefact.consentRequestId ?? ''))
    .limit(1);
  const request = rows[0];
  if (!request) {
    logger.warn({ consentId: artefact.consentId }, 'Consent artefact for an unknown request — dropped');
    return null;
  }

  const tenantId = request.tenantId;
  const saved = await runWithTenant(tenantId, async (tx) => {
    const inserted = await tx
      .insert(abdmHiuConsents)
      .values({
        tenantId,
        requestId: request.id,
        consentId: artefact.consentId,
        hipId: artefact.hipId ?? null,
        hiuId: artefact.hiuId ?? null,
        consentManagerId: artefact.consentManagerId ?? null,
        abhaAddress: artefact.abhaAddress,
        purposeCode: artefact.purposeCode ?? null,
        purposeText: artefact.purposeText ?? null,
        hiTypes: artefact.hiTypes,
        careContexts: (artefact.careContexts ?? null) as never,
        accessMode: artefact.accessMode ?? null,
        dateRangeFrom: toDate(artefact.dateRangeFrom),
        dateRangeTo: toDate(artefact.dateRangeTo),
        dataEraseAt: toDate(artefact.dataEraseAt),
        frequencyUnit: artefact.frequencyUnit ?? null,
        frequencyValue: artefact.frequencyValue ?? null,
        frequencyRepeats: artefact.frequencyRepeats ?? null,
        signature: artefact.signature ?? null,
        grantedAt: toDate(artefact.grantedAt),
        status: 'granted',
      })
      // Re-notification of the same artefact updates rather than duplicating.
      .onConflictDoUpdate({
        target: [abdmHiuConsents.tenantId, abdmHiuConsents.consentId],
        set: { status: 'granted', dataEraseAt: toDate(artefact.dataEraseAt), updatedAt: new Date() },
      })
      .returning();

    await tx
      .update(abdmHiuConsentRequests)
      .set({ status: 'granted', lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(abdmHiuConsentRequests.id, request.id));

    return inserted[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.hiu.consent_granted',
    resourceType: 'patient',
    resourceId: request.patientId,
    severity: 'notice',
    metadata: { hipId: artefact.hipId, hiTypes: artefact.hiTypes, dataEraseAt: artefact.dataEraseAt },
  });
  return saved;
}

/**
 * Destroys everything held under a consent, and says so.
 *
 * The single most important function in M3. `abdm_hiu_records.consent_id` cascades, so one statement
 * removes the artefact **and** every record obtained under it — a purge cannot succeed halfway and
 * leave another hospital's clinical data behind. The audit entry is written afterwards and survives,
 * because proving we destroyed something must not require keeping it.
 */
export async function purgeHiuConsent(
  tenantId: string,
  consentId: string,
  reason: 'revoked' | 'expired' | 'erase_date',
): Promise<{ records: number }> {
  const consent = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(abdmHiuConsents)
      .where(and(eq(abdmHiuConsents.tenantId, tenantId), eq(abdmHiuConsents.consentId, consentId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!consent) return { records: 0 };

  const records = await runWithTenant(tenantId, async (tx) => {
    const removed = await tx
      .delete(abdmHiuRecords)
      .where(and(eq(abdmHiuRecords.tenantId, tenantId), eq(abdmHiuRecords.consentId, consent.id)))
      .returning({ id: abdmHiuRecords.id });
    await tx.delete(abdmHiuConsents).where(eq(abdmHiuConsents.id, consent.id));
    return removed.length;
  });

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.hiu.consent_purged',
    resourceType: 'abdm_hiu_consent',
    resourceId: consent.id,
    severity: 'notice',
    // Counts and identifiers only — never a fragment of what was destroyed.
    metadata: { reason, hipId: consent.hipId, recordsDeleted: records, consentId },
  });
  logger.info({ tenantId, consentId, reason, records }, 'ABDM HIU consent purged with its records');
  return { records };
}

/**
 * ABDM telling us a consent is revoked or expired.
 *
 * Acknowledged **after** the purge, never before: the acknowledgement is our assertion that the data
 * is gone, and sending it first would make it a lie whenever the delete then failed.
 */
export async function handleConsentNotification(input: {
  consentId: string;
  status: string;
}): Promise<{ purged: boolean }> {
  const rows = await db.select().from(abdmHiuConsents).where(eq(abdmHiuConsents.consentId, input.consentId)).limit(1);
  const consent = rows[0];
  if (!consent) {
    // Nothing held under it is the same outcome the notification asks for, so it is acknowledged.
    await acknowledgeNotification(input.consentId);
    return { purged: false };
  }

  const status = input.status.toUpperCase();
  const reason = status === 'REVOKED' ? 'revoked' : 'expired';
  await purgeHiuConsent(consent.tenantId, input.consentId, reason);
  await acknowledgeNotification(input.consentId, consent.tenantId);
  return { purged: true };
}

async function acknowledgeNotification(consentId: string, tenantId?: string): Promise<void> {
  const facility = tenantId ? await getFacilityConfig(tenantId) : null;
  await hipPost(
    HIU_CONSENT_PATHS.onNotify,
    { acknowledgement: [{ status: 'ok', consentId }] },
    { hipId: facility?.hipId },
  ).catch((err: unknown) => logger.error({ err, consentId }, 'Could not acknowledge a consent notification'));
}

/**
 * The consents that may currently yield a record.
 *
 * **Expiry is decided by the clock, not by the status column.** A missed revoke callback, a sweep
 * that has not run yet, a clock that drifted — none of them may become a licence to keep reading, so
 * anything past its erase date is excluded here regardless of what its status says. The sweep then
 * deletes it; this makes sure it is invisible in the meantime.
 */
export async function usableConsents(tenantId: string, patientId: string, now = new Date()): Promise<AbdmHiuConsent[]> {
  const requestIds = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ id: abdmHiuConsentRequests.id })
      .from(abdmHiuConsentRequests)
      .where(and(eq(abdmHiuConsentRequests.tenantId, tenantId), eq(abdmHiuConsentRequests.patientId, patientId))),
  );
  if (requestIds.length === 0) return [];

  const consents = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmHiuConsents)
      .where(
        and(
          eq(abdmHiuConsents.tenantId, tenantId),
          eq(abdmHiuConsents.status, 'granted'),
          inArray(
            abdmHiuConsents.requestId,
            requestIds.map((r) => r.id),
          ),
        ),
      ),
  );
  return consents.filter((c) => !c.dataEraseAt || c.dataEraseAt > now);
}

/**
 * The scheduled sweep: destroy everything whose time is up.
 *
 * Runs independently of the callbacks, because a notification that never arrives must not leave
 * another hospital's records on our disk indefinitely. Deliberately driven by `data_erase_at` — the
 * date we promised the patient — rather than by status, so a consent nobody told us about still
 * dies on schedule.
 */
export async function purgeExpiredHiuConsents(now = new Date()): Promise<{ consents: number; records: number }> {
  const due = await db
    .select({ tenantId: abdmHiuConsents.tenantId, consentId: abdmHiuConsents.consentId })
    .from(abdmHiuConsents)
    .where(or(lte(abdmHiuConsents.dataEraseAt, now), eq(abdmHiuConsents.status, 'revoked')));

  let records = 0;
  for (const row of due) {
    const result = await purgeHiuConsent(row.tenantId, row.consentId, 'erase_date');
    records += result.records;
  }
  if (due.length > 0) logger.info({ consents: due.length, records }, 'ABDM HIU expiry sweep purged consents');
  return { consents: due.length, records };
}

/**
 * Where a HIP must push the records we asked for.
 *
 * Throws rather than returning a half-formed URL when unconfigured: ABDM accepts a data request
 * naming an unreachable push URL and then simply delivers nothing, which looks like a broken feature
 * for as long as nobody checks. Failing at the point of asking is the only visible failure available.
 */
export function dataPushUrl(): string {
  if (!env.ABDM_HIU_PUSH_BASE_URL) {
    throw new AppError(
      503,
      'ABDM_PUSH_URL_NOT_CONFIGURED',
      'ABDM_HIU_PUSH_BASE_URL is not set, so no hospital could deliver the records we asked for',
    );
  }
  return `${env.ABDM_HIU_PUSH_BASE_URL.replace(/\/+$/, '')}${HIU_CALLBACK_PATHS.dataPush}`;
}

async function loadRequest(tenantId: string, requestId: string): Promise<AbdmHiuConsentRequest | null> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmHiuConsentRequests)
      .where(and(eq(abdmHiuConsentRequests.tenantId, tenantId), eq(abdmHiuConsentRequests.id, requestId)))
      .limit(1),
  );
  return rows[0] ?? null;
}

async function setRequestStatus(tenantId: string, id: string, status: string, error?: string): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(abdmHiuConsentRequests)
      .set({ status, lastError: error?.slice(0, 300) ?? null, updatedAt: new Date() })
      .where(eq(abdmHiuConsentRequests.id, id)),
  );
}

/** Requests a doctor has in flight for a patient, newest first — what the chart panel shows. */
export async function listHistoryRequests(tenantId: string, patientId: string): Promise<AbdmHiuConsentRequest[]> {
  return runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmHiuConsentRequests)
      .where(and(eq(abdmHiuConsentRequests.tenantId, tenantId), eq(abdmHiuConsentRequests.patientId, patientId)))
      .orderBy(sql`${abdmHiuConsentRequests.createdAt} DESC`),
  );
}

const toDate = (v?: string): Date | null => (v ? new Date(v) : null);

/**
 * Finds the patient an ABHA identifier refers to, and says what can be done next (ADR-100).
 *
 * Closes `HIU_FLOW_101`, which asks the HIU to find a patient by ABHA Number **or** Address and
 * check that the ABHA is valid. Before this, the only way in was a chart that already carried a
 * verified ABHA — correct as far as it went, but it meant a walk-in whose ABHA had never been
 * verified here could not be searched at all.
 *
 * Deliberately does **not** invent an ABDM lookup call. No such endpoint exists in the published
 * M1 collection, and guessing one is how the M2 service-registration payload ended up wrong. The
 * validity check that does exist is M1's verification flow, which puts an OTP in front of the
 * patient — so what this returns is the match plus the honest next step, and the caller runs that
 * proven flow rather than a fabricated one.
 */
export async function findPatientByAbha(
  tenantId: string,
  identifier: string,
): Promise<{
  outcome: 'verified' | 'unverified' | 'not_found' | 'ambiguous';
  patient?: { id: string; uhid: string; name: string; abhaAddress: string | null; abhaNumber: string | null };
  nextStep: string;
}> {
  const trimmed = identifier.trim();
  const digits = trimmed.replace(/\D/g, '');

  const matches = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(patients)
      .where(
        and(
          eq(patients.tenantId, tenantId),
          eq(patients.status, 'active'),
          // Either identifier form finds the same person. The number is compared on digits alone so
          // that '91-1234-5678-9012' and '911234567890' are one lookup, not two.
          or(
            sql`lower(${patients.abhaAddress}) = lower(${trimmed})`,
            digits.length === 14
              ? sql`regexp_replace(coalesce(${patients.abhaNumber}, ''), '[^0-9]', '', 'g') = ${digits}`
              : sql`false`,
          ),
        ),
      )
      .limit(2),
  );

  if (matches.length > 1) {
    // Should now be unreachable — a unique index forbids it (ADR-100) — but a lookup that silently
    // picked one of two charts claiming a national identity would be the worst possible answer.
    return { outcome: 'ambiguous', nextStep: 'Two charts hold this ABHA. Merge them before requesting a history.' };
  }

  const found = matches[0];
  if (!found) {
    return {
      outcome: 'not_found',
      nextStep: 'No chart here holds that ABHA. Register the patient, or verify their ABHA at the desk first.',
    };
  }

  const summary = {
    id: found.id,
    uhid: found.uhid,
    name: [found.firstName, found.lastName].filter(Boolean).join(' '),
    abhaAddress: found.abhaAddress,
    abhaNumber: found.abhaNumber,
  };

  if (!found.abhaVerifiedAt) {
    return {
      outcome: 'unverified',
      patient: summary,
      // The real validity check, not a fabricated one.
      nextStep: 'This ABHA was typed in and never verified. Verify it from the patient chart before requesting their history.',
    };
  }
  return { outcome: 'verified', patient: summary, nextStep: 'Ready — a history can be requested for this patient.' };
}
