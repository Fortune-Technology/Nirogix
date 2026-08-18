import { pgTable, pgEnum, uuid, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Platform-level branding (ADR-024). Vendor-owned, PLATFORM-GLOBAL config for two
// independent surfaces — `marketing` (the public site) and `hms` (the Portal's product
// default). Deliberately has NO `tenant_id`: it is not tenant data, so the RLS auto-policy
// (which keys off `tenant_id`) never applies, and the base `db` client reads/writes it
// directly (no `runWithTenant`). This is what lets the unauthenticated marketing site read
// its scope. Per-tenant branding stays in `tenant_branding` (ADR-021) and layers on top of
// the `hms` default. `tokens` is a scalable JSONB set (resources/DESIGN.md §7); logo/favicon
// reference `file_metadata` ids (stored under the PLATFORM tenant). `version` = optimistic lock.
export const platformBrandingScope = pgEnum('platform_branding_scope', ['marketing', 'hms']);

export const platformBranding = pgTable('platform_branding', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  scope: platformBrandingScope('scope').notNull().unique(),
  tokens: jsonb('tokens')
    .$type<Record<string, string>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  logoFileId: uuid('logo_file_id'),
  faviconFileId: uuid('favicon_file_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformBrandingRow = typeof platformBranding.$inferSelect;
export type NewPlatformBrandingRow = typeof platformBranding.$inferInsert;
