import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  patientCases,
  patients,
  providers,
  departments,
  visits,
  type PatientCaseRow,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { assertCaseType } from '../workflow/workflowConfig.service';

/**
 * Treatment cases (ADR-116) — the episode a run of visits belongs to.
 *
 * The service is small on purpose. A case is a thin spine: a number, a title, where it is being
 * run, and whether it is still open. Everything clinical hangs off the visits underneath it, which
 * already have their own rules. Making the case itself clever would mean two places deciding what a
 * course of treatment is.
 */

export interface CaseDto {
  id: string;
  caseNumber: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  title: string;
  /** What kind of episode this is, in the hospital's own vocabulary (ADR-121). */
  caseType: string | null;
  status: string;
  departmentId: string | null;
  departmentName: string | null;
  providerId: string | null;
  providerName: string | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  closeReason: string | null;
  version: number;
  /** How many visits have been made under this case, and when the last one was. */
  visitCount: number;
  lastVisitDate: string | null;
}

type CaseRowFlat = {
  c: PatientCaseRow;
  patientFirst: string;
  patientLast: string | null;
  patientUhid: string;
  departmentName: string | null;
  providerName: string | null;
};

function toDto(row: CaseRowFlat, visitCount: number, lastVisitDate: string | null): CaseDto {
  const c = row.c;
  return {
    id: c.id,
    caseNumber: c.caseNumber,
    patientId: c.patientId,
    patientName: `${row.patientFirst} ${row.patientLast ?? ''}`.trim(),
    patientUhid: row.patientUhid,
    title: c.title,
    caseType: c.caseType,
    status: c.status,
    departmentId: c.departmentId,
    departmentName: row.departmentName,
    providerId: c.providerId,
    providerName: row.providerName,
    notes: c.notes,
    openedAt: c.openedAt.toISOString(),
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
    closeReason: c.closeReason,
    version: c.version,
    visitCount,
    lastVisitDate,
  };
}

const caseColumns = {
  c: patientCases,
  patientFirst: patients.firstName,
  patientLast: patients.lastName,
  patientUhid: patients.uhid,
  departmentName: departments.name,
  providerName: providers.fullName,
};

/** Visit counts for a set of cases, in one query rather than one per row. */
async function visitStats(
  tx: Parameters<Parameters<typeof runWithTenant>[1]>[0],
  tenantId: string,
  caseIds: string[],
): Promise<Map<string, { count: number; last: string | null }>> {
  const out = new Map<string, { count: number; last: string | null }>();
  if (caseIds.length === 0) return out;
  const rows = await tx
    .select({
      caseId: visits.caseId,
      c: count(),
      last: sql<string | null>`max(${visits.visitDate})`,
    })
    .from(visits)
    .where(and(eq(visits.tenantId, tenantId), inArray(visits.caseId, caseIds)))
    .groupBy(visits.caseId);
  for (const r of rows) {
    if (r.caseId) out.set(r.caseId, { count: Number(r.c), last: r.last ?? null });
  }
  return out;
}

export interface ListCasesOptions {
  patientId?: string;
  /** `open` | `closed`. Omitted returns both — the chart shows history as well as what is live. */
  status?: string;
}

export async function listCases(tenantId: string, opts: ListCasesOptions = {}): Promise<CaseDto[]> {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [eq(patientCases.tenantId, tenantId)];
    if (opts.patientId) conds.push(eq(patientCases.patientId, opts.patientId));
    if (opts.status) conds.push(eq(patientCases.status, opts.status));

    const rows = await tx
      .select(caseColumns)
      .from(patientCases)
      .innerJoin(patients, eq(patients.id, patientCases.patientId))
      .leftJoin(departments, eq(departments.id, patientCases.departmentId))
      .leftJoin(providers, eq(providers.id, patientCases.providerId))
      .where(and(...conds))
      // Open before closed, then most recently opened — the desk is choosing from what is live.
      // Ordered on the MEANING of the status, not on the string: sorting the column alphabetically
      // put 'closed' above 'open', which is the exact opposite of what this comment has claimed.
      .orderBy(
        sql`case when ${patientCases.status} = 'open' then 0 else 1 end`,
        desc(patientCases.openedAt),
      );

    const stats = await visitStats(
      tx,
      tenantId,
      rows.map((r) => r.c.id),
    );
    return rows.map((r) => {
      const s = stats.get(r.c.id);
      return toDto(r, s?.count ?? 0, s?.last ?? null);
    });
  });
}

export async function getCase(tenantId: string, caseId: string): Promise<CaseDto> {
  return runWithTenant(tenantId, async (tx) => {
    const row = (
      await tx
        .select(caseColumns)
        .from(patientCases)
        .innerJoin(patients, eq(patients.id, patientCases.patientId))
        .leftJoin(departments, eq(departments.id, patientCases.departmentId))
        .leftJoin(providers, eq(providers.id, patientCases.providerId))
        .where(and(eq(patientCases.tenantId, tenantId), eq(patientCases.id, caseId)))
        .limit(1)
    )[0];
    if (!row) throw Errors.notFound('Case not found');
    const stats = await visitStats(tx, tenantId, [caseId]);
    const s = stats.get(caseId);
    return toDto(row, s?.count ?? 0, s?.last ?? null);
  });
}

export interface OpenCaseInput {
  patientId: string;
  title: string;
  departmentId?: string | null;
  providerId?: string | null;
  branchId?: string | null;
  notes?: string | null;
  /**
   * The hospital's own case type (ADR-121), already checked against its configured vocabulary.
   * `openCaseTx` runs inside a caller's transaction and deliberately does not validate it here —
   * resolving the vocabulary is a separate tenant-scoped read, and check-in does it before opening
   * its transaction so a bad value fails before anything is written.
   */
  caseType?: string | null;
}

/**
 * Opens a case, inside an existing transaction.
 *
 * Exported in this shape because check-in opens one as part of creating a visit, and that has to be
 * the same transaction: a case with no visit, left behind by a check-in that failed afterwards, is
 * exactly the orphan record this feature is supposed to prevent.
 */
export async function openCaseTx(
  tx: Parameters<Parameters<typeof runWithTenant>[1]>[0],
  tenantId: string,
  input: OpenCaseInput,
  actorUserId?: string,
): Promise<PatientCaseRow> {
  const patient = (
    await tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId)))
      .limit(1)
  )[0];
  if (!patient) throw Errors.notFound('Patient not found');

  if (input.departmentId) {
    const dept = (
      await tx
        .select({ isActive: departments.isActive })
        .from(departments)
        .where(and(eq(departments.tenantId, tenantId), eq(departments.id, input.departmentId)))
        .limit(1)
    )[0];
    if (!dept) throw Errors.notFound('Department not found');
    if (!dept.isActive) throw Errors.validation(undefined, 'That department is no longer active');
  }
  if (input.providerId) {
    const provider = (
      await tx
        .select({ id: providers.id })
        .from(providers)
        .where(and(eq(providers.tenantId, tenantId), eq(providers.id, input.providerId)))
        .limit(1)
    )[0];
    if (!provider) throw Errors.notFound('Provider not found');
  }

  // Tenant-monotonic case number, retried on the unique conflict — the same shape as visit
  // numbering, and for the same reason: two desks opening a case in the same instant.
  const existing = Number(
    (
      await tx.select({ c: count() }).from(patientCases).where(eq(patientCases.tenantId, tenantId))
    )[0]?.c ?? 0,
  );
  for (let i = 1; i <= 8; i++) {
    const caseNumber = `C-${String(existing + i).padStart(6, '0')}`;
    const inserted = await tx
      .insert(patientCases)
      .values({
        tenantId,
        branchId: input.branchId ?? null,
        patientId: input.patientId,
        caseNumber,
        title: input.title.trim(),
        departmentId: input.departmentId ?? null,
        providerId: input.providerId ?? null,
        notes: input.notes ?? null,
        caseType: input.caseType ?? null,
        openedBy: actorUserId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) return inserted[0];
  }
  throw Errors.conflict('Could not allocate a case number. Please retry');
}

export async function openCase(
  tenantId: string,
  input: OpenCaseInput,
  actorUserId?: string,
): Promise<CaseDto> {
  const caseType = input.caseType
    ? await assertCaseType(tenantId, input.branchId, input.caseType)
    : null;
  const row = await runWithTenant(tenantId, async (tx) => {
    // The same advisory lock check-in uses, for the same read-then-write on the number.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${tenantId}:case_number`}))`);
    return openCaseTx(tx, tenantId, { ...input, caseType }, actorUserId);
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'case.opened',
    resourceType: 'patient_case',
    resourceId: row.id,
    metadata: {
      patientId: row.patientId,
      caseNumber: row.caseNumber,
      title: row.title,
      caseType: row.caseType,
    },
  });
  return getCase(tenantId, row.id);
}

export interface UpdateCaseInput {
  version: number;
  title?: string;
  departmentId?: string | null;
  providerId?: string | null;
  notes?: string | null;
  /**
   * Correctable, on purpose (ADR-060). A case opened as general treatment that turns out to be an
   * insurance claim is the ordinary case, not the exceptional one, and a type that can only be set
   * once would be worked around by opening a second case — the duplicate ADR-116 exists to prevent.
   *
   * It changes what **future** visits under this case are charged. Visits already priced keep their
   * invoices: re-pricing a consultation that has been paid for is a credit note, not an edit.
   */
  caseType?: string | null;
}

export async function updateCase(
  tenantId: string,
  caseId: string,
  input: UpdateCaseInput,
  actorUserId?: string,
): Promise<CaseDto> {
  const before = await getCase(tenantId, caseId);
  const caseType =
    input.caseType === undefined
      ? before.caseType
      : input.caseType
        ? await assertCaseType(tenantId, null, input.caseType)
        : null;

  await runWithTenant(tenantId, async (tx) => {
    if (input.departmentId) {
      const dept = (
        await tx
          .select({ isActive: departments.isActive })
          .from(departments)
          .where(and(eq(departments.tenantId, tenantId), eq(departments.id, input.departmentId)))
          .limit(1)
      )[0];
      if (!dept) throw Errors.notFound('Department not found');
      if (!dept.isActive) throw Errors.validation(undefined, 'That department is no longer active');
    }

    // Compare-and-swap on the version rather than a pre-read: two tabs cannot both win.
    const bumped = await tx
      .update(patientCases)
      .set({
        title: input.title?.trim() ?? before.title,
        departmentId: input.departmentId === undefined ? before.departmentId : input.departmentId,
        providerId: input.providerId === undefined ? before.providerId : input.providerId,
        notes: input.notes === undefined ? before.notes : input.notes,
        caseType,
        version: before.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(patientCases.tenantId, tenantId),
          eq(patientCases.id, caseId),
          eq(patientCases.version, input.version),
        ),
      )
      .returning({ id: patientCases.id });
    if (!bumped[0])
      throw Errors.conflict('This case was changed by someone else. Reload and try again');
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'case.updated',
    resourceType: 'patient_case',
    resourceId: caseId,
    metadata: {
      caseNumber: before.caseNumber,
      titleBefore: before.title,
      titleAfter: input.title ?? before.title,
      // Both, because it decides what every later visit under this case is charged.
      caseTypeBefore: before.caseType,
      caseTypeAfter: caseType,
    },
  });
  return getCase(tenantId, caseId);
}

/**
 * Closes a case.
 *
 * Refused while a visit under it is still live. Closing an episode with the patient sitting in the
 * waiting room is either a mis-click or a race, and the queue is the honest place to see which —
 * the alternative is a doctor opening a consultation on a case that has been declared finished.
 */
export async function closeCase(
  tenantId: string,
  caseId: string,
  input: { version: number; closeReason: string },
  actorUserId?: string,
): Promise<CaseDto> {
  const before = await getCase(tenantId, caseId);
  if (before.status === 'closed') throw Errors.conflict('This case is already closed');

  await runWithTenant(tenantId, async (tx) => {
    const live = (
      await tx
        .select({ visitNumber: visits.visitNumber })
        .from(visits)
        .where(
          and(
            eq(visits.tenantId, tenantId),
            eq(visits.caseId, caseId),
            inArray(visits.status, ['checked_in', 'in_consultation']),
          ),
        )
        .limit(1)
    )[0];
    if (live) {
      throw Errors.conflict(
        `${live.visitNumber} is still open under this case. Complete or cancel it first`,
      );
    }

    const bumped = await tx
      .update(patientCases)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closedBy: actorUserId ?? null,
        closeReason: input.closeReason.trim(),
        version: before.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(patientCases.tenantId, tenantId),
          eq(patientCases.id, caseId),
          eq(patientCases.version, input.version),
        ),
      )
      .returning({ id: patientCases.id });
    if (!bumped[0])
      throw Errors.conflict('This case was changed by someone else. Reload and try again');
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'case.closed',
    resourceType: 'patient_case',
    resourceId: caseId,
    metadata: {
      caseNumber: before.caseNumber,
      closeReason: input.closeReason,
      visitCount: before.visitCount,
    },
  });
  return getCase(tenantId, caseId);
}

/**
 * Reopens a closed case.
 *
 * Treatment resumes, and people mis-click. Reopening keeps every visit already under the case, so
 * the alternative — opening a second case for the same episode — is the thing worth avoiding: it
 * splits a patient's history in two with no way to put it back together.
 */
export async function reopenCase(
  tenantId: string,
  caseId: string,
  input: { version: number },
  actorUserId?: string,
): Promise<CaseDto> {
  const before = await getCase(tenantId, caseId);
  if (before.status !== 'closed') throw Errors.conflict('This case is already open');

  await runWithTenant(tenantId, async (tx) => {
    const bumped = await tx
      .update(patientCases)
      .set({
        status: 'open',
        closedAt: null,
        closedBy: null,
        closeReason: null,
        version: before.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(patientCases.tenantId, tenantId),
          eq(patientCases.id, caseId),
          eq(patientCases.version, input.version),
        ),
      )
      .returning({ id: patientCases.id });
    if (!bumped[0])
      throw Errors.conflict('This case was changed by someone else. Reload and try again');
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'case.reopened',
    resourceType: 'patient_case',
    resourceId: caseId,
    // What it was closed for is the thing someone reading this later needs, and it is about to be
    // erased from the row.
    metadata: { caseNumber: before.caseNumber, previousCloseReason: before.closeReason },
  });
  return getCase(tenantId, caseId);
}

/**
 * Validates a case a visit is about to be attached to, inside check-in's transaction.
 *
 * Both checks matter and neither is obvious from the client: the case must belong to *this*
 * patient — an id from another chart would silently file the visit under a stranger's episode —
 * and it must still be open, because attaching a visit to a closed case is how an episode quietly
 * comes back to life without anyone deciding to reopen it.
 */
export async function assertCaseUsableTx(
  tx: Parameters<Parameters<typeof runWithTenant>[1]>[0],
  tenantId: string,
  caseId: string,
  patientId: string,
): Promise<PatientCaseRow> {
  const row = (
    await tx
      .select()
      .from(patientCases)
      .where(and(eq(patientCases.tenantId, tenantId), eq(patientCases.id, caseId)))
      .limit(1)
  )[0];
  if (!row) throw Errors.notFound('Case not found');
  if (row.patientId !== patientId) {
    throw Errors.validation(undefined, 'That case belongs to a different patient');
  }
  if (row.status !== 'open') {
    throw Errors.conflict(
      'That case is closed. Reopen it, or check the patient in under a new case',
    );
  }
  return row;
}
