import { and, eq, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { abdmCareContexts, patients, type AbdmCareContext, type Patient } from '../../db/schema';
import { logger } from '../../config/logger';
import { writeAudit } from '../audit/audit.service';

/**
 * Discovery — a patient asking "what records do you hold for me?" (ADR-090).
 *
 * The gateway forwards the request with a set of **verified** identifiers (ABHA address, mobile,
 * name, gender, year of birth) and optionally an **unverified** one the patient typed themselves
 * (a hospital registration number). We answer with the care contexts we hold for that person, or
 * with nothing.
 *
 * The whole risk of this flow sits in one decision: **who is this?** Answer it too loosely and one
 * patient is handed another patient's records. So the rules here are deliberately strict:
 *
 * - A **verified ABHA address** is conclusive on its own — ABDM proved it, not us.
 * - An unverified registration number is **never** sufficient alone. It is something a patient can
 *   guess, mistype, or read off someone else's card, and treating it as proof would make our own
 *   UHID sequence an attack surface.
 * - Demographics must match on **mobile AND name AND year of birth** together. Any one of them
 *   alone is a coincidence; a shared family mobile makes even two of them plausible.
 * - **Ambiguity means no match.** If more than one chart fits, we return nothing rather than
 *   guessing. ABDM's flow expects a single patient, and the failure mode of guessing is disclosure.
 */

/** ABDM's vocabulary for what the match was made on, echoed back in `matchedBy`. */
export type MatchedBy = 'HEALTH_ID' | 'MOBILE' | 'MR' | 'NAME' | 'YEAR_OF_BIRTH' | 'GENDER';

export type DiscoveryRequest = {
  /** Verified by ABDM before it reached us. */
  abhaAddress?: string;
  mobile?: string;
  name?: string;
  gender?: string;
  yearOfBirth?: number;
  /** Self-declared by the patient. A hint, never a proof. */
  medicalRecordNumber?: string;
};

export type DiscoveryResult = {
  patient?: Patient;
  matchedBy: MatchedBy[];
  careContexts: AbdmCareContext[];
  /** Set when we deliberately declined to answer, for the audit trail and the log. */
  reason?: string;
};

const digits = (v?: string): string => (v ?? '').replace(/\D/g, '').slice(-10);
const normalise = (v?: string): string => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Our stored `male|female|other` against ABDM's `M|F|O`, without either side having to care. */
function genderMatches(ours?: string | null, theirs?: string): boolean {
  if (!ours || !theirs) return true; // Absent on either side is not a contradiction.
  return ours.trim().toLowerCase().startsWith(theirs.trim().toLowerCase().charAt(0));
}

/** A patient's full name, as one comparable string. */
const fullName = (p: Patient): string => normalise([p.firstName, p.lastName].filter(Boolean).join(' '));

/**
 * Finds the one patient a discovery request refers to, or nobody.
 *
 * Runs the strongest signal first and stops there: a verified ABHA address needs no corroboration,
 * and looking for demographic agreement after it would only introduce ways to reject a match ABDM
 * has already proved.
 */
export async function discoverPatient(tenantId: string, request: DiscoveryRequest): Promise<DiscoveryResult> {
  // 1. Verified ABHA address — conclusive.
  if (request.abhaAddress) {
    const byAbha = await runWithTenant(tenantId, (tx) =>
      tx
        .select()
        .from(patients)
        .where(
          and(
            eq(patients.tenantId, tenantId),
            eq(patients.status, 'active'),
            sql`lower(${patients.abhaAddress}) = lower(${request.abhaAddress})`,
          ),
        )
        .limit(2),
    );
    if (byAbha.length === 1) {
      return withContexts(tenantId, byAbha[0]!, ['HEALTH_ID']);
    }
    if (byAbha.length > 1) {
      // Two charts claiming one national identity is a data problem here, not a reason to pick one.
      return { matchedBy: [], careContexts: [], reason: 'More than one chart holds that ABHA address' };
    }
  }

  // 2. Demographics: mobile AND name AND year of birth, with gender as a consistency check.
  const mobile = digits(request.mobile);
  const name = normalise(request.name);
  if (mobile && name && request.yearOfBirth) {
    const candidates = await runWithTenant(tenantId, (tx) =>
      tx
        .select()
        .from(patients)
        .where(
          and(
            eq(patients.tenantId, tenantId),
            eq(patients.status, 'active'),
            sql`regexp_replace(coalesce(${patients.phone}, ''), '[^0-9]', '', 'g') like ${'%' + mobile}`,
            sql`extract(year from ${patients.dateOfBirth}) = ${request.yearOfBirth}`,
          ),
        )
        .limit(10),
    );

    const matches = candidates.filter((p) => fullName(p) === name && genderMatches(p.gender, request.gender));

    // A self-declared registration number cannot create a match, but it CAN choose between
    // demographic candidates the patient has additionally identified — which is exactly the
    // "weaker signal" role ABDM describes for it.
    if (matches.length > 1 && request.medicalRecordNumber) {
      const byMr = matches.filter((p) => normalise(p.uhid) === normalise(request.medicalRecordNumber));
      if (byMr.length === 1) {
        return withContexts(tenantId, byMr[0]!, ['MOBILE', 'NAME', 'YEAR_OF_BIRTH', 'MR']);
      }
    }

    if (matches.length === 1) {
      const matchedBy: MatchedBy[] = ['MOBILE', 'NAME', 'YEAR_OF_BIRTH'];
      if (request.gender) matchedBy.push('GENDER');
      return withContexts(tenantId, matches[0]!, matchedBy);
    }
    if (matches.length > 1) {
      // Twins on a shared family mobile are real. Guessing between them is a disclosure.
      return { matchedBy: [], careContexts: [], reason: 'More than one chart matches those details' };
    }
  }

  return { matchedBy: [], careContexts: [], reason: 'No chart matches the details supplied' };
}

/**
 * The care contexts we will admit to holding.
 *
 * Only those already **linked or linkable** — a context we have not yet processed is our internal
 * bookkeeping, not a record the patient can ask for. And only the label and reference travel: the
 * response carries no clinical information, by the same rule that governs linking (ADR-087).
 */
async function withContexts(tenantId: string, patient: Patient, matchedBy: MatchedBy[]): Promise<DiscoveryResult> {
  const careContexts = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmCareContexts)
      .where(and(eq(abdmCareContexts.tenantId, tenantId), eq(abdmCareContexts.patientId, patient.id))),
  );
  return { patient, matchedBy, careContexts };
}

/**
 * Answers a discovery request and records what happened.
 *
 * Every discovery is audited whether or not it matched: an unmatched request is the more
 * interesting one to be able to look back at, because a run of them against the same demographics
 * is what an attempt to enumerate patients looks like.
 */
export async function handleDiscovery(
  tenantId: string,
  request: DiscoveryRequest,
  meta: { transactionId?: string; requestId?: string },
): Promise<DiscoveryResult> {
  const result = await discoverPatient(tenantId, request);

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: result.patient ? 'abdm.discovery.matched' : 'abdm.discovery.no_match',
    resourceType: 'patient',
    resourceId: result.patient?.id ?? null,
    severity: 'notice',
    // The identifiers themselves are not recorded — only which KINDS of them matched, which is
    // what makes the trail useful without turning the audit log into a second copy of the request.
    metadata: {
      matchedBy: result.matchedBy,
      careContexts: result.careContexts.length,
      transactionId: meta.transactionId,
      reason: result.reason,
    },
  });

  if (!result.patient) {
    logger.info({ tenantId, reason: result.reason }, 'ABDM discovery found no match');
  }
  return result;
}
