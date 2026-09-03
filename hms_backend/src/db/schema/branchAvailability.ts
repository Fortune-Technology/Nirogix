import { pgTable, uuid, varchar, boolean, bigint, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { branches } from './branches';

// Per-hospital (per-branch) availability of master-data items (ADR-073). An overlay/exception on top
// of the ORGANIZATION default: the master row's `is_active` is the org default, and a row here is the
// per-branch exception. NO row for a (branch, item) = inherit the org default. This keeps ONE item
// identity (no duplication — the ADR-072 catalogue links and every snapshot in history stay valid),
// and because it carries `tenant_id` it inherits the standard tenant RLS policy, so one
// organization's per-branch configuration is invisible to another.
//
// Resolution rule: an item is available at a branch iff  master.is_active AND NOT (an overlay row
// exists with is_available = false). A branch can therefore turn an org-enabled item OFF for itself
// without affecting any other branch; disabling never rewrites history (records are snapshot-based).
export const branchItemAvailability = pgTable(
  'branch_item_availability',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    // 'drug' | 'lab_test' | 'service' | 'vaccine'. (Departments are excluded — they carry their own
    // branch_id natively and are per-hospital by construction.)
    itemType: varchar('item_type', { length: 40 }).notNull(),
    // Stable identity within the type: the tenant row's UUID (drug / lab_test / service) or the
    // catalogue code (vaccine).
    itemRef: varchar('item_ref', { length: 64 }).notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    // Optional per-hospital price (integer paise) for priced items; NULL = use the organization price.
    priceOverridePaise: bigint('price_override_paise', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique('branch_item_availability_unique').on(
      t.tenantId,
      t.branchId,
      t.itemType,
      t.itemRef,
    ),
  }),
);

export type BranchItemAvailability = typeof branchItemAvailability.$inferSelect;
