import { pgTable, uuid, varchar, integer, bigint, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { labOrders } from './emr';

// Laboratory Management, MVP subset (development-plan §14). Test master + results against the
// lab orders the doctor raises in the EMR (1.4). A result is entered against an order, the
// abnormal flag is derived from the test's reference range, and a lab charge is added to the
// visit's invoice via the Billing-Core extension point. Money is integer paise. Tenant-scoped → RLS.

export const labTests = pgTable('lab_tests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 200 }).notNull(),
  code: varchar('code', { length: 40 }), // LOINC where known
  sampleType: varchar('sample_type', { length: 60 }), // blood | urine | ...
  unit: varchar('unit', { length: 40 }),
  // Reference range kept as strings — a range may be numeric (4000–11000) or qualitative ("Negative").
  refLow: varchar('ref_low', { length: 40 }),
  refHigh: varchar('ref_high', { length: 40 }),
  pricePaise: bigint('price_paise', { mode: 'number' }).notNull().default(0),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const labResults = pgTable(
  'lab_results',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    labOrderId: uuid('lab_order_id')
      .notNull()
      .references(() => labOrders.id, { onDelete: 'cascade' }),
    testId: uuid('test_id'), // matched master (for price + range), nullable
    value: varchar('value', { length: 200 }).notNull(),
    unit: varchar('unit', { length: 40 }),
    refLow: varchar('ref_low', { length: 40 }),
    refHigh: varchar('ref_high', { length: 40 }),
    flag: varchar('flag', { length: 20 }).notNull().default('normal'), // normal | low | high | critical
    notes: varchar('notes', { length: 500 }),
    resultedBy: uuid('resulted_by'),
    resultedAt: timestamp('resulted_at', { withTimezone: true }).notNull().defaultNow(),
    // Verification (ADR-070): a second sign-off before the report is released to the
    // patient portal. Order status moves resulted → verified; re-entering a result
    // clears these (a corrected value needs re-verification).
    verifiedBy: uuid('verified_by'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    // Attached report file (PDF/image) via the file module. Plain uuid, no FK — files
    // soft-delete and are retained, same convention as the branding/letterhead assets.
    fileId: uuid('file_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('lab_results_tenant_order_unique').on(t.tenantId, t.labOrderId)],
);

export type LabTest = typeof labTests.$inferSelect;
export type NewLabTest = typeof labTests.$inferInsert;
export type LabResult = typeof labResults.$inferSelect;
