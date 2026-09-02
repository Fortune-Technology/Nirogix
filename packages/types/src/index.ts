// @hms/types — shared TypeScript types and API contracts.
// Consumed by hms_backend (API) and hms_frontend (Portal) so request/response
// shapes stay in sync across the wire. These MUST mirror the backend controllers
// (hms_backend/src/modules/**). See resources/development-plan.md §6, §10.

// ---- Canonical error envelope (hms_backend/src/http/error.ts) --------------

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ---- Pagination envelope (hms_backend/src/http/respond.ts) ------------------

export interface Paginated<T> {
  data: T[];
  page: {
    number: number;
    size: number;
    total: number;
    totalPages: number;
  };
}

// ---- Auth (hms_backend/src/modules/auth) -----------------------------------

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  mfaEnabled: boolean;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  /** Role keys in this tenant. Present on /auth/me; omitted on the login response. */
  roles?: string[];
  /** Set when this session was started by a platform operator (ADR-037). */
  impersonatedBy?: string | null;
}

/** `POST /admin/support-sessions` (ADR-037). */
export interface StartSupportSessionRequest {
  tenantId: string;
  userId: string;
  reason: string;
  ticketRef?: string;
}

export interface StartSupportSessionResponse {
  accessToken: string;
  user: AuthUser;
  tenant: { id: string; name: string };
  message: string;
}

export interface LoginRequest {
  orgCode: string;
  email: string;
  password: string;
}

/** `POST /auth/login` → tokens, OR an MFA challenge when the user has MFA enabled. */
export type LoginResponse =
  | { accessToken: string; user: AuthUser }
  | { mfaRequired: true };

export interface RefreshResponse {
  accessToken: string;
}

export interface MeResponse {
  user: AuthUser;
}

// ---- RBAC (hms_backend/src/modules/rbac) -----------------------------------

/** `GET /rbac/permissions` — the caller's effective permission set. */
export interface MyPermissionsResponse {
  wildcard: boolean;
  permissions: string[];
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

/**
 * `GET /rbac/access?permission=…` — why a caller cannot do something (ADR-126).
 *
 * `reason` is the part that matters: `module_not_enabled` is the hospital's subscription and no
 * administrator can grant their way past it, while `permission_missing` is a role question their
 * administrator can answer today.
 */
export interface AccessExplanation {
  permission: { key: string; label: string };
  /** Null for Platform Core, which every hospital always has. */
  module: { key: string; name: string; enabled: boolean } | null;
  granted: boolean;
  reason: 'granted' | 'module_not_enabled' | 'permission_missing';
  /** Roles in this hospital that grant it — system and custom alike. */
  grantedByRoles: Array<{ key: string; name: string; isSystem: boolean }>;
}

// ---- Providers & specialties (hms_backend/src/modules/provider) -------------

export interface Specialty {
  code: string;
  name: string;
  snomedCode: string | null;
}

export interface Provider {
  id: string;
  fullName: string;
  gender: string | null;
  registrationNumber: string | null;
  qualification: string | null;
  email: string | null;
  phone: string | null;
  /** Login user this doctor is linked to (gives them a personal OPD queue). */
  userId: string | null;
  /** Default OPD consultation fee in paise; check-in uses it when no override is typed. */
  consultationFeePaise: number | null;
  isActive: boolean;
  specialties: string[];
}

export interface CreateProviderRequest {
  fullName: string;
  gender?: string;
  registrationNumber?: string;
  qualification?: string;
  email?: string;
  phone?: string;
  userId?: string;
  consultationFeePaise?: number | null;
}

export interface UpdateProviderRequest {
  fullName?: string;
  gender?: string | null;
  registrationNumber?: string | null;
  qualification?: string | null;
  email?: string | null;
  phone?: string | null;
  userId?: string | null;
  consultationFeePaise?: number | null;
  isActive?: boolean;
}

export interface AssignSpecialtyRequest {
  specialtyCode: string;
  branchId?: string;
  departmentId?: string;
  role?: string;
  isPrimary?: boolean;
}

// ---- Admin / onboarding (hms_backend/src/modules/admin) --------------------

export interface Tenant {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface TenantDetail extends Tenant {
  modules: string[];
  branches: Branch[];
  userCount: number;
  /** Identity only, for tenant administration and support-session targeting (ADR-037). */
  users: Array<{ id: string; email: string; fullName: string; status: string; roles: string[] }>;
}

export interface ModuleCatalogItem {
  key: string;
  name: string;
  /** Domain the module belongs to (ADR-085), e.g. CORE, HOSPITAL, ADD_ON. */
  category: string;
  /** Lifecycle status (ADR-085): BUILT | AVAILABLE | PLANNED | FUTURE. */
  status: string;
  /** Platform Core — always on, never togglable per tenant. */
  alwaysOn: boolean;
  hardDependencies: string[];
  /** The module's declared capabilities, so onboarding can offer capability-level choices. */
  capabilities: Array<{ key: string; name: string; status: string; dependencies: string[] }>;
}

/** `GET /entitlements` — the tenant's enabled modules and capabilities (ADR-085). */
export interface MyEntitlementsResponse {
  modules: string[];
  capabilities: string[];
}

/** A capability of a tenant's entitled module, with its current enabled state (ADR-085). */
export interface TenantCapability {
  module: string;
  moduleName: string;
  capability: string;
  name: string;
  status: string;
  enabled: boolean;
  dependencies: string[];
}

/** One capability within the module manager's config model (ADR-085). */
export interface ModuleConfigCapability {
  key: string;
  name: string;
  status: string;
  enabled: boolean;
  dependencies: string[];
}

/** One module within the module manager's config model, entitled or not (ADR-085). */
export interface ModuleConfigModule {
  key: string;
  name: string;
  category: string;
  status: string;
  /** Platform Core — always on, never togglable per tenant (ADR-085). */
  alwaysOn: boolean;
  hardDependencies: string[];
  entitled: boolean;
  capabilities: ModuleConfigCapability[];
}

/** The whole module/capability picture for a tenant, grouped by domain (ADR-085 §19). */
export interface TenantModuleConfig {
  categories: Array<{ key: string; name: string }>;
  modules: ModuleConfigModule[];
}

export interface OnboardTenantRequest {
  code: string;
  name: string;
  modules?: string[];
  /** Capability keys to switch OFF at onboarding (deny-by-exception). */
  disabledCapabilities?: string[];
  admin: { email: string; fullName: string };
  branches?: Array<{ code: string; name: string }>;
}

export interface OnboardTenantResponse {
  tenant: Tenant;
  admin: { email: string; tempPassword: string };
}

// ---- Users & branches (hms_backend/src/modules/user, /branch) ---------------

export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  status: string;
  mfaEnabled: boolean;
  roles: string[];
}

export interface PermissionOverride {
  id: string;
  permission: string;
  effect: string;
  validUntil: string | null;
}

export interface UserDetail {
  id: string;
  email: string;
  fullName: string;
  status: string;
  mfaEnabled: boolean;
  roles: Array<{ key: string; name: string }>;
  wildcard: boolean;
  permissions: string[];
  overrides: PermissionOverride[];
}

export interface CreateUserRequest {
  email: string;
  fullName: string;
  roleKey?: string;
  password?: string;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

// ---- Tenant branding (hms_backend/src/modules/branding) ---------------------

export interface Branding {
  brandColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  typography: unknown;
  /** The hospital's own identity, for document headers (ADR-047). */
  organization: { name: string; code: string } | null;
}

// ---- Organization profile (hms_backend/src/modules/organization, ADR-049) ---
// The hospital's own identity: registered address, contact details and statutory
// numbers. Every field is optional — a document prints the lines that exist and
// omits the rest rather than inventing a placeholder.

/**
 * The paper a printed document targets (ADR-065). One reusable set shared by the
 * settings selector and the print layer — never an A4 special case. `LETTER`/`LEGAL`
 * are US sizes; the print CSS maps each to a sheet width and a `@page size`.
 */
export const DOCUMENT_PAGE_SIZES = ['A4', 'A5', 'LETTER', 'LEGAL'] as const;
export type DocumentPageSize = (typeof DOCUMENT_PAGE_SIZES)[number];

export interface OrganizationProfile {
  /** From the tenant row — provisioned by the platform, not editable here. */
  name: string;
  code: string;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationNumber: string | null;
  gstin: string | null;
  displayName: string | null;
  secondaryPhone: string | null;
  supportEmail: string | null;
  /** Letterhead — reuses this record rather than a second identity store (ADR-056). */
  letterheadHeader: string | null;
  letterheadFooter: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
  /** Short-lived URL for the uploaded letterhead image (ADR-065); null when none is set. */
  letterheadImageUrl: string | null;
  /** The paper printed documents target. Null means the platform default (A4). */
  documentPageSize: DocumentPageSize | null;
  /** The same data pre-ordered for a printed document header. */
  contactLines: string[];
  /** True once the fields an invoice header needs are present. */
  isComplete: boolean;
}

export interface RegistrationSettings {
  enabled: boolean;
  /** Null until self-registration is switched on for the first time. */
  token: string | null;
  pendingCount: number;
}

export interface RegistrationRequestItem {
  id: string;
  firstName: string;
  lastName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  note: string | null;
  status: string;
  createdAt: string;
}

export interface PublicRegistrationContext {
  hospitalName: string;
  city: string | null;
  enabled: boolean;
}

// `letterheadImageUrl` is upload-only (its own multipart route), so it is not part of the
// partial text update — only `documentPageSize` rides the normal PUT.
export type UpdateOrganizationProfileRequest = Partial<
  Omit<OrganizationProfile, 'name' | 'code' | 'contactLines' | 'isComplete' | 'letterheadImageUrl'>
>;

// ---- Hospital Setup Console (hms_backend/src/modules/setup, ADR-049) --------
// Progress is derived from real tenant data on every read, never stored as a
// flag, so it stays honest when configuration changes after setup "finishes".

export type SetupStepKey =
  | 'profile'
  | 'branding'
  | 'branches'
  | 'departments'
  | 'providers'
  | 'staff'
  | 'roles'
  | 'lab_tests'
  | 'drugs'
  | 'modules';

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  description: string;
  /** Portal route that completes this step. */
  href: string;
  /** Permission needed to act on it; null = any authenticated user. */
  permission: string | null;
  /** Module entitlement this step belongs to; null = platform core. */
  module: string | null;
  required: boolean;
  complete: boolean;
  count: number;
  dependsOn: SetupStepKey[];
}

export interface SetupStatus {
  organization: { name: string; code: string };
  steps: SetupStep[];
  completedRequired: number;
  totalRequired: number;
  ready: boolean;
}

// ---- Departments (hms_backend/src/modules/department, ADR-050) --------------
// The hospital's clinical organisation. `branchId` NULL = organization-wide, the
// same convention every branch-scoped record uses. Departments are deactivated,
// never deleted — visits and encounters reference them.

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string | null;
  branchId: string | null;
  branchName: string | null;
  specialtyCode: string | null;
  headProviderId: string | null;
  headProviderName: string | null;
  /** Providers assigned. Shown before deactivating, so the effect is visible first. */
  providerCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateDepartmentRequest {
  code: string;
  name: string;
  description?: string | null;
  branchId?: string | null;
  specialtyCode?: string | null;
  headProviderId?: string | null;
}

export type UpdateDepartmentRequest = Partial<Omit<CreateDepartmentRequest, 'code'>> & {
  isActive?: boolean;
};

// ---- Patient portal (hms_backend/src/modules/patient-identity, ADR-052) -----
// A patient is a DIFFERENT PRINCIPAL from a staff user, not a user with fewer
// permissions. There is no public signup: access is granted by the hospital.

export interface PatientSession {
  accessToken: string;
  identity: { id: string; fullName: string | null };
}

export interface PatientHospital {
  tenantId: string;
  name: string;
  patientId: string;
}

export interface PatientPortalProfile {
  uhid: string;
  firstName: string;
  lastName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  bloodGroup: string | null;
  city: string | null;
  state: string | null;
}

export interface PatientLabReport {
  id: string;
  status: string;
  orderedAt: string;
  testName: string;
  value: string | null;
  unit: string | null;
  refLow: string | null;
  refHigh: string | null;
  /** normal | low | high | critical — shown as-is; the portal does not interpret it. */
  flag: string | null;
  resultedAt: string | null;
}

/** One contact, never both — the code goes to exactly one place. */
export type PatientContact = { mobile: string; email?: never } | { email: string; mobile?: never };

// ---- Platform branding (hms_backend/src/modules/platform-branding, ADR-024) ----
// Vendor-owned, platform-global branding for two independent surfaces. Distinct
// from per-tenant `Branding` above. The scalable token set maps to CSS variables
// (resources/DESIGN.md §7).

export type PlatformBrandingScope = 'marketing' | 'hms';

export interface BrandingTokens {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  surface?: string;
  foreground?: string;
  border?: string;
  buttonBg?: string;
  buttonFg?: string;
}

export interface PlatformBranding {
  scope: PlatformBrandingScope;
  tokens: BrandingTokens;
  logoUrl: string | null;
  faviconUrl: string | null;
  version: number;
}

// ---- Dashboards (hms_backend/src/modules/admin, /dashboard) ----------------

export interface ActiveInactive {
  total: number;
  active: number;
  inactive: number;
}

/** `GET /admin/stats` — platform-wide, super-admin only, aggregate-only (ADR-023). */
export interface PlatformStats {
  organizations: ActiveInactive;
  hospitals: ActiveInactive;
  branches: { total: number; active: number };
  doctors: number;
  users: number;
  modules: Array<{ module: string; name: string; tenants: number }>;
  patients: number | null;
  appointments: number | null;
}

/** One period of a platform trend — the count created in it, plus the running total. */
export interface TrendPoint {
  /** `YYYY-MM` for a monthly series, `YYYY-MM-DD` for a daily one. */
  period: string;
  created: number;
  cumulative: number;
}

export interface SeverityPoint {
  period: string;
  info: number;
  warning: number;
  critical: number;
}

/**
 * `GET /admin/trends` — platform growth over time, derived from each record's own
 * `created_at` (ADR-043). Aggregate-only, super-admin gated: counts per period,
 * never another tenant's rows.
 */
export interface PlatformTrends {
  from: string;
  to: string;
  hospitals: TrendPoint[];
  users: TrendPoint[];
  patients: TrendPoint[];
  appointments: TrendPoint[];
  /** Audit events per day for the trailing 30 days. */
  events: SeverityPoint[];
}

/**
 * `GET /dashboard/overview` — the caller's own tenant, RLS-scoped (ADR-044).
 * The operational data behind every role dashboard. Amounts are in paise.
 */
export interface DashboardOverview {
  /** The clinical day this describes, `YYYY-MM-DD` in the server's local time. */
  today: string;
  loadByHour: Array<{ hour: number; scheduled: number; walkIn: number }>;
  today_counts: {
    appointments: number;
    checkedIn: number;
    inConsultation: number;
    completed: number;
    newPatients: number;
  };
  revenue: Array<{ period: string; billed: number; collected: number }>;
  registrations: Array<{ period: string; value: number }>;
  outstandingPaise: number;
  pendingLabOrders: number;
  lowStock: Array<{ id: string; name: string; onHand: number; reorderLevel: number }>;
  providerLoad: Array<{ providerId: string; name: string; seen: number; inProgress: number; booked: number }>;
}

/** `GET /dashboard/summary` — the caller's own tenant, RLS-scoped. */
export interface OrgSummary {
  users: number;
  doctors: number;
  branches: { total: number; active: number };
  modules: string[];
  patients: number | null;
  appointments: number | null;
}

// ---- Patients (hms_backend/src/modules/patient) ----------------------------

export interface Patient {
  id: string;
  uhid: string;
  firstName: string;
  lastName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  bloodGroup: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  abhaNumber: string | null;
  /** ABDM Milestone 1 (ADR-084). `abhaVerifiedAt` is null for a hand-typed ABHA number. */
  abhaAddress?: string | null;
  abhaVerifiedAt?: string | null;
  abhaSource?: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  branchId: string | null;
  status: string;
  createdAt: string;
}

export interface CreatePatientRequest {
  firstName: string;
  lastName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  bloodGroup?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  abhaNumber?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  branchId?: string | null;
  /** Register anyway after reviewing the DUPLICATE_PATIENT candidates from a 409. */
  allowDuplicate?: boolean;
}

/** A matching chart surfaced by the DUPLICATE_PATIENT 409 (error.details.candidates). */
export interface DuplicatePatientCandidate {
  id: string;
  uhid: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
}

// ---- Appointments (hms_backend/src/modules/appointment) --------------------

export interface Appointment {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  reason: string | null;
  patientId: string;
  patientName: string;
  patientUhid: string;
  providerId: string;
  providerName: string;
  departmentId: string | null;
  departmentName: string | null;
  /** `appointment` (first visit with this doctor) or `follow_up` (a return) — ADR-115. */
  arrivalType: string;
}

export interface BookAppointmentRequest {
  patientId: string;
  providerId: string;
  scheduledAt: string;
  durationMinutes?: number;
  reason?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  arrivalType?: 'appointment' | 'follow_up' | null;
}

// ---- The unified visit workflow (ADR-115) ---------------------------------

/**
 * When the patient is being seen. The only thing that really separates "check this walk-in in"
 * from "book an appointment" — everything else about the two is the same set of questions.
 */
export type VisitTiming = 'now' | 'future';

/** How the patient arrived. Recorded on both the appointment and the visit it becomes. */
export type ArrivalType = 'walk_in' | 'appointment' | 'follow_up';

// ---- Patient self check-in (ADR-118) --------------------------------------

/** What a self check-in QR code says about the hospital behind it. Nothing about its patients. */
export interface PublicCheckinContext {
  hospitalName: string;
  city: string | null;
  enabled: boolean;
}

/**
 * A patient announcing arrival. Everything except the hospital is a claim until the front desk
 * confirms it — which is also the identity check, because the desk is looking at the person.
 */
export interface SelfCheckinRequest {
  id: string;
  status: string;
  claimedPhone: string;
  announcedAt: string;
  patientId: string | null;
  patientName: string | null;
  patientUhid: string | null;
  appointmentId: string | null;
  scheduledAt: string | null;
  providerName: string | null;
  departmentName: string | null;
  resultingVisitId: string | null;
  confirmedAt: string | null;
  dismissReason: string | null;
  version: number;
  /** A colleague checked this appointment in by hand while the patient queued at the kiosk. */
  alreadyCheckedIn: boolean;
}

export interface SelfCheckinSettings {
  enabled: boolean;
  token: string | null;
  /** How many arrivals are waiting on the board right now. */
  pendingCount: number;
}

// ---- Consultation fee schedule (ADR-117) ----------------------------------

/**
 * One line of the price list. Any of doctor / department / case type / consultation type / arrival
 * type may be null, meaning "any" — which is what lets one table express both "every follow-up is
 * ₹200" and "Dr Sharma's first visit is ₹800". The most specific match wins.
 */
export interface ConsultationFeeRule {
  id: string;
  branchId: string | null;
  branchName: string | null;
  providerId: string | null;
  providerName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  arrivalType: string | null;
  /** What kind of consultation, in the hospital's own vocabulary (ADR-121). */
  consultationType: string | null;
  /** What kind of episode (ADR-121). Read from the case, never from the check-in form. */
  caseType: string | null;
  feePaise: number;
  isActive: boolean;
  label: string | null;
  /**
   * Doctor (16) + department (8) + case type (4) + consultation type (2) + arrival type (1).
   * Higher wins; powers of two make the ordering total, so there is never a tie.
   */
  specificity: number;
  version: number;
  createdAt: string;
}

export interface CreateFeeRuleRequest {
  branchId?: string | null;
  providerId?: string | null;
  departmentId?: string | null;
  arrivalType?: ArrivalType | null;
  /** Must be one of the hospital's configured consultation types (ADR-121). */
  consultationType?: string | null;
  /** Must be one of the hospital's configured case types (ADR-121). */
  caseType?: string | null;
  feePaise: number;
  label?: string | null;
}

export interface UpdateFeeRuleRequest {
  version: number;
  feePaise?: number;
  label?: string | null;
  /** Retire rather than delete — a rule explains the invoices it priced. */
  isActive?: boolean;
}

/** What a check-in with these details would be charged, and where the number came from. */
export interface ResolvedConsultationFee {
  feePaise: number;
  ruleId: string | null;
  ruleLabel: string | null;
  source: 'rule' | 'provider_default' | 'none';
}

// ---- ABDM consent status (ADR-120) ----------------------------------------

/**
 * A patient's consent position — states and counts, deliberately nothing more.
 *
 * No source hospitals (a name is a diagnosis by implication), no record counts (a proxy for how
 * ill somebody has been), and not who asked. This is what a front desk may know.
 */
export interface AbdmConsentStatus {
  /** False when the patient has no verified ABHA — nothing can be requested at all. */
  canRequest: boolean;
  awaitingPatient: number;
  active: number;
  declined: number;
  lapsed: number;
  failed: number;
  /** When the earliest active consent obliges us to have destroyed our copy. */
  activeUntil: string | null;
  latestStatus: string | null;
  latestRequestedAt: string | null;
}

// ---- Patient documents (ADR-119) ------------------------------------------

/** What a document is. Fixed, because the point of a type is filtering and free text does not. */
export const DOCUMENT_TYPES = [
  'referral_letter',
  'prior_report',
  'insurance',
  'id_proof',
  'consent_form',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * A file attached to a patient, and optionally to the visit it arrived with or the case it
 * belongs to. `file_metadata` stores the bytes and knows nothing about who they are about; this
 * is what gives a file a subject.
 */
export interface PatientDocument {
  id: string;
  patientId: string;
  visitId: string | null;
  caseId: string | null;
  caseNumber: string | null;
  fileId: string;
  /** `(file removed)` where the underlying file has since been deleted — the link is kept. */
  filename: string;
  contentType: string;
  size: number;
  documentType: string;
  title: string;
  note: string | null;
  /** `active` | `archived`. Archived, never deleted. */
  status: string;
  archiveReason: string | null;
  uploadedByName: string | null;
  createdAt: string;
  version: number;
}

export interface AttachDocumentRequest {
  /** From `POST /files` — the upload goes through the ordinary file store first. */
  fileId: string;
  title?: string | null;
  documentType?: DocumentType;
  note?: string | null;
  visitId?: string | null;
  caseId?: string | null;
}

// ---- Treatment cases (ADR-116) --------------------------------------------

/**
 * The episode a run of visits belongs to. A patient may have several open at once — a long-term
 * condition and a fresh injury are genuinely separate — so this is a list, never a single value.
 */
export interface PatientCase {
  id: string;
  caseNumber: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  /** Free text, not a diagnosis — a case is opened before anyone has examined the patient. */
  title: string;
  /**
   * What kind of episode this is (ADR-121), in the hospital's own vocabulary — "Corporate",
   * "Insurance", "Camp". It prices every visit under the case.
   */
  caseType: string | null;
  /** `open` | `closed`. */
  status: string;
  departmentId: string | null;
  departmentName: string | null;
  providerId: string | null;
  providerName: string | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  closeReason: string | null;
  version: number;
  visitCount: number;
  lastVisitDate: string | null;
}

export interface OpenCaseRequest {
  patientId: string;
  title: string;
  departmentId?: string | null;
  providerId?: string | null;
  branchId?: string | null;
  notes?: string | null;
  /** One of the hospital's configured case types (ADR-121). */
  caseType?: string | null;
}

export interface UpdateCaseRequest {
  version: number;
  title?: string;
  departmentId?: string | null;
  providerId?: string | null;
  notes?: string | null;
  /** Correctable — it changes what future visits under this case are charged, never past ones. */
  caseType?: string | null;
}

export interface CloseCaseRequest {
  version: number;
  /** Required — "closed" with no reason is unreadable to whoever opens the chart next. */
  closeReason: string;
}

// ---- OPD / Visits (hms_backend/src/modules/opd) ----------------------------

export interface VisitInvoiceSummary {
  id: string;
  invoiceNumber: string;
  status: string;
  totalPaise: number;
  amountPaidPaise: number;
  balancePaise: number;
}

export interface Visit {
  id: string;
  visitNumber: string;
  tokenNumber: number;
  visitDate: string;
  visitType: string;
  /** `walk_in` | `appointment` | `follow_up` (ADR-115). */
  arrivalType: string;
  /**
   * What kind of consultation this is (ADR-121). A third, separate question from `visitType`
   * (where) and `arrivalType` (how they got here): this is what is about to happen.
   */
  consultationType: string | null;
  /** The treatment case this visit belongs to, when it belongs to one (ADR-116). */
  caseId: string | null;
  /** What the fee schedule said this consultation costs (ADR-117). */
  calculatedFeePaise: number | null;
  /** Why the desk charged something else, when it did. */
  feeOverrideReason: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
  /** The case's type (ADR-121) — carried here because it is what priced this consultation. */
  caseType: string | null;
  status: string; // checked_in | in_consultation | completed | cancelled
  /** Optimistic-lock version — send it back with a status change. */
  version: number;
  /** The department's name at check-in (legacy free-text column, ADR-050). */
  department: string | null;
  departmentId: string | null;
  reason: string | null;
  checkedInAt: string;
  completedAt: string | null;
  patientId: string;
  patientName: string;
  patientUhid: string;
  providerId: string | null;
  providerName: string | null;
  appointmentId: string | null;
  invoice: VisitInvoiceSummary | null;
}

export interface CheckInRequest {
  patientId: string;
  appointmentId?: string | null;
  providerId?: string | null;
  branchId?: string | null;
  /** Deprecated free-text department — send `departmentId` instead (ADR-050). */
  department?: string | null;
  departmentId?: string | null;
  reason?: string | null;
  /** Optional override — omitted, the provider's configured default fee applies. */
  consultationFeePaise?: number | null;
  /** Check in against a pending referral — patient/department/provider default from it. */
  referralId?: string | null;
  /** How the patient arrived (ADR-115). An appointment check-in overrides this server-side. */
  arrivalType?: ArrivalType | null;
  /**
   * What kind of consultation (ADR-121), from the hospital's configured vocabulary. Rejected where
   * the hospital has configured none — a value no screen can explain is worse than no value.
   */
  consultationType?: string | null;
  /** Check in under an existing open case (ADR-116). Mutually exclusive with `newCase`. */
  caseId?: string | null;
  /** Required whenever the amount differs from the calculated fee (ADR-117). */
  feeOverrideReason?: string | null;
  /** Open a new case in the same transaction as the visit. Mutually exclusive with `caseId`. */
  newCase?: { title: string; notes?: string | null; caseType?: string | null } | null;
  /**
   * Readings taken at the desk, when the hospital collects vitals during check-in
   * (`vitalsMode: during_checkin`, ADR-113). Ignored in any other mode — the server decides
   * whether the desk is allowed to record them, not the form.
   */
  vitals?: Partial<Vitals> | null;
}

export interface UpdateVisitStatusRequest {
  status: 'in_consultation' | 'completed' | 'cancelled';
  version?: number;
}

// ---- Billing (hms_backend/src/modules/billing — Financial Transaction Infra) ----

export interface InvoiceLineItem {
  id: string;
  itemType: string;
  description: string;
  quantity: number;
  unitPricePaise: number;
  taxRateBps: number;
  taxPaise: number;
  lineTotalPaise: number;
}

export interface Payment {
  id: string;
  amountPaise: number;
  method: string;
  reference: string | null;
  status: string;
  collectedAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string; // draft | partially_paid | paid | void
  currency: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  amountPaidPaise: number;
  balancePaise: number;
  notes: string | null;
  visitId: string | null;
  patientId: string;
  patientName: string;
  patientUhid: string;
  createdAt: string;
  lineItems: InvoiceLineItem[];
  payments: Payment[];
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: string;
  totalPaise: number;
  amountPaidPaise: number;
  balancePaise: number;
  currency: string;
  createdAt: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
}

export interface RecordPaymentRequest {
  amountPaise: number;
  method: 'cash' | 'upi' | 'card' | 'netbanking' | 'other';
  reference?: string | null;
  idempotencyKey: string;
}

/** Manual invoice creation (billing.invoice.create). */
export interface CreateInvoiceRequest {
  patientId: string;
  branchId?: string | null;
  visitId?: string | null;
  notes?: string | null;
  lineItems: Array<{
    itemType: string;
    description: string;
    quantity?: number;
    unitPricePaise: number;
    taxRateBps?: number;
  }>;
}

// ---- Services catalogue (ADR-067, E-3) --------------------------------------

export interface Service {
  id: string;
  code: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  departmentName: string | null;
  pricePaise: number;
  taxRateBps: number;
  isActive: boolean;
}

export interface CreateServiceRequest {
  code: string;
  name: string;
  description?: string | null;
  /** Set when adopted from the system catalogue (ADR-072); omit for a pure custom service. */
  catalogCode?: string | null;
  departmentId?: string | null;
  pricePaise: number;
  taxRateBps?: number;
}

export type UpdateServiceRequest = Partial<CreateServiceRequest> & { isActive?: boolean };

/** Either a catalogue service (server-priced) or a custom one-off line. */
export interface AddInvoiceLineRequest {
  serviceId?: string;
  quantity?: number;
  description?: string;
  unitPricePaise?: number;
  taxRateBps?: number;
}

// ---- Referrals (ADR-068) -----------------------------------------------------

export interface Referral {
  id: string;
  visitId: string;
  visitNumber: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  fromProviderId: string | null;
  fromProviderName: string | null;
  toDepartmentId: string;
  toDepartmentName: string;
  toProviderId: string | null;
  toProviderName: string | null;
  reason: string;
  status: string; // pending | completed | cancelled
  resultingVisitId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CreateReferralRequest {
  visitId: string;
  toDepartmentId: string;
  toProviderId?: string | null;
  reason: string;
}

// ---- Provider weekly roster (ADR-069, E-8) ------------------------------------

export interface ScheduleWindow {
  id?: string;
  weekday: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  slotMinutes?: number;
  branchId?: string | null;
}

export interface FreeSlots {
  hasRoster: boolean;
  slots: Array<{ startsAt: string; label: string }>;
}

// ---- Public appointment requests (ADR-069) ------------------------------------

export interface BookingRequestItem {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  departmentId: string | null;
  departmentName: string | null;
  providerId: string | null;
  providerName: string | null;
  note: string | null;
  status: string;
  appointmentId: string | null;
  patientId: string | null;
  createdAt: string;
}

export interface BookingSettings {
  enabled: boolean;
  token: string | null;
  pendingCount: number;
}

export interface ApproveBookingRequest {
  scheduledAt: string;
  providerId: string;
  durationMinutes?: number;
  existingPatientId?: string;
  allowDuplicate?: boolean;
}

// ---- Pharmacy suppliers + adjustments (ADR-070) --------------------------------

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  addressLine: string | null;
  isActive: boolean;
}

export interface CreateSupplierRequest {
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  addressLine?: string | null;
}

export interface StockAdjustment {
  id: string;
  drugId: string;
  drugName: string;
  batchId: string | null;
  delta: number;
  reason: string;
  createdAt: string;
}

// ---- AI prescription draft (ADR-070) -------------------------------------------

export interface AiCapabilities {
  prescriptionDraft: boolean;
}

export interface AiDraftRequest {
  chiefComplaint?: string | null;
  diagnoses: Array<{ icd10Code: string; icd10Term: string }>;
  ageYears?: number | null;
  gender?: string | null;
  vitalsSummary?: string | null;
}

export interface AiDraftResponse {
  prescriptions: Array<{
    drugName: string;
    dose: string | null;
    frequency: string | null;
    duration: string | null;
    route: string | null;
    instructions: string | null;
    drugId: string | null;
  }>;
  note: string | null;
}

// ---- EMR / Clinical Workflow (hms_backend/src/modules/emr) ------------------

export interface Vitals {
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  spo2: number | null;
  respRate: number | null;
  tempC: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bloodSugarMgDl: number | null;
  /** Which reading the blood sugar is — a number without this is not interpretable. */
  bloodSugarType: 'fasting' | 'post_prandial' | 'random' | null;
}

// ---- Workflow configuration & vitals (ADR-113) -----------------------------

/**
 * The vitals a hospital can choose to collect. The keys are the contract between the
 * configuration screen, the forms that render the fields, and the columns the readings are
 * stored in — one list, so a parameter cannot be offered somewhere it cannot be saved.
 *
 * `systolic` and `diastolic` are one parameter (`bloodPressure`) as far as configuration is
 * concerned: nobody asks for one half of a blood pressure.
 */
export const VITAL_PARAMETERS = [
  'bloodPressure',
  'pulse',
  'spo2',
  'respRate',
  'tempC',
  'weightKg',
  'heightCm',
  'bloodSugar',
] as const;

export type VitalParameter = (typeof VITAL_PARAMETERS)[number];

/** Where in the workflow a hospital takes vitals. `consultation_only` is the platform default. */
export type VitalsMode = 'disabled' | 'consultation_only' | 'during_checkin' | 'after_checkin';

/** When the consultation fee must be settled. `before_consultation` is the platform default. */
export type PaymentTiming = 'before_consultation' | 'at_checkin' | 'after_consultation';

/** Where a reading was taken. Kept because it changes how a clinician reads the number. */
export type VitalsStage = 'check_in' | 'pre_consultation' | 'consultation';

export interface HospitalWorkflowConfig {
  /** NULL for the organization-wide default. */
  branchId: string | null;
  branchName: string | null;
  vitalsMode: VitalsMode;
  vitalsRequiredParams: VitalParameter[];
  vitalsOptionalParams: VitalParameter[];
  paymentTiming: PaymentTiming;
  /**
   * The hospital's own vocabularies (ADR-121), used as pricing dimensions and offered as fields at
   * check-in. **Empty means the question is not asked** — which is the default, so a hospital that
   * never opens this screen sees no new fields and no change in what it charges.
   */
  consultationTypes: string[];
  caseTypes: string[];
  version: number;
  /**
   * True when no row exists for this scope and the platform defaults are being reported. Saving
   * creates the row; until then the hospital is running on defaults, which is worth showing.
   */
  isDefault: boolean;
  /** True when this branch has no row of its own and is inheriting the organization default. */
  inheritedFromOrganization: boolean;
}

export interface UpdateHospitalWorkflowConfigRequest {
  version: number;
  vitalsMode?: VitalsMode;
  vitalsRequiredParams?: VitalParameter[];
  vitalsOptionalParams?: VitalParameter[];
  paymentTiming?: PaymentTiming;
  /** Sent whole, not as a patch: leaving a value out is how it is removed. */
  consultationTypes?: string[];
  caseTypes?: string[];
}

export interface VitalsRecord extends Vitals {
  id: string;
  visitId: string;
  patientId: string;
  stage: VitalsStage;
  notes: string | null;
  recordedBy: string | null;
  recordedByName: string | null;
  recordedAt: string;
  version: number;
}

export interface RecordVitalsRequest extends Partial<Vitals> {
  visitId: string;
  stage: VitalsStage;
  notes?: string | null;
}

/**
 * A visit waiting for its vitals (`vitalsMode: after_checkin`). The queue is derived, not a
 * table: a visit is on it while it is checked in, has no vitals recorded, and no consultation has
 * started — so nothing has to be kept in step with the visit's own status.
 */
export interface VitalsQueueEntry {
  visitId: string;
  tokenNumber: number;
  visitNumber: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  providerName: string | null;
  department: string | null;
  checkedInAt: string;
  /** The most recent reading for this visit, when one has already been taken. */
  latestVitals: VitalsRecord | null;
}

export interface Diagnosis {
  id: string;
  icd10Code: string;
  icd10Term: string;
  isPrimary: boolean;
  notes: string | null;
}

export interface Prescription {
  id: string;
  drugId: string | null;
  drugName: string;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  status: string;
}

export interface LabOrder {
  id: string;
  testId: string | null;
  testName: string;
  testCode: string | null;
  priority: string;
  status: string;
  notes: string | null;
}

export interface Encounter {
  id: string;
  visitId: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  providerId: string | null;
  providerName: string | null;
  status: string; // draft | signed
  version: number;
  signedAt: string | null;
  chiefComplaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  /** The most recent reading on the VISIT — which may be one the desk or the vitals room took. */
  vitals: Vitals;
  /** Every reading on this visit, newest first, with who took each and when (ADR-113). */
  vitalsHistory: VitalsRecord[];
  diagnoses: Diagnosis[];
  prescriptions: Prescription[];
  labOrders: LabOrder[];
}

export interface Icd10Code {
  code: string;
  term: string;
}

export interface SaveEncounterRequest {
  version: number;
  chiefComplaint?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  vitals?: Partial<Vitals>;
  diagnoses: Array<{ icd10Code: string; icd10Term: string; isPrimary?: boolean; notes?: string | null }>;
  prescriptions: Array<{
    /** Present on rows that already exist — a re-save updates them in place. */
    id?: string | null;
    /** Drug-master link; the server snapshots the master's name when set. */
    drugId?: string | null;
    drugName: string;
    dose?: string | null;
    frequency?: string | null;
    duration?: string | null;
    route?: string | null;
    instructions?: string | null;
  }>;
  labOrders: Array<{
    id?: string | null;
    /** Test-master link; prices the order at sample collection. */
    testId?: string | null;
    testName: string;
    testCode?: string | null;
    priority?: string | null;
    notes?: string | null;
  }>;
}

/** One row of a patient's clinical history (signed encounters only). */
export interface EncounterSummary {
  id: string;
  visitId: string;
  visitNumber: string;
  visitDate: string;
  providerName: string | null;
  signedAt: string | null;
  chiefComplaint: string | null;
  diagnoses: Array<{ icd10Code: string; icd10Term: string; isPrimary: boolean }>;
  prescriptionCount: number;
  labOrderCount: number;
}

// ---- Pharmacy (hms_backend/src/modules/pharmacy) ---------------------------

export interface Drug {
  id: string;
  name: string;
  form: string | null;
  strength: string | null;
  unit: string;
  unitPricePaise: number;
  taxRateBps: number;
  reorderLevel: number;
  isActive: boolean;
  onHand: number;
  lowStock: boolean;
}

export interface PendingPrescription {
  id: string;
  drugId: string | null;
  drugName: string;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  status: string;
  visitId: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  createdAt: string;
}

export interface CreateDrugRequest {
  name: string;
  form?: string | null;
  strength?: string | null;
  unit?: string;
  /** Set when adopted from the system catalogue (ADR-072); omit for a pure custom drug. */
  catalogCode?: string | null;
  hsnSac?: string | null;
  unitPricePaise: number;
  taxRateBps?: number;
  reorderLevel?: number;
}

export interface ReceiveStockRequest {
  batchNo?: string | null;
  expiryDate?: string | null;
  quantity: number;
  costPricePaise?: number | null;
  /** Who the batch came from (ADR-070). */
  supplierId?: string | null;
}

export interface DispenseRequest {
  prescriptionId: string;
  drugId: string;
  quantity: number;
}

export interface DispenseResult {
  dispenseId: string;
  invoiceId: string | null;
  drugName: string;
  quantity: number;
  totalPaise: number;
}

// ---- Laboratory (hms_backend/src/modules/laboratory) -----------------------

export interface LabTest {
  id: string;
  name: string;
  code: string | null;
  sampleType: string | null;
  unit: string | null;
  refLow: string | null;
  refHigh: string | null;
  pricePaise: number;
  taxRateBps: number;
  isActive: boolean;
}

export interface LabResult {
  value: string;
  unit: string | null;
  flag: string; // normal | low | high | critical
  refLow: string | null;
  refHigh: string | null;
  notes: string | null;
  /** Set when the result has been signed off (ADR-070). */
  verifiedAt: string | null;
  hasAttachment: boolean;
}

export interface LabOrder {
  id: string;
  testId: string | null;
  testName: string;
  testCode: string | null;
  priority: string;
  status: string; // ordered | collected | resulted | cancelled
  notes: string | null;
  visitId: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  createdAt: string;
  result: LabResult | null;
}

export interface CreateLabTestRequest {
  name: string;
  code?: string | null;
  sampleType?: string | null;
  unit?: string | null;
  refLow?: string | null;
  refHigh?: string | null;
  /** Set when adopted from the system catalogue (ADR-072); omit for a pure custom test. */
  catalogCode?: string | null;
  pricePaise: number;
  taxRateBps?: number;
}

export interface EnterResultRequest {
  testId?: string | null;
  value: string;
  unit?: string | null;
  refLow?: string | null;
  refHigh?: string | null;
  flag?: 'normal' | 'low' | 'high' | 'critical' | null;
  notes?: string | null;
  /** Attached report file id (upload through the file API first). */
  fileId?: string | null;
}

// ---- Reports (hms_backend/src/modules/reports) -----------------------------

export interface OpdRegisterRow {
  visitNumber: string;
  tokenNumber: number;
  visitDate: string;
  patientName: string;
  patientUhid: string;
  providerName: string | null;
  status: string;
  checkedInAt: string;
  invoiceNumber: string | null;
  invoiceTotalPaise: number | null;
  invoicePaidPaise: number | null;
  invoiceStatus: string | null;
}

export interface CollectionsReport {
  from: string;
  to: string;
  totalPaise: number;
  count: number;
  byMethod: Array<{ method: string; totalPaise: number; count: number }>;
  byDay: Array<{ date: string; totalPaise: number; count: number }>;
  rows: Array<{
    id: string;
    collectedAt: string;
    method: string;
    amountPaise: number;
    reference: string | null;
    invoiceNumber: string;
    patientName: string;
    patientUhid: string;
  }>;
}

export interface PendingLabRow {
  testName: string;
  testCode: string | null;
  priority: string;
  status: string;
  patientName: string;
  patientUhid: string;
  orderedAt: string;
}

// ---- Audit (hms_backend/src/modules/audit) ---------------------------------

export interface AuditEntry {
  id: string;
  action: string;
  actorUserId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  severity: string;
  /**
   * Correlation id shared with the structured log, the error tracker and the response's
   * `X-Request-Id` header (ADR-082). Null for rows written before the column existed and
   * for events raised outside an HTTP request (jobs, seeders).
   */
  requestId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------------------------
// ABDM / ABHA — Milestone 1 (ADR-084)
//
// Identity verification at registration. Nothing here carries an Aadhaar number or an ABDM
// token: the browser sends an Aadhaar once, on one request, and receives demographics and a
// transaction id in return.
// ---------------------------------------------------------------------------------------------

/** What the registration screen may offer for this hospital right now. */
export interface AbdmCapabilities {
  provider: 'mock' | 'gateway';
  creationEnabled: boolean;
  verificationEnabled: boolean;
  /** Scan and Share needs an HFR facility id, a QR payload and the flow switched on. */
  scanShareEnabled: boolean;
  facilityConfigured: boolean;
  facilityName: string | null;
  qrContent: string | null;
  encryptionConfigured: boolean;
  consentVersion: string;
}

/** Registration-form values taken from a verified ABHA profile. Editable before submit. */
export interface AbhaPrefill {
  firstName?: string;
  lastName?: string;
  gender?: string | null;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
  abhaNumber?: string;
  abhaAddress?: string;
}

/** A chart that may already belong to this ABHA. */
export interface AbhaMatchCandidate {
  id: string;
  uhid: string;
  firstName: string;
  lastName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  abhaNumber: string | null;
  /** exact_abha = a verified ABHA number matched; demographic = name + gender + birth year. */
  reason: 'exact_abha' | 'demographic';
}

export interface AbhaVerificationResult {
  transactionId: string;
  state: string;
  prefill: AbhaPrefill;
  match: {
    /** returning = one confident ABHA-number match; ambiguous = a human must confirm. */
    outcome: 'returning' | 'ambiguous' | 'new';
    candidates: AbhaMatchCandidate[];
  };
  isNewAbha?: boolean;
  /** The patient's chosen mobile differs from the Aadhaar-linked one — a second OTP is due. */
  requiresMobileVerification?: boolean;
  requiresAbhaAddress?: boolean;
  /** Present when one identifier resolved to several ABHA accounts and one must be chosen. */
  /**
   * When one identifier resolves to several ABHAs the operator picks one. The list carries real
   * demographics, and they are the only description of that person the flow produces — the call
   * that resolves the chosen account returns a token and little else (ADR-130).
   */
  accounts?: Array<{ abhaNumber: string; abhaAddress?: string; name?: string; gender?: string; dateOfBirth?: string }>;
}

export interface AbdmOtpSent {
  transactionId: string;
  /** Masked destination, e.g. `XXXXXX7890`. */
  mobileHint?: string;
  /** Sandbox/mock only — no SMS is sent, so the OTP comes back in-band. Never in production. */
  devOtp?: string;
}

/** A profile a patient pushed by scanning the hospital's QR, waiting at the desk. */
export interface AbdmPendingShare {
  transactionId: string;
  abhaNumber: string | null;
  abhaAddress: string | null;
  prefill: AbhaPrefill;
  matchOutcome: string | null;
  receivedAt: string;
}

export type AbhaIdentifierType = 'abha_number' | 'abha_address' | 'mobile' | 'aadhaar';

/**
 * A correction to the patient's profile AT ABDM — the one M1 call that writes to the national
 * register. Every field optional; at least one must be set. `dateOfBirth` is `DD-MM-YYYY`, the
 * form ABDM's own examples use, not our ISO transport format.
 */
export interface AbhaProfileUpdate {
  transactionId: string;
  profilePhoto?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  gender?: 'M' | 'F' | 'O';
  dateOfBirth?: string;
  address?: string;
  pincode?: string;
}

/** The hospital's own ABDM/HFR facility registration. Issued by NHA to the hospital, not by us. */
export interface AbdmFacilityConfig {
  id: string;
  hipId: string;
  facilityName: string | null;
  qrContent: string | null;
  scanShareEnabled: boolean;
  branchId: string | null;
}
