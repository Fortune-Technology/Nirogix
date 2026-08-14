import { pgTable, uuid, varchar, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

// Immutable, tamper-evident security/compliance trail (resources/rules.md → Audit Rules).
// APPEND-ONLY: a DB trigger blocks UPDATE/DELETE (see db/auditProtection.ts); rows are never
// deleted, even when the referenced record is later deleted or anonymized. Tenant-scoped (RLS).
// No updated_at — rows never change. `severity` supports the enhanced break-glass audit event.
export const auditLog = pgTable('audit_log', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  actorUserId: uuid('actor_user_id'),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }),
  resourceId: varchar('resource_id', { length: 100 }),
  method: varchar('method', { length: 10 }),
  path: varchar('path', { length: 300 }),
  statusCode: integer('status_code'),
  severity: varchar('severity', { length: 20 }).notNull().default('info'),
  metadata: jsonb('metadata'),
  ip: varchar('ip', { length: 64 }),
  userAgent: varchar('user_agent', { length: 300 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLog.$inferSelect;
