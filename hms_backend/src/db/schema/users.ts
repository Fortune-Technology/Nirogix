import { pgTable, uuid, varchar, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

// Application users (staff, doctors, admins, ...). Tenant-scoped: carries `tenant_id` and gets
// the RLS policy. Email is unique WITHIN a tenant (the same person can exist at two hospitals).
// `mfaEnabled` is the MFA hook (present from Phase 0, not enforced for every tenant at MVP).
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    // active | suspended | invited
    status: varchar('status', { length: 20 }).notNull().default('active'),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantEmailUnique: unique('users_tenant_email_unique').on(t.tenantId, t.email),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
