import { and, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { abdmCareContexts, abdmDataTransfers, type AbdmDataTransfer } from '../../db/schema';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { writeAudit } from '../audit/audit.service';
import { getJobRunner } from '../../jobs/runner';
import { DATA_FLOW_PATHS } from './abdm.constants';
import { hipPost, pushToHiu } from './hipGateway';
import { checkConsentForTransfer } from './consent.service';
import { buildDocumentBundle } from './fhir/fhirBuilder';
import { encryptForHiu, EncryptionUnavailableError } from './cipher';
import type { HiType } from './careContext.service';

/**
 * Sending health records to a consented Health Information User (ADR-091).
 *
 * This is the only place in the product where clinical records leave the hospital, so the shape of
 * the code is dictated by that rather than by convenience:
 *
 * - **The consent is re-checked immediately before sending**, not when the request arrived. A
 *   consent can be revoked in the seconds between, and the artefact we hold at the moment of
 *   sending is the only one that matters.
 * - **Nothing is pushed unencrypted, on any path.** Encryption failure aborts the transfer and
 *   tells the gateway it failed. There is no degraded mode.
 * - **Only the consented care contexts, HI types and date window travel.** The request says what
 *   the HIU wants; the consent says what they may have; the intersection is what is sent.
 * - **The work happens on the queue.** NHA allows twenty minutes, building and encrypting a report
 *   can take real time, and none of it should hold open the gateway's connection.
 */

/** Roughly 4 MB of ciphertext per page — comfortably inside what gateways and HIUs accept. */
const MAX_PAGE_BYTES = 4 * 1024 * 1024;

type TransferEntry = {
  careContextReference: string;
  content: string;
  checksum: string;
  media: string;
};

export type HealthInformationRequest = {
  hipId: string;
  transactionId: string;
  requestId?: string;
  consentId: string;
  dataPushUrl: string;
  hiuPublicKey?: string;
  hiuNonce?: string;
  careContextRefs: string[];
  from?: string;
  to?: string;
};

/**
 * Accepts a request, acknowledges it, and queues the work.
 *
 * Acknowledgement is deliberately separate from doing the work: NHA expects a prompt
 * `ACKNOWLEDGED`, and a gateway left waiting while we build FHIR for a year of records would time
 * out on a transfer that was going to succeed.
 */
export async function receiveHealthInformationRequest(
  input: HealthInformationRequest,
): Promise<{ accepted: boolean; reason?: string }> {
  const tenantId = await tenantForHip(input.hipId);
  if (!tenantId) {
    logger.warn({ hipId: input.hipId }, 'Health information request for an unknown facility');
    return { accepted: false };
  }

  const deadlineAt = new Date(Date.now() + env.ABDM_TRANSFER_SLA_SECONDS * 1000);
  const transfer = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(abdmDataTransfers)
      .values({
        tenantId,
        transactionId: input.transactionId,
        requestId: input.requestId ?? null,
        consentId: input.consentId,
        dataPushUrl: input.dataPushUrl,
        hiuPublicKey: input.hiuPublicKey ?? null,
        hiuNonce: input.hiuNonce ?? null,
        careContextRefs: input.careContextRefs,
        dateRangeFrom: input.from ? new Date(input.from) : null,
        dateRangeTo: input.to ? new Date(input.to) : null,
        deadlineAt,
      })
      // A re-sent request is the same transfer, not a second one.
      .onConflictDoUpdate({
        target: [abdmDataTransfers.tenantId, abdmDataTransfers.transactionId],
        set: { dataPushUrl: input.dataPushUrl, updatedAt: new Date() },
      })
      .returning();
    return rows[0]!;
  });

  await hipPost(
    DATA_FLOW_PATHS.onRequest,
    {
      hiRequest: { sessionStatus: 'ACKNOWLEDGED', transactionId: input.transactionId },
      response: { requestId: input.requestId },
    },
    { hipId: input.hipId },
  );
  await setStatus(tenantId, transfer.id, 'acknowledged');

  await getJobRunner().enqueue('abdm.transfer', { tenantId, transferId: transfer.id });

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.transfer.requested',
    resourceType: 'abdm_data_transfer',
    resourceId: transfer.id,
    severity: 'notice',
    metadata: {
      consentId: input.consentId,
      careContexts: input.careContextRefs.length,
      deadlineAt: deadlineAt.toISOString(),
    },
  });
  return { accepted: true };
}

/**
 * Builds, encrypts and pushes the records for one transfer.
 *
 * Run from the queue. Every refusal path notifies the gateway rather than failing silently — a HIU
 * waiting on a transfer that will never arrive is worse than one told promptly that it will not.
 */
export async function performTransfer(
  tenantId: string,
  transferId: string,
): Promise<{ sent: number; reason?: string }> {
  const transfer = await loadTransfer(tenantId, transferId);
  if (!transfer) return { sent: 0, reason: 'Unknown transfer' };
  if (transfer.status === 'transferred') return { sent: 0, reason: 'Already transferred' };

  // 1. The consent, re-checked NOW. It may have been revoked since the request arrived.
  const consent = await checkConsentForTransfer(tenantId, {
    consentId: transfer.consentId,
    from: transfer.dateRangeFrom ?? undefined,
    to: transfer.dateRangeTo ?? undefined,
  });
  if (!consent.allowed)
    return refuse(tenantId, transfer, consent.reason ?? 'Consent does not permit this transfer');

  // 2. Only contexts the consent actually covers, intersected with what we hold.
  const consented = consentedReferences(consent.consent?.careContexts);
  const contexts = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmCareContexts)
      .where(and(eq(abdmCareContexts.tenantId, tenantId), eq(abdmCareContexts.status, 'linked'))),
  );
  const eligible = contexts.filter(
    (c) =>
      transfer.careContextRefs.includes(c.referenceNumber) &&
      (consented.length === 0 || consented.includes(c.referenceNumber)),
  );
  if (eligible.length === 0)
    return refuse(tenantId, transfer, 'No care context in this request is covered by the consent');

  // 3. Only the HI types the patient allowed.
  const allowedTypes = new Set(consent.consent?.hiTypes ?? []);

  const entries: TransferEntry[] = [];
  let keyMaterial: Awaited<ReturnType<typeof encryptForHiu>>['keyMaterial'] | undefined;

  for (const context of eligible) {
    for (const hiType of context.hiTypes) {
      if (allowedTypes.size > 0 && !allowedTypes.has(hiType)) continue;
      if (!context.visitId) continue;

      let bundle;
      try {
        bundle = await buildDocumentBundle(tenantId, {
          visitId: context.visitId,
          hiType: hiType as HiType,
        });
      } catch (err) {
        // A context with nothing to share for this type is normal, not a failure of the transfer.
        logger.info({ tenantId, hiType, err }, 'Skipping a care context with nothing to share');
        continue;
      }

      try {
        const encrypted = await encryptForHiu({
          plaintext: JSON.stringify(bundle),
          hiuPublicKey: transfer.hiuPublicKey ?? '',
          hiuNonce: transfer.hiuNonce ?? '',
        });
        keyMaterial = encrypted.keyMaterial;
        entries.push({
          careContextReference: context.referenceNumber,
          content: encrypted.content,
          checksum: encrypted.checksum,
          media: 'application/fhir+json',
        });
      } catch (err) {
        // The one failure that stops everything. No plaintext, on any path.
        if (err instanceof EncryptionUnavailableError) {
          return refuse(
            tenantId,
            transfer,
            `Records could not be encrypted: ${err.message}`,
            'failed',
          );
        }
        throw err;
      }
    }
  }

  if (entries.length === 0 || !keyMaterial) {
    return refuse(
      tenantId,
      transfer,
      'Nothing shareable was found for the consented period and record types',
    );
  }

  // 4. Push to the HIU, one page at a time. ABDM pages the transfer rather than allowing one
  // enormous body, and a year of records for a frequent patient is genuinely large.
  const pages = paginate(entries);
  for (const [index, page] of pages.entries()) {
    const pushed = await pushToHiu(transfer.dataPushUrl, {
      pageNumber: index + 1,
      pageCount: pages.length,
      transactionId: transfer.transactionId,
      entries: page,
      keyMaterial,
    });
    if (!pushed.ok) {
      // Partial delivery is a failed transfer, not a partial success: the HIU is told the flow
      // errored so it re-requests, rather than believing it holds a complete record.
      return refuse(
        tenantId,
        transfer,
        `The HIU rejected page ${index + 1} of the data push (${pushed.status})`,
        'failed',
      );
    }
  }

  await notifyDataFlow(
    tenantId,
    transfer,
    entries.map((e) => e.careContextReference),
    'OK',
  );
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(abdmDataTransfers)
      .set({
        status: 'transferred',
        entriesSent: entries.length,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(abdmDataTransfers.id, transfer.id)),
  );

  const late = transfer.deadlineAt ? Date.now() > transfer.deadlineAt.getTime() : false;
  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.transfer.completed',
    resourceType: 'abdm_data_transfer',
    resourceId: transfer.id,
    severity: late ? 'warning' : 'notice',
    // Recorded so a pattern of near-misses is visible before NHA notices it in certification.
    metadata: { entries: entries.length, consentId: transfer.consentId, withinSla: !late },
  });
  if (late)
    logger.warn(
      { tenantId, transferId: transfer.id },
      'ABDM transfer completed after the SLA deadline',
    );

  return { sent: entries.length };
}

/**
 * Refuses a transfer, tells the gateway, and records why.
 *
 * A refusal is a normal outcome of a consent system working, not an error — but it is always
 * *announced*, because the HIU is waiting and silence is indistinguishable from a system that is
 * broken.
 */
async function refuse(
  tenantId: string,
  transfer: AbdmDataTransfer,
  reason: string,
  status: 'refused' | 'failed' = 'refused',
): Promise<{ sent: 0; reason: string }> {
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(abdmDataTransfers)
      .set({ status, reason: reason.slice(0, 300), completedAt: new Date(), updatedAt: new Date() })
      .where(eq(abdmDataTransfers.id, transfer.id)),
  );

  await notifyDataFlow(tenantId, transfer, transfer.careContextRefs, 'ERRORED').catch(
    (err: unknown) => logger.error({ err }, 'Could not notify ABDM of a refused transfer'),
  );

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.transfer.refused',
    resourceType: 'abdm_data_transfer',
    resourceId: transfer.id,
    severity: 'warning',
    metadata: { reason, consentId: transfer.consentId },
  });
  logger.warn({ tenantId, transferId: transfer.id, reason }, 'ABDM transfer refused');
  return { sent: 0, reason };
}

/** Tells the gateway how the flow ended, per care context. */
async function notifyDataFlow(
  tenantId: string,
  transfer: AbdmDataTransfer,
  references: string[],
  hiStatus: 'OK' | 'ERRORED',
): Promise<void> {
  const facility = await facilityForTenant(tenantId);
  await hipPost(
    DATA_FLOW_PATHS.notify,
    {
      notification: {
        consentId: transfer.consentId,
        doneAt: new Date().toISOString(),
        notifier: { id: facility ?? 'HIP', type: 'HIP' },
        statusNotification: {
          hipId: facility ?? 'HIP',
          sessionStatus: hiStatus === 'OK' ? 'TRANSFERRED' : 'FAILED',
          statusResponses: references.map((reference) => ({
            careContextReference: reference,
            description: hiStatus === 'OK' ? 'Transferred' : 'Not transferred',
            hiStatus,
          })),
        },
        transactionId: transfer.transactionId,
      },
    },
    { hipId: facility ?? undefined },
  );
}

/**
 * Splits entries into pages ABDM will accept.
 *
 * Bounded by **byte size, not entry count**: one long admission can outweigh fifty prescriptions,
 * and a page limit expressed in entries would pass here and fail at the HIU. A single entry larger
 * than the limit still ships alone — refusing to send a large record would be worse than sending
 * one big page.
 */
function paginate(entries: TransferEntry[]): TransferEntry[][] {
  const pages: TransferEntry[][] = [];
  let page: TransferEntry[] = [];
  let bytes = 0;
  for (const entry of entries) {
    const size = entry.content.length;
    if (page.length > 0 && bytes + size > MAX_PAGE_BYTES) {
      pages.push(page);
      page = [];
      bytes = 0;
    }
    page.push(entry);
    bytes += size;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

/** The care contexts named on a consent artefact, whatever shape it stored them in. */
function consentedReferences(careContexts: unknown): string[] {
  if (!Array.isArray(careContexts)) return [];
  return careContexts
    .map((c) => (c as { careContextReference?: string }).careContextReference)
    .filter((r): r is string => typeof r === 'string');
}

async function loadTransfer(
  tenantId: string,
  transferId: string,
): Promise<AbdmDataTransfer | null> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmDataTransfers)
      .where(and(eq(abdmDataTransfers.tenantId, tenantId), eq(abdmDataTransfers.id, transferId)))
      .limit(1),
  );
  return rows[0] ?? null;
}

async function setStatus(tenantId: string, transferId: string, status: string): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(abdmDataTransfers)
      .set({ status, updatedAt: new Date() })
      .where(eq(abdmDataTransfers.id, transferId)),
  );
}

async function facilityForTenant(tenantId: string): Promise<string | null> {
  const { getFacilityConfig } = await import('./abdm.service');
  return (await getFacilityConfig(tenantId))?.hipId ?? null;
}

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
