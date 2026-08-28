import { and, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { abdmStaffHpr, providers, type AbdmStaffHpr } from '../../db/schema';
import { AppError } from '../../http/error';
import { logger } from '../../config/logger';
import { writeAudit } from '../audit/audit.service';
import { HPR_MASTER_PATHS, HPR_PATHS } from './abdm.constants';
import { registryMasterData, registryPost } from './registryGateway';
import { encryptForAbdm } from './abdm.crypto';
import { abdmProvider } from './providers/index';

/**
 * Enrolling a clinician in the Healthcare Professional Registry (ADR-097).
 *
 * The mirror of M1, performed on a doctor instead of a patient: the same UIDAI eKYC, the same
 * RSA-OAEP-SHA1 encryption, the same rule that **no Aadhaar number is ever written down**. What
 * survives a session is ABDM's `txnId` — a reference to a verification they hold — so a stolen copy
 * of our table proves nothing about anybody.
 *
 * Two things shape the code beyond that:
 *
 * - **The dedup check runs first, always.** Most clinicians in India already hold an HPR id; a
 *   second one is not a duplicate row, it is a second national identity for a real person, and
 *   unpicking that is somebody's afternoon at a government helpdesk.
 * - **The chain is resumable and its steps can be days apart.** A doctor who verifies their Aadhaar
 *   on Monday and finishes on Thursday is normal, so the row records where they got to rather than
 *   only whether they finished.
 *
 * **An honest limitation, stated where it matters rather than in a commit message:** NHA's published
 * V4 spec is authoritative for these *paths* but **incomplete for the Aadhaar request bodies** — its
 * `verifyOTP` schema declares only `txnId` and no OTP field, and `generateLink` has nowhere to put
 * an Aadhaar number. Those two payloads are therefore modelled on M1's proven ABHA shapes, which are
 * the same eKYC underneath, and are marked unverified in `BACKLOG.md`. Everything else here is read
 * from the spec.
 */

export type ProfessionalCategory = 'doctor' | 'nurse' | 'pharmacist';

/** Where an enrolment can go from where it is. */
const ALLOWED: Record<string, readonly string[]> = {
  not_started: ['aadhaar_verified', 'already_registered'],
  aadhaar_verified: ['aadhaar_verified', 'mobile_verified', 'already_registered'],
  mobile_verified: ['mobile_verified', 'registered'],
  // Terminal. Someone already registered updates their profile; they do not enrol again.
  registered: ['registered'],
  already_registered: ['already_registered', 'registered'],
};

/** ABDM's transaction is short-lived; a stale one produces a confusing failure three steps later. */
const TXN_TTL_MS = 30 * 60_000;

/** The enrolment state for one clinician — the screen's whole content. */
export async function getEnrolment(tenantId: string, providerId: string): Promise<AbdmStaffHpr | null> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmStaffHpr)
      .where(and(eq(abdmStaffHpr.tenantId, tenantId), eq(abdmStaffHpr.providerId, providerId)))
      .limit(1),
  );
  return rows[0] ?? null;
}

export async function listEnrolments(tenantId: string): Promise<AbdmStaffHpr[]> {
  return runWithTenant(tenantId, (tx) =>
    tx.select().from(abdmStaffHpr).where(eq(abdmStaffHpr.tenantId, tenantId)),
  );
}

/**
 * Step 1 — send the Aadhaar OTP, and check first whether this person already has an HPR id.
 *
 * The Aadhaar number arrives, is encrypted, is sent, and is never written anywhere. It is not
 * returned, not logged, and not stored on the row — the only thing kept is ABDM's `txnId`.
 */
export async function startEnrolment(
  tenantId: string,
  actorUserId: string | null,
  input: { providerId: string; aadhaar: string; category: ProfessionalCategory },
): Promise<{ txnId: string; status: string; alreadyRegistered?: boolean }> {
  const provider = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(providers)
      .where(and(eq(providers.tenantId, tenantId), eq(providers.id, input.providerId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!provider) throw new AppError(404, 'PROVIDER_NOT_FOUND', 'No such staff member');

  const existing = await getEnrolment(tenantId, input.providerId);
  if (existing?.status === 'registered') {
    throw new AppError(
      409,
      'ABDM_HPR_ALREADY_ENROLLED',
      'This staff member already holds an HPR id. Update their profile instead of enrolling again.',
    );
  }

  // Encrypted with ABDM's public certificate, exactly as M1 does — same helper, same padding.
  const encrypted = await encryptForAbdm(abdmProvider(), input.aadhaar.replace(/\D/g, ''));

  const started = await registryPost<{ txnId?: string }>(HPR_PATHS.aadhaarGenerateOtp, {
    aadhaar: encrypted,
    scopes: ['hp_id_registration'],
    source: 'Nirogix HMS',
  });
  const txnId = started.txnId;
  if (!txnId) throw new AppError(502, 'ABDM_HPR_NO_TXN', 'The registry accepted the request but returned no transaction');

  // Does this person already hold an HPR id? Asked before we create a second national identity for
  // a real human being.
  let alreadyRegistered = false;
  try {
    const exists = await registryPost<{ hprIdNumber?: string; hprId?: string }>(HPR_PATHS.checkAccountExists, {
      txnId,
      preverifiedCheck: true,
    });
    alreadyRegistered = Boolean(exists.hprIdNumber ?? exists.hprId);
    if (alreadyRegistered) {
      await upsert(tenantId, input.providerId, {
        status: 'already_registered',
        hprId: exists.hprIdNumber ?? exists.hprId ?? null,
        statusMessage: 'This person already holds an HPR id.',
        txnId,
        txnStartedAt: new Date(),
        professionalCategory: input.category,
        createdBy: actorUserId,
      });
    }
  } catch (err) {
    // A dedup check that itself fails must not block enrolment — but it must be visible, because
    // proceeding blind is how a second identity gets created.
    logger.warn({ tenantId, err }, 'HPR duplicate check failed; enrolment continues unverified');
  }

  if (!alreadyRegistered) {
    await upsert(tenantId, input.providerId, {
      status: existing?.status ?? 'not_started',
      txnId,
      txnStartedAt: new Date(),
      professionalCategory: input.category,
      createdBy: actorUserId,
    });
  }

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'abdm.hpr.enrolment_started',
    resourceType: 'provider',
    resourceId: input.providerId,
    severity: 'notice',
    // Which staff member and which category — never the Aadhaar, never the transaction.
    metadata: { category: input.category, alreadyRegistered },
  });

  return { txnId, status: alreadyRegistered ? 'already_registered' : 'otp_sent', alreadyRegistered };
}

/** Step 2 — the Aadhaar OTP. */
export async function verifyAadhaarOtp(
  tenantId: string,
  input: { providerId: string; otp: string },
): Promise<AbdmStaffHpr> {
  const row = await requireLiveTransaction(tenantId, input.providerId);
  const encrypted = await encryptForAbdm(abdmProvider(), input.otp);

  await registryPost(HPR_PATHS.aadhaarVerifyOtp, { txnId: row.txnId, otp: encrypted });
  return transition(tenantId, input.providerId, 'aadhaar_verified');
}

/** Step 3 — a mobile number, which may or may not be the one on the Aadhaar. */
export async function sendMobileOtp(tenantId: string, providerId: string, mobile: string): Promise<void> {
  const row = await requireLiveTransaction(tenantId, providerId);
  await registryPost(HPR_PATHS.generateMobileOtp, { txnId: row.txnId, mobile: mobile.replace(/\D/g, '').slice(-10) });
}

export async function verifyMobileOtp(tenantId: string, providerId: string, otp: string): Promise<AbdmStaffHpr> {
  const row = await requireLiveTransaction(tenantId, providerId);
  await registryPost(HPR_PATHS.verifyMobileOtp, { txnId: row.txnId, otp });
  return transition(tenantId, providerId, 'mobile_verified');
}

/**
 * Step 4 — mint the HPR id and register the professional profile.
 *
 * Two calls, in order: the id first, then the clinical profile that hangs off it. Splitting them
 * would leave a doctor holding an id with no council registration against it, which is worse than
 * not starting.
 */
export async function completeEnrolment(
  tenantId: string,
  actorUserId: string | null,
  input: {
    providerId: string;
    email: string;
    firstName: string;
    lastName?: string;
    registrationCouncil: string;
    registrationNumber: string;
    systemOfMedicine?: string;
  },
): Promise<AbdmStaffHpr> {
  const row = await requireLiveTransaction(tenantId, input.providerId);
  assertTransition(row.status, 'registered');

  const created = await registryPost<{ hprIdNumber?: string; hprId?: string; token?: string }>(HPR_PATHS.createHprId, {
    txnId: row.txnId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    idType: 'hpr_id',
    domainName: '@hpr.abdm',
  });
  const hprId = created.hprIdNumber ?? created.hprId;
  if (!hprId) throw new AppError(502, 'ABDM_HPR_NO_ID', 'The registry completed the account but returned no HPR id');

  await registryPost(HPR_PATHS.registerProfessional, {
    hprToken: created.token,
    practitioner: {
      personalInformation: { firstName: input.firstName, lastName: input.lastName },
      contactInformation: { email: input.email },
      registrationAcademic: {
        registrationNumber: input.registrationNumber,
        councilName: input.registrationCouncil,
        systemOfMedicine: input.systemOfMedicine,
      },
      healthProfessionalType: row.professionalCategory,
    },
  });

  const saved = await upsert(tenantId, input.providerId, {
    status: 'registered',
    hprId,
    hprAddress: created.hprId ?? null,
    registrationCouncil: input.registrationCouncil,
    registrationNumber: input.registrationNumber,
    systemOfMedicine: input.systemOfMedicine ?? null,
    // The transaction is spent; keeping it would only invite a stale retry.
    txnId: null,
    lastSyncedAt: new Date(),
  });

  // The council registration number is what M3's consent requests already need (ADR-092), and a
  // clinician who has just proved it to a national registry should not have to type it again.
  await adoptRegistrationNumber(tenantId, input.providerId, input.registrationNumber);

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'abdm.hpr.registered',
    resourceType: 'provider',
    resourceId: input.providerId,
    severity: 'notice',
    metadata: { hprId, council: input.registrationCouncil, category: row.professionalCategory },
  });
  return saved;
}

/**
 * Fills in a blank provider registration number from the one HPR just verified.
 *
 * Never overwrites an existing value — the same rule as the HFR facility id (ADR-096). A number
 * already on file may be what a hospital's own records key on, and silently replacing it is not
 * this feature's business.
 */
async function adoptRegistrationNumber(tenantId: string, providerId: string, registrationNumber: string): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    const rows = await tx.select().from(providers).where(eq(providers.id, providerId)).limit(1);
    const current = rows[0]?.registrationNumber?.trim();
    if (current) return;
    await tx.update(providers).set({ registrationNumber, updatedAt: new Date() }).where(eq(providers.id, providerId));
    logger.info({ tenantId, providerId }, 'Adopted the HPR-verified registration number onto the provider');
  });
}

/** The current profile as HPR holds it — used to show a staff member what the registry says. */
export async function syncProfile(tenantId: string, providerId: string): Promise<AbdmStaffHpr> {
  const row = await getEnrolment(tenantId, providerId);
  if (!row?.hprId) throw new AppError(404, 'ABDM_HPR_NOT_ENROLLED', 'This staff member has no HPR id yet');
  await registryPost(HPR_PATHS.fetchProfessional, { hprId: row.hprId });
  return upsert(tenantId, providerId, { lastSyncedAt: new Date() });
}

/** Councils, systems of medicine and the rest — fetched and cached, never hard-coded. */
export async function hprMasterData(kind: keyof typeof HPR_MASTER_PATHS) {
  return registryMasterData(HPR_MASTER_PATHS[kind]);
}

/**
 * A transaction that is still usable.
 *
 * ABDM expires these, and a stale one fails three steps later with a message about something else
 * entirely — so it is caught here, where the fix ("start again") is obvious.
 */
async function requireLiveTransaction(tenantId: string, providerId: string): Promise<AbdmStaffHpr> {
  const row = await getEnrolment(tenantId, providerId);
  if (!row?.txnId) throw new AppError(409, 'ABDM_HPR_NO_TRANSACTION', 'Start the enrolment before verifying');
  if (row.txnStartedAt && Date.now() - row.txnStartedAt.getTime() > TXN_TTL_MS) {
    throw new AppError(410, 'ABDM_HPR_TRANSACTION_EXPIRED', 'This enrolment has expired. Please start again.');
  }
  return row;
}

function assertTransition(from: string, to: string): void {
  if (!(ALLOWED[from] ?? []).includes(to)) {
    throw new AppError(409, 'ABDM_HPR_BAD_TRANSITION', `An enrolment at "${from}" cannot become "${to}"`);
  }
}

async function transition(tenantId: string, providerId: string, to: string): Promise<AbdmStaffHpr> {
  const row = await getEnrolment(tenantId, providerId);
  assertTransition(row?.status ?? 'not_started', to);
  return upsert(tenantId, providerId, { status: to });
}

async function upsert(
  tenantId: string,
  providerId: string,
  set: Partial<typeof abdmStaffHpr.$inferInsert>,
): Promise<AbdmStaffHpr> {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(abdmStaffHpr)
      .values({ tenantId, providerId, ...set })
      .onConflictDoUpdate({
        target: [abdmStaffHpr.tenantId, abdmStaffHpr.providerId],
        set: { ...set, updatedAt: new Date() },
      })
      .returning();
    return rows[0]!;
  });
}
