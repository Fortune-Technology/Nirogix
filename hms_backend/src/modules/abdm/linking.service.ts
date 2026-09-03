import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { abdmCareContexts, patients, type AbdmCareContext } from '../../db/schema';
import { logger } from '../../config/logger';
import { AppError } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { getFacilityConfig } from './abdm.service';
import { HIP_GATEWAY_PATHS } from './abdm.constants';
import { hipPost } from './hipGateway';
import { listLinkableCareContexts, markLinkResult } from './careContext.service';
import { linkTokenFor, requestLinkToken } from './linkToken.service';

/**
 * HIP-initiated linking — attaching this hospital's records to a patient's ABHA (ADR-089).
 *
 * ABDM's instruction is to link "as soon as the health record is ready to be shared". The care
 * context is already recorded the moment a record is finalised (ADR-087); this is the step that
 * tells ABDM about it, and it is deliberately **separate and resumable**:
 *
 * - Linking needs a link token, and acquiring one is asynchronous. A design that linked inline
 *   would have to fail, block, or lie whenever the token was not yet in hand.
 * - Linking is a network call to a government gateway. Tying it to the clinical write would mean a
 *   consultation could fail to save because NHA was slow.
 *
 * So the sweep runs over pending contexts, links what it can, requests a token for what it cannot,
 * and records every outcome. Running it twice is safe; running it late costs only latency.
 */

/** ABDM wants one patient block per HI type, each listing its care contexts. */
type PatientBlock = {
  referenceNumber: string;
  display: string;
  hiType: string;
  count: number;
  careContexts: Array<{ referenceNumber: string; display: string }>;
};

/**
 * Groups care contexts into the payload shape ABDM expects.
 *
 * One context carrying three HI types becomes three blocks referencing the same context — which is
 * exactly why `hi_types` is an array on our side (ADR-087): the fan-out is a wire format, not a
 * reason to hold three records of one visit.
 */
export function toPatientBlocks(
  contexts: AbdmCareContext[],
  patientReference: string,
): PatientBlock[] {
  const byType = new Map<string, Array<{ referenceNumber: string; display: string }>>();
  for (const ctx of contexts) {
    for (const hiType of ctx.hiTypes) {
      const list = byType.get(hiType) ?? [];
      list.push({ referenceNumber: ctx.referenceNumber, display: ctx.displayLabel });
      byType.set(hiType, list);
    }
  }
  return [...byType.entries()].map(([hiType, careContexts]) => ({
    referenceNumber: patientReference,
    display: patientReference,
    hiType,
    count: careContexts.length,
    careContexts,
  }));
}

/**
 * Links one patient's pending care contexts.
 *
 * Everything is grouped into a single call per patient rather than one per context: ABDM notifies
 * every subscribed PHR app on each link, and a patient whose visit produced four records should get
 * one notification, not four.
 */
export async function linkPendingForPatient(
  tenantId: string,
  patientId: string,
): Promise<{ linked: number; reason?: string }> {
  const patient = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!patient?.abhaAddress || !patient.abhaVerifiedAt) {
    return { linked: 0, reason: 'The patient has no verified ABHA address' };
  }

  const pending = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmCareContexts)
      .where(
        and(
          eq(abdmCareContexts.tenantId, tenantId),
          eq(abdmCareContexts.patientId, patientId),
          eq(abdmCareContexts.status, 'pending'),
        ),
      ),
  );
  if (pending.length === 0) return { linked: 0, reason: 'Nothing pending' };

  const facility = await getFacilityConfig(tenantId, pending[0]!.branchId);
  if (!facility?.hipId)
    return { linked: 0, reason: 'This hospital has no HFR facility id configured' };

  const token = await linkTokenFor(tenantId, patient.abhaAddress);
  if (!token) {
    // Not an error: the token arrives on a webhook, and the next sweep will pick these up.
    await requestLinkToken(tenantId, { patientId, hipId: facility.hipId });
    return { linked: 0, reason: 'Waiting for a link token' };
  }

  try {
    await hipPost(
      HIP_GATEWAY_PATHS.linkCareContext,
      {
        abhaAddress: patient.abhaAddress,
        abhaNumber: patient.abhaNumber ?? '',
        patient: toPatientBlocks(pending, patient.uhid),
      },
      { hipId: facility.hipId, linkToken: token },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Linking failed';
    // Every context in the batch failed together, and each records why — a stuck context has to be
    // diagnosable without replaying the call.
    for (const ctx of pending)
      await markLinkResult(tenantId, ctx.id, { linked: false, error: message });
    return { linked: 0, reason: message };
  }

  // ABDM confirms on a webhook, but the request was accepted: mark them linked now and let the
  // callback correct the record if it disagrees. The alternative — leaving them pending — means a
  // sweep re-links the same contexts every time it runs.
  for (const ctx of pending) {
    await markLinkResult(tenantId, ctx.id, { linked: true, abhaAddress: patient.abhaAddress });
  }
  return { linked: pending.length };
}

/**
 * The sweep: links everything linkable for a hospital.
 *
 * Resumable and idempotent by construction — it reads only `pending` contexts and only for patients
 * with a **verified** ABHA, so running it on a schedule, after a deploy, or twice by accident all
 * do the right thing.
 */
export async function linkPendingCareContexts(
  tenantId: string,
  limit = 50,
): Promise<{ patients: number; linked: number }> {
  const rows = await listLinkableCareContexts(tenantId, limit);
  const patientIds = [...new Set(rows.map((r) => r.careContext.patientId))];

  let linked = 0;
  for (const patientId of patientIds) {
    try {
      const result = await linkPendingForPatient(tenantId, patientId);
      linked += result.linked;
    } catch (err) {
      // One patient's failure must not stop the sweep for everyone else.
      logger.error({ err, tenantId, patientId }, 'ABDM linking sweep failed for a patient');
    }
  }
  return { patients: patientIds.length, linked };
}

/** What HIE-CM's two acknowledgement callbacks carry, in either of the shapes NHA spells them. */
export interface GatewayAcknowledgement {
  requestId?: string;
  timestamp?: string;
  status?: string;
  acknowledgement?: { status?: string };
  error?: { code?: string; message?: string } | null;
  resp?: { requestId?: string };
  response?: { requestId?: string };
}

/**
 * HIE-CM telling us how an outbound notify actually went (M2 §4.3.7 and §4.3.9).
 *
 * Both are recorded as audit entries rather than rows of their own. That is a deliberate limit:
 * neither acknowledgement changes any clinical or consent state — it says whether a message we
 * already sent was accepted — and a table whose only reader is a support question is a migration
 * with no user. The originating `requestId` is in the audit metadata of the send, so the pair reads
 * back together.
 *
 * Unattributable acknowledgements are logged and dropped: answering 5xx would make NHA retry
 * something that can never succeed.
 */
export async function recordNotifyAcknowledgement(
  kind: 'care_context' | 'sms',
  hipId: string,
  body: GatewayAcknowledgement,
): Promise<void> {
  const tenantId = hipId ? await tenantForHip(hipId) : null;
  if (!tenantId) {
    logger.warn({ hipId, kind }, 'Notify acknowledgement for an unknown facility — discarded');
    return;
  }

  // NHA uses `resp` in one section and `response` in the other, and states the outcome as a bare
  // `status` in one and `acknowledgement.status` in the other. Reading only one spelling would
  // record half the acknowledgements as anonymous failures.
  const originalRequestId = body.resp?.requestId ?? body.response?.requestId ?? null;
  const status = body.acknowledgement?.status ?? body.status ?? (body.error ? 'FAILED' : null);

  await writeAudit({
    tenantId,
    actorUserId: null,
    action:
      kind === 'sms' ? 'abdm.sms_notify.acknowledged' : 'abdm.care_context.update_acknowledged',
    resourceType: 'abdm_facility_config',
    resourceId: null,
    severity: body.error ? 'warning' : 'notice',
    // Status and error code only — no phone number, no ABHA address, no patient.
    metadata: { requestId: originalRequestId, status, error: body.error?.code ?? null },
  });
}

/** Resolves the hospital from its HFR facility id — the one identifier a callback may be trusted on. */
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

/**
 * Tells ABDM an already-linked care context has new records./**
 * Tells ABDM an already-linked care context has new records.
 *
 * Distinct from linking: the context exists, the patient already has it, and this is what makes
 * their PHR app show that there is more to fetch. Without it a second record added to the same
 * visit is invisible until something else triggers a refresh.
 */
export async function notifyCareContextUpdate(
  tenantId: string,
  careContextId: string,
): Promise<void> {
  const context = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(abdmCareContexts)
      .where(and(eq(abdmCareContexts.tenantId, tenantId), eq(abdmCareContexts.id, careContextId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!context)
    throw new AppError(404, 'ABDM_CARE_CONTEXT_NOT_FOUND', 'That care context was not found');
  if (context.status !== 'linked' || !context.abhaAddress) {
    throw new AppError(422, 'ABDM_NOT_LINKED', 'That care context has not been linked yet');
  }

  const facility = await getFacilityConfig(tenantId, context.branchId);
  const token = await linkTokenFor(tenantId, context.abhaAddress);
  if (!facility?.hipId || !token)
    throw new AppError(422, 'ABDM_NOT_READY', 'No facility id or link token is available');

  // Our own request id, sent in the body and recorded in the audit, because HIE-CM's
  // acknowledgement (`/api/v3/links/context/on-notify`) quotes it back and nothing else in the
  // callback identifies which notify it answers.
  const requestId = randomUUID();

  await hipPost(
    HIP_GATEWAY_PATHS.notifyCareContext,
    {
      requestId,
      timestamp: new Date().toISOString(),
      notification: {
        careContext: {
          careContextReference: context.referenceNumber,
          patientReference: context.abhaAddress,
        },
        date: new Date().toISOString(),
        hiTypes: context.hiTypes,
        hip: { id: facility.hipId },
        patient: { id: context.abhaAddress },
      },
    },
    { hipId: facility.hipId, linkToken: token },
  );

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.care_context.update_notified',
    resourceType: 'abdm_care_context',
    resourceId: careContextId,
    metadata: { hiTypes: context.hiTypes, requestId },
  });
}

/**
 * The fallback when the patient never gave us an ABHA: ABDM texts them a deep link.
 *
 * Their PHR app then creates or opens an ABHA, discovers our records and links them itself. This is
 * the only branch where the patient's **phone number** leaves our system, which is why it carries
 * its own audit entry and why the number is never logged.
 */
export async function notifyPatientBySms(
  tenantId: string,
  input: { patientId: string; phone?: string },
): Promise<{ sent: boolean; reason?: string }> {
  const patient = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!patient) return { sent: false, reason: 'Patient not found' };

  // Pointless and intrusive: a patient who already shared an ABHA gets their records linked
  // directly, and does not need a text telling them to go and find them.
  if (patient.abhaAddress && patient.abhaVerifiedAt) {
    return { sent: false, reason: 'The patient already has a linked ABHA address' };
  }

  const phone = (input.phone ?? patient.phone ?? '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone))
    return { sent: false, reason: 'No valid mobile number for this patient' };

  const facility = await getFacilityConfig(tenantId);
  if (!facility?.hipId)
    return { sent: false, reason: 'This hospital has no HFR facility id configured' };

  // Recorded, not discarded: HIE-CM answers on `/api/v3/patients/sms/on-notify` quoting this id,
  // and it is the only thing tying that answer to this patient.
  const smsRequestId = randomUUID();

  await hipPost(
    HIP_GATEWAY_PATHS.smsNotify,
    {
      notification: {
        hip: { id: facility.hipId, name: facility.facilityName ?? 'Hospital' },
        phoneNo: phone,
      },
      requestId: smsRequestId,
      timestamp: new Date().toISOString(),
    },
    { hipId: facility.hipId },
  );

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.sms_notify.sent',
    resourceType: 'patient',
    resourceId: input.patientId,
    severity: 'notice',
    // The number itself is not recorded — the fact that we texted this patient is the auditable event.
    metadata: { hipId: facility.hipId, requestId: smsRequestId },
  });
  return { sent: true };
}

/**
 * Records ABDM's verdict on a link, arriving after we optimistically marked the contexts linked.
 *
 * Only a **failure** changes anything. A success confirms what we already recorded, and rewriting
 * `linked_at` on every confirmation would move the timestamp away from when the record actually
 * became shareable. A failure, though, has to be believed: the desk would otherwise go on thinking
 * records are in the patient's app when they never arrived.
 */
export async function recordLinkCallback(input: {
  hipId: string;
  abhaAddress: string;
  status?: string;
  error?: string;
}): Promise<{ updated: number }> {
  const { db } = await import('../../db/client');
  const { abdmFacilityConfig } = await import('../../db/schema');
  const facilityRows = await db
    .select()
    .from(abdmFacilityConfig)
    .where(eq(abdmFacilityConfig.hipId, input.hipId))
    .limit(1);
  const tenantId = facilityRows[0]?.tenantId;
  if (!tenantId) {
    logger.warn({ hipId: input.hipId }, 'Link callback for an unknown facility');
    return { updated: 0 };
  }

  const failed = Boolean(input.error) || (input.status ? !/success/i.test(input.status) : false);
  if (!failed) {
    await writeAudit({
      tenantId,
      actorUserId: null,
      action: 'abdm.care_context.link_confirmed',
      resourceType: 'abdm_link_token',
      resourceId: null,
      metadata: { abhaAddress: input.abhaAddress, status: input.status },
    });
    return { updated: 0 };
  }

  // Put them back to pending rather than failed: the sweep should retry, because most link
  // failures are transient (an expired token, a gateway blip) rather than a broken record.
  const reverted = await runWithTenant(tenantId, (tx) =>
    tx
      .update(abdmCareContexts)
      .set({
        status: 'pending',
        linkedAt: null,
        lastError: (input.error ?? input.status ?? 'Link refused').slice(0, 300),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(abdmCareContexts.tenantId, tenantId),
          eq(abdmCareContexts.abhaAddress, input.abhaAddress),
          eq(abdmCareContexts.status, 'linked'),
        ),
      )
      .returning({ id: abdmCareContexts.id }),
  );

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.care_context.link_failed',
    resourceType: 'abdm_care_context',
    resourceId: reverted[0]?.id ?? null,
    severity: 'warning',
    metadata: {
      abhaAddress: input.abhaAddress,
      error: input.error,
      status: input.status,
      reverted: reverted.length,
    },
  });
  return { updated: reverted.length };
}
