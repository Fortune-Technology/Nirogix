// @hms/permissions — the single source of truth for permission strings, shared by hms_backend
// (enforcement) and hms_frontend (menu/route visibility). Keys use a dot-hierarchy
// module.submodule.action. See resources/architecture.md (RBAC) and resources/rules.md.

export const PERMISSIONS = {
  // Platform / administration
  RBAC_MANAGE: 'platform.rbac.manage',
  USERS_VIEW: 'platform.users.view',
  USERS_MANAGE: 'platform.users.manage',
  ROLES_VIEW: 'platform.roles.view',
  ROLES_MANAGE: 'platform.roles.manage',
  BRANCHES_VIEW: 'platform.branches.view',
  BRANCHES_MANAGE: 'platform.branches.manage',
  // Patient
  PATIENT_VIEW: 'patient.record.view',
  PATIENT_CREATE: 'patient.record.create',
  PATIENT_UPDATE: 'patient.record.update',
  // Appointment
  APPOINTMENT_VIEW: 'appointment.booking.view',
  APPOINTMENT_CREATE: 'appointment.booking.create',
  APPOINTMENT_CANCEL: 'appointment.booking.cancel',
  // EMR
  EMR_VIEW: 'emr.encounter.view',
  EMR_WRITE: 'emr.encounter.write',
  // Pharmacy
  PHARMACY_DISPENSE: 'pharmacy.dispense.create',
  PHARMACY_STOCK_VIEW: 'pharmacy.stock.view',
  // Laboratory
  LAB_ORDER_VIEW: 'laboratory.order.view',
  LAB_RESULT_ENTER: 'laboratory.result.enter',
  // Billing
  BILLING_VIEW: 'billing.invoice.view',
  BILLING_CREATE: 'billing.invoice.create',
  BILLING_PAYMENT: 'billing.payment.collect',
  // Audit
  AUDIT_VIEW: 'audit.log.view',
  // Notifications
  NOTIFICATION_SEND: 'notifications.send',
  NOTIFICATION_VIEW: 'notifications.log.view',
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
      P.BRANCHES_VIEW, P.BRANCHES_MANAGE, P.PATIENT_VIEW, P.APPOINTMENT_VIEW, P.BILLING_VIEW,
      P.AUDIT_VIEW, P.NOTIFICATION_SEND, P.NOTIFICATION_VIEW,
    ],
  },
  {
    key: 'branch_admin',
    name: 'Branch Admin',
    description: 'Administers a branch',
    permissions: [P.USERS_VIEW, P.BRANCHES_VIEW, P.PATIENT_VIEW, P.APPOINTMENT_VIEW, P.BILLING_VIEW],
  },
  {
    key: 'doctor',
    name: 'Doctor',
    description: 'Clinical provider',
    permissions: [
      P.PATIENT_VIEW, P.PATIENT_CREATE, P.PATIENT_UPDATE, P.APPOINTMENT_VIEW, P.APPOINTMENT_CREATE,
      P.EMR_VIEW, P.EMR_WRITE, P.LAB_ORDER_VIEW,
    ],
  },
  {
    key: 'receptionist',
    name: 'Receptionist',
    description: 'Front desk',
    permissions: [P.PATIENT_VIEW, P.PATIENT_CREATE, P.APPOINTMENT_VIEW, P.APPOINTMENT_CREATE, P.APPOINTMENT_CANCEL],
  },
  {
    key: 'pharmacist',
    name: 'Pharmacist',
    description: 'Pharmacy dispensing',
    permissions: [P.PHARMACY_DISPENSE, P.PHARMACY_STOCK_VIEW, P.PATIENT_VIEW],
  },
  {
    key: 'lab_technician',
    name: 'Lab Technician',
    description: 'Laboratory',
    permissions: [P.LAB_ORDER_VIEW, P.LAB_RESULT_ENTER, P.PATIENT_VIEW],
  },
  {
    key: 'cashier',
    name: 'Cashier',
    description: 'Billing counter',
    permissions: [P.BILLING_VIEW, P.BILLING_CREATE, P.BILLING_PAYMENT, P.PATIENT_VIEW],
  },
];
