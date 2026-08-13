import { pgTable, varchar } from 'drizzle-orm/pg-core';

// Global permission catalog (no tenant_id, no RLS) — the same set for every tenant, seeded from
// @hms/permissions. Informational (admin UI listing / validation reference); role_permissions
// store the key as a string validated in code, so the wildcard '*' needs no catalog row.
export const permissions = pgTable('permissions', {
  key: varchar('key', { length: 100 }).primaryKey(),
  module: varchar('module', { length: 50 }).notNull(),
  description: varchar('description', { length: 200 }),
});

export type Permission = typeof permissions.$inferSelect;
