import {
  pgTable,
  uuid,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { departments } from './departments';

/**
 * Services catalogue (ADR-067, closing BACKLOG E-3): the priced things a clinic does that
 * are neither a drug nor a lab test — a dressing, an injection, a procedure, a follow-up
 * consultation. Billing consumes it as a line-item source (`itemType: 'service'`); the
 * catalogue itself carries no invoice logic (invariant #8 — money stays in Billing Core).
 *
 * Money is integer paise, tax in basis points — the billing convention. `department_id`
 * is organisational context (set null on department retirement, the service outlives it).
 * Deactivate, never delete: a billed line references the service by snapshot, and history
 * must keep meaning what it meant.
 */
export const services = pgTable(
  'services',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: varchar('description', { length: 500 }),
    // Which system catalogue item this service was adopted from (ADR-072). NULL = pure custom.
    catalogCode: varchar('catalog_code', { length: 64 }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    pricePaise: bigint('price_paise', { mode: 'number' }).notNull(),
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('services_tenant_code_unique').on(t.tenantId, t.code)],
);

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
