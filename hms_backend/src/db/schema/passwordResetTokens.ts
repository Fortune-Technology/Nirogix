import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

/**
 * Staff password-reset tokens (forgot-password flow).
 *
 * Tenant-scoped on purpose — the RLS auto-policy applies, exactly like `sessions`.
 * The unauthenticated consume route can still find the row because the emailed
 * token is a signed JWT carrying `tid`: the server verifies the signature FIRST,
 * takes the tenant from the verified claims (never from client-supplied fields),
 * and only then enters `runWithTenant` — the same trick `/auth/refresh` uses.
 *
 * Only a SHA-256 hash of the token is stored (`tokens.ts` → `hashToken`), so a
 * leaked row is not a usable link. Single-use via `consumedAt`; a successful reset
 * also consumes every OTHER outstanding token for the user, so an old email's link
 * dies the moment any reset lands. Rows are never reused — a new request inserts a
 * new row — and expired rows are inert (checked on consume), so no cleanup job is
 * load-bearing.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byUser: index('password_reset_tokens_user_idx').on(t.tenantId, t.userId) }),
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
