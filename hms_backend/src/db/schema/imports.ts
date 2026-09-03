import { pgTable, uuid, varchar, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

/**
 * What a bulk import did (ADR-138) — who ran it, over what file, and what it changed.
 *
 * An import is the one action in the product that creates hundreds of records from a single
 * click, which makes "what happened?" a question somebody will ask weeks later, usually because
 * something is wrong. The audit log records the *act*; this records the **result**, per run, in
 * one row a person can read: created, updated, skipped, failed.
 *
 * Append-only (invariant #6). The file itself is not stored — it is the hospital's own data, it
 * may hold patient identifiers, and keeping a copy of every upload forever is a liability, not a
 * feature. The filename and the counts are what a person needs to reconcile a run.
 */
export const importRuns = pgTable(
  'import_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    /** Which registry module — `drugs`, `lab-tests`, `patients`. */
    module: varchar('module', { length: 40 }).notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    /** skip | update | create_only — what the operator chose to do about matches. */
    duplicateStrategy: varchar('duplicate_strategy', { length: 20 }).notNull(),
    totalRows: integer('total_rows').notNull().default(0),
    created: integer('created').notNull().default(0),
    updated: integer('updated').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    /**
     * Why the failed rows failed — row number and message, capped. Enough to fix the spreadsheet
     * without storing the spreadsheet: the values themselves are not copied in here.
     */
    errors: jsonb('errors'),
    importedBy: uuid('imported_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('import_runs_tenant_idx').on(t.tenantId, t.createdAt)],
);

export type ImportRun = typeof importRuns.$inferSelect;
