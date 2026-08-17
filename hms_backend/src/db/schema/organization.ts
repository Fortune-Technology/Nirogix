import { pgTable, uuid, varchar, boolean, integer, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

/**
 * The hospital's own identity — registered address, contact details and statutory numbers
 * (ADR-049, closing BACKLOG U-8).
 *
 * Deliberately a tenant-SCOPED table rather than columns on `tenants`: `tenants` is the
 * tenancy boundary itself and is platform-managed (no `tenant_id`, no RLS), while this is
 * data the hospital's own administrator owns and edits. Carrying `tenant_id` means it picks
 * up the RLS policy automatically from `src/db/rls.ts`, so one hospital can never read or
 * write another's registered details.
 *
 * One row per tenant (organization level). A per-branch override is a later, additive change
 * — a nullable `branch_id` plus a resolve-branch-then-organization read — and is recorded in
 * BACKLOG rather than half-built here.
 *
 * Every field is optional. A printed document renders the lines that exist and omits the rest:
 * a wrong or invented address on a tax invoice is worse than no address at all.
 */
export const organizationProfile = pgTable(
  'organization_profile',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    // The registered/legal name when it differs from the trading name held on `tenants.name`.
    legalName: varchar('legal_name', { length: 200 }),
    addressLine1: varchar('address_line1', { length: 200 }),
    addressLine2: varchar('address_line2', { length: 200 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    postalCode: varchar('postal_code', { length: 12 }),
    country: varchar('country', { length: 100 }),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 255 }),
    website: varchar('website', { length: 255 }),
    // Clinical establishment / hospital registration number.
    registrationNumber: varchar('registration_number', { length: 100 }),
    // GSTIN — 15 characters, validated at the edge, stored uppercase.
    gstin: varchar('gstin', { length: 15 }),
    // The name shown to patients where the legal name would be unhelpful.
    displayName: varchar('display_name', { length: 200 }),
    secondaryPhone: varchar('secondary_phone', { length: 32 }),
    supportEmail: varchar('support_email', { length: 255 }),
    // Letterhead (ADR-056). Reuses this row and the tenant's branding rather than starting a
    // second identity store — a document's header IS the organization's identity, and having
    // two places to change a hospital's address is how they end up disagreeing.
    letterheadHeader: varchar('letterhead_header', { length: 300 }),
    letterheadFooter: varchar('letterhead_footer', { length: 500 }),
    signatoryName: varchar('signatory_name', { length: 200 }),
    signatoryDesignation: varchar('signatory_designation', { length: 200 }),
    /**
     * Letterhead image and page geometry (ADR-065).
     *
     * `letterheadImageFileId` references a `file_metadata` id — a pre-designed header strip
     * (the hospital's name, logo and address baked into one image, as most Indian hospitals
     * already have printed). Plain uuid, no FK: files soft-delete and are retained for audit,
     * same as `tenant_branding.logo_file_id`. When set it becomes the document's header.
     *
     * `documentPageSize` is the paper the printed document targets — A4 (default), A5, US
     * Letter or US Legal — so the letterhead has a predictable relationship with the page.
     * NULL means the platform default (A4); never hard-coded to A4 downstream.
     */
    letterheadImageFileId: uuid('letterhead_image_file_id'),
    documentPageSize: varchar('document_page_size', { length: 10 }),
    /**
     * Patient self-registration (ADR-056).
     *
     * `selfRegistrationToken` is an opaque random string, NOT the tenant id: a QR on a
     * poster is public, and printing an internal identifier on it would hand every
     * passer-by a key to guess with. It is regenerable, which is the only way to retire a
     * poster that has been photographed or altered.
     *
     * Off by default. A hospital opts in.
     */
    selfRegistrationEnabled: boolean('self_registration_enabled').notNull().default(false),
    selfRegistrationToken: varchar('self_registration_token', { length: 64 }),
    /**
     * Public appointment requests (same ADR-056 pattern, its own token and toggle): a QR or
     * link opens a booking form; a submission is a REQUEST the front desk converts, never an
     * appointment. Separate from the registration token so retiring one poster keeps the
     * other alive.
     */
    onlineBookingEnabled: boolean('online_booking_enabled').notNull().default(false),
    onlineBookingToken: varchar('online_booking_token', { length: 64 }),
    // Optimistic locking, same shape as tenant_branding.
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One organization-level profile per tenant.
    tenantUnique: unique('organization_profile_tenant_unique').on(t.tenantId),
    // The public registration endpoint resolves a tenant FROM this token, so it must be
    // unique platform-wide and indexed — it is the lookup key on an unauthenticated route.
    regTokenUnique: unique('organization_profile_reg_token_unique').on(t.selfRegistrationToken),
    // Same rule for the public booking token.
    bookingTokenUnique: unique('organization_profile_booking_token_unique').on(t.onlineBookingToken),
  }),
);

/**
 * A patient's self-registration submission (ADR-056).
 *
 * **This is a request, not a patient.** The hospital still decides who becomes a patient
 * record — ADR-052's invariant survives, because nothing here writes to `patients`. A
 * stranger scanning a poster can put a row in this table and nothing else; the front desk
 * verifies the person, checks for a duplicate, and converts it.
 *
 * That distinction is the whole design. A public form that wrote straight into `patients`
 * would let anyone fill a hospital's chart list with junk, and duplicate charts are the
 * expensive kind of mistake — there is no merge tool.
 *
 * Tenant-scoped, so RLS applies: the tenant comes from the token the submitter scanned,
 * resolved server-side, never from the request body.
 */
export const registrationRequests = pgTable(
  'registration_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }),
    gender: varchar('gender', { length: 20 }),
    dateOfBirth: varchar('date_of_birth', { length: 10 }),
    phone: varchar('phone', { length: 32 }).notNull(),
    email: varchar('email', { length: 255 }),
    city: varchar('city', { length: 100 }),
    /** What the person came in for, in their own words. Free text, never clinical. */
    note: varchar('note', { length: 500 }),
    // pending | approved | rejected
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    /** Set when approved — the patient record this became. */
    patientId: uuid('patient_id'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: varchar('rejection_reason', { length: 300 }),
    submittedIp: varchar('submitted_ip', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byTenantStatus: index('registration_requests_tenant_status_idx').on(t.tenantId, t.status) }),
);

export type RegistrationRequest = typeof registrationRequests.$inferSelect;

/**
 * A public appointment-booking submission (ADR-069 — the ADR-056 pattern applied to
 * booking). **A request, not an appointment**: the front desk reviews it, matches or
 * registers the patient (the DUPLICATE_PATIENT flow), and converts it into a real
 * appointment — nothing on the public path writes to `appointments` or `patients`.
 * Preferred date/time are the visitor's wish, stored as text and validated only for
 * shape; the desk picks the actual slot when converting.
 */
export const appointmentRequests = pgTable(
  'appointment_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }),
    phone: varchar('phone', { length: 32 }).notNull(),
    email: varchar('email', { length: 255 }),
    /** The visitor's wish — YYYY-MM-DD / HH:mm, shape-validated only. */
    preferredDate: varchar('preferred_date', { length: 10 }),
    preferredTime: varchar('preferred_time', { length: 5 }),
    departmentId: uuid('department_id'),
    providerId: uuid('provider_id'),
    /** Why they want to come, in their own words. Free text, never clinical. */
    note: varchar('note', { length: 500 }),
    // pending | approved | rejected
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    /** Set when approved — the appointment (and patient) this became. */
    appointmentId: uuid('appointment_id'),
    patientId: uuid('patient_id'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: varchar('rejection_reason', { length: 300 }),
    submittedIp: varchar('submitted_ip', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byTenantStatus: index('appointment_requests_tenant_status_idx').on(t.tenantId, t.status) }),
);

export type AppointmentRequest = typeof appointmentRequests.$inferSelect;

export type OrganizationProfile = typeof organizationProfile.$inferSelect;
export type NewOrganizationProfile = typeof organizationProfile.$inferInsert;
