// @hms/permissions — the single source of truth for permission strings, shared by hms_backend
// (enforcement) and hms_frontend (menu/route visibility). Keys use a dot-hierarchy
// module.submodule.action. See resources/architecture.md (RBAC) and resources/rules.md.

export const PERMISSIONS = {
  // Platform / administration
  TENANTS_MANAGE: 'platform.tenants.manage', // Super-Admin only (cross-tenant onboarding); covered by WILDCARD
  RBAC_MANAGE: 'platform.rbac.manage',
  USERS_VIEW: 'platform.users.view',
  USERS_MANAGE: 'platform.users.manage',
  ROLES_VIEW: 'platform.roles.view',
  ROLES_MANAGE: 'platform.roles.manage',
  BRANCHES_VIEW: 'platform.branches.view',
  BRANCHES_MANAGE: 'platform.branches.manage',
  BRANDING_MANAGE: 'platform.branding.manage',
  // The hospital's own identity — registered address, contact and statutory numbers — plus the
  // Hospital Setup Console that reads how far configuration has got (ADR-049). Separate from
  // BRANDING_MANAGE on purpose: a GSTIN is not a colour, and a tenant may want the person who
  // sets its legal details to be someone other than the person who picks its logo.
  ORG_PROFILE_MANAGE: 'platform.organization.manage',
  // Departments — the hospital's clinical organisation (ADR-050). Viewing is wide (the front
  // desk books into a department, the doctor works one); maintaining the list is org_admin.
  DEPARTMENT_VIEW: 'platform.departments.view',
  DEPARTMENT_MANAGE: 'platform.departments.manage',
  // Platform operator surface (ADR-037). Held only by the vendor's own staff in the
  // PLATFORM org — never granted to a hospital's org_admin.
  PLATFORM_SUPPORT_VIEW: 'platform.support.view', // see support sessions + tenant detail for support
  PLATFORM_SUPPORT_IMPERSONATE: 'platform.support.impersonate', // start a support session inside a tenant
  PLATFORM_ANALYTICS_VIEW: 'platform.analytics.view', // cross-tenant aggregate metrics
  PLATFORM_BRANDING_MANAGE: 'platform.branding.platform.manage', // Super-Admin only (marketing + Nirogix platform branding); covered by WILDCARD, not granted to org_admin
  // AI Portal access (ADR-053, widened by ADR-055). Held by EVERY staff role: the portal
  // is for the whole hospital team plus platform operators. The boundary that matters is
  // the principal type — a patient is refused before this key is ever consulted — not a
  // narrow permission. Still a real key, so a tenant can DENY it for an individual.
  AI_PORTAL_ACCESS: 'ai.portal.access',
  // Patient
  PATIENT_VIEW: 'patient.record.view',
  PATIENT_CREATE: 'patient.record.create',
  PATIENT_UPDATE: 'patient.record.update',
  // Appointment
  APPOINTMENT_VIEW: 'appointment.booking.view',
  APPOINTMENT_CREATE: 'appointment.booking.create',
  APPOINTMENT_CANCEL: 'appointment.booking.cancel',
  // OPD & Check-in (visit / queue)
  OPD_VIEW: 'opd.visit.view',
  OPD_CHECKIN: 'opd.visit.checkin',
  OPD_UPDATE: 'opd.visit.update',
  // EMR
  EMR_VIEW: 'emr.encounter.view',
  EMR_WRITE: 'emr.encounter.write',
  // Pharmacy
  PHARMACY_DISPENSE: 'pharmacy.dispense.create',
  PHARMACY_STOCK_VIEW: 'pharmacy.stock.view',
  PHARMACY_MANAGE: 'pharmacy.stock.manage', // drug master + stock receive/adjust
  // Laboratory
  LAB_ORDER_VIEW: 'laboratory.order.view',
  LAB_RESULT_ENTER: 'laboratory.result.enter',
  LAB_RESULT_VERIFY: 'laboratory.result.verify', // sign off a resulted order (its own key so a hospital can split enter/verify)
  LAB_MANAGE: 'laboratory.test.manage', // test master + sample collection
  // Billing
  BILLING_VIEW: 'billing.invoice.view',
  BILLING_CREATE: 'billing.invoice.create',
  BILLING_PAYMENT: 'billing.payment.collect',
  // Services & packages catalogue (E-3) — priced non-drug, non-lab items Billing consumes
  BILLING_SERVICES_VIEW: 'billing.services.view',
  BILLING_SERVICES_MANAGE: 'billing.services.manage',
  // Referrals (in-hospital, visit → department)
  REFERRAL_VIEW: 'opd.referral.view',
  REFERRAL_CREATE: 'opd.referral.create',
  REFERRAL_UPDATE: 'opd.referral.update',
  // Reports
  REPORTS_VIEW: 'reports.view',
  // Audit
  AUDIT_VIEW: 'audit.log.view',
  // Notifications
  NOTIFICATION_SEND: 'notifications.send',
  NOTIFICATION_VIEW: 'notifications.log.view',
  // Files / documents
  FILE_UPLOAD: 'files.document.upload',
  FILE_VIEW: 'files.document.view',
  FILE_DELETE: 'files.document.delete',
  // Providers / specialties
  PROVIDER_VIEW: 'providers.view',
  PROVIDER_MANAGE: 'providers.manage',
  // Immunisations (ADR-072 consumer) — record a patient's vaccinations and add hospital-specific
  // custom vaccines to the picker. Viewing rides with the patient record; recording is clinical /
  // front desk.
  IMMUNIZATION_VIEW: 'clinical.immunization.view',
  IMMUNIZATION_MANAGE: 'clinical.immunization.manage',
  // System master-data catalogue (ADR-072). Reserved for a future System-Admin editor of the
  // GLOBAL reference catalogue; today the catalogue is seeded from code. Super-Admin only
  // (covered by WILDCARD), never granted to a hospital's org_admin. Reading the catalogue as
  // suggestions needs no key — it is non-sensitive reference data, like the specialty catalogue.
  CATALOG_MANAGE: 'platform.catalog.manage',
  // Per-hospital (branch) availability of master-data items (ADR-073) — the org configures which of
  // its drugs / lab tests / services / vaccines / departments each of its hospitals offers. Held by
  // org_admin; the config is the organization's own, isolated from other organizations by RLS.
  CATALOG_AVAILABILITY_MANAGE: 'platform.catalog.availability.manage',
  // ABDM / ABHA — Milestone 1 (ADR-084). Verifying an ABHA is a front-desk action, so it sits
  // with registration; linking a verified ABHA onto an existing chart is separated because it
  // changes an identifier on a clinical record. Configuring the hospital's HFR facility id is
  // org_admin work — it is the hospital's national registration, not a counter setting.
  ABDM_VERIFY: 'abdm.verification.perform',
  ABDM_LINK: 'abdm.verification.link',
  ABDM_FACILITY_VIEW: 'abdm.facility.view',
  ABDM_FACILITY_MANAGE: 'abdm.facility.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// A role or override holding this grants every permission (used by super_admin).
export const WILDCARD = '*';

export const ALL_PERMISSIONS: readonly PermissionKey[] = Object.values(PERMISSIONS);

// Catalog metadata (module per key) for the permissions table + admin UI.
export function permissionModule(key: string): string {
  return key.split('.')[0] ?? 'unknown';
}

export type SystemRoleKey =
  | 'super_admin'
  | 'org_admin'
  | 'branch_admin'
  | 'doctor'
  | 'receptionist'
  | 'pharmacist'
  | 'lab_technician'
  | 'cashier';

export interface SystemRoleDef {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: readonly string[]; // PermissionKey[] or [WILDCARD]
}

const P = PERMISSIONS;

// The reduced MVP role set (resources/phases.md → Phase 0). Seeded per tenant; tenants may
// clone + customize these into their own roles without growing the count unboundedly.
export const SYSTEM_ROLES: readonly SystemRoleDef[] = [
  { key: 'super_admin', name: 'Super Admin', description: 'Full platform access', permissions: [WILDCARD] },
  {
    key: 'org_admin',
    name: 'Organization Admin',
    description: 'Administers the organization',
    permissions: [
      P.RBAC_MANAGE, P.USERS_VIEW, P.USERS_MANAGE, P.ROLES_VIEW, P.ROLES_MANAGE,
      P.BRANCHES_VIEW, P.BRANCHES_MANAGE, P.BRANDING_MANAGE, P.ORG_PROFILE_MANAGE,
      P.DEPARTMENT_VIEW, P.DEPARTMENT_MANAGE,
      P.PATIENT_VIEW, P.APPOINTMENT_VIEW, P.IMMUNIZATION_VIEW,
      // Configure which master-data items each of the org's hospitals offers (ADR-073).
      P.CATALOG_AVAILABILITY_MANAGE,
      P.OPD_VIEW, P.BILLING_VIEW, P.REPORTS_VIEW,
      // The services & packages catalogue is hospital configuration (E-3) — the admin owns it.
      P.BILLING_SERVICES_VIEW, P.BILLING_SERVICES_MANAGE,
      P.REFERRAL_VIEW,
      P.AUDIT_VIEW, P.NOTIFICATION_SEND, P.NOTIFICATION_VIEW,
      P.FILE_VIEW, P.FILE_UPLOAD, P.FILE_DELETE,
      P.PROVIDER_VIEW, P.PROVIDER_MANAGE,
      // The hospital's ABDM/HFR facility registration is organization-level configuration.
      P.ABDM_FACILITY_VIEW, P.ABDM_FACILITY_MANAGE, P.ABDM_VERIFY, P.ABDM_LINK,
      P.AI_PORTAL_ACCESS,
    ],
  },
  {
    key: 'branch_admin',
    name: 'Branch Admin',
    description: 'Administers a branch',
    permissions: [
      P.USERS_VIEW, P.BRANCHES_VIEW, P.DEPARTMENT_VIEW, P.PATIENT_VIEW, P.APPOINTMENT_VIEW,
      P.OPD_VIEW, P.BILLING_VIEW, P.REPORTS_VIEW, P.IMMUNIZATION_VIEW,
      P.AI_PORTAL_ACCESS,
    ],
  },
  {
    key: 'doctor',
    name: 'Doctor',
    description: 'Clinical provider',
    permissions: [
      P.PATIENT_VIEW, P.PATIENT_CREATE, P.PATIENT_UPDATE, P.APPOINTMENT_VIEW, P.APPOINTMENT_CREATE,
      P.OPD_VIEW, P.OPD_UPDATE, // doctor works the queue: advances a visit through consultation
      P.EMR_VIEW, P.EMR_WRITE, P.LAB_ORDER_VIEW, P.FILE_VIEW, P.FILE_UPLOAD, P.PROVIDER_VIEW,
      P.DEPARTMENT_VIEW,
      // Record and review a patient's immunisations from the chart.
      P.IMMUNIZATION_VIEW, P.IMMUNIZATION_MANAGE,
      // Refer the patient onward from the consultation, and see where a referral stands.
      P.REFERRAL_VIEW, P.REFERRAL_CREATE, P.REFERRAL_UPDATE,
      // Read the drug master while prescribing — the formulary picker needs the list (and its
      // stock levels) even though dispensing stays with the pharmacist.
      P.PHARMACY_STOCK_VIEW,
      P.AI_PORTAL_ACCESS,
    ],
  },
  {
    key: 'receptionist',
    name: 'Receptionist',
    description: 'Front desk',
    permissions: [
      P.PATIENT_VIEW, P.PATIENT_CREATE, P.APPOINTMENT_VIEW, P.APPOINTMENT_CREATE, P.APPOINTMENT_CANCEL,
      P.OPD_VIEW, P.OPD_CHECKIN, // front desk checks patients in and works the queue board
      P.IMMUNIZATION_VIEW, P.IMMUNIZATION_MANAGE, // front desk records routine vaccinations
      P.REFERRAL_VIEW, // routes a referred patient to the right department at the desk
      P.PROVIDER_VIEW, // front desk sees the provider directory to book appointments
      P.DEPARTMENT_VIEW, // and the department it books into
      P.FILE_VIEW, P.FILE_UPLOAD,
      // The front desk is where an ABHA is verified and attached to a chart (ADR-084).
      P.ABDM_VERIFY, P.ABDM_LINK,
      P.AI_PORTAL_ACCESS,
    ],
  },
  {
    key: 'pharmacist',
    name: 'Pharmacist',
    description: 'Pharmacy dispensing',
    permissions: [P.PHARMACY_DISPENSE, P.PHARMACY_STOCK_VIEW, P.PHARMACY_MANAGE, P.PATIENT_VIEW,
      P.AI_PORTAL_ACCESS,
    ],
  },
  {
    key: 'lab_technician',
    name: 'Lab Technician',
    description: 'Laboratory',
    permissions: [P.LAB_ORDER_VIEW, P.LAB_RESULT_ENTER, P.LAB_RESULT_VERIFY, P.LAB_MANAGE, P.PATIENT_VIEW,
      P.AI_PORTAL_ACCESS,
    ],
  },
  {
    key: 'cashier',
    name: 'Cashier',
    description: 'Billing counter',
    permissions: [P.BILLING_VIEW, P.BILLING_CREATE, P.BILLING_PAYMENT, P.BILLING_SERVICES_VIEW,
      P.OPD_VIEW, P.REPORTS_VIEW, P.PATIENT_VIEW,
      P.AI_PORTAL_ACCESS,
    ],
  },
];

const SYSTEM_ROLE_NAMES: Record<string, string> = Object.fromEntries(
  SYSTEM_ROLES.map((r) => [r.key, r.name]),
);

/**
 * A human-readable label for a role key. Seeded roles use their declared name
 * (`org_admin` → "Organization Admin"); a tenant's cloned/custom role, whose key is
 * not in the system set, falls back to a humanized form of the key
 * (`night_shift_lead` → "Night Shift Lead"). Shared FE/BE so a role reads the same in
 * the header, the RBAC screens and any server-rendered surface.
 */
export function roleDisplayName(key: string): string {
  const seeded = SYSTEM_ROLE_NAMES[key];
  if (seeded) return seeded;
  return key
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Join a user's role keys into one display string, e.g. "Doctor · Cashier". Empty when none. */
export function formatRoleNames(keys: readonly string[] | null | undefined): string {
  if (!keys || keys.length === 0) return '';
  return keys.map(roleDisplayName).join(' · ');
}
