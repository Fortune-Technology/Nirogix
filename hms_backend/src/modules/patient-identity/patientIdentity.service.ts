import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { randomUUID } from 'node:crypto';
import {
  patientIdentity,
  patientIdentityLink,
  patientSessions,
  patientVerification,
  patients,
  tenants,
  type PatientIdentity,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { hashToken, signAccessToken, signRefreshToken, tokenExpiry, verifyRefreshToken } from '../auth/tokens';
import { writeAudit } from '../audit/audit.service';
import {
  sendOtp,
  verifyOtp,
  type OtpStore,
  type OtpChannel,
} from '../notification/communication.service';

/**
 * Patient identity (ADR-052).
 *
 * The rules this module exists to enforce, in order of how badly they go wrong:
 *
 * 1. **A contact is not an identity until it is verified.** Nothing reads a link, and
 *    no token is minted, for an identity whose `verifiedAt` is null.
 * 2. **The hospital creates the link, never the patient.** There is no endpoint that
 *    lets a caller attach themselves to a patient record — that is what "no public
 *    signup" means structurally.
 * 3. **Tenant comes from an ACTIVE link, re-checked per request.** Never from a URL,
 *    a header, or the token alone.
 * 4. **A patient principal is not a `users` row** and can never hold a staff
 *    permission; staff routes refuse it by principal type (`requireAuth`).
 */

/**
 * `patient_verification` expressed as the shared service's `OtpStore` (ADR-059).
 *
 * The generation, hashing, expiry and attempt-limiting rules live in one place now —
 * `communication.service` — and this adapter only says where the rows are kept. Staff
 * MFA and contact verification reuse the same rules by writing their own adapter
 * rather than a second implementation of the same care.
 */
function verificationStore(identityId: string): OtpStore {
  return {
    async save({ destination, channel, codeHash, expiresAt }) {
      await db.insert(patientVerification).values({ identityId, channel, destination, codeHash, expiresAt });
    },

    async findActive({ destination }) {
      const rows = await db
        .select()
        .from(patientVerification)
        .where(
          and(
            eq(patientVerification.identityId, identityId),
            eq(patientVerification.destination, destination),
            isNull(patientVerification.consumedAt),
          ),
        )
        .orderBy(sql`${patientVerification.createdAt} desc`)
        .limit(1);
      const row = rows[0];
      return row
        ? { id: row.id, codeHash: row.codeHash, expiresAt: row.expiresAt, attempts: row.attempts }
        : null;
    },

    async consume(id) {
      await db.update(patientVerification).set({ consumedAt: new Date() }).where(eq(patientVerification.id, id));
    },

    async recordFailedAttempt(id) {
      await db
        .update(patientVerification)
        .set({ attempts: sql`${patientVerification.attempts} + 1` })
        .where(eq(patientVerification.id, id));
    },
  };
}

/** Normalised on write so a lookup is exact and two spellings cannot become two people. */
export function normaliseMobile(mobile: string): string {
  return mobile.replace(/[^\d+]/g, '');
}
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

type Contact = { mobile?: string | null; email?: string | null };

function requireOneContact(c: Contact): { channel: 'sms' | 'email'; destination: string } {
  const mobile = c.mobile ? normaliseMobile(c.mobile) : null;
  const email = c.email ? normaliseEmail(c.email) : null;
  if (mobile) return { channel: 'sms', destination: mobile };
  if (email) return { channel: 'email', destination: email };
  throw Errors.validation(undefined, 'A mobile number or an email address is required');
}

async function findIdentityByContact(c: Contact): Promise<PatientIdentity | null> {
  const mobile = c.mobile ? normaliseMobile(c.mobile) : null;
  const email = c.email ? normaliseEmail(c.email) : null;
  if (mobile) {
    const rows = await db.select().from(patientIdentity).where(eq(patientIdentity.mobile, mobile)).limit(1);
    if (rows[0]) return rows[0];
  }
  if (email) {
    const rows = await db.select().from(patientIdentity).where(eq(patientIdentity.email, email)).limit(1);
    if (rows[0]) return rows[0];
  }
  return null;
}

/**
 * Hospital-side provisioning: link a patient record to an identity (ADR-052).
 *
 * Called from the hospital's own registration flow, by a staff user with
 * `patient.record.create`. Creates the identity row if this is the person's first
 * hospital on Nirogix — note that this does **not** verify the contact and does not
 * grant access on its own: the patient still has to prove they hold it.
 */
export async function linkPatientToIdentity(
  tenantId: string,
  patientId: string,
  contact: Contact,
  actorUserId: string,
): Promise<{ identityId: string; linkId: string }> {
  requireOneContact(contact);

  const patient = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId)))
      .limit(1),
  );
  if (!patient[0]) throw Errors.notFound('Patient not found');

  const mobile = contact.mobile ? normaliseMobile(contact.mobile) : null;
  const email = contact.email ? normaliseEmail(contact.email) : null;

  let identity = await findIdentityByContact(contact);
  if (!identity) {
    identity = (await db.insert(patientIdentity).values({ mobile, email }).returning())[0]!;
  }

  const existing = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ id: patientIdentityLink.id, identityId: patientIdentityLink.identityId })
      .from(patientIdentityLink)
      .where(and(eq(patientIdentityLink.tenantId, tenantId), eq(patientIdentityLink.patientId, patientId)))
      .limit(1),
  );
  if (existing[0]) {
    if (existing[0].identityId !== identity.id) {
      // Two people must never be able to claim the same chart.
      throw Errors.conflict('That patient record is already linked to a different portal account');
    }
    return { identityId: identity.id, linkId: existing[0].id };
  }

  const link = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(patientIdentityLink)
      .values({ tenantId, identityId: identity!.id, patientId, createdBy: actorUserId })
      .returning();
    return rows[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'patient.portal.link',
    severity: 'notice',
    resourceType: 'patient',
    resourceId: patientId,
    metadata: { identityId: identity.id, channel: mobile ? 'sms' : 'email' },
  });

  return { identityId: identity.id, linkId: link.id };
}

/**
 * Send a one-time code to a contact (ADR-052).
 *
 * **Deliberately uniform**: the response is the same whether or not an identity exists
 * or holds any link. Telling an unauthenticated caller "no account for this number"
 * would turn this endpoint into a directory of who is a patient somewhere, which is a
 * disclosure in its own right — arguably a more sensitive one than a login oracle.
 */
export async function requestPatientCode(contact: Contact): Promise<void> {
  const { channel, destination } = requireOneContact(contact);
  const identity = await findIdentityByContact(contact);
  if (!identity || identity.status !== 'active') return; // silent, on purpose


  // Sent from the PLATFORM tenant, not from a hospital (ADR-052). Two reasons: the
  // message is from Nirogix about platform access, not from a hospital about care; and
  // logging it against a hospital would tell that hospital's staff, in their own
  // notification log, that this person is signing in — including hospitals the patient
  // did not choose this time. Picking "one of" their hospitals would be arbitrary and
  // disclosing.
  await sendOtp({
    tenantId: await platformTenantId(),
    channel: channel as OtpChannel,
    destination,
    store: verificationStore(identity.id),
    purpose: 'sign-in',
  });
}

/**
 * The vendor's own PLATFORM organization (ADR-022) — where platform-level messages are
 * logged. Resolved by code rather than configured, so it cannot drift from the seed.
 */
async function platformTenantId(): Promise<string> {
  const rows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.code, 'NIROGIX')).limit(1);
  const id = rows[0]?.id;
  if (!id) // No canonical `internal` helper — this is a deployment fault, not a user error.
    throw new Error('The PLATFORM organization is missing; patient verification cannot be sent');
  return id;
}

/**
 * Verify a code and mint a patient session (ADR-052).
 *
 * The token carries `pt: 'patient'`, which is what staff routes refuse on. `tid` is
 * empty at this point: the patient has not chosen a hospital yet, and the tenant is
 * resolved from an active link when they do.
 */
export async function verifyPatientCode(
  contact: Contact,
  code: string,
  meta: ClientMeta = {},
): Promise<{ accessToken: string; refreshToken: string; identity: { id: string; fullName: string | null } }> {
  const { destination } = requireOneContact(contact);
  const identity = await findIdentityByContact(contact);
  // Uniform failure: a wrong code and an unknown contact are indistinguishable.
  const invalid = Errors.unauthorized('That code is not valid');
  if (!identity || identity.status !== 'active') throw invalid;

  // Expiry, attempt-limiting, hash comparison and consumption all live in the shared
  // service (ADR-059). Every failure mode collapses to the same `invalid` here, so a
  // wrong code, an expired one and an exhausted one stay indistinguishable.
  const ok = await verifyOtp({
    channel: (contact.mobile ? 'sms' : 'email') as OtpChannel,
    destination,
    code,
    store: verificationStore(identity.id),
  });
  if (!ok) throw invalid;

  const now = new Date();
  await db
    .update(patientIdentity)
    .set({ verifiedAt: identity.verifiedAt ?? now, activatedAt: identity.activatedAt ?? now, lastLoginAt: now })
    .where(eq(patientIdentity.id, identity.id));

  // No tenant on either token — the patient picks a hospital afterwards, and the tenant
  // is resolved from an active link on every request rather than baked in here.
  return issuePatientSession(identity, meta);
}

/**
 * Mint a patient session: a short-lived access token plus a rotating refresh token
 * backed by a `patient_sessions` row (F-8).
 *
 * The refresh token is stored hashed and is revocable, exactly like a staff session —
 * a patient's records deserve the same session controls a staff account gets, not a
 * weaker set because the principal is different.
 *
 * Existing sessions are deliberately NOT revoked: a patient may reasonably use their
 * phone and a laptop, and signing them out of one by using the other would be hostile.
 */
async function issuePatientSession(
  identity: PatientIdentity,
  meta: ClientMeta = {},
): Promise<{ accessToken: string; refreshToken: string; identity: { id: string; fullName: string | null } }> {
  const sid = randomUUID();
  const accessToken = signAccessToken({ sub: identity.id, tid: '', roles: [], pt: 'patient' });
  const refreshToken = signRefreshToken({ sub: identity.id, tid: '', sid, pt: 'patient' });

  await db.insert(patientSessions).values({
    id: sid,
    identityId: identity.id,
    tokenHash: hashToken(refreshToken),
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ip: meta.ip?.slice(0, 64) ?? null,
    expiresAt: tokenExpiry(refreshToken),
  });

  return { accessToken, refreshToken, identity: { id: identity.id, fullName: identity.fullName } };
}

export type ClientMeta = { userAgent?: string; ip?: string };

/**
 * Exchange a patient refresh token for a new pair (F-8).
 *
 * Rotates on every use: the stored hash is replaced, so a token that is presented twice
 * fails the second time. A revoked or expired row fails uniformly — the caller is never
 * told which, because "expired" and "revoked" would tell an attacker whether the session
 * existed at all.
 */
export async function refreshPatientSession(
  refreshTokenRaw: string,
  meta: ClientMeta = {},
): Promise<{ accessToken: string; refreshToken: string; identity: { id: string; fullName: string | null } }> {
  const invalid = Errors.unauthorized('Invalid or expired session');
  let claims;
  try {
    claims = verifyRefreshToken(refreshTokenRaw);
  } catch {
    throw invalid;
  }
  if (claims.pt !== 'patient') throw invalid; // a staff refresh token is not accepted here

  const rows = await db.select().from(patientSessions).where(eq(patientSessions.id, claims.sid)).limit(1);
  const session = rows[0];
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() < Date.now() ||
    session.tokenHash !== hashToken(refreshTokenRaw)
  ) {
    throw invalid;
  }

  const identityRows = await db
    .select()
    .from(patientIdentity)
    .where(eq(patientIdentity.id, session.identityId))
    .limit(1);
  const identity = identityRows[0];
  // A suspended or unverified identity cannot refresh, however valid the token is.
  if (!identity || identity.status !== 'active' || !identity.verifiedAt) throw invalid;

  const accessToken = signAccessToken({ sub: identity.id, tid: '', roles: [], pt: 'patient' });
  const refreshToken = signRefreshToken({ sub: identity.id, tid: '', sid: session.id, pt: 'patient' });
  await db
    .update(patientSessions)
    .set({
      tokenHash: hashToken(refreshToken),
      expiresAt: tokenExpiry(refreshToken),
      userAgent: meta.userAgent?.slice(0, 300) ?? session.userAgent,
      ip: meta.ip?.slice(0, 64) ?? session.ip,
    })
    .where(eq(patientSessions.id, session.id));

  return { accessToken, refreshToken, identity: { id: identity.id, fullName: identity.fullName } };
}

/** Sign out: revoke the row so the refresh token is dead server-side, not just dropped. */
export async function endPatientSession(refreshTokenRaw: string | undefined): Promise<void> {
  if (!refreshTokenRaw) return;
  try {
    const claims = verifyRefreshToken(refreshTokenRaw);
    if (claims.pt !== 'patient') return;
    await db
      .update(patientSessions)
      .set({ revokedAt: new Date() })
      .where(eq(patientSessions.id, claims.sid));
  } catch {
    /* an unparseable token is already useless — signing out is still a success */
  }
}

/** The hospitals this identity may view — active links only, verified identities only. */
export async function listMyHospitals(
  identityId: string,
): Promise<Array<{ tenantId: string; name: string; patientId: string }>> {
  const identity = (await db.select().from(patientIdentity).where(eq(patientIdentity.id, identityId)).limit(1))[0];
  if (!identity || !identity.verifiedAt || identity.status !== 'active') return [];

  // Cross-tenant by nature — this is the one query that legitimately spans tenants, and
  // it returns ONLY this identity's own links, never another person's.
  const rows = await db
    .select({
      tenantId: patientIdentityLink.tenantId,
      patientId: patientIdentityLink.patientId,
      name: tenants.name,
    })
    .from(patientIdentityLink)
    .innerJoin(tenants, eq(tenants.id, patientIdentityLink.tenantId))
    .where(and(eq(patientIdentityLink.identityId, identityId), eq(patientIdentityLink.isActive, true)));
  return rows;
}

/**
 * Re-check, on every request, that this identity may act inside this tenant.
 *
 * The tenant never comes from the URL. A revoked link takes effect immediately because
 * this runs per request rather than being baked into the token.
 */
export async function resolvePatientAccess(
  identityId: string,
  tenantId: string,
): Promise<{ patientId: string }> {
  const rows = await db
    .select({ patientId: patientIdentityLink.patientId })
    .from(patientIdentityLink)
    .where(
      and(
        eq(patientIdentityLink.identityId, identityId),
        eq(patientIdentityLink.tenantId, tenantId),
        eq(patientIdentityLink.isActive, true),
      ),
    )
    .limit(1);
  if (!rows[0]) throw Errors.forbidden('You do not have access to that hospital');
  return { patientId: rows[0].patientId };
}

/** The hospital withdraws portal access without touching the clinical record. */
export async function revokePatientAccess(
  tenantId: string,
  patientId: string,
  actorUserId: string,
): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(patientIdentityLink)
      .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(patientIdentityLink.tenantId, tenantId), eq(patientIdentityLink.patientId, patientId))),
  );
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'patient.portal.revoke',
    severity: 'notice',
    resourceType: 'patient',
    resourceId: patientId,
  });
}
