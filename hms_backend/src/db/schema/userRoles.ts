import { pgTable, uuid, varchar, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { users } from './users';
import { roles } from './roles';

// Role assignments (a user may hold several roles). RLS-scoped.
export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniq: unique('user_roles_unique').on(t.userId, t.roleId) }),
);

// Per-user grants/denies beyond their roles, optionally time-bound (temporary permissions).
// Never physically deleted — revocation sets revoked_at (resources/rules.md → Database Rules).
// effect: 'GRANT' | 'DENY'. valid_until = NULL means permanent. DENY always beats GRANT.
export const userPermissionOverrides = pgTable('user_permission_overrides', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  permission: varchar('permission', { length: 100 }).notNull(),
  effect: varchar('effect', { length: 5 }).notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  reason: varchar('reason', { length: 300 }),
  createdBy: uuid('created_by'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRole = typeof userRoles.$inferSelect;
export type UserPermissionOverride = typeof userPermissionOverrides.$inferSelect;
