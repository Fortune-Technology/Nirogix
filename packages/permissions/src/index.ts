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
  LAB_MANAGE: 'laboratory.test.manage', // test master + sample collection
  // Billing
  BILLING_VIEW: 'billing.invoice.view',
  BILLING_CREATE: 'billing.invoice.create',
  BILLING_PAYMENT: 'billing.payment.collect',
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
      P.PATIENT_VIEW, P.APPOINTMENT_VIEW,
      P.OPD_VIEW, P.BILLING_VIEW, P.REPORTS_VIEW,
      P.AUDIT_VIEW, P.NOTIFICATION_SEND, P.NOTIFICATION_VIEW,
      P.FILE_VIEW, P.FILE_UPLOAD, P.FILE_DELETE,
      P.PROVIDER_VIEW, P.PROVIDER_MANAGE,
      P.AI_PORTAL_ACCESS,
    ],
  },
  {
    key: 'branch_admin',
    name: 'Branch Admin',
    description: 'Administers a branch',
    permissions: [
      P.USERS_VIEW, P.BRANCHES_VIEW, P.DEPARTMENT_VIEW, P.PATIENT_VIEW, P.APPOINTMENT_VIEW,
      P.OPD_VIEW, P.BILLING_VIEW, P.REPORTS_VIEW,
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
      P.PROVIDER_VIEW, // front desk sees the provider directory to book appointments
      P.DEPARTMENT_VIEW, // and the department it books into
      P.FILE_VIEW, P.FILE_UPLOAD,
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
    permissions: [P.LAB_ORDER_VIEW, P.LAB_RESULT_ENTER, P.LAB_MANAGE, P.PATIENT_VIEW,
      P.AI_PORTAL_ACCESS,
    ],
  },
  {
    key: 'cashier',
    name: 'Cashier',
    description: 'Billing counter',
    permissions: [P.BILLING_VIEW, P.BILLING_CREATE, P.BILLING_PAYMENT, P.OPD_VIEW, P.REPORTS_VIEW, P.PATIENT_VIEW,
      P.AI_PORTAL_ACCESS,
    ],
  },
];
