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
  isActive: boolean;
  specialties: string[];
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
}

export interface ModuleCatalogItem {
  key: string;
  name: string;
  hardDependencies: string[];
}

export interface OnboardTenantRequest {
  code: string;
  name: string;
  modules?: string[];
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
}

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
}

export interface BookAppointmentRequest {
  patientId: string;
  providerId: string;
  scheduledAt: string;
  durationMinutes?: number;
  reason?: string | null;
  branchId?: string | null;
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
  status: string; // checked_in | in_consultation | completed | cancelled
  department: string | null;
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
  department?: string | null;
  reason?: string | null;
  consultationFeePaise: number;
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
  vitals: Vitals;
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
    drugName: string;
    dose?: string | null;
    frequency?: string | null;
    duration?: string | null;
    route?: string | null;
    instructions?: string | null;
  }>;
  labOrders: Array<{ testName: string; testCode?: string | null; priority?: string | null; notes?: string | null }>;
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
}

export interface LabOrder {
  id: string;
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
  createdAt: string;
}
