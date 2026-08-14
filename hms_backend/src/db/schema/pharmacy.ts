import { pgTable, uuid, varchar, integer, bigint, boolean, date, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';

// Pharmacy Management, MVP subset (development-plan §22). Drug master + batch-level stock (FEFO)
// + dispense-against-prescription. Dispensing deducts stock, marks the prescription dispensed,
// and adds a pharmacy line to the visit's invoice via the Billing-Core extension point (it never
// touches invoice/payment tables directly). Money is integer paise. All tenant-scoped → RLS.

export const drugs = pgTable('drugs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 200 }).notNull(),
  form: varchar('form', { length: 40 }), // tablet | capsule | syrup | injection | ...
  strength: varchar('strength', { length: 60 }), // "500 mg"
  unit: varchar('unit', { length: 30 }).notNull().default('unit'), // tablet | ml | vial | ...
  hsnSac: varchar('hsn_sac', { length: 12 }),
  unitPricePaise: bigint('unit_price_paise', { mode: 'number' }).notNull().default(0),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  reorderLevel: integer('reorder_level').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const drugBatches = pgTable('drug_batches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  drugId: uuid('drug_id')
    .notNull()
    .references(() => drugs.id, { onDelete: 'restrict' }),
  batchNo: varchar('batch_no', { length: 60 }),
  expiryDate: date('expiry_date'),
  quantity: integer('quantity').notNull().default(0), // on-hand
  costPricePaise: bigint('cost_price_paise', { mode: 'number' }),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dispenses = pgTable('dispenses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
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
