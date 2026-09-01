import { and, eq, isNull, or } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { runWithTenant } from '../../db/tenantContext';
import {
  consultationFeeRules,
  providers,
  departments,
  branches,
  type ConsultationFeeRuleRow,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';

/**
 * The consultation fee schedule (ADR-117).
 *
 * The resolver is the interesting part; the CRUD around it is ordinary. Everything a hospital can
 * express is a row here, and everything the product decides is `resolveConsultationFee`.
 */

export type ArrivalType = 'walk_in' | 'appointment' | 'follow_up';

/**
 * How specific a rule is, as a number.
 *
 * Doctor beats department beats arrival type, and the weights (4 / 2 / 1) make the ordering total:
 * every distinct combination of the three scores differently, so there is never a tie to break
 * arbitrarily. This is the ordering a hospital means when it says "Dr Sharma charges ₹800" and also
 * "cardiology is ₹600" — the named consultant wins.
 */
function specificity(rule: { providerId: string | null; departmentId: string | null; arrivalType: string | null }): number {
  return (rule.providerId ? 4 : 0) + (rule.departmentId ? 2 : 0) + (rule.arrivalType ? 1 : 0);
}

export interface FeeContext {
  providerId?: string | null;
  departmentId?: string | null;
  arrivalType?: ArrivalType | null;
  branchId?: string | null;
}

export interface ResolvedFee {
  feePaise: number;
  /** Which rule decided it, so a screen can say *why* rather than only *how much*. */
  ruleId: string | null;
  ruleLabel: string | null;
  /** `rule` | `provider_default` | `none` — where the number came from. */
  source: 'rule' | 'provider_default' | 'none';
}

/**
 * What this consultation costs.
 *
 * Falls back to the doctor's own configured fee and then to zero, which is precisely what check-in
 * did before this table existed — so a hospital with no rules behaves exactly as it did.
 */
export async function resolveConsultationFee(tenantId: string, ctx: FeeContext): Promise<ResolvedFee> {
  return runWithTenant(tenantId, (tx) => resolveConsultationFeeTx(tx, tenantId, ctx));
}

/**
 * The same resolution, inside a caller's transaction.
 *
 * Check-in prices the visit in the transaction that creates it, because the department, the
 * doctor and the arrival type are all still being settled there — defaulted from a referral, an
 * appointment or a case. Resolving afterwards would price against the wrong inputs, and opening a
 * second connection to do it would be worse.
 */
export async function resolveConsultationFeeTx(
  tx: Parameters<Parameters<typeof runWithTenant>[1]>[0],
  tenantId: string,
  ctx: FeeContext,
): Promise<ResolvedFee> {
  {
    // Every active rule that COULD apply: each dimension either matches this visit or is NULL
    // ("any"). Filtering in SQL and ranking in code keeps the ordering rule in one readable place
    // rather than spread across a CASE expression.
    const candidates = await tx
      .select()
      .from(consultationFeeRules)
      .where(
        and(
          eq(consultationFeeRules.tenantId, tenantId),
          eq(consultationFeeRules.isActive, true),
          ctx.branchId
            ? or(isNull(consultationFeeRules.branchId), eq(consultationFeeRules.branchId, ctx.branchId))
            : isNull(consultationFeeRules.branchId),
          ctx.providerId
            ? or(isNull(consultationFeeRules.providerId), eq(consultationFeeRules.providerId, ctx.providerId))
            : isNull(consultationFeeRules.providerId),
          ctx.departmentId
            ? or(isNull(consultationFeeRules.departmentId), eq(consultationFeeRules.departmentId, ctx.departmentId))
            : isNull(consultationFeeRules.departmentId),
          ctx.arrivalType
            ? or(isNull(consultationFeeRules.arrivalType), eq(consultationFeeRules.arrivalType, ctx.arrivalType))
            : isNull(consultationFeeRules.arrivalType),
        ),
      );

    if (candidates.length > 0) {
      // A branch's own rule beats the organization's at equal specificity: it is a deliberate
      // override for that hospital, which is the more specific statement of the two.
      const best = candidates.reduce((a, b) => {
        const sa = specificity(a) * 2 + (a.branchId ? 1 : 0);
        const sb = specificity(b) * 2 + (b.branchId ? 1 : 0);
        return sb > sa ? b : a;
      });
      return { feePaise: best.feePaise, ruleId: best.id, ruleLabel: best.label, source: 'rule' as const };
    }

    if (ctx.providerId) {
      const provider = (
        await tx
          .select({ fee: providers.consultationFeePaise })
          .from(providers)
          .where(and(eq(providers.tenantId, tenantId), eq(providers.id, ctx.providerId)))
          .limit(1)
      )[0];
      if (provider?.fee != null) {
        return { feePaise: provider.fee, ruleId: null, ruleLabel: null, source: 'provider_default' as const };
      }
    }

    return { feePaise: 0, ruleId: null, ruleLabel: null, source: 'none' as const };
  }
}

export interface FeeRuleDto {
  id: string;
  branchId: string | null;
  branchName: string | null;
  providerId: string | null;
  providerName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  arrivalType: string | null;
  feePaise: number;
  isActive: boolean;
  label: string | null;
  /** Surfaced so the screen can sort and explain: a bigger number wins. */
  specificity: number;
  version: number;
  createdAt: string;
}

type RuleRowFlat = {
  r: ConsultationFeeRuleRow;
  branchName: string | null;
  providerName: string | null;
  departmentName: string | null;
};

function toDto(row: RuleRowFlat): FeeRuleDto {
  const r = row.r;
  return {
    id: r.id,
    branchId: r.branchId,
    branchName: row.branchName,
    providerId: r.providerId,
    providerName: row.providerName,
    departmentId: r.departmentId,
    departmentName: row.departmentName,
    arrivalType: r.arrivalType,
    feePaise: r.feePaise,
    isActive: r.isActive,
    label: r.label,
    specificity: specificity(r),
    version: r.version,
    createdAt: r.createdAt.toISOString(),
  };
}

const ruleColumns = {
  r: consultationFeeRules,
  branchName: branches.name,
  providerName: providers.fullName,
  departmentName: departments.name,
};

export async function listFeeRules(tenantId: string, opts: { includeInactive?: boolean } = {}): Promise<FeeRuleDto[]> {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [eq(consultationFeeRules.tenantId, tenantId)];
    if (!opts.includeInactive) conds.push(eq(consultationFeeRules.isActive, true));
    const rows = await tx
      .select(ruleColumns)
      .from(consultationFeeRules)
      .leftJoin(branches, eq(branches.id, consultationFeeRules.branchId))
      .leftJoin(providers, eq(providers.id, consultationFeeRules.providerId))
      .leftJoin(departments, eq(departments.id, consultationFeeRules.departmentId))
      .where(and(...conds));
    // Most specific first: the screen should read in the order the resolver applies them.
    return rows.map(toDto).sort((a, b) => b.specificity - a.specificity || a.feePaise - b.feePaise);
  });
}

export interface CreateFeeRuleInput {
  branchId?: string | null;
  providerId?: string | null;
  departmentId?: string | null;
  arrivalType?: ArrivalType | null;
  feePaise: number;
  label?: string | null;
}

/** Two rules matching on exactly the same things are a contradiction, not a refinement. */
async function assertNoDuplicate(
  tx: Parameters<Parameters<typeof runWithTenant>[1]>[0],
  tenantId: string,
  input: CreateFeeRuleInput,
  excludeId?: string,
): Promise<void> {
  // Each column has its own literal type in Drizzle, so the helper is generic over any uuid column
  // on this table rather than pinned to one of them.
  const nullable = <C extends AnyPgColumn>(col: C, value: string | null | undefined) =>
    value ? eq(col, value) : isNull(col);
  const rows = await tx
    .select({ id: consultationFeeRules.id })
    .from(consultationFeeRules)
    .where(
      and(
        eq(consultationFeeRules.tenantId, tenantId),
        nullable(consultationFeeRules.branchId, input.branchId),
        nullable(consultationFeeRules.providerId, input.providerId),
        nullable(consultationFeeRules.departmentId, input.departmentId),
        input.arrivalType
          ? eq(consultationFeeRules.arrivalType, input.arrivalType)
          : isNull(consultationFeeRules.arrivalType),
      ),
    );
  const clash = rows.find((r) => r.id !== excludeId);
  if (clash) {
    throw Errors.conflict('A rule already covers exactly this combination. Edit that one instead');
  }
}

export async function createFeeRule(
  tenantId: string,
  input: CreateFeeRuleInput,
  actorUserId?: string,
): Promise<FeeRuleDto> {
  const created = await runWithTenant(tenantId, async (tx) => {
    await assertNoDuplicate(tx, tenantId, input);
    const rows = await tx
      .insert(consultationFeeRules)
      .values({
        tenantId,
        branchId: input.branchId ?? null,
        providerId: input.providerId ?? null,
        departmentId: input.departmentId ?? null,
        arrivalType: input.arrivalType ?? null,
        feePaise: input.feePaise,
        label: input.label ?? null,
        createdBy: actorUserId ?? null,
      })
      .returning();
    return rows[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'billing.fee_rule.created',
    resourceType: 'consultation_fee_rule',
    resourceId: created.id,
    metadata: {
      feePaise: created.feePaise,
      providerId: created.providerId,
      departmentId: created.departmentId,
      arrivalType: created.arrivalType,
    },
  });
  const all = await listFeeRules(tenantId, { includeInactive: true });
  return all.find((r) => r.id === created.id)!;
}

export interface UpdateFeeRuleInput {
  version: number;
  feePaise?: number;
  label?: string | null;
  isActive?: boolean;
}

export async function updateFeeRule(
  tenantId: string,
  ruleId: string,
  input: UpdateFeeRuleInput,
  actorUserId?: string,
): Promise<FeeRuleDto> {
  const before = (await listFeeRules(tenantId, { includeInactive: true })).find((r) => r.id === ruleId);
  if (!before) throw Errors.notFound('Fee rule not found');

  await runWithTenant(tenantId, async (tx) => {
    const bumped = await tx
      .update(consultationFeeRules)
      .set({
        feePaise: input.feePaise ?? before.feePaise,
        label: input.label === undefined ? before.label : input.label,
        isActive: input.isActive ?? before.isActive,
        version: before.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(consultationFeeRules.tenantId, tenantId),
          eq(consultationFeeRules.id, ruleId),
          eq(consultationFeeRules.version, input.version),
        ),
      )
      .returning({ id: consultationFeeRules.id });
    if (!bumped[0]) throw Errors.conflict('This rule was changed by someone else. Reload and try again');
  });

  // What a consultation costs is worth an audit trail with both numbers in it: "the fee changed"
  // is not answerable from the row afterwards, because the row now holds only the new value.
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'billing.fee_rule.updated',
    resourceType: 'consultation_fee_rule',
    resourceId: ruleId,
    metadata: {
      feePaiseBefore: before.feePaise,
      feePaiseAfter: input.feePaise ?? before.feePaise,
      isActiveBefore: before.isActive,
      isActiveAfter: input.isActive ?? before.isActive,
    },
  });
  const all = await listFeeRules(tenantId, { includeInactive: true });
  return all.find((r) => r.id === ruleId)!;
}

/**
 * What a check-in is about to charge, before it charges it.
 *
 * The front desk sees the number and where it came from as it picks the doctor, so quoting the
 * patient is reading a screen rather than remembering a policy.
 */
export async function previewFee(tenantId: string, ctx: FeeContext): Promise<ResolvedFee> {
  return resolveConsultationFee(tenantId, ctx);
}

