import { and, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { abdmLinkTokens, patients, type AbdmLinkToken } from '../../db/schema';
import { logger } from '../../config/logger';
import { encryptSecret, isEncryptionConfigured, tryDecryptSecret } from '../../security/encryption';
import { writeAudit } from '../audit/audit.service';
import { HIP_GATEWAY_PATHS } from './abdm.constants';
import { hipPost } from './hipGateway';

/**
 * Link tokens — the credential that lets this hospital attach records to a patient's ABHA (ADR-089).
 *
 * **Acquisition is asynchronous, and the design has to admit that.** We POST a demographic-auth
 * request; NHA answers on our webhook, not in the response. So there is no `getToken()` that can
 * block until one exists — instead `linkTokenFor` returns what we hold, `requestLinkToken` asks for
 * one, and the linking sweep tries again once the webhook has landed. Pretending otherwise would
 * produce a function that returns null for reasons the caller cannot act on.
 *
 * Tokens live roughly six months. `expiresAt` is read from the token's **own `exp` claim** rather
 * than assumed from that figure: a token we believe is valid and is not fails at the moment a
 * patient is waiting for a record to appear in their app.
 */

/** Refresh this long before expiry, so a link never starts with a token about to die mid-flight. */
const RENEW_MARGIN_MS = 24 * 60 * 60_000;

/**
 * Reads the `exp` claim without verifying the signature.
 *
 * Verification is not ours to do — NHA signed it, we are the audience, and we hold no key. The
 * claim is used **only** to decide when to ask for a fresh token, never to authorise anything, so a
 * forged value could at worst make us request a replacement we did not need.
 */
export function linkTokenExpiry(token: string): Date | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number };
    return typeof json.exp === 'number' ? new Date(json.exp * 1000) : null;
  } catch {
    // An unreadable token is not a crash: it is a token to replace.
    return null;
  }
}

/** The usable token for an ABHA address, or null when there is none we can rely on. */
export async function linkTokenFor(
  tenantId: string,
  abhaAddress: string,
  now = new Date(),
): Promise<string | null> {
  const row = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(abdmLinkTokens)
      .where(
        and(eq(abdmLinkTokens.tenantId, tenantId), eq(abdmLinkTokens.abhaAddress, abhaAddress)),
      )
      .limit(1);
    return rows[0] ?? null;
  });
  if (!row?.tokenEnc) return null;
  // Treat a token inside the renewal margin as absent, so the caller asks for a new one rather
  // than starting a link that may expire while the gateway is still processing it.
  if (row.expiresAt && row.expiresAt.getTime() - RENEW_MARGIN_MS <= now.getTime()) return null;
  return tryDecryptSecret(row.tokenEnc);
}

/**
 * Asks NHA for a link token by demographic auth.
 *
 * The demographics are the patient's own, taken from the chart rather than from a caller: this is
 * an assertion to a national registry that we hold this person's record, and the only honest source
 * for it is the record. A request already outstanding is not repeated — the webhook is still coming.
 */
export async function requestLinkToken(
  tenantId: string,
  input: { patientId: string; hipId?: string },
): Promise<{ requested: boolean; reason?: string }> {
  const patient = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId)))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!patient?.abhaAddress) return { requested: false, reason: 'The patient has no ABHA address' };
  // A hand-typed ABHA was never proved (ADR-084); asking a registry to trust it would be our error,
  // not the patient's.
  if (!patient.abhaVerifiedAt)
    return { requested: false, reason: 'The ABHA address has not been verified' };
  if (!patient.dateOfBirth)
    return { requested: false, reason: 'Demographic auth needs a date of birth' };

  const existing = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(abdmLinkTokens)
      .where(
        and(
          eq(abdmLinkTokens.tenantId, tenantId),
          eq(abdmLinkTokens.abhaAddress, patient.abhaAddress!),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  });

  // One request in flight at a time. The webhook is the only thing that resolves it, and asking
  // again just adds another callback for the same address.
  const OUTSTANDING_MS = 10 * 60_000;
  if (
    existing?.requestedAt &&
    !existing.tokenEnc &&
    Date.now() - existing.requestedAt.getTime() < OUTSTANDING_MS
  ) {
    return { requested: false, reason: 'A request for this ABHA is already outstanding' };
  }

  await upsertTokenRow(tenantId, patient.abhaAddress, { requestedAt: new Date(), lastError: null });

  try {
    await hipPost(
      HIP_GATEWAY_PATHS.generateLinkToken,
      {
        abhaAddress: patient.abhaAddress,
        abhaNumber: patient.abhaNumber ?? undefined,
        gender: fhirishGender(patient.gender),
        name: [patient.firstName, patient.lastName].filter(Boolean).join(' '),
        yearOfBirth: Number(patient.dateOfBirth.slice(0, 4)),
      },
      { hipId: input.hipId },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Link token request failed';
    await upsertTokenRow(tenantId, patient.abhaAddress, { lastError: message.slice(0, 300) });
    return { requested: false, reason: message };
  }

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.link_token.requested',
    resourceType: 'patient',
    resourceId: input.patientId,
    metadata: { abhaAddress: patient.abhaAddress },
  });
  return { requested: true };
}

/** ABDM's single-letter gender, which is not our vocabulary and not FHIR's either. */
function fhirishGender(gender?: string | null): string {
  const g = (gender ?? '').toLowerCase();
  if (g.startsWith('m')) return 'M';
  if (g.startsWith('f')) return 'F';
  return 'O';
}

/**
 * Stores a token delivered by the webhook.
 *
 * Encrypted, or **discarded** — the same rule every other ABDM credential follows. A link token in
 * plaintext is standing permission to write to somebody's national health record.
 */
export async function storeLinkToken(input: {
  abhaAddress: string;
  token: string;
  hipId: string;
}): Promise<boolean> {
  const tenantId = await tenantForHip(input.hipId);
  if (!tenantId) {
    logger.warn({ hipId: input.hipId }, 'Link token delivered for an unknown facility');
    return false;
  }
  if (!isEncryptionConfigured()) {
    logger.error('Link token discarded — ENCRYPTION_KEY is not configured');
    await upsertTokenRow(tenantId, input.abhaAddress, {
      lastError: 'Encryption is not configured on this server',
    });
    return false;
  }

  await upsertTokenRow(tenantId, input.abhaAddress, {
    tokenEnc: encryptSecret(input.token),
    expiresAt: linkTokenExpiry(input.token),
    lastError: null,
  });

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.link_token.stored',
    resourceType: 'abdm_link_token',
    resourceId: null,
    metadata: {
      abhaAddress: input.abhaAddress,
      expiresAt: linkTokenExpiry(input.token)?.toISOString(),
    },
  });
  return true;
}

async function upsertTokenRow(
  tenantId: string,
  abhaAddress: string,
  patch: Partial<Pick<AbdmLinkToken, 'tokenEnc' | 'expiresAt' | 'requestedAt' | 'lastError'>>,
): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx
      .insert(abdmLinkTokens)
      .values({ tenantId, abhaAddress, ...patch })
      .onConflictDoUpdate({
        target: [abdmLinkTokens.tenantId, abdmLinkTokens.abhaAddress],
        set: { ...patch, updatedAt: new Date() },
      }),
  );
}

/** Resolves the hospital from its HFR facility id — the one identifier a callback may be trusted on. */
async function tenantForHip(hipId: string): Promise<string | null> {
  const { db } = await import('../../db/client');
  const { abdmFacilityConfig } = await import('../../db/schema');
  const { eq: equals } = await import('drizzle-orm');
  const rows = await db
    .select()
    .from(abdmFacilityConfig)
    .where(equals(abdmFacilityConfig.hipId, hipId))
    .limit(1);
  return rows[0]?.tenantId ?? null;
}
