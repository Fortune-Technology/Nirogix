import { and, desc, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { organizationProfile, registrationRequests, tenants } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { createPatient, getPatient } from '../patient/patient.service';

/**
 * Patient self-registration by QR (ADR-056).
 *
 * The rule this module exists to hold: **a submission is a request, not a patient.**
 * ADR-052 said the hospital decides who becomes a patient record, and that survives here
 * — nothing on the public path writes to `patients`. A stranger who scans a poster can
 * add a row to `registration_requests` and nothing else. The front desk verifies the
 * person, checks for a duplicate, and converts.
 *
 * The tenant is resolved **from the token**, server-side, on every public call. It is
 * never read from the request body, a header, or a query parameter — which is what makes
 * "a QR for Hospital A can never register a patient under Hospital B" structural rather
 * than a validation rule someone can forget.
 */

/** Opaque, high-entropy, and not derived from anything internal. A poster is public. */
function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export type PublicRegistrationContext = {
  hospitalName: string;
  /** Shown on the public form so the person can see they scanned the right poster. */
  city: string | null;
  enabled: boolean;
};

/**
 * Resolve the hospital a registration token belongs to.
 *
 * Uses the base client rather than `runWithTenant`: this is the one lookup that runs
 * before a tenant is known, because determining the tenant is its whole purpose. It reads
 * a single row by an indexed unique token and returns **only** what a public form may show
 * — a name and a city. No identifiers, no configuration, no contact details.
 */
export async function resolveRegistrationToken(
  token: string,
): Promise<{ tenantId: string; ctx: PublicRegistrationContext }> {
  if (!token || token.length < 16) throw Errors.notFound('That registration link is not valid');

  const rows = await db
    .select({
      tenantId: organizationProfile.tenantId,
      enabled: organizationProfile.selfRegistrationEnabled,
      city: organizationProfile.city,
      displayName: organizationProfile.displayName,
      tenantName: tenants.name,
      tenantStatus: tenants.status,
    })
    .from(organizationProfile)
    .innerJoin(tenants, eq(tenants.id, organizationProfile.tenantId))
    .where(eq(organizationProfile.selfRegistrationToken, token))
    .limit(1);

  const row = rows[0];
  // A retired token, a disabled hospital and a typo all fail identically — the response
  // must not tell an unauthenticated caller which hospitals exist.
  if (!row || row.tenantStatus !== 'active')
    throw Errors.notFound('That registration link is not valid');

  return {
    tenantId: row.tenantId,
    ctx: {
      hospitalName: row.displayName ?? row.tenantName,
      city: row.city,
      enabled: row.enabled,
    },
  };
}

export type SubmitRegistrationInput = {
  firstName: string;
  lastName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone: string;
  email?: string | null;
  city?: string | null;
  note?: string | null;
};

/**
 * Accept a public submission against a token.
 *
 * Writes one row to `registration_requests` and nothing else. If the hospital has turned
 * self-registration off, the submission is refused — the toggle is enforced here, not only
 * hidden in the form.
 */
export async function submitRegistrationRequest(
  token: string,
  input: SubmitRegistrationInput,
  meta: { ip?: string } = {},
): Promise<{ received: true }> {
  const { tenantId, ctx } = await resolveRegistrationToken(token);
  if (!ctx.enabled) throw Errors.notFound('That registration link is not valid');

  await runWithTenant(tenantId, (tx) =>
    tx.insert(registrationRequests).values({
      tenantId,
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || null,
      gender: input.gender || null,
      dateOfBirth: input.dateOfBirth || null,
      phone: input.phone.trim(),
      email: input.email?.trim().toLowerCase() || null,
      city: input.city?.trim() || null,
      note: input.note?.trim() || null,
      submittedIp: meta.ip?.slice(0, 64) ?? null,
    }),
  );

  // Audited against the hospital, with no actor — nobody was authenticated. The trail
  // still answers "where did this record come from" when the front desk approves it.
  await writeAudit({
    tenantId,
    action: 'patient.registration.submitted',
    severity: 'info',
    resourceType: 'registration_request',
    metadata: { source: 'qr' },
  });

  return { received: true };
}

// ---- Hospital side ---------------------------------------------------------

export async function listRegistrationRequests(tenantId: string, status = 'pending') {
  return runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(registrationRequests)
      .where(
        and(eq(registrationRequests.tenantId, tenantId), eq(registrationRequests.status, status)),
      )
      .orderBy(desc(registrationRequests.createdAt)),
  );
}

/**
 * Convert a request into a real patient.
 *
 * This is the moment the hospital takes responsibility for the record, which is why it
 * needs `patient.record.create` and is audited at notice. The request row is kept and
 * marked approved rather than deleted — it is the provenance of a chart that nobody on
 * staff typed.
 */
export async function approveRegistrationRequest(
  tenantId: string,
  requestId: string,
  actorUserId: string,
  opts?: { allowDuplicate?: boolean; existingPatientId?: string },
): Promise<{ patientId: string }> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(registrationRequests)
      .where(
        and(eq(registrationRequests.tenantId, tenantId), eq(registrationRequests.id, requestId)),
      )
      .limit(1),
  );
  const req = rows[0];
  if (!req) throw Errors.notFound('Registration request not found');
  if (req.status !== 'pending') throw Errors.conflict('That request has already been reviewed');

  // The duplicate path: the reviewer matched the request to a chart that already exists, so the
  // request links to it instead of minting a second chart for the same person.
  let patientId: string;
  if (opts?.existingPatientId) {
    const existing = await getPatient(tenantId, opts.existingPatientId);
    if (!existing) throw Errors.notFound('That patient record was not found');
    patientId = existing.id;
  } else {
    // createPatient itself raises DUPLICATE_PATIENT (409 + candidates) unless allowDuplicate —
    // the reviewer sees the matching charts and chooses: link one, or knowingly create anyway.
    const patient = await createPatient(
      tenantId,
      {
        firstName: req.firstName,
        lastName: req.lastName ?? undefined,
        gender: req.gender ?? undefined,
        dateOfBirth: req.dateOfBirth ?? undefined,
        phone: req.phone,
        email: req.email ?? undefined,
        city: req.city ?? undefined,
        allowDuplicate: opts?.allowDuplicate,
      },
      actorUserId,
    );
    patientId = patient.id;
  }

  await runWithTenant(tenantId, (tx) =>
    tx
      .update(registrationRequests)
      .set({ status: 'approved', patientId, reviewedBy: actorUserId, reviewedAt: new Date() })
      .where(eq(registrationRequests.id, requestId)),
  );

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'patient.registration.approved',
    severity: 'notice',
    resourceType: 'patient',
    resourceId: patientId,
    metadata: { requestId, linkedExisting: Boolean(opts?.existingPatientId) },
  });

  return { patientId };
}

export async function rejectRegistrationRequest(
  tenantId: string,
  requestId: string,
  reason: string | undefined,
  actorUserId: string,
): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(registrationRequests)
      .set({
        status: 'rejected',
        rejectionReason: reason?.slice(0, 300) ?? null,
        reviewedBy: actorUserId,
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(registrationRequests.tenantId, tenantId),
          eq(registrationRequests.id, requestId),
          eq(registrationRequests.status, 'pending'),
        ),
      ),
  );
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'patient.registration.rejected',
    severity: 'notice',
    resourceType: 'registration_request',
    resourceId: requestId,
  });
}

// ---- Settings --------------------------------------------------------------

export type RegistrationSettings = {
  enabled: boolean;
  /** Null until self-registration is switched on for the first time. */
  token: string | null;
  pendingCount: number;
};

export async function getRegistrationSettings(tenantId: string): Promise<RegistrationSettings> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({
        enabled: organizationProfile.selfRegistrationEnabled,
        token: organizationProfile.selfRegistrationToken,
      })
      .from(organizationProfile)
      .where(eq(organizationProfile.tenantId, tenantId))
      .limit(1),
  );
  const pending = await listRegistrationRequests(tenantId, 'pending');
  return {
    enabled: rows[0]?.enabled ?? false,
    token: rows[0]?.token ?? null,
    pendingCount: pending.length,
  };
}

/**
 * Turn self-registration on or off, and mint a token the first time it is enabled.
 *
 * Disabling keeps the token: a hospital that pauses registration over a holiday should not
 * have to reprint every poster to resume. Retiring a printed QR is a separate, deliberate
 * act — `regenerateRegistrationToken`.
 */
export async function setSelfRegistration(
  tenantId: string,
  enabled: boolean,
  actorUserId: string,
): Promise<RegistrationSettings> {
  const current = await getRegistrationSettings(tenantId);
  const token = current.token ?? newToken();

  await runWithTenant(tenantId, async (tx) => {
    const existing = await tx
      .select({ id: organizationProfile.id })
      .from(organizationProfile)
      .where(eq(organizationProfile.tenantId, tenantId))
      .limit(1);
    if (existing[0]) {
      await tx
        .update(organizationProfile)
        .set({
          selfRegistrationEnabled: enabled,
          selfRegistrationToken: token,
          updatedAt: new Date(),
        })
        .where(eq(organizationProfile.tenantId, tenantId));
    } else {
      await tx
        .insert(organizationProfile)
        .values({ tenantId, selfRegistrationEnabled: enabled, selfRegistrationToken: token });
    }
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: enabled ? 'patient.registration.enabled' : 'patient.registration.disabled',
    severity: 'notice',
    resourceType: 'organization_profile',
    resourceId: tenantId,
  });

  return getRegistrationSettings(tenantId);
}

/** Retire the printed QR and issue a new one. Every existing poster stops working. */
export async function regenerateRegistrationToken(
  tenantId: string,
  actorUserId: string,
): Promise<RegistrationSettings> {
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(organizationProfile)
      .set({ selfRegistrationToken: newToken(), updatedAt: new Date() })
      .where(eq(organizationProfile.tenantId, tenantId)),
  );
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'patient.registration.token_regenerated',
    severity: 'notice',
    resourceType: 'organization_profile',
    resourceId: tenantId,
  });
  return getRegistrationSettings(tenantId);
}
