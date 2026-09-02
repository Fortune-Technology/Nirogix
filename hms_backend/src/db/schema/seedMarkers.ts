import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * What a seeder has already done (ADR-122).
 *
 * The seeders create records that are missing and never touch records that exist, which
 * covers everything with a stable natural key — a tenant code, a user's email, a branch
 * code, a service code, a patient's phone number. It does not cover the actions that have
 * no record of their own: applying an organisation profile, setting a brand colour, turning
 * on a public form, generating the clinical history, backfilling a newly added column. Those
 * are writes to rows that already exist, and re-applying them on every deployment is exactly
 * the thing that would overwrite what a tester changed by hand.
 *
 * So each such action carries a marker key. The marker is written once, and the action is
 * skipped for ever after. `--reset` empties this table with the rest of the seeded data, so a
 * deliberate rebuild still re-applies everything.
 *
 * PLATFORM-managed like `tenants` and `patient_identity`: no `tenant_id`, therefore no RLS
 * policy. The tenant a marker belongs to is recorded as its *code*, for reading, not as a
 * foreign key — a marker outlives the row it describes on purpose.
 */
export const seedMarkers = pgTable('seed_markers', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** Stable, hand-written key: `staging:QAHOSP:config.profile`. Unique platform-wide. */
  markerKey: varchar('marker_key', { length: 200 }).notNull().unique(),
  /** Which seeder wrote it — development | staging | production. */
  environment: varchar('environment', { length: 20 }).notNull(),
  /** Tenant code where the marker is tenant-specific; NULL for platform-wide actions. */
  tenantCode: varchar('tenant_code', { length: 50 }),
  /** Free-form context printed in the seed report (counts, ids, what was skipped and why). */
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SeedMarker = typeof seedMarkers.$inferSelect;
export type NewSeedMarker = typeof seedMarkers.$inferInsert;
