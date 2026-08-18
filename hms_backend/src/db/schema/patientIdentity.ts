import { pgTable, uuid, varchar, boolean, integer, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';

/**
 * Patient identity (ADR-052) — the principal a patient signs in as.
 *
 * **Platform-managed, like `tenants`: no `tenant_id`, no RLS.** That is the whole
 * design. A patient registered at three hospitals is ONE person, and a tenant-scoped
 * principal would give them three accounts, three passwords and no view of their own
 * history. The identity therefore sits above the tenancy boundary and reaches into it
 * through `patient_identity_link`.
 *
 * Keyed by a **verified** contact. An unverified mobile or email is a claim, not an
 * identity, and must never unlock a medical record — which is why `verifiedAt` exists
 * and why nothing reads this table without checking it.
 *
 * This is deliberately NOT the `users` table. A patient is a different principal type
 * (`principal_type` on the session/token), cannot hold a staff permission, and is
 * refused on staff routes by type rather than by an empty permission set.
 */
export const patientIdentity = pgTable(
  'patient_identity',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // Exactly one of these is the sign-in key; both may be present. Normalised on write
    // (mobile digits only with country code, email lower-cased) so a lookup is exact.
    mobile: varchar('mobile', { length: 20 }),
    email: varchar('email', { length: 255 }),
    fullName: varchar('full_name', { length: 200 }),
    /** Null until the contact has actually been proven. No verification, no access. */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /** Set when the person completes verification for the first time. */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    status: varchar('status', { length: 20 }).notNull().default('active'), // active | suspended
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    mobileUnique: unique('patient_identity_mobile_unique').on(t.mobile),
    emailUnique: unique('patient_identity_email_unique').on(t.email),
  }),
);

/**
 * The link between a patient identity and one hospital's patient record (ADR-052).
 *
 * **Tenant-scoped, so it inherits the RLS policy** — a hospital can only ever see and
 * create its own links. The link is created by the HOSPITAL during registration, never
 * by the patient: that is what "no public patient signup" means structurally rather
 * than as a missing button.
 *
 * One identity may hold many links (the multi-hospital case). One patient record holds
 * at most one identity, so two people cannot both claim the same chart.
 */
export const patientIdentityLink = pgTable(
  'patient_identity_link',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => patientIdentity.id, { onDelete: 'restrict' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    /** The hospital can withdraw portal access without deleting the clinical record. */
    isActive: boolean('is_active').notNull().default(true),
    /** Who at the hospital granted access, for the audit trail. */
    createdBy: uuid('created_by'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One identity per patient record, within the tenant.
    patientUnique: unique('patient_identity_link_patient_unique').on(t.tenantId, t.patientId),
    byIdentity: index('patient_identity_link_identity_idx').on(t.identityId),
  }),
);

/**
 * A one-time code sent to a contact to prove the person holds it (ADR-052).
 *
 * Platform-managed alongside the identity. The code is **stored hashed** — a leaked
 * table must not hand over live codes — with an expiry, an attempt counter and a
 * consumed marker, so a code is single-use and brute force is bounded rather than
 * merely slowed by rate limiting.
 */
export const patientVerification = pgTable(
  'patient_verification',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => patientIdentity.id, { onDelete: 'cascade' }),
    /** The contact this code proves — mirrored so a code cannot be replayed after a change. */
    channel: varchar('channel', { length: 10 }).notNull(), // sms | email
    destination: varchar('destination', { length: 255 }).notNull(),
    codeHash: varchar('code_hash', { length: 128 }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byIdentity: index('patient_verification_identity_idx').on(t.identityId) }),
);

/**
 * A patient's refresh session (ADR-052, F-8).
 *
 * **Its own table, not a row in `sessions`.** `sessions` is foreign-keyed to `users` and
 * carries a NOT NULL `tenant_id`; a patient identity is neither. Widening that table with
 * a nullable user and a principal discriminator would put two principals in one place and
 * weaken the constraint that currently guarantees every staff session belongs to a real
 * staff user — for the sake of saving a table.
 *
 * Platform-managed like the identity itself: no `tenant_id`, no RLS. A patient session is
 * not scoped to a hospital, because the patient has not chosen one when it is created;
 * the hospital is resolved from an active link on every request instead.
 *
 * The token is stored **hashed**, rotated on every refresh, and revocable — the same
 * three properties the staff session model has, for the same reasons.
 */
export const patientSessions = pgTable(
  'patient_sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => patientIdentity.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    userAgent: varchar('user_agent', { length: 300 }),
    ip: varchar('ip', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byIdentity: index('patient_sessions_identity_idx').on(t.identityId) }),
);

export type PatientIdentity = typeof patientIdentity.$inferSelect;
export type PatientSessionRow = typeof patientSessions.$inferSelect;
export type PatientIdentityLink = typeof patientIdentityLink.$inferSelect;
export type PatientVerification = typeof patientVerification.$inferSelect;
