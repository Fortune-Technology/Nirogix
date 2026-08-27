import { and, eq, isNull } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { abdmFacilityRegistry, type AbdmFacilityRegistry } from '../../db/schema';
import { AppError } from '../../http/error';
import { logger } from '../../config/logger';
import { writeAudit } from '../audit/audit.service';
import { HFR_PATHS } from './abdm.constants';
import { registryMasterData, registryPost } from './registryGateway';
import { getFacilityConfig, upsertFacilityConfig } from './abdm.service';

/**
 * Listing the hospital in the Health Facility Registry (ADR-096).
 *
 * The first ABDM milestone that moves **no patient data whatsoever** — it registers the building and
 * the organisation, not anyone's health. That changes the risk profile completely, and the code
 * should not pretend otherwise: there is no encryption ceremony here, no consent, no purge. What
 * there *is* instead is a long human process, and the honesty problem is different:
 *
 * - **Submitted is not approved.** HFR routes every registration to a verifier. A UI that shows a
 *   green tick on submission would have an administrator believe they hold a Facility ID they do
 *   not, and only discover otherwise when M2's service registration fails weeks later.
 * - **The wizard is stateful on HFR's side.** `basic-information` mints a `trackingId`; the other
 *   three steps quote it. A row therefore exists long before a facility id does, and losing the
 *   tracking id means starting the whole registration again.
 * - **The facility id, once issued, is not just a record — it is the `hipId` M1–M3 already use.**
 *   Today an org_admin types that by hand. Approval here should populate it, which is the one place
 *   M4 reaches back into the earlier milestones.
 */

/** Where a registration can go from where it is. Anything else is a bug, not a transition. */
const ALLOWED: Record<string, readonly string[]> = {
  draft: ['draft', 'submitted'],
  submitted: ['submitted', 'under_review', 'verified', 'rejected'],
  under_review: ['under_review', 'verified', 'rejected'],
  // A rejection is recoverable: the administrator fixes the form and submits again.
  rejected: ['draft', 'submitted'],
  // Terminal. A verified facility that changes its details updates; it does not re-register.
  verified: ['verified'],
};

export type FacilityDraft = {
  branchId?: string | null;
  facilityName: string;
  ownershipCode?: string;
  ownershipSubTypeCode?: string;
  facilityTypeCode?: string;
  facilitySubType?: string;
  systemOfMedicineCode?: string;
  specialityTypeCode?: string;
  typeOfServiceCode?: string;
  facilityOperationalStatus?: string;
  address: {
    country?: string;
    stateLGDCode?: string;
    districtLGDCode?: string;
    subDistrictLGDCode?: string;
    villageCityTownLGDCode?: string;
    facilityRegion?: string;
    addressLine1?: string;
    addressLine2?: string;
    pincode?: string;
    latitude?: string;
    longitude?: string;
  };
  contact: {
    facilityEmailId?: string;
    facilityContactNumber?: string;
    facilityLandlineNumber?: string;
    facilityStdCode?: string;
    websiteLink?: string;
  };
  timings?: Array<{ workingDays: string; openingHours: string }>;
};

/** Saves the administrator's work without sending anything to HFR. */
export async function saveDraft(
  tenantId: string,
  actorUserId: string | null,
  draft: FacilityDraft,
): Promise<AbdmFacilityRegistry> {
  const existing = await findRegistration(tenantId, draft.branchId ?? null);
  if (existing && existing.status === 'verified') {
    throw new AppError(
      409,
      'ABDM_FACILITY_ALREADY_VERIFIED',
      'This facility is already registered with HFR. Update its details instead of registering again.',
    );
  }

  const values = {
    tenantId,
    branchId: draft.branchId ?? null,
    facilityName: draft.facilityName,
    ownershipCode: draft.ownershipCode ?? null,
    facilityTypeCode: draft.facilityTypeCode ?? null,
    systemOfMedicineCode: draft.systemOfMedicineCode ?? null,
    stateLgdCode: draft.address.stateLGDCode ?? null,
    districtLgdCode: draft.address.districtLGDCode ?? null,
    pincode: draft.address.pincode ?? null,
    payload: draft as never,
    status: 'draft',
    createdBy: actorUserId,
  };

  const saved = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(abdmFacilityRegistry)
      .values(values)
      .onConflictDoUpdate({
        target: [abdmFacilityRegistry.tenantId, abdmFacilityRegistry.branchId],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return rows[0]!;
  });
  return saved;
}

/**
 * Sends the registration to HFR and records what came back.
 *
 * Four calls in order, all quoting the tracking id the first one mints. If a later step fails the
 * tracking id is still saved — losing it means starting the whole registration from scratch, and
 * that is a worse outcome than a half-finished wizard an administrator can resume.
 */
export async function submitRegistration(
  tenantId: string,
  actorUserId: string | null,
  branchId: string | null = null,
): Promise<AbdmFacilityRegistry> {
  const row = await findRegistration(tenantId, branchId);
  if (!row) throw new AppError(404, 'ABDM_FACILITY_DRAFT_NOT_FOUND', 'Save the facility details before submitting');
  assertTransition(row.status, 'submitted');

  const draft = row.payload as FacilityDraft | null;
  if (!draft) throw new AppError(422, 'ABDM_FACILITY_DRAFT_EMPTY', 'The saved facility details are incomplete');

  // Step 1 — mints the tracking id. Persisted immediately, before anything else can fail.
  const basic = await registryPost<{ trackingId?: string; message?: string }>(HFR_PATHS.basicInformation, {
    trackingId: row.trackingId ?? undefined,
    facilityInformation: {
      facilityName: draft.facilityName,
      facilityAddressDetails: { country: 'India', ...draft.address },
      facilityContactInformation: draft.contact,
      ownershipCode: draft.ownershipCode,
      ownershipSubTypeCode: draft.ownershipSubTypeCode,
      facilityTypeCode: draft.facilityTypeCode,
      facilitySubType: draft.facilitySubType,
      systemOfMedicineCode: draft.systemOfMedicineCode,
      specialityTypeCode: draft.specialityTypeCode,
      typeOfServiceCode: draft.typeOfServiceCode,
      facilityOperationalStatus: draft.facilityOperationalStatus ?? 'Functional',
      ...(draft.timings ? { timingsOfFacility: draft.timings } : {}),
    },
  });

  const trackingId = basic.trackingId ?? row.trackingId;
  if (!trackingId) {
    throw new AppError(502, 'ABDM_FACILITY_NO_TRACKING_ID', 'HFR accepted the details but returned no tracking id');
  }
  await patch(tenantId, row.id, { trackingId });

  // Steps 2–4. A failure here leaves the tracking id saved, so the administrator resumes rather
  // than re-keying a forty-field form.
  await registryPost(HFR_PATHS.additionalInformation, { trackingId, generalInformation: {} });
  await registryPost(HFR_PATHS.detailedInformation, { trackingId });
  const submitted = await registryPost<{ status?: string; message?: string }>(HFR_PATHS.submitFacility, {
    trackingId,
    sourceOfInformation: 'Nirogix HMS',
  });

  const updated = await patch(tenantId, row.id, {
    status: 'submitted',
    statusMessage: submitted.message ?? null,
    submittedAt: new Date(),
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'abdm.hfr.submitted',
    resourceType: 'abdm_facility_registry',
    resourceId: row.id,
    severity: 'notice',
    metadata: { trackingId, branchId, facilityName: draft.facilityName },
  });
  logger.info({ tenantId, trackingId }, 'HFR facility registration submitted');
  return updated;
}

/**
 * Records a verifier's decision.
 *
 * Approval is the one place M4 reaches back into M1–M3: the issued Facility ID **is** the `hipId`
 * those milestones already use, and leaving an administrator to copy it across by hand is how two
 * sources of truth start disagreeing.
 */
export async function recordVerification(
  tenantId: string,
  input: { branchId?: string | null; facilityId?: string; status: 'under_review' | 'verified' | 'rejected'; message?: string },
): Promise<AbdmFacilityRegistry> {
  const row = await findRegistration(tenantId, input.branchId ?? null);
  if (!row) throw new AppError(404, 'ABDM_FACILITY_NOT_FOUND', 'No facility registration to update');
  assertTransition(row.status, input.status);

  if (input.status === 'verified' && !input.facilityId) {
    throw new AppError(422, 'ABDM_FACILITY_ID_REQUIRED', 'A verified registration must carry the HFR facility id');
  }

  const updated = await patch(tenantId, row.id, {
    status: input.status,
    statusMessage: input.message ?? null,
    ...(input.facilityId ? { facilityId: input.facilityId } : {}),
    ...(input.status === 'verified' ? { verifiedAt: new Date() } : {}),
    lastSyncedAt: new Date(),
  });

  if (input.status === 'verified' && input.facilityId) {
    await adoptFacilityId(tenantId, input.facilityId, row.facilityName);
  }

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: `abdm.hfr.${input.status}`,
    resourceType: 'abdm_facility_registry',
    resourceId: row.id,
    severity: input.status === 'rejected' ? 'warning' : 'notice',
    metadata: { facilityId: input.facilityId, message: input.message },
  });
  return updated;
}

/**
 * Points the M1–M3 facility configuration at the id HFR just issued.
 *
 * Deliberately does **not** overwrite a `hipId` that is already set to something else: an operator
 * who registered by hand on ABDM's portal months ago may be live on that id, and silently swapping
 * it underneath a working integration would break every callback. A conflict is logged for a human.
 */
async function adoptFacilityId(tenantId: string, facilityId: string, facilityName: string): Promise<void> {
  const config = await getFacilityConfig(tenantId);
  if (config?.hipId && config.hipId !== facilityId) {
    logger.warn(
      { tenantId, configured: config.hipId, issued: facilityId },
      'HFR issued a facility id that differs from the configured hipId — left alone for a human to reconcile',
    );
    return;
  }
  if (config?.hipId === facilityId) return;

  await upsertFacilityConfig(tenantId, { hipId: facilityId, facilityName });
  logger.info({ tenantId, facilityId }, 'Adopted the HFR facility id as the ABDM hipId');
}

/** The registration for one facility — the screen's whole state. */
export async function findRegistration(tenantId: string, branchId: string | null): Promise<AbdmFacilityRegistry | null> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(abdmFacilityRegistry)
      .where(
        and(
          eq(abdmFacilityRegistry.tenantId, tenantId),
          branchId ? eq(abdmFacilityRegistry.branchId, branchId) : isNull(abdmFacilityRegistry.branchId),
        ),
      )
      .limit(1),
  );
  return rows[0] ?? null;
}

/** Every facility this organisation has registered — the group's overview. */
export async function listRegistrations(tenantId: string): Promise<AbdmFacilityRegistry[]> {
  return runWithTenant(tenantId, (tx) =>
    tx.select().from(abdmFacilityRegistry).where(eq(abdmFacilityRegistry.tenantId, tenantId)),
  );
}

/**
 * The reference data the registration form needs.
 *
 * Fetched from HFR and cached for hours rather than embedded as constants: LGD codes and facility
 * types are the registry's to define, and a hard-coded copy would drift silently into rejections
 * that look like our bug.
 */
export async function facilityMasterData(kind: 'states' | 'districts' | 'subDistricts' | 'facilityType' | 'ownerSubtype' | 'specialities', query?: Record<string, string>) {
  const path = HFR_PATHS[kind];
  // Districts and sub-districts are scoped by their parent code; the rest are flat lists.
  return registryMasterData(path, query);
}

function assertTransition(from: string, to: string): void {
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError(
      409,
      'ABDM_FACILITY_BAD_TRANSITION',
      `A ${from.replace('_', ' ')} registration cannot become ${to.replace('_', ' ')}`,
    );
  }
}

async function patch(
  tenantId: string,
  id: string,
  set: Partial<typeof abdmFacilityRegistry.$inferInsert>,
): Promise<AbdmFacilityRegistry> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .update(abdmFacilityRegistry)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(abdmFacilityRegistry.id, id))
      .returning(),
  );
  return rows[0]!;
}
