import { and, eq, inArray, isNull } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  hospitalWorkflowConfig,
  branches,
  consultationFeeRules,
  type HospitalWorkflowConfigRow,
} from '../../db/schema';
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

/**
 * The two vocabularies a hospital defines for itself (ADR-121). Both are the hospital's own words,
 * because there is no shared list: a teaching hospital, a corporate clinic and a camp operator mean
 * different things by "consultation type", and an enum would be wrong for all three.
 *
 * A value is at most 40 characters because it is stored on every visit and every case that uses it,
 * printed on screens beside a price, and read aloud at a desk. It is a label, not a description.
 */
export const MAX_TYPE_VALUES = 30;
export const MAX_TYPE_LENGTH = 40;

export interface ResolvedWorkflowConfig {
  vitalsMode: VitalsMode;
  vitalsRequiredParams: VitalParameter[];
  vitalsOptionalParams: VitalParameter[];
  paymentTiming: PaymentTiming;
  /** What kinds of consultation this hospital offers. Empty means the field is not asked. */
  consultationTypes: string[];
  /** What kinds of episode a case can be. Empty means the field is not asked. */
  caseTypes: string[];
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
  // Deliberately empty. A hospital that has not written its own price list has no vocabulary to
  // offer, so check-in asks neither question and the fee schedule has two inert dimensions.
  // Suggesting a default list here would put words in a hospital's mouth and, worse, would start
  // showing two new fields on a check-in form nobody asked to change.
  consultationTypes: [],
  caseTypes: [],
};

function toResolved(row: HospitalWorkflowConfigRow): ResolvedWorkflowConfig {
  return {
    vitalsMode: row.vitalsMode as VitalsMode,
    vitalsRequiredParams: row.vitalsRequiredParams as VitalParameter[],
    vitalsOptionalParams: row.vitalsOptionalParams as VitalParameter[],
    paymentTiming: row.paymentTiming as PaymentTiming,
    consultationTypes: row.consultationTypes ?? [],
    caseTypes: row.caseTypes ?? [],
  };
}

/**
 * Check a value against the vocabulary this hospital has configured (ADR-121).
 *
 * Every writer goes through here — the fee schedule, check-in and case creation — so "is this a
 * type this hospital actually uses?" is answered in one place. An empty vocabulary rejects every
 * value rather than accepting anything: a hospital that has configured no consultation types is a
 * hospital where a consultation type is meaningless, and silently storing one would leave a value
 * on a visit that no screen can explain.
 *
 * Case-insensitive on the way in, and it returns the **configured spelling** — so a rule written as
 * "corporate" and a case opened as "Corporate" are the same thing, which is what the person typing
 * either of them meant.
 */
export function matchConfiguredType(value: string, allowed: string[]): string | null {
  const needle = value.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === needle) ?? null;
}

export async function assertConsultationType(
  tenantId: string,
  branchId: string | null | undefined,
  value: string,
): Promise<string> {
  const config = await resolveConfig(tenantId, branchId);
  const matched = matchConfiguredType(value, config.consultationTypes);
  if (!matched) {
    throw Errors.validation(
      undefined,
      config.consultationTypes.length
        ? `Not a consultation type this hospital uses. Configured: ${config.consultationTypes.join(", ")}`
        : 'This hospital has not set up consultation types. Add them under Hospital setup → Workflow first',
    );
  }
  return matched;
}

export async function assertCaseType(
  tenantId: string,
  branchId: string | null | undefined,
  value: string,
): Promise<string> {
  const config = await resolveConfig(tenantId, branchId);
  const matched = matchConfiguredType(value, config.caseTypes);
  if (!matched) {
    throw Errors.validation(
      undefined,
      config.caseTypes.length
        ? `Not a case type this hospital uses. Configured: ${config.caseTypes.join(", ")}`
        : 'This hospital has not set up case types. Add them under Hospital setup → Workflow first',
    );
  }
  return matched;
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
  consultationTypes?: string[];
  caseTypes?: string[];
}

/**
 * Tidy a submitted vocabulary: trimmed, blanks dropped, duplicates removed case-insensitively.
 *
 * "Corporate" and "corporate " as two entries is a list that reads as a mistake in a dropdown and
 * prices as two different things in the schedule. The first spelling wins, because that is the one
 * the administrator typed deliberately.
 */
function normaliseTypeList(values: string[], label: string): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    if (value.length > MAX_TYPE_LENGTH) {
      throw Errors.validation(undefined, `${label} must be ${MAX_TYPE_LENGTH} characters or fewer: "${value}"`);
    }
    if (!out.some((v) => v.toLowerCase() === value.toLowerCase())) out.push(value);
  }
  if (out.length > MAX_TYPE_VALUES) {
    throw Errors.validation(undefined, `${label}: at most ${MAX_TYPE_VALUES} values`);
  }
  return out;
}

/**
 * Removing a word from the vocabulary must not silently strand a price.
 *
 * A fee rule naming a type that no longer exists can never match again, so the hospital would go on
 * seeing "Teleconsultation ₹300" in its price list while every teleconsultation quietly fell through
 * to a different rule. Refusing, and naming the rules, is the only version of this that a hospital
 * can act on. Retired rules are ignored — they price history and match nothing.
 */
async function assertRemovedTypesUnused(
  tx: Parameters<Parameters<typeof runWithTenant>[1]>[0],
  tenantId: string,
  removed: { consultationTypes: string[]; caseTypes: string[] },
): Promise<void> {
  if (removed.consultationTypes.length === 0 && removed.caseTypes.length === 0) return;
  const clashes: string[] = [];
  if (removed.consultationTypes.length > 0) {
    const rows = await tx
      .select({ t: consultationFeeRules.consultationType })
      .from(consultationFeeRules)
      .where(
        and(
          eq(consultationFeeRules.tenantId, tenantId),
          eq(consultationFeeRules.isActive, true),
          inArray(consultationFeeRules.consultationType, removed.consultationTypes),
        ),
      );
    for (const r of rows) if (r.t && !clashes.includes(r.t)) clashes.push(r.t);
  }
  if (removed.caseTypes.length > 0) {
    const rows = await tx
      .select({ t: consultationFeeRules.caseType })
      .from(consultationFeeRules)
      .where(
        and(
          eq(consultationFeeRules.tenantId, tenantId),
          eq(consultationFeeRules.isActive, true),
          inArray(consultationFeeRules.caseType, removed.caseTypes),
        ),
      );
    for (const r of rows) if (r.t && !clashes.includes(r.t)) clashes.push(r.t);
  }
  if (clashes.length > 0) {
    throw Errors.validation(
      undefined,
      `The fee schedule still prices ${clashes.join(", ")}. Retire those rules before removing the type`,
    );
  }
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
    consultationTypes: input.consultationTypes
      ? normaliseTypeList(input.consultationTypes, 'A consultation type')
      : before.consultationTypes,
    caseTypes: input.caseTypes ? normaliseTypeList(input.caseTypes, 'A case type') : before.caseTypes,
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
    await assertRemovedTypesUnused(tx, tenantId, {
      consultationTypes: before.consultationTypes.filter((t) => !next.consultationTypes.includes(t)),
      caseTypes: before.caseTypes.filter((t) => !next.caseTypes.includes(t)),
    });

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
          consultationTypes: next.consultationTypes,
          caseTypes: next.caseTypes,
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
      consultationTypes: next.consultationTypes,
      caseTypes: next.caseTypes,
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
        consultationTypes: before.consultationTypes,
        caseTypes: before.caseTypes,
      },
      after: next,
    },
  });

  return getConfig(tenantId, branchId);
}
