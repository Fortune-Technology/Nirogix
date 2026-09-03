import {
  pgTable,
  uuid,
  varchar,
  integer,
  bigint,
  boolean,
  date,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';

// Pharmacy Management, MVP subset (development-plan §22). Drug master + batch-level stock (FEFO)
// + dispense-against-prescription. Dispensing deducts stock, marks the prescription dispensed,
// and adds a pharmacy line to the visit's invoice via the Billing-Core extension point (it never
// touches invoice/payment tables directly). Money is integer paise. All tenant-scoped → RLS.

export const drugs = pgTable('drugs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 200 }).notNull(),
  form: varchar('form', { length: 40 }), // tablet | capsule | syrup | injection | ...
  strength: varchar('strength', { length: 60 }), // "500 mg"
  unit: varchar('unit', { length: 30 }).notNull().default('unit'), // tablet | ml | vial | ...
  // Which system catalogue item this drug was adopted from (ADR-072). NULL = pure custom.
  catalogCode: varchar('catalog_code', { length: 64 }),
  hsnSac: varchar('hsn_sac', { length: 12 }),
  unitPricePaise: bigint('unit_price_paise', { mode: 'number' }).notNull().default(0),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  reorderLevel: integer('reorder_level').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Suppliers (ADR-070 — the inventory slice pharmacy actually needs now): who a batch was
 * received from, so a recall or a rate query has a name and a phone number. Deactivate,
 * never delete — batches keep pointing at their source.
 */
export const suppliers = pgTable('suppliers', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 32 }),
  email: varchar('email', { length: 255 }),
  gstin: varchar('gstin', { length: 15 }),
  addressLine: varchar('address_line', { length: 300 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const drugBatches = pgTable('drug_batches', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  drugId: uuid('drug_id')
    .notNull()
    .references(() => drugs.id, { onDelete: 'restrict' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  batchNo: varchar('batch_no', { length: 60 }),
  expiryDate: date('expiry_date'),
  quantity: integer('quantity').notNull().default(0), // on-hand
  costPricePaise: bigint('cost_price_paise', { mode: 'number' }),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Stock adjustments (ADR-070, closing the BACKLOG "correcting a wrong stock figure"
 * gap): every manual correction is its own ledger row — a delta, a reason, a person —
 * never a silent UPDATE on the batch. The batch quantity changes in the same
 * transaction; this table is why the number changed.
 */
export const stockAdjustments = pgTable('stock_adjustments', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  drugId: uuid('drug_id')
    .notNull()
    .references(() => drugs.id, { onDelete: 'restrict' }),
  batchId: uuid('batch_id').references(() => drugBatches.id, { onDelete: 'restrict' }),
  /** Signed change to on-hand: -3 = write-off three, +10 = found ten uncounted. */
  delta: integer('delta').notNull(),
  reason: varchar('reason', { length: 300 }).notNull(),
  adjustedBy: uuid('adjusted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dispenses = pgTable('dispenses', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  prescriptionId: uuid('prescription_id'), // nullable — OTC dispense (future) has none
  visitId: uuid('visit_id'),
  patientId: uuid('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'restrict' }),
  drugId: uuid('drug_id')
    .notNull()
    .references(() => drugs.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull(),
  unitPricePaise: bigint('unit_price_paise', { mode: 'number' }).notNull(),
  totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
  invoiceId: uuid('invoice_id'),
  dispensedBy: uuid('dispensed_by'),
  dispensedAt: timestamp('dispensed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Drug = typeof drugs.$inferSelect;
export type NewDrug = typeof drugs.$inferInsert;
export type DrugBatch = typeof drugBatches.$inferSelect;
export type Dispense = typeof dispenses.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type StockAdjustment = typeof stockAdjustments.$inferSelect;
