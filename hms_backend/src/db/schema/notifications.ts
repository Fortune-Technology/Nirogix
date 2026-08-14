import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

// Every notification send is logged (per-patient/communication logs, delivery status). Tenant-
// scoped (RLS). channel: email | sms | whatsapp. status: queued | sent | failed.
export const notificationLog = pgTable('notification_log', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  channel: varchar('channel', { length: 20 }).notNull(),
  recipient: varchar('recipient', { length: 255 }).notNull(),
  templateKey: varchar('template_key', { length: 100 }),
  subject: varchar('subject', { length: 300 }),
  status: varchar('status', { length: 20 }).notNull().default('queued'),
  provider: varchar('provider', { length: 50 }),
  providerMessageId: varchar('provider_message_id', { length: 200 }),
  error: varchar('error', { length: 500 }),
  // Idempotency: a repeated send with the same key returns the original log entry, not a dup
  // (rules.md → API Rules: notifications are idempotent).
  idempotencyKey: varchar('idempotency_key', { length: 200 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Per-tenant message templates with {{placeholder}} substitution. One deployed code path reads
// whichever templates a tenant has configured (no per-tenant code branch).
export const notificationTemplates = pgTable(
  'notification_templates',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    key: varchar('key', { length: 100 }).notNull(),
    channel: varchar('channel', { length: 20 }).notNull(),
    locale: varchar('locale', { length: 10 }).notNull().default('en'),
    subject: varchar('subject', { length: 300 }),
    body: text('body').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique('notification_templates_unique').on(t.tenantId, t.key, t.channel, t.locale),
  }),
);

export type NotificationLog = typeof notificationLog.$inferSelect;
export type NotificationTemplate = typeof notificationTemplates.$inferSelect;
