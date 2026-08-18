import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

// File metadata ONLY — the database never stores file content (resources/architecture.md → File
// Storage Architecture). Content lives in object storage; this row holds the storage key, size,
// MIME type, checksum, uploader, and version. Tenant-scoped (RLS). Access + deletion of PHI-bearing
// documents is audit-logged; `version` supports amended clinical documents.
export const fileMetadata = pgTable('file_metadata', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  storageKey: varchar('storage_key', { length: 400 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  contentType: varchar('content_type', { length: 100 }).notNull(),
  size: integer('size').notNull(),
  checksum: varchar('checksum', { length: 64 }).notNull(),
  uploadedBy: uuid('uploaded_by'),
  version: integer('version').notNull().default(1),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type FileMetadata = typeof fileMetadata.$inferSelect;
