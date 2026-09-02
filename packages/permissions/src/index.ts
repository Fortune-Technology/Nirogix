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
  // Choosing how this hospital runs its workflow — where vitals are taken, when the fee is
  // settled (ADR-113). Configuration, so it sits with the other hospital-configuration keys.
  WORKFLOW_CONFIG_VIEW: 'platform.workflow.view',
  WORKFLOW_CONFIG_MANAGE: 'platform.workflow.manage',
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
  // Treatment cases (ADR-116). Two keys, not three: opening a case is part of checking a patient
  // in, so the desk that checks in must be able to open one. Closing is guarded by a business
  // rule and an audit record rather than a third permission nobody would know to grant.
  CASE_VIEW: 'opd.case.view',
  CASE_MANAGE: 'opd.case.manage',
  // EMR
  EMR_VIEW: 'emr.encounter.view',
  EMR_WRITE: 'emr.encounter.write',
  // Vitals are their own pair (ADR-113): they are recorded before a consultation exists, by
  // staff who must never be able to read or write a clinical note. Folding them into
  // `emr.encounter.*` would mean a hospital could not let its nurses take a blood pressure
  // without also handing them the chart.
  VITALS_VIEW: 'emr.vitals.view',
  VITALS_RECORD: 'emr.vitals.record',
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
  // The consultation fee schedule (ADR-117). Setting what a hospital charges is configuration and
  // sits with the administrator; charging something ELSE is a financial decision at the desk, and
  // is its own key so a hospital can hand it to a supervisor without handing over the price list.
  BILLING_FEE_RULES_VIEW: 'billing.fee_rules.view',
  BILLING_FEE_RULES_MANAGE: 'billing.fee_rules.manage',
  BILLING_FEE_OVERRIDE: 'billing.fee.override',
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
  /**
   * Correcting the patient's profile AT ABDM — a write to a national record, not to ours.
   * Deliberately NOT in the receptionist's default set: verifying an identity and amending the
   * identity register are different acts, and the second one leaves our system entirely. A
   * hospital that wants its desk to do it grants the key.
   */
  ABDM_PROFILE_UPDATE: 'abdm.profile.update',
  /**
   * Milestone 3 — reading a patient's history from OTHER hospitals (ADR-092).
   *
   * Two keys, not one, because asking and reading are different acts. Requesting puts this
   * doctor's name and registration number in front of the patient and creates an obligation to
   * destroy what comes back; viewing is reading another hospital's clinical record. A clerk who
   * may see a chart is not thereby permitted to pull a national history onto it.
   */
  /**
   * Milestone 4 — listing the hospital in the national Health Facility Registry (ADR-096).
   *
   * Separate from `abdm.facility.manage`, which edits the LOCAL configuration. This one submits the
   * organisation's own details to a government registry under its name and creates a public listing,
   * which is an organisational act rather than a settings change.
   */
  ABDM_REGISTRY_VIEW: 'abdm.registry.view',
  ABDM_REGISTRY_MANAGE: 'abdm.registry.manage',
  ABDM_HISTORY_REQUEST: 'abdm.history.request',
  ABDM_HISTORY_VIEW: 'abdm.history.view',
  /**
   * See WHETHER a consent exists and what state it is in — never the records, never which
   * hospitals hold them, never who asked (ADR-120). The front desk needs to answer "is anything
   * outstanding for this patient?"; it does not need another hospital's clinical data to do it,
   * and `abdm.history.view` would hand over exactly that.
   */
  ABDM_CONSENT_STATUS_VIEW: 'abdm.consent.status.view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// A role or override holding this grants every permission (used by super_admin).
export const WILDCARD = '*';

export const ALL_PERMISSIONS: readonly PermissionKey[] = Object.values(PERMISSIONS);

/**
 * What each permission is called when a person has to read it (ADR-126).
 *
 * A refused user is told which permission they are missing, and `patient.record.create` is not
 * an answer they can act on — "Register patients" is. Both are shown: the sentence for the
 * person, the key for whoever they forward it to.
 */
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  [PERMISSIONS.TENANTS_MANAGE]: 'Onboard and manage hospitals',
  [PERMISSIONS.RBAC_MANAGE]: 'Grant and deny individual permissions',
  [PERMISSIONS.USERS_VIEW]: 'View staff accounts',
  [PERMISSIONS.USERS_MANAGE]: 'Create and manage staff accounts',
  [PERMISSIONS.ROLES_VIEW]: 'View roles',
  [PERMISSIONS.ROLES_MANAGE]: 'Assign and manage roles',
  [PERMISSIONS.BRANCHES_VIEW]: 'View branches',
  [PERMISSIONS.BRANCHES_MANAGE]: 'Create and edit branches',
  [PERMISSIONS.BRANDING_MANAGE]: "Change the hospital's branding",
  [PERMISSIONS.ORG_PROFILE_MANAGE]: "Manage the hospital's information and setup",
  [PERMISSIONS.WORKFLOW_CONFIG_VIEW]: 'View the workflow configuration',
  [PERMISSIONS.WORKFLOW_CONFIG_MANAGE]: 'Change the workflow configuration',
  [PERMISSIONS.DEPARTMENT_VIEW]: 'View departments',
  [PERMISSIONS.DEPARTMENT_MANAGE]: 'Create and edit departments',
  [PERMISSIONS.PLATFORM_SUPPORT_VIEW]: 'View platform support sessions',
  [PERMISSIONS.PLATFORM_SUPPORT_IMPERSONATE]: 'Start a support session inside a hospital',
  [PERMISSIONS.PLATFORM_ANALYTICS_VIEW]: 'View cross-hospital analytics',
  [PERMISSIONS.PLATFORM_BRANDING_MANAGE]: "Change Nirogix's own branding",
  [PERMISSIONS.AI_PORTAL_ACCESS]: 'Use the AI Portal',
  [PERMISSIONS.PATIENT_VIEW]: 'View patient records',
  [PERMISSIONS.PATIENT_CREATE]: 'Register patients',
  [PERMISSIONS.PATIENT_UPDATE]: 'Edit patient records',
  [PERMISSIONS.APPOINTMENT_VIEW]: 'View appointments',
  [PERMISSIONS.APPOINTMENT_CREATE]: 'Book appointments',
  [PERMISSIONS.APPOINTMENT_CANCEL]: 'Cancel appointments',
  [PERMISSIONS.OPD_VIEW]: 'View the OPD queue',
  [PERMISSIONS.OPD_CHECKIN]: 'Check patients in',
  [PERMISSIONS.OPD_UPDATE]: 'Move a visit through the queue',
  [PERMISSIONS.CASE_VIEW]: 'View treatment cases',
  [PERMISSIONS.CASE_MANAGE]: 'Open and close treatment cases',
  [PERMISSIONS.EMR_VIEW]: 'Read the clinical record',
  [PERMISSIONS.EMR_WRITE]: 'Write the clinical record',
  [PERMISSIONS.VITALS_VIEW]: 'View vitals',
  [PERMISSIONS.VITALS_RECORD]: 'Record vitals',
  [PERMISSIONS.PHARMACY_DISPENSE]: 'Dispense medicines',
  [PERMISSIONS.PHARMACY_STOCK_VIEW]: 'View pharmacy stock',
  [PERMISSIONS.PHARMACY_MANAGE]: 'Manage the drug master and stock',
  [PERMISSIONS.LAB_ORDER_VIEW]: 'View laboratory orders',
  [PERMISSIONS.LAB_RESULT_ENTER]: 'Enter laboratory results',
  [PERMISSIONS.LAB_RESULT_VERIFY]: 'Verify laboratory results',
  [PERMISSIONS.LAB_MANAGE]: 'Manage the test master and collect samples',
  [PERMISSIONS.BILLING_VIEW]: 'View invoices',
  [PERMISSIONS.BILLING_CREATE]: 'Raise invoices',
  [PERMISSIONS.BILLING_PAYMENT]: 'Collect payments',
  [PERMISSIONS.BILLING_SERVICES_VIEW]: 'View the services catalogue',
  [PERMISSIONS.BILLING_SERVICES_MANAGE]: 'Manage the services catalogue',
  [PERMISSIONS.BILLING_FEE_RULES_VIEW]: 'View the consultation fee schedule',
  [PERMISSIONS.BILLING_FEE_RULES_MANAGE]: 'Set the consultation fee schedule',
  [PERMISSIONS.BILLING_FEE_OVERRIDE]: 'Charge a fee other than the price list',
  [PERMISSIONS.REFERRAL_VIEW]: 'View referrals',
  [PERMISSIONS.REFERRAL_CREATE]: 'Refer a patient to another department',
  [PERMISSIONS.REFERRAL_UPDATE]: 'Update a referral',
  [PERMISSIONS.REPORTS_VIEW]: 'View reports',
  [PERMISSIONS.AUDIT_VIEW]: 'View the audit log',
  [PERMISSIONS.NOTIFICATION_SEND]: 'Send notifications',
  [PERMISSIONS.NOTIFICATION_VIEW]: 'View the notification log',
  [PERMISSIONS.FILE_UPLOAD]: 'Upload documents',
  [PERMISSIONS.FILE_VIEW]: 'View documents',
  [PERMISSIONS.FILE_DELETE]: 'Delete documents',
  [PERMISSIONS.PROVIDER_VIEW]: 'View doctors and specialties',
  [PERMISSIONS.PROVIDER_MANAGE]: 'Manage doctors and specialties',
  [PERMISSIONS.IMMUNIZATION_VIEW]: 'View immunisation records',
  [PERMISSIONS.IMMUNIZATION_MANAGE]: 'Record immunisations',
  [PERMISSIONS.CATALOG_MANAGE]: 'Edit the global master-data catalogue',
  [PERMISSIONS.CATALOG_AVAILABILITY_MANAGE]: 'Choose what each branch offers',
  [PERMISSIONS.ABDM_VERIFY]: 'Verify an ABHA',
  [PERMISSIONS.ABDM_LINK]: 'Link an ABHA to a patient record',
  [PERMISSIONS.ABDM_FACILITY_VIEW]: 'View the ABDM facility configuration',
  [PERMISSIONS.ABDM_FACILITY_MANAGE]: 'Configure the ABDM facility',
  [PERMISSIONS.ABDM_PROFILE_UPDATE]: "Correct a patient's profile at ABDM",
  [PERMISSIONS.ABDM_REGISTRY_VIEW]: 'View the national registry listing',
  [PERMISSIONS.ABDM_REGISTRY_MANAGE]: 'Manage the national registry listing',
  [PERMISSIONS.ABDM_HISTORY_REQUEST]: "Request a patient's history from other hospitals",
  [PERMISSIONS.ABDM_HISTORY_VIEW]: 'Read a history pulled from other hospitals',
  [PERMISSIONS.ABDM_CONSENT_STATUS_VIEW]: 'See whether a consent is outstanding',
};

/**
 * A readable name for any permission key, including one this build has never heard of —
 * a tenant's custom role can carry a key added by a later release, and a refusal screen that
 * printed nothing would be worse than one that printed a decent guess.
 */
export function permissionLabel(key: string): string {
  const known = (PERMISSION_LABELS as Record<string, string>)[key];
  if (known) return known;
  const parts = key.split('.');
  const action = parts.pop() ?? key;
  const subject = parts.slice(1).join(' ').replace(/_/g, ' ');
  const sentence = `${action.replace(/_/g, ' ')} ${subject}`.trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Permissions that belong to the **vendor's operators**, not to a hospital (ADR-037).
 * They reach across tenants or edit something every hospital shares, so no role inside a
 * hospital holds them — including its administrator.
 */
export const OPERATOR_ONLY_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.TENANTS_MANAGE,
  PERMISSIONS.PLATFORM_SUPPORT_VIEW,
  PERMISSIONS.PLATFORM_SUPPORT_IMPERSONATE,
  PERMISSIONS.PLATFORM_ANALYTICS_VIEW,
  PERMISSIONS.PLATFORM_BRANDING_MANAGE,
  PERMISSIONS.CATALOG_MANAGE,
];

/**
 * Permissions withheld from an administrator for a reason **outside** this system.
 *
 * Requesting a patient's records from another hospital puts a named clinician's medical
 * registration number in front of that patient, and it is what they read when deciding whether
 * to consent (ADR-092, ADR-120). An administrator has no registration number to put there, so
 * this is not a preference a hospital can configure away.
 */
export const CLINICIAN_ONLY_PERMISSIONS: readonly PermissionKey[] = [PERMISSIONS.ABDM_HISTORY_REQUEST];

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
    /**
     * **The hospital's administrator, and its most capable account** (ADR-125).
     *
     * The rule is one sentence: *anything that happens inside this hospital, this role may do*.
     * It was previously configuration-plus-read-only — it could define departments, doctors and
     * a price list but could not correct a patient's phone number, book an appointment or check
     * anybody in, which left the person accountable for the hospital unable to fix what they
     * were accountable for.
     *
     * What it deliberately still cannot do, and why each one is a boundary rather than an
     * oversight:
     *
     * - **Anything outside this hospital.** `platform.tenants.manage`, the support surface,
     *   cross-tenant analytics, the vendor's own platform branding, and the GLOBAL master-data
     *   catalogue every hospital shares. Those belong to the vendor's operators (ADR-037); RLS
     *   and the wildcard role are what separate them, not politeness.
     * - **`abdm.history.request`.** Asking another hospital for a patient's records puts a named
     *   clinician's medical registration number in front of that patient, and it is what they
     *   read when deciding. An administrator has no registration number to put there. This one
     *   is an external requirement, not an internal preference, so "full administrator" does not
     *   reach it (ADR-092, ADR-120).
     *
     * A hospital that wants the narrower, older split does not need a code change: DENY the keys
     * it disagrees with on that account (invariant #3 — explicit DENY always beats a role grant),
     * or clone this role and remove them. That is the same lever it always had, pointing the
     * other way.
     */
    name: 'Organization Admin',
    description: 'Administers the hospital, and may perform any action within it',
    /**
     * **Derived, not listed** (ADR-126). Every permission except the two named exclusion sets,
     * so a key added by a later release reaches the administrator automatically instead of
     * silently not reaching them — which is exactly how this role came to be missing
     * `patient.record.create` and `opd.visit.checkin`.
     *
     * It is still not a wildcard. `super_admin` holds `*`; this role holds a list, so the
     * operator keys stay out of it by construction.
     *
     * **A permission is not access.** Every route runs `requireModule()` before
     * `requirePermission()`, so holding `pharmacy.stock.manage` grants nothing at all in a
     * hospital that has not been entitled to the Pharmacy module — the administrator's reach is
     * the *intersection* of this list with what the hospital owns.
     */
    permissions: ALL_PERMISSIONS.filter(
      (key) => !OPERATOR_ONLY_PERMISSIONS.includes(key) && !CLINICIAN_ONLY_PERMISSIONS.includes(key),
    ),
  },
  {
    key: 'branch_admin',
    name: 'Branch Admin',
    description: 'Administers a branch',
    permissions: [
      P.USERS_VIEW, P.BRANCHES_VIEW, P.DEPARTMENT_VIEW, P.PATIENT_VIEW, P.APPOINTMENT_VIEW,
      P.OPD_VIEW, P.BILLING_VIEW, P.REPORTS_VIEW, P.IMMUNIZATION_VIEW, P.CASE_VIEW,
      // Reading how the hospital runs is not an administrative act (ADR-129): the patient chart's
      // cases block asks for the case-type vocabulary, and a role that may see cases must be able
      // to read the words they are described in. Changing it stays `platform.workflow.manage`.
      P.WORKFLOW_CONFIG_VIEW,
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
      // A course of treatment is the clinician's to open, describe and declare finished.
      P.CASE_VIEW, P.CASE_MANAGE,
      P.EMR_VIEW, P.EMR_WRITE, P.LAB_ORDER_VIEW, P.FILE_VIEW, P.FILE_UPLOAD, P.PROVIDER_VIEW,
      // Where vitals are taken, when the fee is due, and this hospital's own consultation and case
      // vocabularies (ADR-113) — the consultation screen is built from them, so it must read them
      // (ADR-129). Read only; the schedule itself is the administrator's.
      P.WORKFLOW_CONFIG_VIEW,
      // Vitals recorded earlier in the workflow are part of the picture the doctor consults on,
      // and a clinician must always be able to re-take a reading they doubt.
      P.VITALS_VIEW, P.VITALS_RECORD,
      P.DEPARTMENT_VIEW,
      // Record and review a patient's immunisations from the chart.
      P.IMMUNIZATION_VIEW, P.IMMUNIZATION_MANAGE,
      // Refer the patient onward from the consultation, and see where a referral stands.
      P.REFERRAL_VIEW, P.REFERRAL_CREATE, P.REFERRAL_UPDATE,
      // Read the drug master while prescribing — the formulary picker needs the list (and its
      // stock levels) even though dispensing stays with the pharmacist.
      P.PHARMACY_STOCK_VIEW,
      // Ask the patient for their history at other hospitals, and read what comes back (ADR-092).
      // Doctor-only among clinical staff: the consent request carries THIS doctor's name and
      // registration number to the patient, and it commits the hospital to destroying the records
      // on revocation — not a decision that belongs at the front desk.
      P.ABDM_HISTORY_REQUEST, P.ABDM_HISTORY_VIEW, P.ABDM_CONSENT_STATUS_VIEW,
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
      // "Is this a new problem, or are they coming back about the fracture?" is a front-desk
      // question, asked at check-in, so the desk both reads and opens cases (ADR-116).
      P.CASE_VIEW, P.CASE_MANAGE,
      // Reads the price list to quote from it. Deliberately WITHOUT `billing.fee.override`: the
      // desk charges what the hospital decided, and a hospital that wants otherwise grants the
      // override key to whoever it trusts with it (ADR-117).
      P.BILLING_FEE_RULES_VIEW,
      // Vitals at the desk, or in the vitals queue, where the hospital has configured either
      // (ADR-113). Holding this is not the same as being offered it: the mode decides whether
      // the fields appear at all, and the server checks the mode as well as the permission.
      P.VITALS_VIEW, P.VITALS_RECORD,
      // ...and reading that mode is how the check-in form knows (ADR-129). Without it the desk's
      // own screen 403'd on load against the configuration that governs it.
      P.WORKFLOW_CONFIG_VIEW,
      P.IMMUNIZATION_VIEW, P.IMMUNIZATION_MANAGE, // front desk records routine vaccinations
      P.REFERRAL_VIEW, // routes a referred patient to the right department at the desk
      P.PROVIDER_VIEW, // front desk sees the provider directory to book appointments
      P.DEPARTMENT_VIEW, // and the department it books into
      P.FILE_VIEW, P.FILE_UPLOAD,
      // Check-in opens the consultation-fee invoice, so the desk must be able to see that
      // invoice and take the money for it. Without these the front desk raises a bill it
      // cannot then read or settle, which is a dead end rather than a boundary. Creating an
      // arbitrary invoice stays with the cashier: reception collects against what check-in
      // raised, and every payment is still recorded against the acting user.
      P.BILLING_VIEW, P.BILLING_PAYMENT,
      // The front desk is where an ABHA is verified and attached to a chart (ADR-084).
      P.ABDM_VERIFY, P.ABDM_LINK,
      // Whether a consent is outstanding, granted or lapsed — states and counts only, no records,
      // no source hospitals, no requesting clinician (ADR-120). The desk can then tell a waiting
      // patient what is happening without reading anybody's medical history.
      P.ABDM_CONSENT_STATUS_VIEW,
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
      P.OPD_VIEW, P.REPORTS_VIEW, P.PATIENT_VIEW, P.CASE_VIEW,
      // When the consultation fee is due is a workflow setting the billing counter reads to know
      // what it is looking at, and the chart's cases block needs the case-type words (ADR-129).
      P.WORKFLOW_CONFIG_VIEW,
      // The billing counter reads the price list, and can charge differently — it is the counter
      // a supervisor already stands at when a concession is agreed.
      P.BILLING_FEE_RULES_VIEW, P.BILLING_FEE_OVERRIDE,
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

// ===========================================================================
// Module & Capability registry (ADR-085, extends ADR-083)
// ===========================================================================
// The single canonical `Domain → Module → Capability` catalog, shared by the
// backend (requireModule / requireCapability enforcement) and every frontend
// (module-aware nav / gating). Entitlement has TWO tiers — module and capability —
// both runtime-checked, neither a security bypass. A capability is *what the system
// supports*; a permission is *who may use it*. Only a `BUILT` entry is ever entitled
// to a real screen/API or marked available in marketing (ADR-038) — listing a module
// here is not a claim that it exists. See DECISIONS.md ADR-085, development-plan §20D.

/** The eleven top-level domains from the functional decomposition (ADR-085). */
export type ModuleCategory =
  | 'CORE'
  | 'HOSPITAL'
  | 'CLINIC'
  | 'BILLING'
  | 'ADD_ON'
  | 'SPECIALTY'
  | 'CLINICAL'
  | 'PATIENT_ENGAGEMENT'
  | 'REPORTING'
  | 'AI'
  | 'PLATFORM';

// AVAILABLE = defined here, no running code yet; BUILT = running code behind it;
// PLANNED / FUTURE = roadmap only. Enforcement and a marketing "available" status
// apply to a BUILT entry only — the registry may describe the whole architecture.
export type LifecycleStatus = 'BUILT' | 'AVAILABLE' | 'PLANNED' | 'FUTURE';

export interface CapabilityDef {
  /** Globally unique, `${moduleKey}.${slug}` (e.g. `billing.services`). */
  key: string;
  moduleKey: string;
  name: string;
  status: LifecycleStatus;
  /** Other capability keys this one requires (same or another module). Enforced at configure time. */
  dependencies?: readonly string[];
  /** Permission keys this capability governs — metadata for nav/UX, never the enforcement itself. */
  permissions?: readonly string[];
}

export interface ModuleRegistryDef {
  key: string;
  name: string;
  category: ModuleCategory;
  status: LifecycleStatus;
  /** Onboarding preset hint only (a specialty/facility preset may override); not an enforcement input. */
  defaultEnabled: boolean;
  /**
   * Platform Core: every tenant runs on it, it is never sold or switched off per tenant.
   * The admin surface shows it as required rather than togglable (ADR-085 §9 "Required").
   */
  alwaysOn?: boolean;
  /** Modules that must already be entitled for this one to activate — enforced at grant time. */
  hardDependencies: readonly string[];
  capabilities: readonly CapabilityDef[];
  /** Permission keys the module unlocks — metadata for nav/UX, never the enforcement itself. */
  permissions?: readonly string[];
}

// Compact builders — the catalog is large, so the shape is declared once here and the
// entries below stay readable. A capability key is always `${moduleKey}.${slug}`.
const cap = (
  moduleKey: string,
  slug: string,
  name: string,
  status: LifecycleStatus = 'AVAILABLE',
  extra: { dependencies?: readonly string[]; permissions?: readonly string[] } = {},
): CapabilityDef => ({
  key: `${moduleKey}.${slug}`,
  moduleKey,
  name,
  status,
  ...(extra.dependencies ? { dependencies: extra.dependencies } : {}),
  ...(extra.permissions ? { permissions: extra.permissions } : {}),
});

const mod = (
  key: string,
  name: string,
  category: ModuleCategory,
  status: LifecycleStatus,
  opts: {
    defaultEnabled?: boolean;
    hardDependencies?: readonly string[];
    alwaysOn?: boolean;
    permissions?: readonly string[];
    capabilities?: readonly CapabilityDef[];
  } = {},
): ModuleRegistryDef => ({
  key,
  name,
  category,
  status,
  defaultEnabled: opts.defaultEnabled ?? false,
  hardDependencies: opts.hardDependencies ?? [],
  capabilities: opts.capabilities ?? [],
  ...(opts.alwaysOn ? { alwaysOn: true } : {}),
  ...(opts.permissions ? { permissions: opts.permissions } : {}),
});

// The catalog — the full functional decomposition, organised Domain → Module → Capability.
//
// HONESTY RULE (ADR-038 / ADR-085): `status` is the gate. `BUILT` means running code exists
// behind the entry; `AVAILABLE` means it is declared here so the architecture, the dependency
// graph and the admin surface are complete, but **no screens or APIs exist yet** — it is never
// enforced, never advertised, and never described to a customer as working. Listing something
// here is not a claim that it exists.
//
// The seventeen module keys that predate this registry (patient, appointment, opd, emr,
// pharmacy, laboratory, radiology, billing, inventory, ipd, nursing, emergency, ot, cssd,
// blood_bank, insurance, abdm) keep their exact keys, names and hard dependencies — changing one
// would change what an existing tenant can be granted.
export const MODULE_REGISTRY: readonly ModuleRegistryDef[] = [
  // ---- CORE ---------------------------------------------------------------
  mod('patient', 'Patient Management', 'CORE', 'BUILT', {
    defaultEnabled: true,
    permissions: [P.PATIENT_VIEW, P.PATIENT_CREATE, P.PATIENT_UPDATE],
    capabilities: [
      cap('patient', 'registration', 'Patient Registration', 'BUILT', { permissions: [P.PATIENT_CREATE] }),
      cap('patient', 'profile', 'Patient Profile', 'BUILT', { permissions: [P.PATIENT_VIEW] }),
      cap('patient', 'documents', 'Documents', 'BUILT', { permissions: [P.FILE_VIEW, P.FILE_UPLOAD] }),
      cap('patient', 'immunization', 'Immunisation Records', 'BUILT', { permissions: [P.IMMUNIZATION_VIEW, P.IMMUNIZATION_MANAGE] }),
      cap('patient', 'medical_history', 'Medical History'),
      cap('patient', 'allergies', 'Allergies'),
      cap('patient', 'family_history', 'Family History'),
    ],
  }),
  mod('appointment', 'Appointment Management', 'CORE', 'BUILT', {
    defaultEnabled: true,
    hardDependencies: ['patient'],
    permissions: [P.APPOINTMENT_VIEW, P.APPOINTMENT_CREATE, P.APPOINTMENT_CANCEL],
    capabilities: [
      cap('appointment', 'booking', 'Appointment Booking', 'BUILT', { permissions: [P.APPOINTMENT_CREATE] }),
      cap('appointment', 'doctor_schedule', 'Doctor Schedule / Roster', 'BUILT', { permissions: [P.PROVIDER_VIEW] }),
      cap('appointment', 'cancellation', 'Cancellation', 'BUILT', { permissions: [P.APPOINTMENT_CANCEL] }),
      cap('appointment', 'online_booking', 'Online Booking Requests', 'BUILT'),
      cap('appointment', 'reschedule', 'Rescheduling'),
      cap('appointment', 'followup', 'Follow-up Scheduling'),
    ],
  }),
  mod('emr', 'Clinical Workflow (EMR)', 'CORE', 'BUILT', {
    defaultEnabled: true,
    hardDependencies: ['patient'],
    permissions: [P.EMR_VIEW, P.EMR_WRITE],
    capabilities: [
      cap('emr', 'consultation', 'Consultation', 'BUILT', { permissions: [P.EMR_WRITE] }),
      cap('emr', 'vitals', 'Vitals', 'BUILT', { permissions: [P.VITALS_VIEW, P.VITALS_RECORD] }),
      cap('emr', 'diagnosis', 'Diagnosis (ICD-10)', 'BUILT'),
      cap('emr', 'clinical_notes', 'Clinical Notes', 'BUILT'),
      cap('emr', 'prescription', 'Prescription', 'BUILT'),
      cap('emr', 'investigations', 'Investigations / Orders', 'BUILT'),
      cap('emr', 'ai_assist', 'AI Clinical Drafting', 'BUILT', { permissions: [P.EMR_WRITE] }),
      cap('emr', 'followup_plan', 'Follow-up Plan'),
    ],
  }),

  // ---- CLINIC / OPD -------------------------------------------------------
  mod('opd', 'OPD & Check-in', 'CLINIC', 'BUILT', {
    defaultEnabled: true,
    hardDependencies: ['patient', 'appointment'],
    permissions: [P.OPD_VIEW, P.OPD_CHECKIN, P.OPD_UPDATE],
    capabilities: [
      cap('opd', 'checkin', 'Check-in', 'BUILT', { permissions: [P.OPD_CHECKIN] }),
      cap('opd', 'queue', 'Queue / Token Management', 'BUILT', { permissions: [P.OPD_VIEW] }),
      cap('opd', 'referral', 'Referral Management', 'BUILT', {
        permissions: [P.REFERRAL_VIEW, P.REFERRAL_CREATE, P.REFERRAL_UPDATE],
      }),
      cap('opd', 'self_registration', 'Patient Self-registration (QR)', 'BUILT'),
      cap('opd', 'case', 'Treatment Cases', 'BUILT', { permissions: [P.CASE_VIEW, P.CASE_MANAGE] }),
    ],
  }),
  mod('abdm', 'ABDM / ABHA (Milestone 1)', 'CLINIC', 'BUILT', {
    hardDependencies: ['patient'],
    permissions: [
      P.ABDM_VERIFY,
      P.ABDM_LINK,
      P.ABDM_FACILITY_VIEW,
      P.ABDM_FACILITY_MANAGE,
      P.ABDM_HISTORY_REQUEST,
      P.ABDM_HISTORY_VIEW,
      P.ABDM_REGISTRY_VIEW,
      P.ABDM_REGISTRY_MANAGE,
    ],
    capabilities: [
      cap('abdm', 'verification', 'ABHA Verification', 'BUILT', { permissions: [P.ABDM_VERIFY, P.ABDM_LINK] }),
      cap('abdm', 'facility', 'HFR Facility Configuration', 'BUILT', {
        permissions: [P.ABDM_FACILITY_VIEW, P.ABDM_FACILITY_MANAGE],
      }),
      cap('abdm', 'scan_share', 'Scan & Share', 'BUILT', { dependencies: ['abdm.facility'] }),
      cap('abdm', 'record_exchange', 'Health Record Exchange (M2, HIP)'),
      // M3 — pulling history FROM other hospitals. Registry entry only; describing a module is
      // not a claim it exists (ADR-085), and nothing here is BUILT or marketable yet.
      cap('abdm', 'facility_registry', 'Health Facility Registry (M4, HFR)', 'PLANNED', {
        permissions: [P.ABDM_REGISTRY_VIEW, P.ABDM_REGISTRY_MANAGE],
      }),
      cap('abdm', 'external_history', 'External Health History (M3, HIU)', 'BUILT', {
        permissions: [P.ABDM_HISTORY_REQUEST, P.ABDM_HISTORY_VIEW, P.ABDM_CONSENT_STATUS_VIEW],
      }),
    ],
  }),
  mod('self_checkin', 'Patient Self Check-in', 'CLINIC', 'AVAILABLE', {
    hardDependencies: ['patient', 'opd'],
    capabilities: [
      cap('self_checkin', 'kiosk', 'Kiosk Check-in'),
      cap('self_checkin', 'qr', 'QR Check-in'),
    ],
  }),

  // ---- HOSPITAL -----------------------------------------------------------
  mod('hospital_management', 'Hospital Management', 'HOSPITAL', 'AVAILABLE', {
    capabilities: [
      cap('hospital_management', 'profile', 'Hospital Profile'),
      cap('hospital_management', 'departments', 'Departments'),
      cap('hospital_management', 'floors', 'Floors'),
      cap('hospital_management', 'rooms', 'Rooms'),
      cap('hospital_management', 'beds', 'Beds'),
      cap('hospital_management', 'resources', 'Resources'),
    ],
  }),
  mod('ipd', 'Admission (IPD)', 'HOSPITAL', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('ipd', 'admission', 'Admission'),
      cap('ipd', 'discharge', 'Discharge'),
      cap('ipd', 'transfer', 'Transfer'),
      cap('ipd', 'bed_management', 'Bed Management'),
      cap('ipd', 'nursing', 'Nursing'),
      cap('ipd', 'ward_management', 'Ward Management'),
      cap('ipd', 'billing', 'Inpatient Billing'),
    ],
  }),
  mod('icu', 'ICU Management', 'HOSPITAL', 'AVAILABLE', {
    hardDependencies: ['ipd'],
    capabilities: [
      cap('icu', 'beds', 'ICU Beds'),
      cap('icu', 'admission', 'ICU Admission'),
      cap('icu', 'monitoring', 'Monitoring'),
      cap('icu', 'ventilator', 'Ventilator'),
      cap('icu', 'nursing', 'ICU Nursing'),
      cap('icu', 'billing', 'ICU Billing'),
    ],
  }),
  mod('ot', 'Operation Theatre', 'HOSPITAL', 'AVAILABLE', {
    hardDependencies: ['ipd'],
    capabilities: [
      cap('ot', 'scheduling', 'OT Scheduling'),
      cap('ot', 'surgery_scheduling', 'Surgery Scheduling'),
      cap('ot', 'pre_operative', 'Pre-Operative'),
      cap('ot', 'intra_operative', 'Intra-Operative'),
      cap('ot', 'post_operative', 'Post-Operative'),
      cap('ot', 'staff', 'OT Staff'),
      cap('ot', 'equipment', 'OT Equipment'),
      cap('ot', 'billing', 'OT Billing'),
    ],
  }),
  mod('emergency', 'Emergency Department', 'HOSPITAL', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('emergency', 'registration', 'Emergency Registration'),
      cap('emergency', 'triage', 'Triage'),
      cap('emergency', 'assessment', 'Emergency Assessment'),
      cap('emergency', 'orders', 'Emergency Orders'),
      cap('emergency', 'discharge', 'Emergency Discharge'),
    ],
  }),
  mod('nursing', 'Nursing', 'HOSPITAL', 'AVAILABLE', {
    hardDependencies: ['ipd'],
    capabilities: [
      cap('nursing', 'rounds', 'Nursing Rounds'),
      cap('nursing', 'vitals', 'Vitals Charting'),
      cap('nursing', 'medication_admin', 'Medication Administration'),
      cap('nursing', 'care_notes', 'Care Notes'),
    ],
  }),
  mod('cssd', 'CSSD', 'HOSPITAL', 'AVAILABLE', {
    hardDependencies: ['ot'],
    capabilities: [
      cap('cssd', 'sterilization', 'Sterilization Cycles'),
      cap('cssd', 'instrument_tracking', 'Instrument Tracking'),
      cap('cssd', 'issue_return', 'Issue & Return'),
    ],
  }),

  // ---- BILLING & FINANCE --------------------------------------------------
  mod('billing', 'Billing & Payments', 'BILLING', 'BUILT', {
    defaultEnabled: true,
    permissions: [P.BILLING_VIEW, P.BILLING_CREATE, P.BILLING_PAYMENT],
    capabilities: [
      cap('billing', 'invoice', 'Invoicing', 'BUILT', { permissions: [P.BILLING_CREATE] }),
      cap('billing', 'payments', 'Payments', 'BUILT', { permissions: [P.BILLING_PAYMENT] }),
      cap('billing', 'fee_schedule', 'Consultation Fee Schedule', 'BUILT', {
        permissions: [P.BILLING_FEE_RULES_VIEW, P.BILLING_FEE_RULES_MANAGE, P.BILLING_FEE_OVERRIDE],
      }),
      cap('billing', 'services', 'Services & Packages Catalogue', 'BUILT', {
        permissions: [P.BILLING_SERVICES_VIEW, P.BILLING_SERVICES_MANAGE],
      }),
      cap('billing', 'opd_billing', 'OPD Billing', 'BUILT'),
      cap('billing', 'pharmacy_billing', 'Pharmacy Billing', 'BUILT'),
      cap('billing', 'lab_billing', 'Laboratory Billing', 'BUILT'),
      cap('billing', 'financial_reports', 'Financial Reports', 'BUILT', { permissions: [P.REPORTS_VIEW] }),
      cap('billing', 'ipd_billing', 'IPD Billing'),
      cap('billing', 'procedure_billing', 'Procedure Billing'),
      cap('billing', 'ot_billing', 'OT Billing'),
      cap('billing', 'packages', 'Package Management'),
      cap('billing', 'discounts', 'Discounts'),
      cap('billing', 'refunds', 'Refunds'),
      cap('billing', 'tax', 'GST / Tax Profiles'),
      cap('billing', 'corporate', 'Corporate Billing'),
      cap('billing', 'payment_gateway', 'Online Payment Gateway'),
    ],
  }),
  mod('insurance', 'Insurance, TPA & Govt. Schemes', 'BILLING', 'AVAILABLE', {
    hardDependencies: ['billing'],
    capabilities: [
      cap('insurance', 'payers', 'Payer Catalogue'),
      cap('insurance', 'pre_authorization', 'Pre-authorisation'),
      cap('insurance', 'claims', 'Claims'),
      cap('insurance', 'tpa', 'TPA Management'),
      cap('insurance', 'govt_schemes', 'Government Schemes'),
    ],
  }),

  // ---- ADD-ONS ------------------------------------------------------------
  mod('pharmacy', 'Pharmacy', 'ADD_ON', 'BUILT', {
    permissions: [P.PHARMACY_DISPENSE, P.PHARMACY_STOCK_VIEW, P.PHARMACY_MANAGE],
    capabilities: [
      cap('pharmacy', 'drug_inventory', 'Drug Inventory', 'BUILT', { permissions: [P.PHARMACY_MANAGE] }),
      cap('pharmacy', 'stock', 'Stock', 'BUILT', { permissions: [P.PHARMACY_STOCK_VIEW] }),
      cap('pharmacy', 'batch_expiry', 'Batch / Expiry', 'BUILT'),
      cap('pharmacy', 'dispensing', 'Dispensing', 'BUILT', { permissions: [P.PHARMACY_DISPENSE] }),
      cap('pharmacy', 'billing', 'Pharmacy Billing', 'BUILT'),
      cap('pharmacy', 'purchase', 'Purchase & Suppliers'),
    ],
  }),
  mod('laboratory', 'Laboratory', 'ADD_ON', 'BUILT', {
    permissions: [P.LAB_ORDER_VIEW, P.LAB_RESULT_ENTER, P.LAB_RESULT_VERIFY, P.LAB_MANAGE],
    capabilities: [
      cap('laboratory', 'orders', 'Lab Orders', 'BUILT', { permissions: [P.LAB_ORDER_VIEW] }),
      cap('laboratory', 'sample_collection', 'Sample Collection', 'BUILT', { permissions: [P.LAB_MANAGE] }),
      cap('laboratory', 'processing', 'Processing', 'BUILT'),
      cap('laboratory', 'results', 'Results & Verification', 'BUILT', {
        permissions: [P.LAB_RESULT_ENTER, P.LAB_RESULT_VERIFY],
      }),
      cap('laboratory', 'reports', 'Lab Reports', 'BUILT'),
      cap('laboratory', 'result_files', 'Lab Result Files', 'BUILT', { permissions: [P.LAB_RESULT_ENTER] }),
    ],
  }),
  mod('radiology', 'Radiology & Imaging', 'ADD_ON', 'AVAILABLE', {
    capabilities: [
      cap('radiology', 'xray', 'X-Ray'),
      cap('radiology', 'ct', 'CT'),
      cap('radiology', 'mri', 'MRI'),
      cap('radiology', 'ultrasound', 'Ultrasound'),
      cap('radiology', 'reports', 'Radiology Reports'),
    ],
  }),
  mod('blood_bank', 'Blood Bank', 'ADD_ON', 'AVAILABLE', {
    capabilities: [
      cap('blood_bank', 'donors', 'Donor Register'),
      cap('blood_bank', 'inventory', 'Blood Inventory'),
      cap('blood_bank', 'crossmatch', 'Crossmatch'),
      cap('blood_bank', 'issue', 'Issue & Transfusion'),
    ],
  }),
  mod('inventory', 'Inventory, Stores & Procurement', 'ADD_ON', 'AVAILABLE', {
    capabilities: [
      cap('inventory', 'stores', 'Stores'),
      cap('inventory', 'procurement', 'Procurement'),
      cap('inventory', 'purchase_orders', 'Purchase Orders'),
      cap('inventory', 'goods_receipt', 'Goods Receipt'),
    ],
  }),
  mod('ambulance', 'Ambulance & Fleet', 'ADD_ON', 'AVAILABLE', {
    capabilities: [
      cap('ambulance', 'fleet', 'Fleet Register'),
      cap('ambulance', 'dispatch', 'Dispatch'),
      cap('ambulance', 'trip_log', 'Trip Log & Billing'),
    ],
  }),
  mod('diet', 'Diet & Nutrition', 'ADD_ON', 'AVAILABLE', {
    capabilities: [
      cap('diet', 'diet_charts', 'Diet Charts'),
      cap('diet', 'meal_orders', 'Meal Orders'),
    ],
  }),
  mod('medical_equipment', 'Medical Equipment', 'ADD_ON', 'AVAILABLE', {
    capabilities: [
      cap('medical_equipment', 'register', 'Equipment Register'),
      cap('medical_equipment', 'maintenance', 'Maintenance'),
      cap('medical_equipment', 'calibration', 'Calibration'),
    ],
  }),

  // ---- SPECIALTY ----------------------------------------------------------
  // Specialty narrows the view, never widens access (ADR-083). Each is an independent
  // module so a new specialty is a registry row, not a core rewrite.
  mod('pediatrics', 'Pediatrics', 'SPECIALTY', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('pediatrics', 'consultation', 'Pediatric Consultation'),
      cap('pediatrics', 'growth_monitoring', 'Growth Monitoring'),
      cap('pediatrics', 'growth_charts', 'Growth Charts'),
      cap('pediatrics', 'vaccination', 'Vaccination / Immunisation'),
      cap('pediatrics', 'vaccine_schedule', 'Vaccine Schedule'),
      cap('pediatrics', 'vaccine_inventory', 'Vaccine Inventory'),
      cap('pediatrics', 'developmental_assessment', 'Developmental Assessment'),
      cap('pediatrics', 'dosage', 'Pediatric Dosage'),
      cap('pediatrics', 'followup', 'Pediatric Follow-up'),
    ],
  }),
  mod('gynecology', 'Gynecology & Obstetrics', 'SPECIALTY', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('gynecology', 'consultation', 'Gynecology Consultation'),
      cap('gynecology', 'pregnancy', 'Pregnancy Record'),
      cap('gynecology', 'antenatal', 'Antenatal Care'),
      cap('gynecology', 'prenatal_visits', 'Prenatal Visits'),
      cap('gynecology', 'pregnancy_tracking', 'Pregnancy Tracking'),
      cap('gynecology', 'ultrasound_tracking', 'Ultrasound Tracking'),
      cap('gynecology', 'labor_delivery', 'Labor & Delivery'),
      cap('gynecology', 'postnatal', 'Postnatal Care'),
      cap('gynecology', 'family_planning', 'Family Planning'),
    ],
  }),
  mod('orthopedics', 'Orthopedics', 'SPECIALTY', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('orthopedics', 'consultation', 'Orthopedic Consultation'),
      cap('orthopedics', 'msk_assessment', 'Musculoskeletal Assessment'),
      cap('orthopedics', 'injury', 'Injury Management'),
      cap('orthopedics', 'fracture', 'Fracture Management'),
      cap('orthopedics', 'surgery', 'Surgery'),
      cap('orthopedics', 'exercise_plan', 'Exercise Plan'),
      cap('orthopedics', 'physiotherapy', 'Physiotherapy'),
      cap('orthopedics', 'pt_scheduling', 'PT Scheduling'),
    ],
  }),
  mod('dentistry', 'Dentistry', 'SPECIALTY', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('dentistry', 'consultation', 'Dental Consultation'),
      cap('dentistry', 'odontogram', 'Dental Chart / Odontogram'),
      cap('dentistry', 'tooth_history', 'Tooth History'),
      cap('dentistry', 'procedures', 'Dental Procedures'),
      cap('dentistry', 'treatment_plans', 'Treatment Plans'),
      cap('dentistry', 'imaging', 'Dental Imaging'),
      cap('dentistry', 'prescription', 'Dental Prescription'),
      cap('dentistry', 'billing', 'Dental Billing'),
    ],
  }),
  mod('psychiatry', 'Psychiatry', 'SPECIALTY', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('psychiatry', 'assessment', 'Psychiatric Assessment'),
      cap('psychiatry', 'history', 'Mental Health History'),
      cap('psychiatry', 'psychological_assessment', 'Psychological Assessment'),
      cap('psychiatry', 'medication_management', 'Medication Management'),
      cap('psychiatry', 'therapy', 'Therapy / Counselling'),
      cap('psychiatry', 'scales', 'Mental Health Scales'),
      cap('psychiatry', 'followup', 'Follow-up'),
    ],
  }),
  mod('dermatology', 'Dermatology', 'SPECIALTY', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('dermatology', 'skin_assessment', 'Skin Assessment'),
      cap('dermatology', 'conditions', 'Skin Conditions'),
      cap('dermatology', 'body_map', 'Body Map'),
      cap('dermatology', 'procedures', 'Procedure Management'),
      cap('dermatology', 'photos', 'Before / After Photos'),
    ],
  }),
  mod('cardiology', 'Cardiology', 'SPECIALTY', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('cardiology', 'assessment', 'Cardiac Assessment'),
      cap('cardiology', 'ecg', 'ECG'),
      cap('cardiology', 'investigations', 'Cardiac Investigations'),
      cap('cardiology', 'risk_assessment', 'Risk Assessment'),
      cap('cardiology', 'followup', 'Cardiac Follow-up'),
    ],
  }),
  mod('ophthalmology', 'Ophthalmology', 'SPECIALTY', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('ophthalmology', 'vision_assessment', 'Vision Assessment'),
      cap('ophthalmology', 'refraction', 'Refraction'),
      cap('ophthalmology', 'examination', 'Eye Examination'),
      cap('ophthalmology', 'procedures', 'Eye Procedures'),
      cap('ophthalmology', 'optical_prescription', 'Optical Prescription'),
    ],
  }),
  mod('ent', 'ENT', 'SPECIALTY', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('ent', 'examination', 'ENT Examination'),
      cap('ent', 'audiometry', 'Audiometry'),
      cap('ent', 'nasal', 'Nasal Examination'),
      cap('ent', 'throat', 'Throat Examination'),
      cap('ent', 'procedures', 'ENT Procedures'),
    ],
  }),
  mod('neurology', 'Neurology', 'SPECIALTY', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('neurology', 'examination', 'Neurological Examination'),
      cap('neurology', 'seizure_tracking', 'Seizure Tracking'),
      cap('neurology', 'stroke_management', 'Stroke Management'),
      cap('neurology', 'followup', 'Neurological Follow-up'),
    ],
  }),

  // ---- CLINICAL SUPPORT ---------------------------------------------------
  mod('clinical_support', 'Clinical Support', 'CLINICAL', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('clinical_support', 'care_plans', 'Care Plans'),
      cap('clinical_support', 'documentation', 'Clinical Documentation'),
      cap('clinical_support', 'medical_records', 'Medical Records'),
      cap('clinical_support', 'procedures', 'Procedure Management'),
      cap('clinical_support', 'consent', 'Consent Management'),
      cap('clinical_support', 'protocols', 'Clinical Protocols'),
      cap('clinical_support', 'followup', 'Follow-up Management'),
    ],
  }),

  // ---- PATIENT ENGAGEMENT -------------------------------------------------
  mod('patient_portal', 'Patient Portal', 'PATIENT_ENGAGEMENT', 'AVAILABLE', {
    hardDependencies: ['patient'],
    capabilities: [
      cap('patient_portal', 'appointments', 'Appointments'),
      cap('patient_portal', 'prescriptions', 'Digital Prescriptions'),
      cap('patient_portal', 'lab_reports', 'Lab Reports'),
      cap('patient_portal', 'documents', 'Medical Documents'),
      cap('patient_portal', 'invoices', 'Invoices'),
      cap('patient_portal', 'payments', 'Payment History'),
      cap('patient_portal', 'vaccination_records', 'Vaccination Records'),
    ],
  }),
  mod('communication', 'Communication', 'PATIENT_ENGAGEMENT', 'AVAILABLE', {
    capabilities: [
      cap('communication', 'notifications', 'Notifications'),
      cap('communication', 'sms', 'SMS'),
      cap('communication', 'whatsapp', 'WhatsApp'),
      cap('communication', 'email', 'Email'),
    ],
  }),
  mod('telemedicine', 'Telemedicine', 'PATIENT_ENGAGEMENT', 'AVAILABLE', {
    hardDependencies: ['appointment'],
    capabilities: [
      cap('telemedicine', 'video_consultation', 'Video Consultation'),
      cap('telemedicine', 'online_appointment', 'Online Appointment'),
      cap('telemedicine', 'digital_prescription', 'Digital Prescription'),
      cap('telemedicine', 'online_payment', 'Online Payment'),
    ],
  }),

  // ---- REPORTING & ANALYTICS ---------------------------------------------
  mod('reporting', 'Reporting & Analytics', 'REPORTING', 'AVAILABLE', {
    capabilities: [
      cap('reporting', 'clinical', 'Clinical Reports'),
      cap('reporting', 'patient', 'Patient Reports'),
      cap('reporting', 'opd', 'OPD Reports'),
      cap('reporting', 'ipd', 'IPD Reports'),
      cap('reporting', 'ot', 'OT Reports'),
      cap('reporting', 'pharmacy', 'Pharmacy Reports'),
      cap('reporting', 'laboratory', 'Laboratory Reports'),
      cap('reporting', 'financial', 'Financial Reports'),
      cap('reporting', 'doctor_performance', 'Doctor Performance'),
      cap('reporting', 'department_performance', 'Department Performance'),
      cap('reporting', 'custom', 'Custom Reports'),
    ],
  }),

  // ---- AI -----------------------------------------------------------------
  mod('ai_clinical_assistant', 'AI Clinical Assistant', 'AI', 'AVAILABLE', {
    hardDependencies: ['emr'],
    capabilities: [
      cap('ai_clinical_assistant', 'consultation_assistance', 'Consultation Assistance'),
      cap('ai_clinical_assistant', 'note_suggestions', 'Clinical Note Suggestions'),
      cap('ai_clinical_assistant', 'documentation', 'Medical Documentation'),
    ],
  }),
  mod('ai_decision_support', 'AI Decision Support', 'AI', 'AVAILABLE', {
    hardDependencies: ['emr'],
    capabilities: [
      cap('ai_decision_support', 'symptom_suggestions', 'Symptom Suggestions'),
      cap('ai_decision_support', 'diagnosis_assistance', 'Diagnosis Assistance'),
      cap('ai_decision_support', 'medicine_suggestions', 'Medicine Suggestions'),
      cap('ai_decision_support', 'drug_interaction', 'Drug Interaction Checking'),
      cap('ai_decision_support', 'cds', 'Clinical Decision Support'),
    ],
  }),
  mod('ai_insights', 'AI Summarisation & Insight', 'AI', 'AVAILABLE', {
    capabilities: [
      cap('ai_insights', 'report_summarization', 'Report Summarisation'),
      cap('ai_insights', 'history_summarization', 'Patient History Summarisation'),
      cap('ai_insights', 'followup_suggestions', 'AI Follow-up Suggestions'),
      cap('ai_insights', 'analytics', 'AI Analytics'),
    ],
  }),

  // ---- PLATFORM SERVICES --------------------------------------------------
  // Shared services every tenant runs on. `alwaysOn` — they are Platform Core, never sold or
  // switched off per tenant, so the admin surface shows them as required rather than togglable.
  mod('platform_services', 'Platform Services', 'PLATFORM', 'BUILT', {
    defaultEnabled: true,
    alwaysOn: true,
    capabilities: [
      cap('platform_services', 'authentication', 'Authentication', 'BUILT'),
      cap('platform_services', 'authorization', 'Authorization (RBAC)', 'BUILT'),
      cap('platform_services', 'notifications', 'Notifications', 'BUILT'),
      cap('platform_services', 'file_storage', 'File / Document Storage', 'BUILT'),
      cap('platform_services', 'audit_logging', 'Audit Logging', 'BUILT'),
      cap('platform_services', 'event_queue', 'Event / Queue System', 'BUILT'),
      cap('platform_services', 'api_management', 'API Management (OpenAPI)', 'BUILT'),
      cap('platform_services', 'search', 'Search'),
      cap('platform_services', 'workflow_engine', 'Workflow Engine'),
      cap('platform_services', 'configuration_engine', 'Configuration Engine'),
      cap('platform_services', 'feature_flags', 'Feature Flags'),
      cap('platform_services', 'integration_engine', 'Integration Engine'),
    ],
  }),
];

/** Named, type-safe references to the BUILT capability keys (mirrors `PERMISSIONS`). */
export const CAPABILITIES = {
  OPD_REFERRAL: 'opd.referral',
  EMR_AI_ASSIST: 'emr.ai_assist',
  BILLING_SERVICES: 'billing.services',
  LAB_RESULT_FILES: 'laboratory.result_files',
  ABDM_VERIFICATION: 'abdm.verification',
  ABDM_FACILITY: 'abdm.facility',
  ABDM_SCAN_SHARE: 'abdm.scan_share',
} as const;

export type CapabilityKey = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

// The eleven domains, in display order, with their labels (Level 1 of the module manager).
// The registry may not yet contain a module for every one — the UI shows only categories that
// actually have modules, so an empty domain never renders as a dead heading.
export const MODULE_CATEGORIES: readonly { key: ModuleCategory; name: string }[] = [
  { key: 'CORE', name: 'Core' },
  { key: 'CLINIC', name: 'Clinic / OPD' },
  { key: 'HOSPITAL', name: 'Hospital' },
  { key: 'BILLING', name: 'Billing & Finance' },
  { key: 'ADD_ON', name: 'Add-ons' },
  { key: 'SPECIALTY', name: 'Specialty' },
  { key: 'CLINICAL', name: 'Clinical Support' },
  { key: 'PATIENT_ENGAGEMENT', name: 'Patient Engagement' },
  { key: 'REPORTING', name: 'Reporting & Analytics' },
  { key: 'AI', name: 'AI' },
  { key: 'PLATFORM', name: 'Platform Services' },
];

export function categoryLabel(key: string): string {
  return MODULE_CATEGORIES.find((c) => c.key === key)?.name ?? key;
}

export const REGISTRY_MODULE_KEYS: ReadonlySet<string> = new Set(MODULE_REGISTRY.map((m) => m.key));

/** Every capability across every module, flattened. */
export const ALL_CAPABILITIES: readonly CapabilityDef[] = MODULE_REGISTRY.flatMap(
  (m) => m.capabilities,
);

export const CAPABILITY_KEYS: ReadonlySet<string> = new Set(ALL_CAPABILITIES.map((c) => c.key));

export function registryModule(key: string): ModuleRegistryDef | undefined {
  return MODULE_REGISTRY.find((m) => m.key === key);
}

/** The declared capabilities of a module (empty if the module is unknown or has none). */
export function moduleCapabilities(moduleKey: string): readonly CapabilityDef[] {
  return registryModule(moduleKey)?.capabilities ?? [];
}

export function capabilityDef(capabilityKey: string): CapabilityDef | undefined {
  return ALL_CAPABILITIES.find((c) => c.key === capabilityKey);
}

export function isModuleBuilt(moduleKey: string): boolean {
  return registryModule(moduleKey)?.status === 'BUILT';
}

export function isCapabilityBuilt(capabilityKey: string): boolean {
  return capabilityDef(capabilityKey)?.status === 'BUILT';
}

/**
 * Capabilities that declare `keyOrModule` as a dependency — either a capability key
 * (`abdm.facility`) or a whole module key (a dependent of any of its capabilities).
 * Used to warn before disabling something other capabilities rely on (ADR-085 §17).
 */
export function capabilityDependents(keyOrModule: string): readonly CapabilityDef[] {
  return ALL_CAPABILITIES.filter((c) => (c.dependencies ?? []).includes(keyOrModule));
}

/**
 * Which module a permission belongs to — **derived from the registry**, never a second list
 * (ADR-126). A permission named by a module, or by one of that module's capabilities, belongs
 * to it; the first module that claims it wins, and a key claimed by none is Platform Core.
 *
 * This is what lets a refusal say the true thing. "You lack a permission" and "your hospital
 * does not have this module" are different problems with different people to ask, and a screen
 * that says the first when the second is true sends someone to argue with their administrator
 * about something their administrator cannot fix.
 */
const PERMISSION_TO_MODULE: ReadonlyMap<string, string> = (() => {
  const index = new Map<string, string>();
  for (const m of MODULE_REGISTRY) {
    for (const key of [...(m.permissions ?? []), ...m.capabilities.flatMap((c) => c.permissions ?? [])]) {
      if (!index.has(key)) index.set(key, m.key);
    }
  }
  return index;
})();

/** The module a permission belongs to, or `null` for Platform Core — always available. */
export function permissionModuleKey(permission: string): string | null {
  return PERMISSION_TO_MODULE.get(permission) ?? null;
}
