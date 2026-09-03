import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { abdmCareContexts, abdmLinkRequests, patients } from '../../db/schema';
import { logger } from '../../config/logger';
import { writeAudit } from '../audit/audit.service';
import {
  OTP_TTL_MS,
  sendOtp,
  verifyOtp,
  type OtpStore,
} from '../notification/communication.service';
import { USER_LINKING_PATHS } from './abdm.constants';
import { hipPost } from './hipGateway';
import { handleDiscovery, type DiscoveryRequest } from './discovery.service';
import { markLinkResult } from './careContext.service';

/**
 * User-initiated linking — the patient linking records they discovered (ADR-090).
 *
 * Three steps with gaps between them: **discover** (what do you hold for me?), **init** (link these,
 * and prove it is me), **confirm** (here is the code). The OTP in the middle is **ours**, not
 * ABDM's, and that is the point of the flow: the consent manager verified an identity, but only the
 * hospital can verify that the person asking is the person whose chart this is.
 *
 * ABDM lets the HIP choose which number to text — theirs or ours. We use **the number on the
 * chart**, because that is the one this hospital actually confirmed with the patient at the desk;
 * an ABDM-verified number proves the ABHA, not the chart.
 *
 * The OTP goes through the platform's existing communication seam (ADR-016/059), so it inherits
 * hashing at rest, the five-attempt limit, the ten-minute life, the DLT template, and the rule that
 * the code is never returned to any caller.
 */

/** Answers the gateway's discovery call and posts the result back on `on-discover`. */
export async function respondToDiscovery(input: {
  hipId: string;
  request: DiscoveryRequest;
  transactionId?: string;
  requestId?: string;
}): Promise<{ matched: boolean }> {
  const tenantId = await tenantForHip(input.hipId);
  if (!tenantId) {
    logger.warn({ hipId: input.hipId }, 'Discovery request for an unknown facility');
    return { matched: false };
  }

  const result = await handleDiscovery(tenantId, input.request, {
    transactionId: input.transactionId,
    requestId: input.requestId,
  });

  const patientBlocks = result.patient
    ? [
        {
          referenceNumber: result.patient.uhid,
          display: [result.patient.firstName, result.patient.lastName].filter(Boolean).join(' '),
          // The label and reference only — a discovery answer carries no clinical information.
          careContexts: result.careContexts.map((c) => ({
            referenceNumber: c.referenceNumber,
            display: c.displayLabel,
          })),
          count: result.careContexts.length,
          hiType: result.careContexts[0]?.hiTypes[0] ?? 'HealthDocumentRecord',
        },
      ]
    : [];

  await hipPost(
    USER_LINKING_PATHS.onDiscover,
    {
      matchedBy: result.matchedBy,
      patient: patientBlocks,
      response: { requestId: input.requestId },
      transactionId: input.transactionId ?? '',
    },
    { hipId: input.hipId },
  );

  return { matched: Boolean(result.patient) };
}

/**
 * The patient chose some contexts. Send them a code and tell ABDM one is coming.
 *
 * The contexts are **intersected with what we actually hold for that patient** rather than trusted
 * from the request: the reference numbers arrive from outside, and a caller that could name any
 * reference could otherwise have somebody else's records linked to their ABHA.
 */
export async function initUserLink(input: {
  hipId: string;
  transactionId: string;
  requestId?: string;
  patientReference: string;
  careContextRefs: string[];
}): Promise<{ referenceNumber: string } | { refused: string }> {
  const tenantId = await tenantForHip(input.hipId);
  if (!tenantId) return { refused: 'Unknown facility' };

  const patient = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.uhid, input.patientReference)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!patient) return { refused: 'No such patient' };

  const owned = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmCareContexts)
      .where(
        and(eq(abdmCareContexts.tenantId, tenantId), eq(abdmCareContexts.patientId, patient.id)),
      ),
  );
  const permitted = owned.filter((c) => input.careContextRefs.includes(c.referenceNumber));
  if (permitted.length === 0)
    return { refused: 'None of those care contexts belong to this patient' };

  const destination = (patient.phone ?? '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(destination))
    return { refused: 'No mobile number on file to verify against' };

  const referenceNumber = randomUUID();
  await runWithTenant(tenantId, (tx) =>
    tx.insert(abdmLinkRequests).values({
      tenantId,
      transactionId: input.transactionId,
      referenceNumber,
      patientId: patient.id,
      abhaAddress: patient.abhaAddress,
      careContextRefs: permitted.map((c) => c.referenceNumber),
      channel: 'sms',
      destination,
    }),
  );

  // Through the shared seam: hashed at rest, five attempts, ten minutes, DLT template, and the
  // code never comes back to us.
  await sendOtp({
    tenantId,
    channel: 'sms',
    destination,
    store: linkRequestOtpStore(tenantId, referenceNumber),
    purpose: 'health record linking',
  });

  await hipPost(
    USER_LINKING_PATHS.onInit,
    {
      link: {
        authenticationType: 'DIRECT',
        meta: {
          communicationExpiry: new Date(Date.now() + OTP_TTL_MS).toISOString(),
          communicationHint: 'OTP',
          communicationMedium: 'MOBILE',
        },
        referenceNumber,
      },
      response: { requestId: input.requestId },
      transactionId: input.transactionId,
    },
    { hipId: input.hipId },
  );

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.user_link.otp_sent',
    resourceType: 'patient',
    resourceId: patient.id,
    severity: 'notice',
    metadata: { careContexts: permitted.length, transactionId: input.transactionId },
  });

  return { referenceNumber };
}

/**
 * The patient sent the code back. Verify it, link what they chose, and answer `on-confirm`.
 *
 * A wrong code answers `on-confirm` with no care contexts rather than throwing: the gateway is
 * waiting for a reply, and an exception here would leave the patient's app hanging instead of
 * telling them the code was wrong.
 */
export async function confirmUserLink(input: {
  hipId: string;
  referenceNumber: string;
  token: string;
  requestId?: string;
}): Promise<{ linked: number; reason?: string }> {
  const tenantId = await tenantForHip(input.hipId);
  if (!tenantId) return { linked: 0, reason: 'Unknown facility' };

  const request = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(abdmLinkRequests)
      .where(
        and(
          eq(abdmLinkRequests.tenantId, tenantId),
          eq(abdmLinkRequests.referenceNumber, input.referenceNumber),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  });
  if (!request) return { linked: 0, reason: 'Unknown link request' };

  const ok = await verifyOtp({
    channel: 'sms',
    destination: request.destination,
    code: input.token,
    store: linkRequestOtpStore(tenantId, input.referenceNumber),
  });

  if (!ok) {
    await setRequestStatus(tenantId, input.referenceNumber, 'failed');
    await writeAudit({
      tenantId,
      actorUserId: null,
      action: 'abdm.user_link.otp_failed',
      resourceType: 'patient',
      resourceId: request.patientId,
      severity: 'warning',
      metadata: { referenceNumber: input.referenceNumber },
    });
    // Answer anyway, with nothing linked — a hanging app is worse than a clear refusal.
    await hipPost(
      USER_LINKING_PATHS.onConfirm,
      { patient: [], response: { requestId: input.requestId } },
      { hipId: input.hipId },
    );
    return { linked: 0, reason: 'The code was wrong or has expired' };
  }

  const contexts = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmCareContexts)
      .where(
        and(
          eq(abdmCareContexts.tenantId, tenantId),
          eq(abdmCareContexts.patientId, request.patientId),
        ),
      ),
  );
  const linked = contexts.filter((c) => request.careContextRefs.includes(c.referenceNumber));

  const patientRow = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(patients)
      .where(eq(patients.id, request.patientId))
      .limit(1);
    return rows[0] ?? null;
  });

  await hipPost(
    USER_LINKING_PATHS.onConfirm,
    {
      patient: [
        {
          referenceNumber: patientRow?.uhid ?? request.patientId,
          display: [patientRow?.firstName, patientRow?.lastName].filter(Boolean).join(' '),
          careContexts: linked.map((c) => ({
            referenceNumber: c.referenceNumber,
            display: c.displayLabel,
          })),
          count: linked.length,
          hiType: linked[0]?.hiTypes[0] ?? '',
        },
      ],
      response: { requestId: input.requestId },
    },
    { hipId: input.hipId },
  );

  // The patient linked these themselves, so they are linked — recorded through the same path as
  // HIP-initiated linking, which keeps one meaning for `status` however a context got there.
  for (const context of linked) {
    await markLinkResult(tenantId, context.id, {
      linked: true,
      abhaAddress: request.abhaAddress ?? undefined,
    });
  }
  await setRequestStatus(tenantId, input.referenceNumber, 'verified');

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.user_link.confirmed',
    resourceType: 'patient',
    resourceId: request.patientId,
    severity: 'notice',
    metadata: { careContexts: linked.length, referenceNumber: input.referenceNumber },
  });
  return { linked: linked.length };
}

/**
 * The OTP store for one link request, satisfying the platform's contract.
 *
 * Scoped to a single reference number rather than to a destination: the same patient may have two
 * link requests in flight from two apps, and a code issued for one must not verify the other.
 */
function linkRequestOtpStore(tenantId: string, referenceNumber: string): OtpStore {
  const where = and(
    eq(abdmLinkRequests.tenantId, tenantId),
    eq(abdmLinkRequests.referenceNumber, referenceNumber),
  );
  return {
    async save({ codeHash, expiresAt }) {
      await runWithTenant(tenantId, (tx) =>
        tx
          .update(abdmLinkRequests)
          .set({ codeHash, expiresAt, attempts: 0, consumedAt: null, updatedAt: new Date() })
          .where(where),
      );
    },
    async findActive() {
      const rows = await runWithTenant(tenantId, (tx) =>
        tx
          .select()
          .from(abdmLinkRequests)
          .where(and(where, isNull(abdmLinkRequests.consumedAt)))
          .orderBy(desc(abdmLinkRequests.createdAt))
          .limit(1),
      );
      const row = rows[0];
      return row?.codeHash && row.expiresAt
        ? { id: row.id, codeHash: row.codeHash, expiresAt: row.expiresAt, attempts: row.attempts }
        : null;
    },
    async consume() {
      await runWithTenant(tenantId, (tx) =>
        tx
          .update(abdmLinkRequests)
          .set({ consumedAt: new Date(), updatedAt: new Date() })
          .where(where),
      );
    },
    async recordFailedAttempt() {
      await runWithTenant(tenantId, (tx) =>
        tx
          .update(abdmLinkRequests)
          .set({ attempts: sql`${abdmLinkRequests.attempts} + 1`, updatedAt: new Date() })
          .where(where),
      );
    },
  };
}

async function setRequestStatus(
  tenantId: string,
  referenceNumber: string,
  status: string,
): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(abdmLinkRequests)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(abdmLinkRequests.tenantId, tenantId),
          eq(abdmLinkRequests.referenceNumber, referenceNumber),
        ),
      ),
  );
}

/** The one identifier a gateway callback may be trusted on — the facility id we registered. */
async function tenantForHip(hipId: string): Promise<string | null> {
  const { db } = await import('../../db/client');
  const { abdmFacilityConfig } = await import('../../db/schema');
  const rows = await db
    .select()
    .from(abdmFacilityConfig)
    .where(eq(abdmFacilityConfig.hipId, hipId))
    .limit(1);
  return rows[0]?.tenantId ?? null;
}
