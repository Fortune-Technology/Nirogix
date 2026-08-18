import { pgTable, uuid, varchar, date, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

// The patient — a core clinical entity, strongly typed (no EAV; invariant #5). Tenant-scoped:
// carries `tenant_id` and gets the RLS policy. `uhid` is the hospital's patient id (MRN), unique
// WITHIN a tenant. `branch_id` (nullable) = the branch of registration. Fields reflect an Indian
// healthcare context (ABHA, PIN code). Specialty-specific extra fields ride on configurable form
// templates, not new columns. See resources/projectrequirementdoc.md → Registration.
export const patients = pgTable(
  'patients',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id'), // registration branch (nullable = org-wide)
    uhid: varchar('uhid', { length: 32 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }),
    gender: varchar('gender', { length: 20 }), // male | female | other
    dateOfBirth: date('date_of_birth'),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    bloodGroup: varchar('blood_group', { length: 8 }),
    addressLine: varchar('address_line', { length: 300 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    pincode: varchar('pincode', { length: 10 }),
    abhaNumber: varchar('abha_number', { length: 20 }), // ABHA / Ayushman Bharat Health Account
    emergencyContactName: varchar('emergency_contact_name', { length: 150 }),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
    // active | archived (lifecycle; never hard-deleted while clinically/legally retained)
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantUhidUnique: unique('patients_tenant_uhid_unique').on(t.tenantId, t.uhid),
  }),
);

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
