import { pgTable, uuid, varchar, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

// Per-tenant branding (ADR-021). Tenant-scoped → carries `tenant_id` and gets the RLS policy
// automatically. `branch_id` is nullable: NULL = the organization-wide default; a branch id
// (reserved) would be a per-branch override later. Colours + typography are applied by the
// Portal through the `--hms-*` token seam; the logo/favicon reference `file_metadata` ids
// uploaded via the existing FileStorageService. `version` supports optimistic locking.
export const tenantBranding = pgTable('tenant_branding', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  branchId: uuid('branch_id'), // NULL = org-wide default (branch override reserved)
  brandColor: varchar('brand_color', { length: 32 }),
  secondaryColor: varchar('secondary_color', { length: 32 }),
  logoFileId: uuid('logo_file_id'),
  faviconFileId: uuid('favicon_file_id'),
  typography: jsonb('typography'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TenantBranding = typeof tenantBranding.$inferSelect;
export type NewTenantBranding = typeof tenantBranding.$inferInsert;
