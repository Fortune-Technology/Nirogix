import { and, eq, inArray } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { branchItemAvailability, branches } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';

// Per-hospital availability (ADR-073). An org configures, per branch, which of its master items are
// offered and (optionally) at what price. This is the OVERLAY: absence of a row = inherit the org
// default. Every path filters `tenant_id` explicitly AND runs under RLS (defense in depth).

// Departments are deliberately NOT here: they already carry `branch_id` natively (a department
// belongs to one branch or is org-wide), so they are per-hospital by construction and need no
// overlay. This overlay is for the tenant-only master items that lack a branch dimension.
export type AvailabilityItemType = 'drug' | 'lab_test' | 'service' | 'vaccine';
export const AVAILABILITY_ITEM_TYPES: readonly AvailabilityItemType[] = ['drug', 'lab_test', 'service', 'vaccine'];

export interface AvailabilityOverride {
  branchId: string;
  itemType: AvailabilityItemType;
  itemRef: string;
  isAvailable: boolean;
  priceOverridePaise: number | null;
}

export interface ResolvedOverride {
  isAvailable: boolean;
  priceOverridePaise: number | null;
}

const isItemType = (t: string): t is AvailabilityItemType =>
  (AVAILABILITY_ITEM_TYPES as readonly string[]).includes(t);

/** The per-branch exception rows (only the items that have been overridden for this branch). */
export async function listOverrides(
  tenantId: string,
  branchId: string,
  itemType?: AvailabilityItemType,
): Promise<AvailabilityOverride[]> {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [
      eq(branchItemAvailability.tenantId, tenantId),
      eq(branchItemAvailability.branchId, branchId),
    ];
    if (itemType) conds.push(eq(branchItemAvailability.itemType, itemType));
    const rows = await tx.select().from(branchItemAvailability).where(and(...conds));
    return rows.map((r) => ({
      branchId: r.branchId,
      itemType: r.itemType as AvailabilityItemType,
      itemRef: r.itemRef,
      isAvailable: r.isAvailable,
      priceOverridePaise: r.priceOverridePaise,
    }));
  });
}

/** Upsert one per-branch override. Validates the branch belongs to the caller's organization. */
export async function setAvailability(
  tenantId: string,
  input: {
    branchId: string;
    itemType: AvailabilityItemType;
    itemRef: string;
    isAvailable: boolean;
    priceOverridePaise?: number | null;
  },
  actorUserId?: string,
): Promise<AvailabilityOverride> {
  if (!isItemType(input.itemType)) {
    throw Errors.validation({ itemType: input.itemType }, 'Unknown item type.');
  }
  const row = await runWithTenant(tenantId, async (tx) => {
    const branch = (
      await tx
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.tenantId, tenantId), eq(branches.id, input.branchId)))
        .limit(1)
    )[0];
    if (!branch) throw Errors.validation({ branchId: input.branchId }, 'That branch does not belong to your organization.');

    return (
      await tx
        .insert(branchItemAvailability)
        .values({
          tenantId,
          branchId: input.branchId,
          itemType: input.itemType,
          itemRef: input.itemRef,
          isAvailable: input.isAvailable,
          priceOverridePaise: input.priceOverridePaise ?? null,
        })
        .onConflictDoUpdate({
          target: [
            branchItemAvailability.tenantId,
            branchItemAvailability.branchId,
            branchItemAvailability.itemType,
            branchItemAvailability.itemRef,
          ],
          set: {
            isAvailable: input.isAvailable,
            priceOverridePaise: input.priceOverridePaise ?? null,
            updatedAt: new Date(),
          },
        })
        .returning()
    )[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'catalog.availability.set',
    resourceType: 'branch_item_availability',
    resourceId: row.id,
    metadata: { branchId: input.branchId, itemType: input.itemType, itemRef: input.itemRef, isAvailable: input.isAvailable },
  });

  return {
    branchId: row.branchId,
    itemType: row.itemType as AvailabilityItemType,
    itemRef: row.itemRef,
    isAvailable: row.isAvailable,
    priceOverridePaise: row.priceOverridePaise,
  };
}

/**
 * Resolve the per-branch overrides for a set of item refs. Returns a Map keyed by itemRef; a ref
 * that is absent from the map has NO override and inherits the org default (available). Used by the
 * read models to enforce availability in the backend — not just the UI.
 */
export async function resolveOverrides(
  tenantId: string,
  branchId: string,
  itemType: AvailabilityItemType,
  refs: string[],
): Promise<Map<string, ResolvedOverride>> {
  const map = new Map<string, ResolvedOverride>();
  if (refs.length === 0) return map;
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(branchItemAvailability)
      .where(
        and(
          eq(branchItemAvailability.tenantId, tenantId),
          eq(branchItemAvailability.branchId, branchId),
          eq(branchItemAvailability.itemType, itemType),
          inArray(branchItemAvailability.itemRef, refs),
        ),
      );
    for (const r of rows) {
      map.set(r.itemRef, { isAvailable: r.isAvailable, priceOverridePaise: r.priceOverridePaise });
    }
    return map;
  });
}

/** True when an item with this ref is offered at the branch (default available when no override). */
export function isRefAvailable(overrides: Map<string, ResolvedOverride>, ref: string): boolean {
  return overrides.get(ref)?.isAvailable !== false;
}

/** The per-branch price for a ref, or the passed org price when there is no override. */
export function priceFor(
  overrides: Map<string, ResolvedOverride>,
  ref: string,
  orgPricePaise: number,
): number {
  const o = overrides.get(ref);
  return o && o.priceOverridePaise != null ? o.priceOverridePaise : orgPricePaise;
}
