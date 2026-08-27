import { and, eq, lt, or, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { abdmConsents, abdmFacilityConfig, patients, type AbdmConsent } from '../../db/schema';
import { logger } from '../../config/logger';
import { writeAudit } from '../audit/audit.service';

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
