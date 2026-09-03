import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { referenceCatalog, tenantReferenceItems, drugs, labTests, services } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { REFERENCE_CATALOG, CUSTOM_CAPABLE_CATEGORIES, type CatalogEntry } from './catalog.data';
import {
  resolveOverrides,
  isRefAvailable,
  type AvailabilityItemType,
} from './branchAvailability.service';

export type CatalogCategory = CatalogEntry['category'];

export interface CatalogItem {
  /** `system` = global seeded row (unwritable by a hospital); `custom` = this hospital's own. */
  source: 'system' | 'custom';
  code: string;
  name: string;
  attributes: Record<string, unknown>;
}

const isCustomCapable = (category: string): boolean =>
  (CUSTOM_CAPABLE_CATEGORIES as readonly string[]).includes(category);

export interface AvailabilityItem {
  ref: string;
  name: string;
  detail: string;
  isAvailable: boolean;
  priceOverridePaise: number | null;
}

/**
 * The org's items of a type, each with its availability at one branch — the read model behind the
 * per-hospital availability config screen (ADR-073). Gated by the availability permission, so the
 * admin who configures it needs no pharmacy/lab view permission. This does NOT branch-filter the
 * base list (the config admin must see every item, including the ones turned off).
 */
export async function listItemsForAvailability(
  tenantId: string,
  branchId: string,
  itemType: AvailabilityItemType,
): Promise<AvailabilityItem[]> {
  const dash = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
  let base: { ref: string; name: string; detail: string }[];
  if (itemType === 'drug') {
    base = (
      await runWithTenant(tenantId, (tx) =>
        tx.select().from(drugs).where(eq(drugs.tenantId, tenantId)).orderBy(asc(drugs.name)),
      )
    ).map((d) => ({ ref: d.id, name: d.name, detail: dash([d.form, d.strength]) }));
  } else if (itemType === 'lab_test') {
    base = (
      await runWithTenant(tenantId, (tx) =>
        tx
          .select()
          .from(labTests)
          .where(eq(labTests.tenantId, tenantId))
          .orderBy(asc(labTests.name)),
      )
    ).map((t) => ({ ref: t.id, name: t.name, detail: dash([t.sampleType, t.code]) }));
  } else if (itemType === 'service') {
    base = (
      await runWithTenant(tenantId, (tx) =>
        tx
          .select()
          .from(services)
          .where(eq(services.tenantId, tenantId))
          .orderBy(asc(services.name)),
      )
    ).map((s) => ({ ref: s.id, name: s.name, detail: s.code }));
  } else {
    base = (await listCatalog(tenantId, 'vaccine')).map((v) => ({
      ref: v.code,
      name: v.name,
      detail: typeof v.attributes.schedule === 'string' ? v.attributes.schedule : '',
    }));
  }

  const overrides = await resolveOverrides(
    tenantId,
    branchId,
    itemType,
    base.map((b) => b.ref),
  );
  return base.map((b) => {
    const o = overrides.get(b.ref);
    return {
      ...b,
      isAvailable: o?.isAvailable !== false,
      priceOverridePaise: o?.priceOverridePaise ?? null,
    };
  });
}

/**
 * The merged, searchable read model (ADR-072): global system rows from `reference_catalog` plus —
 * for custom-capable categories (e.g. vaccines) — this tenant's own rows from `tenant_reference_items`.
 * Runs inside `runWithTenant`, so RLS scopes the custom rows to the caller's hospital; the global
 * table has no RLS and is read directly by the same tenant transaction. System rows sort first.
 */
export async function listCatalog(
  tenantId: string,
  category: CatalogCategory,
  search?: string,
  branchId?: string,
): Promise<CatalogItem[]> {
  const q = search?.trim();
  const items = await runWithTenant(tenantId, async (tx) => {
    const sysConds = [eq(referenceCatalog.category, category), eq(referenceCatalog.isActive, true)];
    if (q)
      sysConds.push(
        or(ilike(referenceCatalog.name, `%${q}%`), ilike(referenceCatalog.code, `%${q}%`))!,
      );
    const sys = await tx
      .select()
      .from(referenceCatalog)
      .where(and(...sysConds))
      .orderBy(asc(referenceCatalog.sortOrder), asc(referenceCatalog.name));
    const items: CatalogItem[] = sys.map((r) => ({
      source: 'system',
      code: r.code,
      name: r.name,
      attributes: (r.attributes ?? {}) as Record<string, unknown>,
    }));

    if (isCustomCapable(category)) {
      // Explicit tenant filter AND RLS (defense in depth) — the app must never depend on RLS alone.
      const cusConds = [
        eq(tenantReferenceItems.tenantId, tenantId),
        eq(tenantReferenceItems.category, category),
        eq(tenantReferenceItems.isActive, true),
      ];
      if (q)
        cusConds.push(
          or(
            ilike(tenantReferenceItems.name, `%${q}%`),
            ilike(tenantReferenceItems.code, `%${q}%`),
          )!,
        );
      const cus = await tx
        .select()
        .from(tenantReferenceItems)
        .where(and(...cusConds))
        .orderBy(asc(tenantReferenceItems.name));
      items.push(
        ...cus.map((r) => ({
          source: 'custom' as const,
          code: r.code,
          name: r.name,
          attributes: (r.attributes ?? {}) as Record<string, unknown>,
        })),
      );
    }
    return items;
  });

  // Per-hospital availability (ADR-073): only vaccines are branch-scoped here, keyed by catalogue
  // code. Priced categories are filtered in their own list endpoints; departments are natively
  // branch-scoped. No branch → the org-wide list unchanged.
  if (!branchId || category !== 'vaccine') return items;
  const overrides = await resolveOverrides(
    tenantId,
    branchId,
    'vaccine',
    items.map((i) => i.code),
  );
  return items.filter((i) => isRefAvailable(overrides, i.code));
}

/**
 * Create a hospital-specific custom item for a custom-capable category (ADR-072). Stored in the
 * tenant-scoped `tenant_reference_items` (RLS keeps it private to this hospital). The code is
 * derived from the name and prefixed `CUSTOM_`, so it can never collide with a system code.
 */
export async function createCustomItem(
  tenantId: string,
  category: CatalogCategory,
  input: { name: string; attributes?: Record<string, string | null> },
  actorUserId?: string,
): Promise<CatalogItem> {
  if (!isCustomCapable(category)) {
    throw Errors.validation({ category }, 'Custom items are not supported for this catalogue.');
  }
  const name = input.name.trim();
  const code =
    'CUSTOM_' +
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 56);

  const item = await runWithTenant(tenantId, async (tx) => {
    const existing = await tx
      .select()
      .from(tenantReferenceItems)
      .where(
        and(
          eq(tenantReferenceItems.tenantId, tenantId),
          eq(tenantReferenceItems.category, category),
          eq(tenantReferenceItems.code, code),
        ),
      )
      .limit(1);
    if (existing[0])
      throw Errors.conflict(`A custom item named "${name}" already exists in this catalogue.`);
    return (
      await tx
        .insert(tenantReferenceItems)
        .values({ tenantId, category, code, name, attributes: input.attributes ?? {} })
        .returning()
    )[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'catalog.custom.create',
    resourceType: 'tenant_reference_item',
    resourceId: item.id,
    metadata: { category, code, name },
  });
  return {
    source: 'custom',
    code: item.code,
    name: item.name,
    attributes: (item.attributes ?? {}) as Record<string, unknown>,
  };
}

/**
 * Seeds the global system master-data catalogue (ADR-072), idempotently. `reference_catalog` has
 * NO tenant_id and therefore no RLS (global reference), so this uses the base `db` client — exactly
 * like `seedSpecialtyCatalog` (ADR-008). Called from all three seeders so production has it too.
 *
 * `onConflictDoUpdate` keeps the catalogue in sync with this code data-file on every run (a renamed
 * item or a corrected attribute propagates on the next migrate/seed), which is how we "add or update
 * master data later without changing frontend code". `is_active` is intentionally NOT overwritten,
 * so a future System-Admin deactivation is never resurrected by a re-seed.
 */
export async function seedReferenceCatalog(): Promise<void> {
  for (const item of REFERENCE_CATALOG) {
    await db
      .insert(referenceCatalog)
      .values({
        category: item.category,
        code: item.code,
        name: item.name,
        attributes: item.attributes ?? {},
        sortOrder: item.sortOrder ?? 0,
      })
      .onConflictDoUpdate({
        target: [referenceCatalog.category, referenceCatalog.code],
        set: {
          name: item.name,
          attributes: item.attributes ?? {},
          sortOrder: item.sortOrder ?? 0,
          updatedAt: new Date(),
        },
      });
  }
}
