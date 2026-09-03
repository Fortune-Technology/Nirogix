import { eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { abdmFacilityRegistry, abdmStaffHpr, branches, providers } from '../../db/schema';
import { logger } from '../../config/logger';
import { writeAudit } from '../audit/audit.service';

/**
 * Onboarding a whole roster at once (ADR-098).
 *
 * **There is no bulk-upload API.** Both published V4 specs were searched: HFR has no bulk endpoint
 * at all, and HPR's only upload is `/apis/v1/uploads/upload-document`, which attaches one degree
 * certificate to one professional. ABDM's bulk path is a **portal process** — download their
 * template, fill it, upload it, collect the results — so there is nothing to integrate with and
 * building a client for it would have meant building a client for something that does not exist.
 *
 * What is genuinely useful, and what this does, is the two ends the portal cannot do for us:
 *
 * - **Export** the roster we already hold, so nobody re-keys two hundred staff into a spreadsheet.
 * - **Import** the portal's results, so the issued ids land against the right records instead of
 *   being matched by eye.
 *
 * The import is where the risk lives, and it is the mirror of M3's disclosure risk: attaching a
 * returned HPR id to the wrong clinician gives a real person's national identity to somebody else.
 * So matching is **strict, and ambiguity is refused rather than guessed** — an unmatched row is
 * reported for a human, which is a nuisance; a wrongly-matched row is a defect nobody would notice.
 *
 * **The column names below are derived from the verified API contracts, not from ABDM's template**,
 * which is a downloadable spreadsheet we do not have. They are collected here, in one object each,
 * precisely so that correcting them against the real template is a single edit — see `BACKLOG.md`.
 */

/** One exported row, keyed by the column heading it should carry. */
export type BulkRow = Record<string, string>;

export type ImportOutcome = {
  matched: number;
  unmatched: Array<{ row: number; reason: string; identifier: string }>;
  ambiguous: Array<{ row: number; identifier: string; candidates: number }>;
};

/**
 * Column headings for the professional roster.
 *
 * Named after the fields `PractitionerDTO` actually uses, so the mapping is at least internally
 * consistent with the API we call for single enrolments.
 */
export const PROFESSIONAL_COLUMNS = {
  fullName: 'Name',
  category: 'Health Professional Type',
  registrationCouncil: 'Council Name',
  registrationNumber: 'Registration Number',
  systemOfMedicine: 'System of Medicine',
  email: 'Email',
  mobile: 'Mobile',
  hprId: 'HPR ID',
} as const;

export const FACILITY_COLUMNS = {
  facilityName: 'Facility Name',
  ownershipCode: 'Ownership Code',
  facilityTypeCode: 'Facility Type Code',
  systemOfMedicineCode: 'System of Medicine Code',
  stateLgdCode: 'State LGD Code',
  districtLgdCode: 'District LGD Code',
  pincode: 'Pincode',
  facilityId: 'Facility ID',
} as const;

/**
 * The staff roster, ready to paste into ABDM's template.
 *
 * Everyone who is *not* already registered — someone who holds an HPR id has nothing to submit, and
 * including them would invite the portal to mint a second identity for them.
 */
export async function exportProfessionals(tenantId: string): Promise<BulkRow[]> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({
        providerId: providers.id,
        fullName: providers.fullName,
        registrationNumber: providers.registrationNumber,
        email: providers.email,
        phone: providers.phone,
        isActive: providers.isActive,
      })
      .from(providers)
      .where(eq(providers.tenantId, tenantId)),
  );
  const enrolments = await runWithTenant(tenantId, (tx) =>
    tx.select().from(abdmStaffHpr).where(eq(abdmStaffHpr.tenantId, tenantId)),
  );
  const byProvider = new Map(enrolments.map((e) => [e.providerId, e]));

  return rows
    .filter((r) => r.isActive)
    .filter((r) => {
      const enrolment = byProvider.get(r.providerId);
      // Already has an id — nothing to submit, and submitting anyway risks a duplicate identity.
      return !(
        enrolment?.hprId &&
        (enrolment.status === 'registered' || enrolment.status === 'already_registered')
      );
    })
    .map((r) => {
      const enrolment = byProvider.get(r.providerId);
      return {
        [PROFESSIONAL_COLUMNS.fullName]: r.fullName,
        [PROFESSIONAL_COLUMNS.category]: enrolment?.professionalCategory ?? 'doctor',
        [PROFESSIONAL_COLUMNS.registrationCouncil]: enrolment?.registrationCouncil ?? '',
        [PROFESSIONAL_COLUMNS.registrationNumber]: r.registrationNumber ?? '',
        [PROFESSIONAL_COLUMNS.systemOfMedicine]: enrolment?.systemOfMedicine ?? '',
        [PROFESSIONAL_COLUMNS.email]: r.email ?? '',
        [PROFESSIONAL_COLUMNS.mobile]: r.phone ?? '',
        // Left blank on purpose: the portal fills it, and we read it back on import.
        [PROFESSIONAL_COLUMNS.hprId]: '',
      };
    });
}

/** The same, for a group's facilities. */
export async function exportFacilities(tenantId: string): Promise<BulkRow[]> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx.select().from(abdmFacilityRegistry).where(eq(abdmFacilityRegistry.tenantId, tenantId)),
  );
  return rows
    .filter((r) => !r.facilityId)
    .map((r) => ({
      [FACILITY_COLUMNS.facilityName]: r.facilityName,
      [FACILITY_COLUMNS.ownershipCode]: r.ownershipCode ?? '',
      [FACILITY_COLUMNS.facilityTypeCode]: r.facilityTypeCode ?? '',
      [FACILITY_COLUMNS.systemOfMedicineCode]: r.systemOfMedicineCode ?? '',
      [FACILITY_COLUMNS.stateLgdCode]: r.stateLgdCode ?? '',
      [FACILITY_COLUMNS.districtLgdCode]: r.districtLgdCode ?? '',
      [FACILITY_COLUMNS.pincode]: r.pincode ?? '',
      [FACILITY_COLUMNS.facilityId]: '',
    }));
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const norm = (v: unknown): string => clean(v).toLowerCase().replace(/\s+/g, ' ');

/**
 * Reads the portal's results back and attaches each issued HPR id to the right clinician.
 *
 * **The matching rule is the whole design.** Registration number first, because it is unique and
 * externally meaningful; full name only when it identifies exactly one active person. Anything that
 * matches two people is reported as ambiguous and **skipped** — attaching a stranger's national
 * identity to a staff record is a defect nobody would ever notice, and a row a human has to look at
 * is a far smaller cost than that.
 *
 * Fuzzy matching is deliberately absent. "Close enough" is exactly the wrong standard here.
 */
export async function importProfessionalResults(
  tenantId: string,
  actorUserId: string | null,
  rows: BulkRow[],
): Promise<ImportOutcome> {
  const staff = await runWithTenant(tenantId, (tx) =>
    tx
      .select({
        id: providers.id,
        fullName: providers.fullName,
        registrationNumber: providers.registrationNumber,
        isActive: providers.isActive,
      })
      .from(providers)
      .where(eq(providers.tenantId, tenantId)),
  );
  const active = staff.filter((s) => s.isActive);

  const outcome: ImportOutcome = { matched: 0, unmatched: [], ambiguous: [] };

  for (const [index, row] of rows.entries()) {
    const lineNumber = index + 2; // Header is line 1, as an administrator counts it.
    const hprId = clean(row[PROFESSIONAL_COLUMNS.hprId]);
    const registrationNumber = clean(row[PROFESSIONAL_COLUMNS.registrationNumber]);
    const fullName = clean(row[PROFESSIONAL_COLUMNS.fullName]);
    const identifier = registrationNumber || fullName || `row ${lineNumber}`;

    if (!hprId) {
      outcome.unmatched.push({
        row: lineNumber,
        identifier,
        reason: 'The portal issued no HPR id for this row',
      });
      continue;
    }

    // 1. Registration number — unique, externally meaningful, and the only strong key we have.
    let candidates = registrationNumber
      ? active.filter((s) => norm(s.registrationNumber) === norm(registrationNumber))
      : [];

    // 2. Full name, only if the number found nobody and the name is unambiguous.
    if (candidates.length === 0 && fullName) {
      candidates = active.filter((s) => norm(s.fullName) === norm(fullName));
    }

    if (candidates.length === 0) {
      outcome.unmatched.push({
        row: lineNumber,
        identifier,
        reason: 'No active staff member matches this row',
      });
      continue;
    }
    if (candidates.length > 1) {
      // Two people, one id. Guessing here hands somebody else's identity to the wrong record.
      outcome.ambiguous.push({ row: lineNumber, identifier, candidates: candidates.length });
      continue;
    }

    await runWithTenant(tenantId, (tx) =>
      tx
        .insert(abdmStaffHpr)
        .values({
          tenantId,
          providerId: candidates[0]!.id,
          hprId,
          status: 'registered',
          statusMessage: 'Imported from an ABDM bulk upload',
          registrationCouncil: clean(row[PROFESSIONAL_COLUMNS.registrationCouncil]) || null,
          registrationNumber: registrationNumber || null,
          systemOfMedicine: clean(row[PROFESSIONAL_COLUMNS.systemOfMedicine]) || null,
          professionalCategory: clean(row[PROFESSIONAL_COLUMNS.category]) || null,
          lastSyncedAt: new Date(),
          createdBy: actorUserId,
        })
        .onConflictDoUpdate({
          target: [abdmStaffHpr.tenantId, abdmStaffHpr.providerId],
          set: { hprId, status: 'registered', lastSyncedAt: new Date(), updatedAt: new Date() },
        }),
    );
    outcome.matched += 1;
  }

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'abdm.hpr.bulk_imported',
    resourceType: 'tenant',
    resourceId: tenantId,
    severity: outcome.ambiguous.length > 0 ? 'warning' : 'notice',
    // Counts only — the file itself holds identities and does not belong in an audit row.
    metadata: {
      rows: rows.length,
      matched: outcome.matched,
      unmatched: outcome.unmatched.length,
      ambiguous: outcome.ambiguous.length,
    },
  });
  if (outcome.ambiguous.length > 0) {
    logger.warn(
      { tenantId, ambiguous: outcome.ambiguous.length },
      'HPR bulk import skipped ambiguous rows',
    );
  }
  return outcome;
}

/**
 * The same for facilities, matched on name within the organisation.
 *
 * A group with two branches genuinely called "City Hospital" is a real possibility, so the same
 * refusal applies: two matches means neither is updated.
 */
export async function importFacilityResults(
  tenantId: string,
  actorUserId: string | null,
  rows: BulkRow[],
): Promise<ImportOutcome> {
  const registrations = await runWithTenant(tenantId, (tx) =>
    tx.select().from(abdmFacilityRegistry).where(eq(abdmFacilityRegistry.tenantId, tenantId)),
  );
  const outcome: ImportOutcome = { matched: 0, unmatched: [], ambiguous: [] };

  for (const [index, row] of rows.entries()) {
    const lineNumber = index + 2;
    const facilityId = clean(row[FACILITY_COLUMNS.facilityId]);
    const facilityName = clean(row[FACILITY_COLUMNS.facilityName]);
    const identifier = facilityName || `row ${lineNumber}`;

    if (!facilityId) {
      outcome.unmatched.push({
        row: lineNumber,
        identifier,
        reason: 'The portal issued no facility id for this row',
      });
      continue;
    }

    const candidates = registrations.filter((r) => norm(r.facilityName) === norm(facilityName));
    if (candidates.length === 0) {
      outcome.unmatched.push({
        row: lineNumber,
        identifier,
        reason: 'No facility registration matches this name',
      });
      continue;
    }
    if (candidates.length > 1) {
      outcome.ambiguous.push({ row: lineNumber, identifier, candidates: candidates.length });
      continue;
    }

    await runWithTenant(tenantId, (tx) =>
      tx
        .update(abdmFacilityRegistry)
        .set({
          facilityId,
          status: 'verified',
          statusMessage: 'Imported from an ABDM bulk upload',
          verifiedAt: new Date(),
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(abdmFacilityRegistry.id, candidates[0]!.id)),
    );
    outcome.matched += 1;
  }

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'abdm.hfr.bulk_imported',
    resourceType: 'tenant',
    resourceId: tenantId,
    severity: outcome.ambiguous.length > 0 ? 'warning' : 'notice',
    metadata: { rows: rows.length, matched: outcome.matched, ambiguous: outcome.ambiguous.length },
  });
  return outcome;
}

/** Branch names, so an export can say which facility a row belongs to. */
export async function branchNames(tenantId: string): Promise<Map<string, string>> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.tenantId, tenantId)),
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}
