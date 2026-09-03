import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { db } from '../../db/client';
import {
  abdmHiuConsentRequests,
  abdmHiuConsents,
  abdmHiuDataTransfers,
  abdmHiuRecords,
  type AbdmHiuConsent,
  type AbdmHiuDataTransfer,
} from '../../db/schema';
import { encryptSecret, decryptSecret } from '../../security/encryption';
import { AppError } from '../../http/error';
import { logger } from '../../config/logger';
import { writeAudit } from '../audit/audit.service';
import { DATA_FLOW_PATHS, HIU_DATA_REQUEST_PATH } from './abdm.constants';
import { hipPost } from './hipGateway';
import { getFacilityConfig } from './abdm.service';
import {
  checksumMatches,
  decryptFromHip,
  generateKeyPair,
  EncryptionUnavailableError,
} from './cipher';
import { dataPushUrl, usableConsents } from './hiuConsent.service';

/**
 * Pulling another hospital's records in, and reading them (ADR-093).
 *
 * The inverse of ADR-091, and the asymmetry matters. Sending, we control what leaves and can refuse.
 * Receiving, the payload arrives from a stranger on a connection we did not initiate, encrypted with
 * keys we generated minutes earlier. So the shape of this file is set by three rules:
 *
 * - **The consent is re-checked at the moment of asking**, exactly as in M2 — and again the check is
 *   the clock, not a status column. A consent revoked between the doctor pressing the button and the
 *   request going out must produce no request at all.
 * - **Nothing is stored that we could not decrypt and verify.** An entry whose checksum does not
 *   match is discarded and reported as errored, never stored "just in case": a doctor shown an
 *   incomplete or corrupted history has no way to know it is incomplete.
 * - **The private key lives encrypted and dies with the consent.** It is stored because the push
 *   arrives on a later connection, and `abdm_hiu_data_transfers.consent_id` cascades, so purging a
 *   consent destroys the only key that could read anything sent under it.
 */

export type RequestRecordsResult = { transferId: string; transactionId: string };

/**
 * Asks one hospital for the records a consent covers.
 *
 * The key pair is generated here and now, per request. Its public half goes out in `keyMaterial`;
 * its private half is encrypted and stored, because the answer arrives on a different connection
 * some minutes later and there is nothing else that could read it.
 */
export async function requestRecords(
  tenantId: string,
  consentRowId: string,
): Promise<RequestRecordsResult> {
  const consent = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(abdmHiuConsents)
      .where(and(eq(abdmHiuConsents.tenantId, tenantId), eq(abdmHiuConsents.id, consentRowId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!consent) throw new AppError(404, 'ABDM_CONSENT_NOT_FOUND', 'No such consent');

  // Re-checked at the moment of asking, by the clock. A consent revoked since the doctor pressed
  // the button must produce no request at all.
  assertUsable(consent);

  // Fails loudly when the push URL is unconfigured: ABDM accepts a request naming an unreachable
  // endpoint and then delivers nothing, which reads as a broken feature rather than a missing key.
  const pushUrl = dataPushUrl();

  const keys = await generateKeyPair();
  // A PLACEHOLDER, not the transaction id. The request body carries none: the consent manager
  // assigns one and returns it on `/api/v3/hiu/health-information/on-request`, and the HIP pushes
  // under that. This row is written before the request goes out, so the column needs a value now;
  // `recordDataRequestAck` replaces it the moment ABDM states the real one.
  const transactionId = randomUUID();
  const requestId = randomUUID();

  const transfer = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(abdmHiuDataTransfers)
      .values({
        tenantId,
        consentId: consent.id,
        transactionId,
        requestId,
        // Encrypted at rest, like every ABDM credential (ADR-084).
        privateKeyEnc: encryptSecret(keys.privateKey),
        publicKey: keys.publicKey,
        nonce: keys.nonce,
      })
      .returning();
    return rows[0]!;
  });

  const facility = await getFacilityConfig(tenantId);
  try {
    await hipPost(
      HIU_DATA_REQUEST_PATH,
      {
        hiRequest: {
          consent: { id: consent.consentId },
          dateRange: {
            from: consent.dateRangeFrom?.toISOString(),
            to: consent.dateRangeTo?.toISOString(),
          },
          dataPushUrl: pushUrl,
          keyMaterial: {
            cryptoAlg: 'ECDH',
            curve: 'Curve25519',
            dhPublicKey: {
              expiry: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
              parameters: 'Curve25519/32byte random key',
              // The X.509 form when Fidelius gives us one, exactly as the HIP side sends it
              // (ADR-107). NHA's note that "certain HIUs only accept the public key in the
              // base64-encoded X.509 format" was applied to the HIP half and missed here — and the
              // constraint is symmetric, so a HIP that is strict about it could not read us.
              keyValue: keys.x509PublicKey ?? keys.publicKey,
            },
            nonce: keys.nonce,
          },
        },
        requestId,
      },
      { hipId: facility?.hipId },
    );
  } catch (err) {
    await finish(tenantId, transfer.id, 'failed', (err as Error).message);
    throw err;
  }

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.hiu.records_requested',
    resourceType: 'abdm_hiu_consent',
    resourceId: consent.id,
    severity: 'notice',
    metadata: { hipId: consent.hipId, transactionId, hiTypes: consent.hiTypes },
  });
  return { transferId: transfer.id, transactionId };
}

/** Asks every hospital that granted a consent for this patient. One request per artefact. */
export async function requestAllRecords(
  tenantId: string,
  patientId: string,
): Promise<RequestRecordsResult[]> {
  const consents = await usableConsents(tenantId, patientId);
  const results: RequestRecordsResult[] = [];
  for (const consent of consents) {
    try {
      results.push(await requestRecords(tenantId, consent.id));
    } catch (err) {
      // One hospital being unreachable must not stop the others — a partial history is worth more
      // than none, provided the doctor is told which sources answered.
      logger.warn(
        { tenantId, consentId: consent.consentId, err },
        'Could not request records from one HIP',
      );
    }
  }
  return results;
}

/**
 * The consent manager's answer to our request for records (`on-request`).
 *
 * This is where the transaction id comes from, and it is the whole reason the callback matters: the
 * request body has no field for one, so until this arrives our row is keyed on a placeholder that
 * nobody else has ever seen. A HIP pushing under ABDM's id would match nothing and be discarded.
 *
 * Correlated on **our** `requestId`, which is the one identifier both sides held before this call.
 * Unknown ids are logged and dropped rather than throwing — an inbound callback we cannot place is
 * not an error the caller can act on, and answering 5xx makes NHA retry something that will never
 * succeed.
 */
export async function recordDataRequestAck(body: {
  hiRequest?: { transactionId?: string; sessionStatus?: string };
  error?: { code?: string; message?: string } | null;
  response?: { requestId?: string };
}): Promise<void> {
  const requestId = body.response?.requestId;
  if (!requestId) {
    logger.warn('HIU data-request acknowledgement carried no requestId — discarded');
    return;
  }

  const rows = await db
    .select()
    .from(abdmHiuDataTransfers)
    .where(eq(abdmHiuDataTransfers.requestId, requestId))
    .limit(1);
  const transfer = rows[0];
  if (!transfer) {
    logger.warn({ requestId }, 'Acknowledgement for an unknown HIU data request — discarded');
    return;
  }

  if (body.error) {
    // The consent manager refused the request outright — an expired artefact, usually. There will
    // be no push, so the transfer is closed now rather than left waiting for a delivery.
    await finish(
      transfer.tenantId,
      transfer.id,
      'failed',
      body.error.message ?? body.error.code ?? 'The consent manager refused the request',
    );
    return;
  }

  const transactionId = body.hiRequest?.transactionId;
  if (!transactionId) {
    logger.warn({ requestId }, 'HIU data-request acknowledgement carried no transactionId');
    return;
  }

  await runWithTenant(transfer.tenantId, (tx) =>
    tx
      .update(abdmHiuDataTransfers)
      .set({ transactionId, updatedAt: new Date() })
      .where(eq(abdmHiuDataTransfers.id, transfer.id)),
  );

  await writeAudit({
    tenantId: transfer.tenantId,
    actorUserId: null,
    action: 'abdm.hiu.data_request_acknowledged',
    resourceType: 'abdm_hiu_data_transfer',
    resourceId: transfer.id,
    // The transaction id is the correlation handle, not a secret — and without it in the audit a
    // support question about a missing delivery has nothing to search on.
    metadata: { transactionId, sessionStatus: body.hiRequest?.sessionStatus ?? null },
  });
}

export type PushedPage = {
  transactionId: string;
  pageNumber?: number;
  pageCount?: number;
  entries: Array<{
    content?: string;
    media?: string;
    checksum?: string;
    careContextReference?: string;
    link?: string;
  }>;
  keyMaterial?: {
    dhPublicKey?: { keyValue?: string };
    nonce?: string;
  };
};

/**
 * A hospital delivering records we asked for.
 *
 * Every entry is decrypted, checksum-verified and only then stored. Failures are counted rather than
 * thrown: a page holding nine good entries and one corrupt one should yield nine records and an
 * honest error status, not zero records and an exception.
 */
export async function receivePushedRecords(
  page: PushedPage,
): Promise<{ stored: number; failed: number }> {
  // The transaction id is the only handle an inbound push carries, and it is **ABDM's** — recorded
  // by `recordDataRequestAck` when the consent manager answered our request. It used to be a value
  // we minted ourselves, which nobody else knew, so a real push matched nothing and was discarded
  // with the warning below. Mock mode never showed it: there, both halves are us.
  const rows = await db
    .select()
    .from(abdmHiuDataTransfers)
    .where(eq(abdmHiuDataTransfers.transactionId, page.transactionId))
    .limit(1);
  const transfer = rows[0];
  if (!transfer) {
    logger.warn(
      { transactionId: page.transactionId },
      'Records pushed for an unknown transaction — discarded',
    );
    return { stored: 0, failed: 0 };
  }
  const tenantId = transfer.tenantId;

  // The patient comes from the REQUEST, not the consent or the transfer — neither of those carries
  // one, and a record has to be attached to a chart to be worth anything.
  const joined = await runWithTenant(tenantId, async (tx) => {
    const found = await tx
      .select({ consent: abdmHiuConsents, patientId: abdmHiuConsentRequests.patientId })
      .from(abdmHiuConsents)
      .innerJoin(abdmHiuConsentRequests, eq(abdmHiuConsentRequests.id, abdmHiuConsents.requestId))
      .where(
        and(eq(abdmHiuConsents.tenantId, tenantId), eq(abdmHiuConsents.id, transfer.consentId)),
      )
      .limit(1);
    return found[0] ?? null;
  });
  const consent = joined?.consent ?? null;
  const patientId = joined?.patientId;

  // Revoked or expired while the data was in flight. Arriving records are dropped unread — the
  // permission that would have justified storing them no longer exists.
  if (!consent || !patientId || !isUsable(consent)) {
    await finish(
      tenantId,
      transfer.id,
      'failed',
      'The consent was withdrawn before the records arrived',
    );
    await notifyTransfer(tenantId, transfer, [], 'ERRORED');
    logger.warn(
      { tenantId, transactionId: page.transactionId },
      'Records arrived under a consent that no longer permits them',
    );
    return { stored: 0, failed: page.entries.length };
  }

  if (!transfer.privateKeyEnc) {
    await finish(tenantId, transfer.id, 'failed', 'No private key is held for this transfer');
    return { stored: 0, failed: page.entries.length };
  }

  const ourPrivateKey = decryptSecret(transfer.privateKeyEnc);
  const hipPublicKey = page.keyMaterial?.dhPublicKey?.keyValue ?? '';
  const hipNonce = page.keyMaterial?.nonce ?? '';

  let stored = 0;
  let failed = 0;
  const deliveredRefs: string[] = [];

  for (const entry of page.entries) {
    if (!entry.content) {
      // A `link` entry points at a file we would have to fetch separately; not supported yet, and
      // counted as failed rather than silently ignored so the doctor is not shown a partial history
      // that looks complete.
      failed += 1;
      continue;
    }

    let plaintext: string;
    try {
      plaintext = await decryptFromHip({
        ciphertext: entry.content,
        ourPrivateKey,
        ourNonce: transfer.nonce ?? '',
        hipPublicKey,
        hipNonce,
      });
    } catch (err) {
      if (!(err instanceof EncryptionUnavailableError)) throw err;
      logger.error({ tenantId, err }, 'Could not decrypt a pushed record');
      failed += 1;
      continue;
    }

    // What we hold must be what was sent. Rendering anything else to a clinician is worse than
    // rendering nothing.
    if (!checksumMatches(plaintext, entry.checksum)) {
      logger.error(
        { tenantId, careContext: entry.careContextReference },
        'Checksum mismatch on a pushed record',
      );
      failed += 1;
      continue;
    }

    let bundle: Record<string, unknown>;
    try {
      bundle = JSON.parse(plaintext) as Record<string, unknown>;
    } catch {
      failed += 1;
      continue;
    }

    await runWithTenant(tenantId, (tx) =>
      tx.insert(abdmHiuRecords).values({
        tenantId,
        consentId: consent.id,
        patientId,
        sourceHipId: consent.hipId,
        careContextReference: entry.careContextReference ?? null,
        hiType: hiTypeOf(bundle, consent),
        content: bundle as never,
        recordDate: bundleDate(bundle),
        checksum: entry.checksum ?? null,
      }),
    );
    stored += 1;
    if (entry.careContextReference) deliveredRefs.push(entry.careContextReference);
  }

  const pagesReceived = transfer.pagesReceived + 1;
  const pageCount = page.pageCount ?? transfer.pageCount ?? 1;
  const complete = pagesReceived >= pageCount;

  await runWithTenant(tenantId, (tx) =>
    tx
      .update(abdmHiuDataTransfers)
      .set({
        pagesReceived,
        pageCount,
        entriesStored: transfer.entriesStored + stored,
        status: complete ? (failed > 0 ? 'partial' : 'delivered') : 'receiving',
        ...(complete ? { completedAt: new Date() } : {}),
        ...(failed > 0
          ? { reason: `${failed} entr${failed === 1 ? 'y' : 'ies'} could not be read` }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(abdmHiuDataTransfers.id, transfer.id)),
  );

  // ABDM flips the record to TRANSFERRED on this. Told honestly: `ERRORED` when nothing survived,
  // so a HIP knows its delivery did not land rather than assuming it did.
  if (complete) {
    await notifyTransfer(tenantId, transfer, deliveredRefs, stored > 0 ? 'DELIVERED' : 'ERRORED');
    await writeAudit({
      tenantId,
      actorUserId: null,
      action: 'abdm.hiu.records_received',
      resourceType: 'abdm_hiu_consent',
      resourceId: consent.id,
      severity: failed > 0 ? 'warning' : 'notice',
      // Counts and sources only — never a fragment of the clinical content.
      metadata: { hipId: consent.hipId, stored, failed, pages: pageCount },
    });
  }

  return { stored, failed };
}

/** Tells ABDM how the flow ended, per care context. */
async function notifyTransfer(
  tenantId: string,
  transfer: AbdmHiuDataTransfer,
  references: string[],
  hiStatus: 'DELIVERED' | 'ERRORED',
): Promise<void> {
  const facility = await getFacilityConfig(tenantId);
  await hipPost(
    DATA_FLOW_PATHS.notify,
    {
      notification: {
        consentId: transfer.consentId,
        doneAt: new Date().toISOString(),
        // The one field that differs from the M2 notify: we are the HIU here, not the HIP.
        notifier: { id: facility?.hipId ?? 'HIU', type: 'HIU' },
        statusNotification: {
          hipId: facility?.hipId ?? '',
          sessionStatus: hiStatus === 'DELIVERED' ? 'TRANSFERRED' : 'FAILED',
          statusResponses: references.map((reference) => ({
            careContextReference: reference,
            description: hiStatus === 'DELIVERED' ? 'Delivered' : 'Not delivered',
            hiStatus,
          })),
        },
        transactionId: transfer.transactionId,
      },
    },
    { hipId: facility?.hipId },
  ).catch((err: unknown) =>
    logger.error({ err }, 'Could not notify ABDM of a completed HIU transfer'),
  );
}

/** Throws unless this consent may still yield a record, naming which rule stopped it. */
function assertUsable(consent: AbdmHiuConsent): void {
  if (consent.status !== 'granted') {
    throw new AppError(
      403,
      'ABDM_CONSENT_NOT_GRANTED',
      `This consent is ${consent.status} and cannot be used`,
    );
  }
  if (consent.dataEraseAt && consent.dataEraseAt <= new Date()) {
    throw new AppError(403, 'ABDM_CONSENT_EXPIRED', 'This consent has expired and cannot be used');
  }
}

const isUsable = (consent: AbdmHiuConsent): boolean =>
  consent.status === 'granted' && (!consent.dataEraseAt || consent.dataEraseAt > new Date());

/**
 * Which record type a bundle is.
 *
 * Read from the FHIR Composition's own coding where present, because that is what the source
 * asserted; the consent's types are the fallback, and an unrecognised bundle is stored as a generic
 * health document rather than dropped — an unfamiliar type is not a reason to lose a record.
 */
function hiTypeOf(bundle: Record<string, unknown>, consent: AbdmHiuConsent): string {
  const entries =
    (bundle.entry as Array<{ resource?: { resourceType?: string; type?: { text?: string } } }>) ??
    [];
  const composition = entries.find((e) => e.resource?.resourceType === 'Composition')?.resource;
  const text = composition?.type?.text ?? '';
  const known = [
    'OPConsultation',
    'Prescription',
    'DiagnosticReport',
    'DischargeSummary',
    'ImmunizationRecord',
    'HealthDocumentRecord',
    'WellnessRecord',
  ];
  const matched = known.find((t) =>
    text.replace(/\s+/g, '').toLowerCase().includes(t.toLowerCase()),
  );
  return matched ?? consent.hiTypes[0] ?? 'HealthDocumentRecord';
}

/** The bundle's own clinical date — what the timeline sorts on. */
function bundleDate(bundle: Record<string, unknown>): Date | null {
  const timestamp = typeof bundle.timestamp === 'string' ? bundle.timestamp : null;
  const entries =
    (bundle.entry as Array<{ resource?: { resourceType?: string; date?: string } }>) ?? [];
  const composition = entries.find((e) => e.resource?.resourceType === 'Composition')?.resource;
  const value = composition?.date ?? timestamp;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function finish(
  tenantId: string,
  transferId: string,
  status: string,
  reason?: string,
): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(abdmHiuDataTransfers)
      .set({
        status,
        reason: reason?.slice(0, 300) ?? null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(abdmHiuDataTransfers.id, transferId)),
  );
}
