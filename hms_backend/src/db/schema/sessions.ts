import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { users } from './users';

// Server-side refresh sessions — the record behind each issued refresh token. Enables refresh
// rotation and revocation (logout, "sign out everywhere", device controls). Tenant-scoped.
// `tokenHash` is a SHA-256 of the current refresh token, so a stolen DB row cannot reconstruct
// a usable token, and a presented refresh token is validated by hash match + not-revoked +
// not-expired.
export const sessions = pgTable('sessions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  userAgent: varchar('user_agent', { length: 300 }),
  ip: varchar('ip', { length: 64 }),
  // Support session (ADR-037). Non-null means this session was created by a platform
  // operator impersonating `userId` — never by that user signing in. Kept on the
  // session row so every refresh carries the provenance, not just the first request.
  impersonatedBy: uuid('impersonated_by').references(() => users.id, { onDelete: 'restrict' }),
  impersonationReason: varchar('impersonation_reason', { length: 300 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
