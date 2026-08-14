import { pgTable, uuid, varchar, integer, bigint, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';

// Financial Transaction Infrastructure (development-plan §24; invariant #8). The ONLY place
// invoice / line-item / payment primitives live — clinical modules (OPD, Pharmacy, Lab, IPD, …)
// consume this and extend it with new line-item types; they never reimplement it. No clinical
// or workflow logic belongs here.
//
// Money is stored as an INTEGER number of paise (₹1 = 100 paise) in `bigint` columns — the
// codebase had no prior money convention, so this establishes it: integers avoid float rounding,
// and bigint (mode: number, exact to 2^53 paise) comfortably covers hospital-scale totals.
// `tax_rate_bps` is basis points (1800 = 18% GST). Every table carries `tenant_id`, so RLS is
// applied automatically (src/db/rls.ts).

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id'), // NULL = org-wide
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    visitId: uuid('visit_id'), // soft link to the originating visit (no FK — avoids a cycle with visits.invoice_id)
    invoiceNumber: varchar('invoice_number', { length: 32 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | partially_paid | paid | void
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    subtotalPaise: bigint('subtotal_paise', { mode: 'number' }).notNull().default(0),
    taxPaise: bigint('tax_paise', { mode: 'number' }).notNull().default(0),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull().default(0),
    amountPaidPaise: bigint('amount_paid_paise', { mode: 'number' }).notNull().default(0),
    notes: varchar('notes', { length: 500 }),
    createdBy: uuid('created_by'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('invoices_tenant_number_unique').on(t.tenantId, t.invoiceNumber)],
);

export const invoiceLineItems = pgTable('invoice_line_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  itemType: varchar('item_type', { length: 30 }).notNull(), // consultation | pharmacy | lab | procedure | other
  description: varchar('description', { length: 300 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPricePaise: bigint('unit_price_paise', { mode: 'number' }).notNull(),
  taxRateBps: integer('tax_rate_bps').notNull().default(0), // basis points (1800 = 18%)
  taxPaise: bigint('tax_paise', { mode: 'number' }).notNull().default(0),
  lineTotalPaise: bigint('line_total_paise', { mode: 'number' }).notNull(),
  sourceModule: varchar('source_module', { length: 30 }), // opd | pharmacy | lab | ...
  sourceRef: uuid('source_ref'), // originating record id (e.g. visit_id)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    method: varchar('method', { length: 20 }).notNull(), // cash | upi | card | netbanking | other
    reference: varchar('reference', { length: 120 }), // txn / UPI reference
    status: varchar('status', { length: 20 }).notNull().default('captured'), // captured | refunded | failed
    idempotencyKey: varchar('idempotency_key', { length: 200 }),
    collectedBy: uuid('collected_by'),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Idempotent collection: NULLs are distinct in Postgres, so keyless payments never collide,
  // while a repeated (tenant, idempotency_key) is rejected → the service returns the original.
  (t) => [unique('payments_tenant_idem_unique').on(t.tenantId, t.idempotencyKey)],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
