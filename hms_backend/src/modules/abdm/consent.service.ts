import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { abdmConsents, abdmFacilityConfig, auditLog, patients, type AbdmConsent } from '../../db/schema';
import { logger } from '../../config/logger';
import { writeAudit } from '../audit/audit.service';
import { HIP_CONSENT_ON_NOTIFY_PATH } from './abdm.constants';

/**
 * Consent artefacts, as held by a Health Information Provider (ADR-087, Milestone 2).
 *
 * We never author one. A Health Information User asks, the patient grants in their own PHR app, and
 * the artefact arrives here as a notification. Our duties are few and each is a certification test
 * case:
 *
 * - **Store** what we are told, verbatim enough to honour it later.
 * - **Honour** it on every transfer — the date window, the record types, and nothing beyond.
 * - **Delete** it the moment it is revoked or expires. Not flag it; delete it. NHA checks the row
 *   is gone, and the reasoning is sound: an artefact we keep is an authorisation we might act on.
 *
 * That deletion coexists with invariant #6 (audit records are never deleted) because they are
 * different things. The **audit event** — granted at, revoked at, by which consent id — is written
 * here and survives; the **artefact** does not. So the history of who was allowed what remains
 * answerable without leaving a live permission lying around.
 */

export type ConsentNotification = {
  consentId: string;
  abhaAddress: string;
  hipId: string;
  hiuId?: string;
  consentManagerId?: string;
  purposeCode?: string;
  purposeText?: string;
  hiTypes: string[];
  accessMode?: string;
  dateRangeFrom?: string;
  dateRangeTo?: string;
  dataEraseAt?: string;
  frequencyUnit?: string;
  frequencyValue?: number;
  frequencyRepeats?: number;
  careContexts?: unknown;
  signature?: string;
  grantedAt?: string;
};

const toDate = (v?: string): Date | null => (v ? new Date(v) : null);

/**
 * Resolves which hospital a notification belongs to.
 *
 * From the HFR facility id, server-side, exactly as the Scan-and-Share callback does (ADR-056):
 * the notification arrives unauthenticated from the gateway, so nothing inside it may be trusted to
 * select a tenant except the identifier we ourselves registered.
 */
async function tenantForHip(hipId: string): Promise<string | null> {
  const { db } = await import('../../db/client');
  const rows = await db.select().from(abdmFacilityConfig).where(eq(abdmFacilityConfig.hipId, hipId)).limit(1);
  return rows[0]?.tenantId ?? null;
}

/**
 * Stores a granted consent.
 *
 * Upsert on `(tenant, consentId)`: ABDM re-notifies, and a duplicate row would mean two answers to
 * "what did the patient agree to". The later notification wins, because it is the later statement
 * of the patient's wishes.
 */
export async function recordConsentGrant(input: ConsentNotification): Promise<AbdmConsent | null> {
  const tenantId = await tenantForHip(input.hipId);
  if (!tenantId) {
    // Same posture as the Scan-and-Share callback: an unknown facility is accepted and dropped,
    // never answered differently, so the endpoint cannot be used to enumerate hospitals.
    logger.warn({ hipId: input.hipId }, 'Consent notification for an unknown facility');
    return null;
  }

  const row = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(abdmConsents)
      .values({
        tenantId,
        consentId: input.consentId,
        abhaAddress: input.abhaAddress,
        hipId: input.hipId,
        hiuId: input.hiuId ?? null,
        consentManagerId: input.consentManagerId ?? null,
        purposeCode: input.purposeCode ?? null,
        purposeText: input.purposeText ?? null,
        hiTypes: input.hiTypes,
        accessMode: input.accessMode ?? null,
        dateRangeFrom: toDate(input.dateRangeFrom),
        dateRangeTo: toDate(input.dateRangeTo),
        dataEraseAt: toDate(input.dataEraseAt),
        frequencyUnit: input.frequencyUnit ?? null,
        frequencyValue: input.frequencyValue ?? null,
        frequencyRepeats: input.frequencyRepeats ?? null,
        careContexts: (input.careContexts ?? null) as never,
        signature: input.signature ?? null,
        grantedAt: toDate(input.grantedAt) ?? new Date(),
      })
      .onConflictDoUpdate({
        target: [abdmConsents.tenantId, abdmConsents.consentId],
        set: {
          hiTypes: input.hiTypes,
          dateRangeFrom: toDate(input.dateRangeFrom),
          dateRangeTo: toDate(input.dateRangeTo),
          dataEraseAt: toDate(input.dataEraseAt),
          careContexts: (input.careContexts ?? null) as never,
          signature: input.signature ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.consent.granted',
    resourceType: 'abdm_consent',
    resourceId: row.id,
    severity: 'notice',
    metadata: { consentId: input.consentId, hiuId: input.hiuId, hiTypes: input.hiTypes, abhaAddress: input.abhaAddress },
  });
  return row;
}

/**
 * Deletes a consent artefact, recording why.
 *
 * The one place a consent leaves the system, shared by revoke, expiry and opt-out so the audit
 * shape is identical whichever door it came through. Deleting something that is already gone is
 * not an error — a re-sent revocation must not fail.
 */
async function purgeConsent(
  tenantId: string,
  consentId: string,
  reason: 'revoked' | 'expired' | 'abha_opt_out',
): Promise<boolean> {
  const removed = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .delete(abdmConsents)
      .where(and(eq(abdmConsents.tenantId, tenantId), eq(abdmConsents.consentId, consentId)))
      .returning({ id: abdmConsents.id, abhaAddress: abdmConsents.abhaAddress, hiuId: abdmConsents.hiuId });
    return rows[0] ?? null;
  });

  // The artefact is gone; the record that it existed and why it went is not.
  await writeAudit({
    tenantId,
    actorUserId: null,
    action: `abdm.consent.${reason}`,
    resourceType: 'abdm_consent',
    resourceId: removed?.id ?? consentId,
    severity: 'notice',
    metadata: { consentId, abhaAddress: removed?.abhaAddress, hiuId: removed?.hiuId, existed: Boolean(removed) },
  });
  return Boolean(removed);
}

/** The patient withdrew consent. The artefact is deleted, not deactivated. */
export async function revokeConsent(hipId: string, consentId: string): Promise<boolean> {
  const tenantId = await tenantForHip(hipId);
  if (!tenantId) return false;
  return purgeConsent(tenantId, consentId, 'revoked');
}

/** ABDM told us a consent expired. Same treatment — an expired authorisation is not kept. */
export async function expireConsent(hipId: string, consentId: string): Promise<boolean> {
  const tenantId = await tenantForHip(hipId);
  if (!tenantId) return false;
  return purgeConsent(tenantId, consentId, 'expired');
}

/** What a consent callback resolves to, once its status has been read. */
export type ConsentNotificationOutcome = 'granted' | 'revoked' | 'expired' | 'ignored' | 'unknown_facility';

/**
 * The consent callback ABDM sends a HIP (ADR-101, M2 §6.3.1).
 *
 * **This is the only way a HIP ever learns a consent changed.** There is no polling equivalent, so
 * without it `revokeConsent` is unreachable code and a withdrawn consent goes on authorising
 * transfers indefinitely — the failure the M2 certification cases "revoke a granted request" and
 * "records for revoked consent cannot be seen" exist to catch.
 *
 * Three events arrive on one path, separated only by `status`:
 *
 * - `GRANTED` — store the artefact, so transfers can be honoured against it.
 * - `REVOKED` / `DENIED` — delete it. The patient changed their mind and an artefact we keep is an
 *   authorisation we might act on.
 * - `EXPIRED` — delete it too, for the same reason.
 *
 * **An unrecognised status deletes nothing and stores nothing.** Guessing in either direction is
 * worse than doing nothing: inventing a grant fabricates permission, and inventing a revocation
 * silently destroys one the patient still wants. It is logged so the gap is visible rather than
 * absorbed.
 *
 * The tenant comes from `X-HIP-ID` resolved server-side, never from the body (ADR-056) — the
 * callback is unauthenticated by NHA's own design, so nothing inside it selects a hospital.
 */
export async function applyHipConsentNotification(input: {
  hipId: string;
  status: string;
  consentId?: string;
  detail?: {
    consentId?: string;
    createdAt?: string;
    patient?: { id?: string };
    hiu?: { id?: string };
    consentManager?: { id?: string };
    purpose?: { text?: string; code?: string };
    hiTypes?: string[];
    careContexts?: unknown;
    permission?: {
      accessMode?: string;
      dateRange?: { from?: string; to?: string };
      dataEraseAt?: string;
      frequency?: { unit?: string; value?: number; repeats?: number };
    };
  };
  signature?: string;
}): Promise<ConsentNotificationOutcome> {
  const consentId = input.consentId ?? input.detail?.consentId;
  if (!consentId) {
    logger.warn({ hipId: input.hipId, status: input.status }, 'ABDM consent notification carried no consent id');
    return 'ignored';
  }

  const tenantId = await tenantForHip(input.hipId);
  if (!tenantId) {
    // Identical handling to every other gateway callback: an unknown facility is accepted and
    // dropped rather than answered differently, so this cannot enumerate hospitals (ADR-056).
    logger.warn({ hipId: input.hipId }, 'Consent notification for an unknown facility');
    return 'unknown_facility';
  }

  const status = input.status.trim().toUpperCase();

  if (status === 'REVOKED' || status === 'DENIED') {
    await purgeConsent(tenantId, consentId, 'revoked');
    return 'revoked';
  }

  if (status === 'EXPIRED') {
    await purgeConsent(tenantId, consentId, 'expired');
    return 'expired';
  }

  if (status !== 'GRANTED') {
    logger.warn({ hipId: input.hipId, consentId, status }, 'Unrecognised ABDM consent status — nothing stored or deleted');
    return 'ignored';
  }

  const abhaAddress = input.detail?.patient?.id;
  if (!abhaAddress) {
    // A grant with no patient cannot be honoured later: every transfer check matches on the ABHA
    // address. Storing it would create an artefact that silently never applies to anyone.
    logger.warn({ hipId: input.hipId, consentId }, 'Granted consent carried no ABHA address — not stored');
    return 'ignored';
  }

  await recordConsentGrant({
    consentId,
    abhaAddress,
    hipId: input.hipId,
    hiuId: input.detail?.hiu?.id,
    consentManagerId: input.detail?.consentManager?.id,
    purposeCode: input.detail?.purpose?.code,
    purposeText: input.detail?.purpose?.text,
    hiTypes: input.detail?.hiTypes ?? [],
    accessMode: input.detail?.permission?.accessMode,
    dateRangeFrom: input.detail?.permission?.dateRange?.from,
    dateRangeTo: input.detail?.permission?.dateRange?.to,
    dataEraseAt: input.detail?.permission?.dataEraseAt,
    frequencyUnit: input.detail?.permission?.frequency?.unit,
    frequencyValue: input.detail?.permission?.frequency?.value,
    frequencyRepeats: input.detail?.permission?.frequency?.repeats,
    careContexts: input.detail?.careContexts,
    signature: input.signature,
    grantedAt: input.detail?.createdAt,
  });
  return 'granted';
}

/**
 * Tells the gateway we acted on a consent notification (M2 §6.3.2).
 *
 * Sent **after** the artefact has actually been stored or deleted, never before. ABDM treats this
 * as our acknowledgement, and acknowledging a revocation we have not yet performed would be a lie
 * with a paper trail. `requestId` is the inbound `REQUEST-ID` header, which is what correlates the
 * two halves — not a value from the body.
 *
 * A failure here is logged, not thrown: the patient's wish has already been honoured locally, and
 * the gateway retries. Throwing would only lose that fact.
 */
export async function acknowledgeHipConsentNotification(input: {
  requestId: string;
  consentId: string;
  hipId: string;
  ok: boolean;
  errorMessage?: string;
}): Promise<void> {
  const { hipPost } = await import('./hipGateway');
  // `ERRORED`, not `FAILED`. M2 documents the acknowledgement status as `OK` and pairs `OK` with
  // `ERRORED` wherever it names both (§6.3.6, `hiStatus`); `FAILED` belongs to `sessionStatus`, a
  // different field. The failure value for THIS field is not spelled out anywhere, so this is the
  // best-grounded reading of NHA's own vocabulary rather than a confirmed enum — if a live sandbox
  // rejects it, that is the line to change.
  const body: Record<string, unknown> = {
    acknowledgement: { status: input.ok ? 'OK' : 'ERRORED', consentId: input.consentId },
    response: { requestId: input.requestId },
  };
  if (!input.ok) {
    body.error = { code: 'ABDM-1000', message: input.errorMessage ?? 'Could not apply the consent notification' };
  }

  await hipPost(HIP_CONSENT_ON_NOTIFY_PATH, body, { hipId: input.hipId }).catch((err: unknown) => {
    logger.error({ err, consentId: input.consentId }, 'Could not acknowledge an ABDM consent notification');
  });
}


/**
 * Proactive expiry — the sweep that does not wait to be told.
 *
 * The certification case is driven by a notification, but relying on one would leave a live
 * authorisation in the system whenever a callback is missed, delayed or lost. Expiry is a fact
 * about the artefact itself, so we can and should act on it ourselves.
 */
export async function purgeExpiredConsents(tenantId: string, now = new Date()): Promise<number> {
  const expired = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ consentId: abdmConsents.consentId })
      .from(abdmConsents)
      .where(
        and(
          eq(abdmConsents.tenantId, tenantId),
          or(lt(abdmConsents.dataEraseAt, now), lt(abdmConsents.dateRangeTo, now)),
        ),
      ),
  );
  for (const row of expired) await purgeConsent(tenantId, row.consentId, 'expired');
  return expired.length;
}

/**
 * The patient left ABDM. Their ABHA identifiers and every consent under them go.
 *
 * The **clinical record stays** — it is the hospital's own, made under its own duty of care, and
 * invariant #6 keeps it. What is deleted is the national identity attached to it and every
 * authorisation that flowed from it, which is precisely what opting out means.
 */
export async function handleAbhaOptOut(hipId: string, abhaAddress: string): Promise<{ consents: number; patients: number }> {
  const tenantId = await tenantForHip(hipId);
  if (!tenantId) return { consents: 0, patients: 0 };

  const consents = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ consentId: abdmConsents.consentId })
      .from(abdmConsents)
      .where(and(eq(abdmConsents.tenantId, tenantId), eq(abdmConsents.abhaAddress, abhaAddress))),
  );
  for (const row of consents) await purgeConsent(tenantId, row.consentId, 'abha_opt_out');

  const cleared = await runWithTenant(tenantId, (tx) =>
    tx
      .update(patients)
      .set({
        abhaNumber: null,
        abhaAddress: null,
        abhaVerifiedAt: null,
        abhaSource: null,
        abhaLinkingTokenEnc: null,
        updatedAt: new Date(),
      })
      .where(and(eq(patients.tenantId, tenantId), eq(patients.abhaAddress, abhaAddress)))
      .returning({ id: patients.id }),
  );

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.abha.opted_out',
    resourceType: 'patient',
    resourceId: cleared[0]?.id ?? null,
    severity: 'notice',
    metadata: { abhaAddress, consentsDeleted: consents.length, chartsCleared: cleared.length },
  });
  return { consents: consents.length, patients: cleared.length };
}

export type ConsentCheck = { allowed: boolean; reason?: string; consent?: AbdmConsent };

/**
 * The gate every transfer passes through before a single record leaves.
 *
 * Deliberately fail-closed and deliberately explicit about *why*: a refusal that says "expired" and
 * one that says "this HIU was never granted access" are very different incidents, and an operator
 * or an auditor needs to be able to tell them apart from the log alone.
 */
export async function checkConsentForTransfer(
  tenantId: string,
  input: { consentId: string; hiuId?: string; hiTypes?: string[]; from?: Date; to?: Date; now?: Date },
): Promise<ConsentCheck> {
  const now = input.now ?? new Date();
  const consent = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(abdmConsents)
      .where(and(eq(abdmConsents.tenantId, tenantId), eq(abdmConsents.consentId, input.consentId)))
      .limit(1);
    return rows[0] ?? null;
  });

  // No artefact means revoked, expired, or never granted — all of which are "no".
  if (!consent) return { allowed: false, reason: 'No consent artefact is held for this request' };
  if (consent.dataEraseAt && consent.dataEraseAt <= now) return { allowed: false, reason: 'The consent has expired', consent };
  if (input.hiuId && consent.hiuId && consent.hiuId !== input.hiuId) {
    return { allowed: false, reason: 'This consent was granted to a different requester', consent };
  }

  const requested = input.hiTypes ?? [];
  const disallowed = requested.filter((t) => !consent.hiTypes.includes(t));
  if (disallowed.length > 0) {
    return { allowed: false, reason: `The consent does not cover ${disallowed.join(', ')}`, consent };
  }

  // The requested window must sit INSIDE what the patient agreed to, not merely overlap it.
  if (input.from && consent.dateRangeFrom && input.from < consent.dateRangeFrom) {
    return { allowed: false, reason: 'The requested period starts before the consented range', consent };
  }
  if (input.to && consent.dateRangeTo && input.to > consent.dateRangeTo) {
    return { allowed: false, reason: 'The requested period ends after the consented range', consent };
  }

  return { allowed: true, consent };
}

/** Consents currently held for a hospital — the operator's view, and the certification evidence. */
export async function listConsents(tenantId: string, abhaAddress?: string): Promise<AbdmConsent[]> {
  return runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmConsents)
      .where(
        abhaAddress
          ? and(eq(abdmConsents.tenantId, tenantId), eq(abdmConsents.abhaAddress, abhaAddress))
          : eq(abdmConsents.tenantId, tenantId),
      )
      .orderBy(sql`${abdmConsents.grantedAt} desc nulls last`),
  );
}

/**
 * What happened to consents at this hospital, including the ones that no longer exist (ADR-100).
 *
 * The certification cases `HIP_INIT_GRANT_CONSENT`, `HIP_INIT_REVOKE_CONSENT` and
 * `HIP_INIT_EXPIRE_CONSENT` all state their expected result as **"seen in HMIS"** — the requirement
 * is that an operator can *look*, not merely that we behave correctly.
 *
 * That creates a genuine tension with ADR-087, which deletes an artefact on revocation and does not
 * bend. The resolution is that the two questions are different: the artefact is the *permission* and
 * it is destroyed, while the audit trail is the *record that it existed and ended*, holds metadata
 * only, and is never deleted (invariant #6). So a revoked consent disappears from the live list and
 * appears in the history beneath it, which is exactly what an assessor needs to watch happen.
 */
export async function consentHistory(tenantId: string, limit = 100): Promise<Array<{
  consentId: string;
  event: 'granted' | 'revoked' | 'expired' | 'erased';
  hipId?: string;
  hiuId?: string;
  hiTypes?: string[];
  recordedAt: string;
}>> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, tenantId), inArray(auditLog.action, [
        'abdm.consent.granted',
        'abdm.consent.revoked',
        'abdm.consent.expired',
        'abdm.consent.erased',
      ])))
      .orderBy(sql`${auditLog.createdAt} desc`)
      .limit(limit),
  );

  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      consentId: String(meta.consentId ?? ''),
      event: r.action.split('.').pop() as 'granted' | 'revoked' | 'expired' | 'erased',
      hipId: typeof meta.hipId === 'string' ? meta.hipId : undefined,
      hiuId: typeof meta.hiuId === 'string' ? meta.hiuId : undefined,
      hiTypes: Array.isArray(meta.hiTypes) ? (meta.hiTypes as string[]) : undefined,
      recordedAt: r.createdAt.toISOString(),
    };
  });
}
