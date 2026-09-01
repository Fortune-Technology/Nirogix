import { and, eq, isNull } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { hospitalWorkflowConfig, branches, type HospitalWorkflowConfigRow } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';

/**
 * Per-hospital workflow configuration (ADR-113).
 *
 * Every consumer asks this module "how does this hospital work?" and gets an answer whether or not
 * anyone has ever opened the configuration screen. That is the point of `PLATFORM_DEFAULTS`: a
 * tenant with no row runs exactly as the product ran before this table existed, so shipping the
 * table changes nothing for anybody until they choose to change it.
 */

export type VitalsMode = 'disabled' | 'consultation_only' | 'during_checkin' | 'after_checkin';
export type PaymentTiming = 'before_consultation' | 'at_checkin' | 'after_consultation';

export const VITALS_MODES: readonly VitalsMode[] = [
  'disabled',
  'consultation_only',
  'during_checkin',
  'after_checkin',
];
export const PAYMENT_TIMINGS: readonly PaymentTiming[] = [
  'before_consultation',
  'at_checkin',
  'after_consultation',
];

/** The vitals a hospital may choose to collect — mirrors `VITAL_PARAMETERS` in `@hms/types`. */
export const VITAL_PARAMETERS = [
  'bloodPressure',
  'pulse',
  'spo2',
  'respRate',
  'tempC',
  'weightKg',
  'heightCm',
  'bloodSugar',
] as const;
export type VitalParameter = (typeof VITAL_PARAMETERS)[number];

export interface ResolvedWorkflowConfig {
  vitalsMode: VitalsMode;
  vitalsRequiredParams: VitalParameter[];
  vitalsOptionalParams: VitalParameter[];
  paymentTiming: PaymentTiming;
}

/**
 * What a hospital gets before it configures anything. Deliberately today's behaviour: vitals in the
 * consultation, fee settled before the consultation starts. A default that changed how an existing
 * hospital works would be a migration disguised as a feature.
 */
export const PLATFORM_DEFAULTS: ResolvedWorkflowConfig = {
  vitalsMode: 'consultation_only',
  vitalsRequiredParams: [],
  // The set a general OPD actually asks for. A hospital narrows or widens it.
  vitalsOptionalParams: ['bloodPressure', 'pulse', 'spo2', 'tempC', 'weightKg', 'heightCm'],
  paymentTiming: 'before_consultation',
};

function toResolved(row: HospitalWorkflowConfigRow): ResolvedWorkflowConfig {
  return {
    vitalsMode: row.vitalsMode as VitalsMode,
    vitalsRequiredParams: row.vitalsRequiredParams as VitalParameter[],
    vitalsOptionalParams: row.vitalsOptionalParams as VitalParameter[],
    paymentTiming: row.paymentTiming as PaymentTiming,
  };
}

/**
 * The effective configuration for a branch: the branch's own row, else the organization's, else the
 * platform defaults. Every enforcement point calls this rather than reading the table, so the
 * branch-then-organization fallback exists in exactly one place.
 */
export async function resolveConfig(tenantId: string, branchId?: string | null): Promise<ResolvedWorkflowConfig> {
  return runWithTenant(tenantId, async (tx) => {
    if (branchId) {
      const own = (
        await tx
          .select()
          .from(hospitalWorkflowConfig)
          .where(and(eq(hospitalWorkflowConfig.tenantId, tenantId), eq(hospitalWorkflowConfig.branchId, branchId)))
          .limit(1)
      )[0];
      if (own) return toResolved(own);
    }
    const org = (
      await tx
        .select()
        .from(hospitalWorkflowConfig)
        .where(and(eq(hospitalWorkflowConfig.tenantId, tenantId), isNull(hospitalWorkflowConfig.branchId)))
        .limit(1)
    )[0];
    return org ? toResolved(org) : PLATFORM_DEFAULTS;
  });
}

export interface WorkflowConfigDto extends ResolvedWorkflowConfig {
  branchId: string | null;
  branchName: string | null;
  version: number;
  isDefault: boolean;
  inheritedFromOrganization: boolean;
}

/**
 * What the configuration screen reads. Unlike `resolveConfig` it says *where the answer came from*,
 * because "this hospital is running on the organization default" is the thing an administrator most
 * needs to know before changing anything.
 */
export async function getConfig(tenantId: string, branchId?: string | null): Promise<WorkflowConfigDto> {
  return runWithTenant(tenantId, async (tx) => {
    let branchName: string | null = null;
    if (branchId) {
      const branch = (
        await tx
          .select({ name: branches.name })
          .from(branches)
          .where(and(eq(branches.tenantId, tenantId), eq(branches.id, branchId)))
          .limit(1)
      )[0];
      if (!branch) throw Errors.notFound('Hospital not found');
      branchName = branch.name;

      const own = (
        await tx
          .select()
          .from(hospitalWorkflowConfig)
          .where(and(eq(hospitalWorkflowConfig.tenantId, tenantId), eq(hospitalWorkflowConfig.branchId, branchId)))
          .limit(1)
      )[0];
      if (own) {
        return { ...toResolved(own), branchId, branchName, version: own.version, isDefault: false, inheritedFromOrganization: false };
      }
    }

    const org = (
      await tx
        .select()
        .from(hospitalWorkflowConfig)
        .where(and(eq(hospitalWorkflowConfig.tenantId, tenantId), isNull(hospitalWorkflowConfig.branchId)))
        .limit(1)
    )[0];

    if (org) {
      return {
        ...toResolved(org),
        branchId: branchId ?? null,
        branchName,
        // A branch inheriting the organization row starts from version 1: saving creates its own
        // row rather than updating the organization's, so it must not send the parent's version.
        version: branchId ? 1 : org.version,
        isDefault: false,
        inheritedFromOrganization: Boolean(branchId),
      };
    }

    return {
      ...PLATFORM_DEFAULTS,
      branchId: branchId ?? null,
      branchName,
      version: 1,
      isDefault: true,
      inheritedFromOrganization: false,
    };
  });
}

export interface UpdateWorkflowConfigInput {
  version: number;
  vitalsMode?: VitalsMode;
  vitalsRequiredParams?: VitalParameter[];
  vitalsOptionalParams?: VitalParameter[];
  paymentTiming?: PaymentTiming;
}

export async function updateConfig(
  tenantId: string,
  branchId: string | null,
  input: UpdateWorkflowConfigInput,
  actorUserId?: string,
): Promise<WorkflowConfigDto> {
  const before = await getConfig(tenantId, branchId);

  const next: ResolvedWorkflowConfig = {
    vitalsMode: input.vitalsMode ?? before.vitalsMode,
    vitalsRequiredParams: input.vitalsRequiredParams ?? before.vitalsRequiredParams,
    vitalsOptionalParams: input.vitalsOptionalParams ?? before.vitalsOptionalParams,
    paymentTiming: input.paymentTiming ?? before.paymentTiming,
  };

  // A parameter cannot be both required and merely offered — one of the two lists is wrong, and
  // guessing which would make the form behave differently from what the administrator read.
  const overlap = next.vitalsRequiredParams.filter((p) => next.vitalsOptionalParams.includes(p));
  if (overlap.length > 0) {
    throw Errors.validation(undefined, `A vital cannot be both required and optional: ${overlap.join(', ')}`);
  }
  // Requiring a reading nobody is asked to take is a form that can never be submitted.
  if (next.vitalsMode === 'disabled' && next.vitalsRequiredParams.length > 0) {
    throw Errors.validation(undefined, 'Vitals are switched off, so no vital can be required');
  }

  await runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx
        .select({ id: hospitalWorkflowConfig.id, version: hospitalWorkflowConfig.version })
        .from(hospitalWorkflowConfig)
        .where(
          and(
            eq(hospitalWorkflowConfig.tenantId, tenantId),
            branchId ? eq(hospitalWorkflowConfig.branchId, branchId) : isNull(hospitalWorkflowConfig.branchId),
          ),
        )
        .limit(1)
    )[0];

    if (existing) {
      if (existing.version !== input.version) {
        throw Errors.conflict('This configuration was changed by someone else. Reload and try again');
      }
      await tx
        .update(hospitalWorkflowConfig)
        .set({
          vitalsMode: next.vitalsMode,
          vitalsRequiredParams: next.vitalsRequiredParams,
          vitalsOptionalParams: next.vitalsOptionalParams,
          paymentTiming: next.paymentTiming,
          version: existing.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(hospitalWorkflowConfig.tenantId, tenantId), eq(hospitalWorkflowConfig.id, existing.id)));
      return;
    }

    // First save for this scope. A branch saving for the first time is *creating an override*, not
    // editing what it inherited, which is why the version it sends is its own and starts at 1.
    if (input.version !== 1) {
      throw Errors.conflict('This configuration was changed by someone else. Reload and try again');
    }
    await tx.insert(hospitalWorkflowConfig).values({
      tenantId,
      branchId,
      vitalsMode: next.vitalsMode,
      vitalsRequiredParams: next.vitalsRequiredParams,
      vitalsOptionalParams: next.vitalsOptionalParams,
      paymentTiming: next.paymentTiming,
    });
  });

  // Worth auditing in full: it changes who may record a clinical reading and when money has to be
  // taken, and the answer to "why did the desk stop seeing the vitals fields" is this record.
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'workflow.config.updated',
    resourceType: 'hospital_workflow_config',
    resourceId: branchId ?? tenantId,
    metadata: {
      scope: branchId ? 'branch' : 'organization',
      branchId,
      before: {
        vitalsMode: before.vitalsMode,
        vitalsRequiredParams: before.vitalsRequiredParams,
        vitalsOptionalParams: before.vitalsOptionalParams,
        paymentTiming: before.paymentTiming,
      },
      after: next,
    },
  });

  return getConfig(tenantId, branchId);
}
