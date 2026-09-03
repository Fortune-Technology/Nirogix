// The Nirogix Portal's endpoint surface (ADR-051, ADR-054).
//
// The HTTP core — access token in memory, the single in-flight refresh, the 401 retry,
// canonical error unwrapping and the one-notification-per-call rule (ADR-026) — lives
// in `@hms/client` and is shared by every frontend, so the security-relevant half
// cannot drift between apps. What stays here is this audience's endpoints: hospital
// staff. There is no platform-administration call in this file; those live in the
// admin console on its own origin.

import type {
  AccessExplanation,
  AuditEntry,
  MeResponse,
  Paginated,
  Provider,
  Specialty,
  UserListItem,
  UserDetail,
  CreateUserRequest,
  Branch,
  Role,
  Branding,
  Department,
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
  OrganizationProfile,
  UpdateOrganizationProfileRequest,
  SetupStatus,
  RegistrationSettings,
  RegistrationRequestItem,
  PlatformBranding,
  PlatformBrandingScope,
  DashboardOverview,
  OrgSummary,
  Patient,
  CreatePatientRequest,
  Appointment,
  BookAppointmentRequest,
  Visit,
  CheckInRequest,
  UpdateVisitStatusRequest,
  ArrivalType,
  VisitTiming,
  PatientCase,
  OpenCaseRequest,
  UpdateCaseRequest,
  CloseCaseRequest,
  ConsultationFeeRule,
  PatientDocument,
  AbdmConsentStatus,
  AttachDocumentRequest,
  SelfCheckinRequest,
  SelfCheckinSettings,
  CreateFeeRuleRequest,
  UpdateFeeRuleRequest,
  ResolvedConsultationFee,
  HospitalWorkflowConfig,
  UpdateHospitalWorkflowConfigRequest,
  VitalsRecord,
  RecordVitalsRequest,
  VitalsQueueEntry,
  Invoice,
  InvoiceListItem,
  RecordPaymentRequest,
  Encounter,
  EncounterSummary,
  SaveEncounterRequest,
  AmendEncounterRequest,
  Icd10Code,
  CreateProviderRequest,
  UpdateProviderRequest,
  AssignSpecialtyRequest,
  Service,
  CreateServiceRequest,
  UpdateServiceRequest,
  AddInvoiceLineRequest,
  Referral,
  CreateReferralRequest,
  AbdmCapabilities,
  AbdmFacilityConfig,
  AbdmOtpSent,
  AbdmPendingShare,
  AbhaIdentifierType,
  AbhaProfileUpdate,
  AbhaVerificationResult,
  ScheduleWindow,
  FreeSlots,
  BookingRequestItem,
  BookingSettings,
  ApproveBookingRequest,
  Supplier,
  CreateSupplierRequest,
  StockAdjustment,
  AiCapabilities,
  AiDraftRequest,
  AiDraftResponse,
  CreateInvoiceRequest,
  Drug,
  PendingPrescription,
  CreateDrugRequest,
  ReceiveStockRequest,
  DispenseRequest,
  DispenseResult,
  LabTest,
  LabOrder,
  CreateLabTestRequest,
  EnterResultRequest,
  OpdRegisterRow,
  CollectionsReport,
  PendingLabRow,
} from "@hms/types";
import { createApiClient, notifyError, notifySuccess } from "@hms/client";
import { formatPaise } from "./money";

const client = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1",
});

const { request, send, parseError } = client;

/** The client the AuthProvider drives. */
export const apiClient = client;

export { ApiRequestError, NetworkError, TimeoutError } from "@hms/client";
export const { setAccessToken, getAccessToken, setOnSessionExpired, tryRefresh, login, logout, me, myPermissions } =
  client;

// Session endpoints (login / logout / me / permissions / refresh) come from
// `@hms/client` and are re-exported above — one implementation for every frontend.

// ---- Self-service profile (ADR-035) ----------------------------------------

export async function updateOwnProfile(patch: { fullName: string }): Promise<MeResponse> {
  return request<MeResponse>("/auth/profile", {
    method: "PATCH",
    body: patch,
    feedback: { success: "Profile updated." },
  });
}

export async function changeOwnPassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ message: string }> {
  return request<{ message: string }>("/auth/change-password", { method: "POST", body });
}

// ---- Forgot password (ADR-081) — both unauthenticated ----------------------

export async function forgotPassword(body: { orgCode: string; email: string }): Promise<{ message: string }> {
  // `client` tells the backend which app's configured origin the emailed link opens.
  // The pages render the outcome inline, so the shared toast stays quiet.
  return request<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: { ...body, client: "portal" },
    feedback: false,
  });
}

export async function resetPassword(body: { token: string; newPassword: string }): Promise<{ message: string }> {
  return request<{ message: string }>("/auth/reset-password", { method: "POST", body, feedback: false });
}

// ---- Resources -------------------------------------------------------------

export async function listProviders(): Promise<Provider[]> {
  const data = await request<{ providers: Provider[] }>("/providers");
  return data.providers;
}

export async function createProvider(body: CreateProviderRequest): Promise<Provider> {
  return request<Provider>("/providers", { method: "POST", body, feedback: { success: "Doctor added." } });
}

export async function updateProvider(id: string, patch: UpdateProviderRequest): Promise<Provider> {
  return request<Provider>(`/providers/${id}`, { method: "PATCH", body: patch, feedback: { success: "Doctor updated." } });
}

export async function assignProviderSpecialty(id: string, body: AssignSpecialtyRequest): Promise<void> {
  await request(`/providers/${id}/specialties`, { method: "POST", body, feedback: { success: "Specialty assigned." } });
}

export async function listSpecialties(): Promise<Specialty[]> {
  const data = await request<{ specialties: Specialty[] }>("/specialties");
  return data.specialties;
}

export async function listAudit(
  opts: {
    page?: number;
    pageSize?: number;
    search?: string;
    severity?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  } = {},
): Promise<Paginated<AuditEntry>> {
  const q = new URLSearchParams();
  q.set("page", String(opts.page ?? 1));
  q.set("pageSize", String(opts.pageSize ?? 20));
  if (opts.search) q.set("search", opts.search);
  if (opts.severity) q.set("severity", opts.severity);
  if (opts.sortBy) q.set("sortBy", opts.sortBy);
  if (opts.sortDir) q.set("sortDir", opts.sortDir);
  return request<Paginated<AuditEntry>>(`/audit?${q.toString()}`);
}

export async function listRoles(): Promise<Role[]> {
  return (await request<{ roles: Role[] }>("/rbac/roles")).roles;
}

// ---- Patient self-registration (ADR-056) -----------------------------------
// A submission is a REQUEST, not a patient. The front desk converts it after
// verifying the person, so ADR-052's rule that the hospital decides who becomes a
// patient record still holds.

export async function getRegistrationSettings(): Promise<RegistrationSettings> {
  return request<RegistrationSettings>("/organization/registration");
}

export async function setSelfRegistration(enabled: boolean): Promise<RegistrationSettings> {
  return request<RegistrationSettings>("/organization/registration", {
    method: "PUT",
    body: { enabled },
    feedback: { success: enabled ? "Self-registration is on." : "Self-registration is off." },
  });
}

export async function regenerateRegistrationToken(): Promise<RegistrationSettings> {
  return request<RegistrationSettings>("/organization/registration/regenerate", {
    method: "POST",
    feedback: { success: "New QR issued. Printed posters no longer work." },
  });
}

export async function listRegistrationRequests(status = "pending"): Promise<RegistrationRequestItem[]> {
  return (await request<{ requests: RegistrationRequestItem[] }>(`/registration-requests?status=${status}`)).requests;
}

export async function approveRegistrationRequest(
  id: string,
  opts: { allowDuplicate?: boolean; existingPatientId?: string } = {},
): Promise<{ patientId: string }> {
  return request<{ patientId: string }>(`/registration-requests/${id}/approve`, {
    method: "POST",
    body: opts,
    feedback: { success: opts.existingPatientId ? "Linked to the existing patient." : "Patient registered." },
  });
}

export async function rejectRegistrationRequest(id: string, reason?: string): Promise<void> {
  await request<void>(`/registration-requests/${id}/reject`, {
    method: "POST",
    body: { reason },
    feedback: { success: "Request rejected." },
  });
}

// ---- Patient portal access (ADR-052) ---------------------------------------
// The hospital grants and withdraws a patient's portal access. There is no
// self-service path — this is the only way a link is ever created.

export async function grantPortalAccess(
  patientId: string,
  contact: { mobile: string } | { email: string },
): Promise<{ identityId: string; linkId: string }> {
  return request<{ identityId: string; linkId: string }>(`/patients/${patientId}/portal-access`, {
    method: "POST",
    body: contact,
    feedback: { success: "Portal access granted." },
  });
}

export async function revokePortalAccess(patientId: string): Promise<void> {
  await request<void>(`/patients/${patientId}/portal-access`, {
    method: "DELETE",
    feedback: { success: "Portal access withdrawn." },
  });
}

// ---- Platform branding: READ ONLY (ADR-024, ADR-051) -----------------------
// The Portal reads the platform's "hms" default palette at bootstrap and applies the
// tenant's own branding on top. This GET is public and is NOT an operator capability,
// so it stays here — only the writes (update / reset / logo / favicon upload) moved to
// the admin console, where `platform.branding.platform.manage` is held.

export async function getPlatformBranding(scope: PlatformBrandingScope): Promise<PlatformBranding> {
  return request<PlatformBranding>(`/public/branding/${scope}`);
}

// ---- Platform administration: MOVED (ADR-051) ------------------------------
// Tenant onboarding, module provisioning, platform analytics, support sessions and
// platform branding now live in the `admin` app on its own origin. They are gone from
// here on purpose: leaving the functions behind would keep shipping operator code in
// every hospital's bundle, which is the whole reason the frontends were split.
// The Portal keeps `/support/enter`, which RECEIVES a session the admin console mints.

/**
 * Liveness + readiness for the health tile. Deliberately tolerant: a failure here
 * is itself the signal, so it resolves to a status rather than throwing into the
 * shared error toast.
 */
export async function getSystemHealth(): Promise<{ api: boolean; db: boolean }> {
  const api = await request<{ status: string }>('/health').then(() => true).catch(() => false);
  const db = api
    ? await request<{ status: string }>('/health/ready').then(() => true).catch(() => false)
    : false;
  return { api, db };
}

// A rolling `days` count (legacy/fixed dashboards) or an explicit inclusive ISO
// `{ from, to }` window (the shared period filter). The backend honours from/to when
// both are present.
export async function getDashboardOverview(
  range: number | { from: string; to: string } = 14,
): Promise<DashboardOverview> {
  const qs = typeof range === "object" ? `from=${range.from}&to=${range.to}` : `days=${range}`;
  return request<DashboardOverview>(`/dashboard/overview?${qs}`);
}

/**
 * Why a refusal happened, for the panel that has to explain it (ADR-126).
 *
 * `feedback: false` — the screen is already showing the refusal in full; a toast on top of it
 * would report the same event twice (ADR-057).
 */
export async function explainAccess(permission: string): Promise<AccessExplanation> {
  return request<AccessExplanation>(`/rbac/access?permission=${encodeURIComponent(permission)}`, {
    feedback: false,
  });
}

export async function getOrgSummary(): Promise<OrgSummary> {
  return request<OrgSummary>("/dashboard/summary");
}

// ---- Patients --------------------------------------------------------------

export async function listPatients(
  page = 1,
  pageSize = 20,
  search?: string,
  filters?: Record<string, string[]>,
  registered?: { from: string | null; to: string | null },
): Promise<Paginated<Patient>> {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) q.set("search", search);
  // Faceted filters travel as comma-separated values (ADR-063); the API splits them.
  if (filters) {
    for (const [key, values] of Object.entries(filters)) {
      if (values.length) q.set(key, values.join(","));
    }
  }
  if (registered?.from) q.set("registeredFrom", registered.from);
  if (registered?.to) q.set("registeredTo", registered.to);
  return request<Paginated<Patient>>(`/patients?${q.toString()}`);
}

export async function createPatient(body: CreatePatientRequest): Promise<Patient> {
  return request<Patient>("/patients", { method: "POST", body, feedback: { success: "Patient registered." } });
}

export async function getPatient(id: string): Promise<Patient> {
  return request<Patient>(`/patients/${id}`);
}

export async function updatePatient(id: string, patch: Partial<CreatePatientRequest> & { status?: string }): Promise<Patient> {
  return request<Patient>(`/patients/${id}`, { method: "PATCH", body: patch, feedback: { success: "Patient updated." } });
}

// ---- Appointments ----------------------------------------------------------

export async function listAppointments(
  opts: { page?: number; pageSize?: number; from?: string; to?: string; status?: string; patientId?: string } = {},
): Promise<Paginated<Appointment>> {
  const q = new URLSearchParams();
  q.set("page", String(opts.page ?? 1));
  q.set("pageSize", String(opts.pageSize ?? 20));
  if (opts.from) q.set("from", opts.from);
  if (opts.to) q.set("to", opts.to);
  if (opts.status) q.set("status", opts.status);
  if (opts.patientId) q.set("patientId", opts.patientId);
  return request<Paginated<Appointment>>(`/appointments?${q.toString()}`);
}

export async function bookAppointment(body: BookAppointmentRequest): Promise<{ id: string; status: string }> {
  return request<{ id: string; status: string }>("/appointments", { method: "POST", body, feedback: { success: "Appointment booked." } });
}

export async function cancelAppointment(id: string, reason?: string): Promise<{ id: string; status: string }> {
  return request<{ id: string; status: string }>(`/appointments/${id}/cancel`, {
    method: "POST",
    body: { reason },
    feedback: { success: "Appointment cancelled." },
  });
}

// ---- OPD / visits (hms_backend/src/modules/opd) ----------------------------

export async function listVisits(
  opts: { date?: string; branchId?: string; providerId?: string; patientId?: string; status?: string; mine?: boolean } = {},
): Promise<Visit[]> {
  const q = new URLSearchParams();
  if (opts.date) q.set("date", opts.date);
  if (opts.branchId) q.set("branchId", opts.branchId);
  if (opts.providerId) q.set("providerId", opts.providerId);
  if (opts.patientId) q.set("patientId", opts.patientId);
  if (opts.status) q.set("status", opts.status);
  if (opts.mine) q.set("mine", "true");
  const qs = q.toString();
  return request<Visit[]>(`/visits${qs ? `?${qs}` : ""}`);
}

export async function getVisit(id: string): Promise<Visit> {
  return request<Visit>(`/visits/${id}`);
}

export async function checkIn(body: CheckInRequest): Promise<Visit> {
  return request<Visit>("/visits/check-in", { method: "POST", body, feedback: { success: "Patient checked in." } });
}

export async function updateVisitStatus(id: string, body: UpdateVisitStatusRequest): Promise<Visit> {
  return request<Visit>(`/visits/${id}/status`, { method: "PATCH", body, feedback: { success: "Visit updated." } });
}

// ---- Self check-in arrivals (hms_backend/src/modules/organization) ---------

export async function listArrivals(status?: string): Promise<SelfCheckinRequest[]> {
  const q = status ? `?status=${status}` : "";
  return request<SelfCheckinRequest[]>(`/self-check-ins${q}`);
}

export async function confirmArrival(id: string, version: number): Promise<SelfCheckinRequest> {
  return request<SelfCheckinRequest>(`/self-check-ins/${id}/confirm`, {
    method: "POST",
    body: { version },
    feedback: { success: "Patient checked in." },
  });
}

export async function dismissArrival(id: string, version: number, reason: string): Promise<SelfCheckinRequest> {
  return request<SelfCheckinRequest>(`/self-check-ins/${id}/dismiss`, {
    method: "POST",
    body: { version, reason },
    feedback: { success: "Arrival cleared." },
  });
}

export async function getSelfCheckinSettings(): Promise<SelfCheckinSettings> {
  return request<SelfCheckinSettings>("/self-check-in-settings");
}

export async function setSelfCheckinEnabled(enabled: boolean): Promise<SelfCheckinSettings> {
  return request<SelfCheckinSettings>("/self-check-in-settings", {
    method: "PUT",
    body: { enabled },
    feedback: { success: enabled ? "Self check-in is on." : "Self check-in is off." },
  });
}

export async function regenerateSelfCheckinToken(): Promise<SelfCheckinSettings> {
  return request<SelfCheckinSettings>("/self-check-in-settings/regenerate", {
    method: "POST",
    feedback: { success: "A new check-in link has been created. The old one no longer works." },
  });
}

// ---- Consultation fee schedule (hms_backend/src/modules/billing) -----------

export async function listFeeRules(includeInactive = false): Promise<ConsultationFeeRule[]> {
  const q = includeInactive ? "?includeInactive=true" : "";
  return request<ConsultationFeeRule[]>(`/fee-rules${q}`);
}

/**
 * What check-in would charge for this combination. Called as the desk picks the doctor, so the
 * fee is quoted from the price list rather than remembered.
 */
export async function previewConsultationFee(opts: {
  providerId?: string;
  departmentId?: string;
  arrivalType?: string;
  consultationType?: string;
  /** From the selected case, not typed by the desk — the server prices from the case either way. */
  caseType?: string;
  branchId?: string;
}): Promise<ResolvedConsultationFee> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) if (v) q.set(k, v);
  const qs = q.toString();
  // A preview is a read the desk triggers on every keystroke-ish change; a toast on failure would
  // be noise, and the form falls back to showing no calculated fee.
  return request<ResolvedConsultationFee>(`/fee-rules/preview${qs ? `?${qs}` : ""}`, { feedback: false });
}

export async function createFeeRule(body: CreateFeeRuleRequest): Promise<ConsultationFeeRule> {
  return request<ConsultationFeeRule>("/fee-rules", { method: "POST", body, feedback: { success: "Fee rule added." } });
}

export async function updateFeeRule(id: string, body: UpdateFeeRuleRequest): Promise<ConsultationFeeRule> {
  return request<ConsultationFeeRule>(`/fee-rules/${id}`, {
    method: "PATCH",
    body,
    feedback: { success: "Fee rule updated." },
  });
}

// ---- ABDM consent status (hms_backend/src/modules/abdm) --------------------

/**
 * States and counts only. A 403 here means this hospital is not entitled to external history,
 * which the caller treats as "nothing to show" rather than an error worth a toast.
 */
export async function getConsentStatus(patientId: string): Promise<AbdmConsentStatus> {
  return request<AbdmConsentStatus>(`/abdm/history/${patientId}/consent-status`, { feedback: false });
}

// ---- Patient documents (hms_backend/src/modules/patient) -------------------

/**
 * A short-lived signed URL for a stored file. The URL expires, which is why it is fetched at the
 * moment of opening rather than rendered into every row.
 */
export async function getFileDownloadUrl(fileId: string): Promise<string> {
  const res = await request<{ downloadUrl: string }>(`/files/${fileId}`, { feedback: false });
  return res.downloadUrl;
}

export async function listPatientDocuments(
  patientId: string,
  opts: { caseId?: string; includeArchived?: boolean } = {},
): Promise<PatientDocument[]> {
  const q = new URLSearchParams();
  if (opts.caseId) q.set("caseId", opts.caseId);
  if (opts.includeArchived) q.set("includeArchived", "true");
  const qs = q.toString();
  return request<PatientDocument[]>(`/patients/${patientId}/documents${qs ? `?${qs}` : ""}`);
}

/**
 * Two steps on purpose: the bytes go through the ordinary file store (one set of type and size
 * checks, one optimizer), and the second call records what the file is about.
 */
export async function attachPatientDocument(
  patientId: string,
  file: File,
  meta: Omit<AttachDocumentRequest, "fileId">,
): Promise<PatientDocument> {
  const uploaded = await uploadFile(file, "documents");
  return request<PatientDocument>(`/patients/${patientId}/documents`, {
    method: "POST",
    body: { ...meta, fileId: uploaded.id },
    feedback: { success: "Document attached." },
  });
}

export async function archivePatientDocument(
  patientId: string,
  documentId: string,
  version: number,
  reason: string,
): Promise<PatientDocument> {
  return request<PatientDocument>(`/patients/${patientId}/documents/${documentId}/archive`, {
    method: "POST",
    body: { version, reason },
    feedback: { success: "Document archived." },
  });
}

// ---- Treatment cases (hms_backend/src/modules/opd/case.service) ------------

export async function listCases(opts: { patientId?: string; status?: "open" | "closed" } = {}): Promise<PatientCase[]> {
  const q = new URLSearchParams();
  if (opts.patientId) q.set("patientId", opts.patientId);
  if (opts.status) q.set("status", opts.status);
  const qs = q.toString();
  return request<PatientCase[]>(`/cases${qs ? `?${qs}` : ""}`);
}

export async function getCase(id: string): Promise<PatientCase> {
  return request<PatientCase>(`/cases/${id}`);
}

export async function openCase(body: OpenCaseRequest): Promise<PatientCase> {
  return request<PatientCase>("/cases", { method: "POST", body, feedback: { success: "Case opened." } });
}

export async function updateCase(id: string, body: UpdateCaseRequest): Promise<PatientCase> {
  return request<PatientCase>(`/cases/${id}`, { method: "PATCH", body, feedback: { success: "Case updated." } });
}

export async function closeCase(id: string, body: CloseCaseRequest): Promise<PatientCase> {
  return request<PatientCase>(`/cases/${id}/close`, { method: "POST", body, feedback: { success: "Case closed." } });
}

export async function reopenCase(id: string, version: number): Promise<PatientCase> {
  return request<PatientCase>(`/cases/${id}/reopen`, {
    method: "POST",
    body: { version },
    feedback: { success: "Case reopened." },
  });
}

// ---- Workflow configuration & vitals (hms_backend/src/modules/workflow) ----

/** Omit `branchId` for the organization-wide scope, which is a real scope rather than a default. */
/**
 * How this hospital runs (ADR-113) — read by the check-in form, the vitals queue, the cases block
 * and the fee schedule to know which fields to render.
 *
 * `feedback: false` (ADR-057, ADR-129): every caller already treats a failure as "use the platform
 * defaults", which is the behaviour a hospital that has configured nothing gets anyway. A hospital
 * that denies this key on one account should see that account's check-in form fall back, not a
 * *Not permitted* toast on every page load next to a form that works.
 */
export async function getWorkflowConfig(branchId?: string | null): Promise<HospitalWorkflowConfig> {
  const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return request<HospitalWorkflowConfig>(`/workflow-config${q}`, { feedback: false });
}

export async function updateWorkflowConfig(
  branchId: string | null,
  body: UpdateHospitalWorkflowConfigRequest,
): Promise<HospitalWorkflowConfig> {
  const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return request<HospitalWorkflowConfig>(`/workflow-config${q}`, {
    method: "PUT",
    body,
    feedback: { success: "Workflow settings saved." },
  });
}

export async function recordVitals(body: RecordVitalsRequest): Promise<VitalsRecord> {
  return request<VitalsRecord>("/vitals", { method: "POST", body, feedback: { success: "Vitals recorded." } });
}

export async function listVisitVitals(visitId: string): Promise<VitalsRecord[]> {
  return request<VitalsRecord[]>(`/visits/${visitId}/vitals`);
}

export async function listVitalsQueue(opts: { branchId?: string; pending?: boolean } = {}): Promise<VitalsQueueEntry[]> {
  const q = new URLSearchParams();
  if (opts.branchId) q.set("branchId", opts.branchId);
  if (opts.pending) q.set("pending", "true");
  const qs = q.toString();
  return request<VitalsQueueEntry[]>(`/vitals/queue${qs ? `?${qs}` : ""}`);
}

// ---- Billing (hms_backend/src/modules/billing) -----------------------------

export async function listInvoices(
  opts: {
    page?: number;
    pageSize?: number;
    patientId?: string;
    status?: string;
    /** Invoice-total range in paise (ADR-063). */
    amountFrom?: number;
    amountTo?: number;
  } = {},
): Promise<Paginated<InvoiceListItem>> {
  const q = new URLSearchParams();
  q.set("page", String(opts.page ?? 1));
  q.set("pageSize", String(opts.pageSize ?? 20));
  if (opts.patientId) q.set("patientId", opts.patientId);
  if (opts.status) q.set("status", opts.status);
  if (opts.amountFrom !== undefined) q.set("amountFrom", String(opts.amountFrom));
  if (opts.amountTo !== undefined) q.set("amountTo", String(opts.amountTo));
  return request<Paginated<InvoiceListItem>>(`/invoices?${q.toString()}`);
}

export async function getInvoice(id: string): Promise<Invoice> {
  return request<Invoice>(`/invoices/${id}`);
}

export async function recordPayment(id: string, body: RecordPaymentRequest): Promise<Invoice> {
  return request<Invoice>(`/invoices/${id}/payments`, { method: "POST", body, feedback: { success: "Payment recorded." } });
}

export async function createInvoice(body: CreateInvoiceRequest): Promise<Invoice> {
  return request<Invoice>("/invoices", { method: "POST", body, feedback: { success: "Invoice created." } });
}

export async function addInvoiceLine(invoiceId: string, body: AddInvoiceLineRequest): Promise<Invoice> {
  return request<Invoice>(`/invoices/${invoiceId}/lines`, { method: "POST", body, feedback: { success: "Item added to the bill." } });
}

// ---- Services catalogue (ADR-067) -------------------------------------------

export async function listServices(opts: { activeOnly?: boolean; search?: string } = {}): Promise<Service[]> {
  const q = new URLSearchParams();
  if (opts.activeOnly) q.set("activeOnly", "true");
  if (opts.search) q.set("search", opts.search);
  const qs = q.toString();
  return request<Service[]>(`/services${qs ? `?${qs}` : ""}`);
}

export async function createService(body: CreateServiceRequest): Promise<Service> {
  return request<Service>("/services", { method: "POST", body, feedback: { success: "Service added." } });
}

export async function updateService(id: string, patch: UpdateServiceRequest): Promise<Service> {
  return request<Service>(`/services/${id}`, { method: "PATCH", body: patch, feedback: { success: "Service updated." } });
}

// ---- Referrals (ADR-068) -----------------------------------------------------

export async function listReferrals(opts: { status?: string; toDepartmentId?: string; patientId?: string } = {}): Promise<Referral[]> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.toDepartmentId) q.set("toDepartmentId", opts.toDepartmentId);
  if (opts.patientId) q.set("patientId", opts.patientId);
  const qs = q.toString();
  return request<Referral[]>(`/referrals${qs ? `?${qs}` : ""}`);
}

export async function createReferral(body: CreateReferralRequest): Promise<Referral> {
  return request<Referral>("/referrals", { method: "POST", body, feedback: { success: "Referral created." } });
}

export async function cancelReferral(id: string): Promise<Referral> {
  return request<Referral>(`/referrals/${id}/cancel`, { method: "POST", feedback: { success: "Referral cancelled." } });
}

// ---- Provider roster + slots (ADR-069) ----------------------------------------

export async function listProviderSchedules(providerId: string): Promise<ScheduleWindow[]> {
  return (await request<{ windows: ScheduleWindow[] }>(`/providers/${providerId}/schedules`)).windows;
}

export async function setProviderSchedules(providerId: string, windows: ScheduleWindow[]): Promise<ScheduleWindow[]> {
  return (
    await request<{ windows: ScheduleWindow[] }>(`/providers/${providerId}/schedules`, {
      method: "PUT",
      body: { windows },
      feedback: { success: "Schedule saved." },
    })
  ).windows;
}

export async function listProviderSlots(providerId: string, date: string): Promise<FreeSlots> {
  return request<FreeSlots>(`/providers/${providerId}/slots?date=${date}`);
}

// ---- Online booking requests (ADR-069) ----------------------------------------

export async function getBookingSettings(): Promise<BookingSettings> {
  return request<BookingSettings>("/organization/booking");
}

export async function setOnlineBooking(enabled: boolean): Promise<BookingSettings> {
  return request<BookingSettings>("/organization/booking", {
    method: "PUT",
    body: { enabled },
    feedback: { success: enabled ? "Online booking is on." : "Online booking is off." },
  });
}

export async function regenerateBookingToken(): Promise<BookingSettings> {
  return request<BookingSettings>("/organization/booking/regenerate", {
    method: "POST",
    feedback: { success: "New booking QR issued. Printed posters no longer work." },
  });
}

export async function listBookingRequests(status = "pending"): Promise<BookingRequestItem[]> {
  return (await request<{ requests: BookingRequestItem[] }>(`/booking-requests?status=${status}`)).requests;
}

export async function approveBookingRequest(id: string, body: ApproveBookingRequest): Promise<{ appointmentId: string; patientId: string }> {
  return request<{ appointmentId: string; patientId: string }>(`/booking-requests/${id}/approve`, {
    method: "POST",
    body,
    feedback: { success: "Appointment booked." },
  });
}

export async function rejectBookingRequest(id: string, reason?: string): Promise<void> {
  await request<void>(`/booking-requests/${id}/reject`, { method: "POST", body: { reason }, feedback: { success: "Request rejected." } });
}

// ---- Suppliers + stock corrections (ADR-070) -----------------------------------

export async function listSuppliers(): Promise<Supplier[]> {
  return request<Supplier[]>("/suppliers");
}

export async function createSupplier(body: CreateSupplierRequest): Promise<Supplier> {
  return request<Supplier>("/suppliers", { method: "POST", body, feedback: { success: "Supplier added." } });
}

export async function updateSupplier(id: string, patch: Partial<CreateSupplierRequest> & { isActive?: boolean }): Promise<Supplier> {
  return request<Supplier>(`/suppliers/${id}`, { method: "PATCH", body: patch, feedback: { success: "Supplier updated." } });
}

export async function adjustStock(drugId: string, body: { batchId?: string | null; delta: number; reason: string }): Promise<Drug> {
  return request<Drug>(`/drugs/${drugId}/adjust`, { method: "POST", body, feedback: { success: "Stock corrected." } });
}

export async function listStockAdjustments(drugId?: string): Promise<StockAdjustment[]> {
  const q = drugId ? `?drugId=${drugId}` : "";
  return request<StockAdjustment[]>(`/stock-adjustments${q}`);
}

// ---- Lab verification + attachment (ADR-070) ------------------------------------

export async function verifyLabResult(id: string): Promise<LabOrder> {
  return request<LabOrder>(`/lab-orders/${id}/verify`, { method: "POST", feedback: { success: "Report verified." } });
}

export async function getLabReportAttachment(id: string): Promise<string | null> {
  return (await request<{ url: string | null }>(`/lab-orders/${id}/attachment`)).url;
}

/**
 * Upload a file (multipart) through the file module; returns its id for attaching.
 * `category` folders the object in storage (e.g. "lab-reports"); the server whitelists it.
 */
export async function uploadFile(file: File, category?: string): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  const token = client.getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const path = category ? `/files?category=${encodeURIComponent(category)}` : "/files";
  const res = await send(path, { method: "POST", headers, credentials: "include", body: form });
  if (!res.ok) {
    const failure = await parseError(res);
    notifyError(failure);
    throw failure;
  }
  return (await res.json()) as { id: string };
}

// ---- AI assist (ADR-070) --------------------------------------------------------

export async function aiCapabilities(): Promise<AiCapabilities> {
  return request<AiCapabilities>("/ai/capabilities");
}

export async function aiPrescriptionDraft(body: AiDraftRequest): Promise<AiDraftResponse> {
  return request<AiDraftResponse>("/ai/prescription-draft", {
    method: "POST",
    body,
    feedback: { success: "Draft ready. Review every line before saving." },
  });
}

/** The visit's encounter, read-only (what the printed prescription loads). */
export async function getVisitEncounter(visitId: string): Promise<Encounter> {
  return request<Encounter>(`/visits/${visitId}/encounter`);
}

// ---- EMR / Clinical Workflow (hms_backend/src/modules/emr) ------------------

export async function openEncounter(visitId: string): Promise<Encounter> {
  return request<Encounter>("/encounters/open", { method: "POST", body: { visitId }, feedback: { success: false } });
}

export async function saveEncounter(id: string, body: SaveEncounterRequest): Promise<Encounter> {
  return request<Encounter>(`/encounters/${id}`, { method: "PUT", body, feedback: { success: "Consultation saved." } });
}

export async function signEncounter(id: string): Promise<Encounter> {
  return request<Encounter>(`/encounters/${id}/sign`, { method: "POST", feedback: { success: "Consultation signed." } });
}

/** Reopen a signed consultation for correction (ADR-134) — `emr.encounter.amend`. */
export async function amendEncounter(id: string, body: AmendEncounterRequest): Promise<Encounter> {
  return request<Encounter>(`/encounters/${id}/amend`, {
    method: "POST",
    body,
    feedback: { success: "Consultation reopened for amendment." },
  });
}

export async function cancelEncounterAmendment(id: string): Promise<Encounter> {
  return request<Encounter>(`/encounters/${id}/amend/cancel`, {
    method: "POST",
    feedback: { success: "Amendment discarded; the consultation is signed again." },
  });
}

export async function searchIcd10(q: string): Promise<Icd10Code[]> {
  return request<Icd10Code[]>(`/icd10?q=${encodeURIComponent(q)}`);
}

/** Read-only chart view — never creates a draft (that is `openEncounter`'s job). */
export async function getEncounter(id: string): Promise<Encounter> {
  return request<Encounter>(`/encounters/${id}`);
}

/** A patient's clinical history: signed encounters, newest first. */
export async function listPatientEncounters(patientId: string): Promise<EncounterSummary[]> {
  return request<EncounterSummary[]>(`/patients/${patientId}/encounters`);
}

// ---- Pharmacy (hms_backend/src/modules/pharmacy) ---------------------------

export async function listDrugs(search?: string): Promise<Drug[]> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<Drug[]>(`/drugs${q}`);
}

export async function createDrug(body: CreateDrugRequest): Promise<Drug> {
  return request<Drug>("/drugs", { method: "POST", body, feedback: { success: "Drug added." } });
}

export async function receiveStock(drugId: string, body: ReceiveStockRequest): Promise<Drug> {
  return request<Drug>(`/drugs/${drugId}/stock`, { method: "POST", body, feedback: { success: "Stock received." } });
}

export async function listPendingPrescriptions(): Promise<PendingPrescription[]> {
  return request<PendingPrescription[]>("/prescriptions/pending");
}

export async function dispense(body: DispenseRequest): Promise<DispenseResult> {
  return request<DispenseResult>("/dispense", {
    method: "POST",
    body,
    feedback: {
      success: (r: DispenseResult) =>
        `Dispensed ${r.drugName} × ${r.quantity} · ${formatPaise(r.totalPaise)} added to the bill.`,
    },
  });
}

// ---- Laboratory (hms_backend/src/modules/laboratory) -----------------------

export async function listLabTests(search?: string): Promise<LabTest[]> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<LabTest[]>(`/lab-tests${q}`);
}

export async function createLabTest(body: CreateLabTestRequest): Promise<LabTest> {
  return request<LabTest>("/lab-tests", { method: "POST", body, feedback: { success: "Lab test added." } });
}

export async function listLabOrders(status?: string, patientId?: string): Promise<LabOrder[]> {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (patientId) q.set("patientId", patientId);
  const qs = q.toString();
  return request<LabOrder[]>(`/lab-orders${qs ? `?${qs}` : ""}`);
}

export async function getLabOrder(id: string): Promise<LabOrder> {
  return request<LabOrder>(`/lab-orders/${id}`);
}

export async function collectLabSample(id: string): Promise<LabOrder> {
  return request<LabOrder>(`/lab-orders/${id}/collect`, { method: "POST", feedback: { success: "Sample marked collected." } });
}

export async function enterLabResult(id: string, body: EnterResultRequest): Promise<LabOrder> {
  return request<LabOrder>(`/lab-orders/${id}/result`, { method: "POST", body, feedback: { success: "Result saved." } });
}

// ---- Reports (hms_backend/src/modules/reports) -----------------------------

export async function reportOpdRegister(from: string, to: string): Promise<OpdRegisterRow[]> {
  return request<OpdRegisterRow[]>(`/reports/opd-register?from=${from}&to=${to}`);
}

export async function reportCollections(from: string, to: string): Promise<CollectionsReport> {
  return request<CollectionsReport>(`/reports/collections?from=${from}&to=${to}`);
}

export async function reportPendingLabs(): Promise<PendingLabRow[]> {
  return request<PendingLabRow[]>("/reports/pending-labs");
}

// ---- Org-Admin: users & branches -------------------------------------------

export async function listUsers(): Promise<UserListItem[]> {
  return (await request<{ users: UserListItem[] }>("/users")).users;
}

export async function createUser(body: CreateUserRequest): Promise<{ id: string; tempPassword: string | null }> {
  return request<{ id: string; tempPassword: string | null }>("/users", {
    method: "POST",
    body,
    feedback: { success: "User created." },
  });
}

export async function getUser(id: string): Promise<UserDetail> {
  return request<UserDetail>(`/users/${id}`);
}

export async function updateUser(id: string, patch: { status?: string; fullName?: string }): Promise<void> {
  await request(`/users/${id}`, { method: "PATCH", body: patch, feedback: { success: "User updated." } });
}

export async function assignUserRole(id: string, roleKey: string): Promise<void> {
  await request(`/users/${id}/roles`, { method: "POST", body: { roleKey }, feedback: { success: "Role assigned." } });
}

export async function removeUserRole(id: string, roleKey: string): Promise<void> {
  await request(`/users/${id}/roles/${roleKey}`, { method: "DELETE", feedback: { success: "Role removed." } });
}

export async function addUserOverride(
  id: string,
  body: { permission: string; effect: "GRANT" | "DENY"; validUntil?: string },
): Promise<void> {
  await request(`/users/${id}/overrides`, { method: "POST", body, feedback: { success: "Override added." } });
}

export async function revokeUserOverride(id: string, overrideId: string): Promise<void> {
  await request(`/users/${id}/overrides/${overrideId}`, { method: "DELETE", feedback: { success: "Override revoked." } });
}

export async function listBranches(): Promise<Branch[]> {
  return (await request<{ branches: Branch[] }>("/branches")).branches;
}

export async function createBranch(body: { code: string; name: string }): Promise<Branch> {
  return request<Branch>("/branches", { method: "POST", body, feedback: { success: "Branch created." } });
}

export async function updateBranch(id: string, patch: { name?: string; isActive?: boolean }): Promise<Branch> {
  return request<Branch>(`/branches/${id}`, { method: "PATCH", body: patch, feedback: { success: "Branch updated." } });
}

// ---- Departments (ADR-050) -------------------------------------------------

export async function listDepartments(opts: { activeOnly?: boolean; branchId?: string } = {}): Promise<Department[]> {
  const q = new URLSearchParams();
  if (opts.activeOnly) q.set("activeOnly", "true");
  if (opts.branchId) q.set("branchId", opts.branchId);
  const qs = q.toString();
  return (await request<{ departments: Department[] }>(`/departments${qs ? `?${qs}` : ""}`)).departments;
}

export async function createDepartment(body: CreateDepartmentRequest): Promise<Department> {
  return request<Department>("/departments", { method: "POST", body, feedback: { success: "Department created." } });
}

export async function updateDepartment(id: string, patch: UpdateDepartmentRequest): Promise<Department> {
  return request<Department>(`/departments/${id}`, {
    method: "PATCH",
    body: patch,
    feedback: { success: "Department updated." },
  });
}

// ---- Organization profile + Hospital Setup (ADR-049) -----------------------

export async function getOrganizationProfile(): Promise<OrganizationProfile> {
  return request<OrganizationProfile>("/organization/profile");
}

export async function updateOrganizationProfile(
  patch: UpdateOrganizationProfileRequest,
): Promise<OrganizationProfile> {
  return request<OrganizationProfile>("/organization/profile", {
    method: "PUT",
    body: patch,
    feedback: { success: "Hospital information saved." },
  });
}

/**
 * Upload the letterhead image (multipart). Returns the updated profile with the new
 * short-lived `letterheadImageUrl` (ADR-065). Same shape as `uploadBrandingAsset`.
 */
export async function uploadLetterheadImage(file: File): Promise<OrganizationProfile> {
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  const token = client.getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await send("/organization/profile/letterhead-image", {
    method: "POST",
    headers,
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const failure = await parseError(res);
    notifyError(failure);
    throw failure;
  }
  const profile = (await res.json()) as OrganizationProfile;
  notifySuccess("Letterhead image updated.");
  return profile;
}

/** Remove the configured letterhead image; documents fall back to the text header. */
export async function removeLetterheadImage(): Promise<OrganizationProfile> {
  return request<OrganizationProfile>("/organization/profile/letterhead-image", {
    method: "DELETE",
    feedback: { success: "Letterhead image removed." },
  });
}

/** How far this hospital's configuration has got. Derived server-side from real data. */
export async function getSetupStatus(): Promise<SetupStatus> {
  return request<SetupStatus>("/setup/status");
}

/** The modules this hospital is entitled to. Granted by Nirogix, read-only here. */
export async function listMyModules(): Promise<string[]> {
  return (await request<{ modules: string[] }>("/entitlements")).modules;
}

// ---- Tenant branding -------------------------------------------------------

export async function getCurrentBranding(): Promise<Branding> {
  return request<Branding>("/branding/current");
}

export async function updateBranding(patch: {
  brandColor?: string | null;
  secondaryColor?: string | null;
}): Promise<Branding> {
  return request<Branding>("/branding", { method: "PUT", body: patch, feedback: { success: "Branding saved." } });
}

export async function resetBranding(): Promise<Branding> {
  return request<Branding>("/branding", { method: "DELETE", feedback: { success: "Branding reset to the default." } });
}

/** Upload a logo/favicon (multipart). Returns the updated branding (with the new asset URL). */
export async function uploadBrandingAsset(kind: "logo" | "favicon", file: File): Promise<Branding> {
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  const token = client.getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await send(`/branding/${kind}`, { method: "POST", headers, credentials: "include", body: form });
  if (!res.ok) {
    const failure = await parseError(res);
    notifyError(failure);
    throw failure;
  }
  const branding = (await res.json()) as Branding;
  notifySuccess(kind === "logo" ? "Logo updated." : "Favicon updated.");
  return branding;
}

// ---- Catalog / system master data (hms_backend/src/modules/catalog) — ADR-072 ----

export type CatalogCategory = "lab_test" | "drug" | "service" | "vaccine" | "department";

export interface CatalogItem {
  /** `system` = global seeded item; `custom` = this hospital's own. */
  source: "system" | "custom";
  code: string;
  name: string;
  attributes: Record<string, string | number | boolean | null>;
}

/** Merged, searchable catalogue for a category: system items first, then this hospital's custom ones. */
export async function getCatalog(category: CatalogCategory, q?: string): Promise<CatalogItem[]> {
  const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return request<CatalogItem[]>(`/catalog/${category}${qs}`);
}

/** Add a hospital-specific custom vaccine to the picker. */
export async function createCustomVaccine(
  name: string,
  attributes?: Record<string, string>,
): Promise<CatalogItem> {
  return request<CatalogItem>(`/catalog/vaccine/custom`, {
    method: "POST",
    body: { name, attributes },
    feedback: { success: "Custom vaccine added." },
  });
}

// ---- Immunisations (hms_backend/src/modules/immunization) — ADR-072 consumer ----

export interface Immunization {
  id: string;
  vaccineCode: string;
  vaccineName: string;
  source: "system" | "custom";
  dateGiven: string;
  doseLabel: string | null;
  notes: string | null;
  createdAt: string;
}

export interface RecordImmunizationRequest {
  vaccineCode: string;
  vaccineName: string;
  source?: "system" | "custom";
  dateGiven: string;
  doseLabel?: string | null;
  notes?: string | null;
}

export async function listImmunizations(patientId: string): Promise<Immunization[]> {
  return request<Immunization[]>(`/patients/${patientId}/immunizations`);
}

export async function recordImmunization(
  patientId: string,
  body: RecordImmunizationRequest,
): Promise<Immunization> {
  return request<Immunization>(`/patients/${patientId}/immunizations`, {
    method: "POST",
    body,
    feedback: { success: "Immunisation recorded." },
  });
}

// ---- Per-hospital availability (hms_backend/src/modules/catalog) — ADR-073 ----

export type AvailabilityItemType = "drug" | "lab_test" | "service" | "vaccine";

export interface BranchAvailabilityOverride {
  branchId: string;
  itemType: AvailabilityItemType;
  itemRef: string;
  isAvailable: boolean;
  priceOverridePaise: number | null;
}

/** The per-branch override rows for a hospital (only the items that have been overridden). */
export async function getBranchAvailability(
  branchId: string,
  itemType?: AvailabilityItemType,
): Promise<BranchAvailabilityOverride[]> {
  const q = new URLSearchParams({ branchId });
  if (itemType) q.set("itemType", itemType);
  return request<BranchAvailabilityOverride[]>(`/branch-availability?${q.toString()}`);
}

export interface AvailabilityItem {
  ref: string;
  name: string;
  detail: string;
  isAvailable: boolean;
  priceOverridePaise: number | null;
}

/** The org's items of a type with their availability at one hospital — the config screen's list. */
export async function getAvailabilityItems(
  branchId: string,
  itemType: AvailabilityItemType,
): Promise<AvailabilityItem[]> {
  const q = new URLSearchParams({ branchId, itemType });
  return request<AvailabilityItem[]>(`/branch-availability/items?${q.toString()}`);
}

/** Enable/disable a master item for one hospital (and optionally override its price). */
export async function setBranchAvailability(body: {
  branchId: string;
  itemType: AvailabilityItemType;
  itemRef: string;
  isAvailable: boolean;
  priceOverridePaise?: number | null;
}): Promise<BranchAvailabilityOverride> {
  return request<BranchAvailabilityOverride>(`/branch-availability`, {
    method: "PUT",
    body,
    feedback: { success: "Availability updated." },
  });
}

// ---- ABDM / ABHA (Milestone 1, ADR-084) ------------------------------------
//
// Identity verification at the registration desk. Three things this client never handles: an
// ABDM token (they stay server-side), a stored Aadhaar number (it is sent on exactly one
// request and never comes back), and any decision about matching — the API returns the
// new-vs-returning outcome and the screen presents it.

/** What ABDM can do for this hospital right now — drives which options the screen offers. */
export async function getAbdmCapabilities(branchId?: string): Promise<AbdmCapabilities> {
  const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  // Silent: a hospital that is not entitled to the ABDM module answers 403 here, and that is a
  // normal state for most tenants — not something to raise a toast about on every page load.
  return request<AbdmCapabilities>(`/abdm/capabilities${q}`, { feedback: false });
}

/** Flow 1 — send the Aadhaar OTP. `consentGiven` must be true; the API refuses otherwise. */
export async function startAbhaAadhaarOtp(body: {
  aadhaar: string;
  consentGiven: true;
  branchId?: string;
}): Promise<AbdmOtpSent> {
  return request<AbdmOtpSent>("/abdm/enrolment/aadhaar/otp", {
    method: "POST",
    body,
    feedback: { success: "OTP sent to the Aadhaar-linked mobile." },
  });
}

export async function verifyAbhaAadhaarOtp(body: {
  transactionId: string;
  otp: string;
  mobile?: string;
}): Promise<AbhaVerificationResult> {
  return request<AbhaVerificationResult>("/abdm/enrolment/aadhaar/verify", { method: "POST", body });
}

/** The secondary check, when the patient's mobile differs from the Aadhaar-linked one. */
export async function requestAbhaMobileOtp(body: { transactionId: string; mobile: string }): Promise<AbdmOtpSent> {
  return request<AbdmOtpSent>("/abdm/enrolment/mobile/otp", {
    method: "POST",
    body,
    feedback: { success: "OTP sent to the mobile number." },
  });
}

export async function verifyAbhaMobileOtp(body: { transactionId: string; otp: string }): Promise<AbhaVerificationResult> {
  return request<AbhaVerificationResult>("/abdm/enrolment/mobile/verify", { method: "POST", body });
}

export async function suggestAbhaAddresses(transactionId: string): Promise<{ suggestions: string[] }> {
  return request<{ suggestions: string[] }>(`/abdm/transactions/${transactionId}/abha-address/suggestions`);
}

export async function createAbhaAddress(body: {
  transactionId: string;
  abhaAddress: string;
}): Promise<{ transactionId: string; abhaAddress: string }> {
  return request<{ transactionId: string; abhaAddress: string }>("/abdm/abha-address", {
    method: "POST",
    body,
    feedback: { success: "ABHA address created." },
  });
}

/** Flow 3 — verify an ABHA the patient already holds. */
export async function startAbhaVerification(body: {
  identifierType: AbhaIdentifierType;
  identifier: string;
  consentGiven: true;
  branchId?: string;
}): Promise<AbdmOtpSent> {
  return request<AbdmOtpSent>("/abdm/verification/otp", {
    method: "POST",
    body,
    feedback: { success: "OTP sent." },
  });
}

export async function verifyAbhaIdentifierOtp(body: {
  transactionId: string;
  otp: string;
}): Promise<AbhaVerificationResult> {
  return request<AbhaVerificationResult>("/abdm/verification/verify", { method: "POST", body });
}

/** One identifier can hold several ABHA accounts (a shared family mobile) — pick one. */
export async function selectAbhaAccount(body: {
  transactionId: string;
  abhaNumber: string;
}): Promise<AbhaVerificationResult> {
  return request<AbhaVerificationResult>("/abdm/verification/select-account", { method: "POST", body });
}

/** Flow 2 — profiles patients pushed by scanning the facility QR, waiting at the desk. */
export async function listAbdmPendingShares(): Promise<AbdmPendingShare[]> {
  // Polled while the QR is on screen, so it stays silent: a toast per poll would be unusable.
  return request<AbdmPendingShare[]>("/abdm/pending-shares", { feedback: false });
}

export async function getAbdmVerification(transactionId: string): Promise<AbhaVerificationResult> {
  return request<AbhaVerificationResult>(`/abdm/transactions/${transactionId}`);
}

export async function dismissAbdmVerification(transactionId: string): Promise<void> {
  // Silent: closing a verification the operator abandoned is not news.
  await request<void>(`/abdm/transactions/${transactionId}/dismiss`, { method: "POST", feedback: false });
}

/** Attach a verified ABHA to a chart. The only path that marks an ABHA as verified. */
export async function linkAbhaToPatient(body: { transactionId: string; patientId: string }): Promise<Patient> {
  return request<Patient>("/abdm/link", {
    method: "POST",
    body,
    feedback: { success: "ABHA linked to the patient record." },
  });
}

/** The hospital's own HFR facility registration (org_admin). */
export async function getAbdmFacility(branchId?: string): Promise<AbdmFacilityConfig | null> {
  const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return request<AbdmFacilityConfig | null>(`/abdm/facility${q}`);
}

export async function saveAbdmFacility(body: {
  hipId: string;
  facilityName?: string;
  qrContent?: string;
  scanShareEnabled?: boolean;
  branchId?: string;
}): Promise<AbdmFacilityConfig> {
  return request<AbdmFacilityConfig>("/abdm/facility", {
    method: "PUT",
    body,
    feedback: { success: "ABDM facility settings saved." },
  });
}

/**
 * Correct the patient's profile at ABDM. Writes to the national register, so it is gated by its
 * own permission and is not something the front desk can do unless the hospital grants it.
 */
export async function updateAbhaProfile(body: AbhaProfileUpdate): Promise<AbhaVerificationResult> {
  return request<AbhaVerificationResult>("/abdm/profile", {
    method: "PATCH",
    body,
    feedback: { success: "Profile updated at ABDM." },
  });
}

// --- ABDM Milestone 3: a patient's history from other hospitals (ADR-092…ADR-094) --------------

export interface AbdmHistoryRequest {
  id: string;
  patientId: string;
  consentRequestId: string | null;
  requesterName: string;
  requesterRegistrationNumber: string;
  hiTypes: string[];
  purposeCode: string;
  /** pending | requested | granted | denied | expired | failed */
  status: string;
  dataEraseAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface AbdmTimelineDetail {
  group: string;
  label: string;
  value: string;
  /** Set only when the SOURCE hospital flagged it — never our own inference. */
  emphasis?: "abnormal";
}

export interface AbdmTimelineEntry {
  id: string;
  date: string | null;
  hiType: string;
  sourceHipId: string | null;
  careContextReference: string | null;
  title: string;
  author: string | null;
  details: AbdmTimelineDetail[];
  hasAbnormalFinding: boolean;
  receivedAt: string;
}

export interface AbdmTimeline {
  summary: {
    total: number;
    sources: string[];
    byType: Record<string, number>;
    abnormalCount: number;
    earliest: string | null;
    latest: string | null;
  };
  entries: AbdmTimelineEntry[];
}

export async function requestAbdmHistory(body: { patientId: string; providerId: string }): Promise<AbdmHistoryRequest> {
  // The card raises its own message, which says what actually happens next ("the patient decides in
  // their own ABHA app"). The client's generic "Saved." alongside it would be two toasts for one
  // event, and the less informative one at that (ADR-057).
  return request<AbdmHistoryRequest>("/abdm/history/request", { method: "POST", body, feedback: false });
}

export async function listAbdmHistoryRequests(patientId: string): Promise<AbdmHistoryRequest[]> {
  // Polled while a request is outstanding, so it stays silent — a toast per poll would be unusable.
  const data = await request<{ requests: AbdmHistoryRequest[] }>(`/abdm/history/${patientId}`, { feedback: false });
  return data.requests;
}

export async function refreshAbdmHistoryRequest(requestId: string): Promise<AbdmHistoryRequest> {
  return request<AbdmHistoryRequest>(`/abdm/history/${requestId}/refresh`, { method: "POST", feedback: false });
}

export async function fetchAbdmExternalRecords(patientId: string): Promise<{ requested: number }> {
  // Same reason: the card's own message names how many hospitals were asked (ADR-057).
  return request<{ requested: number }>(`/abdm/history/${patientId}/fetch`, { method: "POST", feedback: false });
}

export async function getAbdmTimeline(patientId: string): Promise<AbdmTimeline> {
  // Silent: it reloads whenever a consent lands or records arrive, and a toast each time is noise.
  return request<AbdmTimeline>(`/abdm/history/${patientId}/timeline`, { feedback: false });
}

// --- ABDM Milestone 4: the national registries (ADR-096…ADR-098) ------------------------------

export interface AbdmFacilityRegistration {
  id: string;
  branchId: string | null;
  trackingId: string | null;
  facilityId: string | null;
  status: "draft" | "submitted" | "under_review" | "verified" | "rejected";
  statusMessage: string | null;
  facilityName: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  /** The whole form as last saved. HFR registration spans days, so a draft must reopen filled in. */
  payload: Record<string, unknown> | null;
}

export interface AbdmHprEnrolment {
  id: string;
  providerId: string;
  hprId: string | null;
  status: "not_started" | "aadhaar_verified" | "mobile_verified" | "registered" | "already_registered";
  statusMessage: string | null;
  professionalCategory: string | null;
  registrationCouncil: string | null;
  registrationNumber: string | null;
  lastSyncedAt: string | null;
}

export interface AbdmBulkExport {
  columns: string[];
  rows: Record<string, string>[];
}

export interface AbdmImportOutcome {
  matched: number;
  unmatched: Array<{ row: number; identifier: string; reason: string }>;
  ambiguous: Array<{ row: number; identifier: string; candidates: number }>;
}

export async function listAbdmFacilityRegistrations(): Promise<AbdmFacilityRegistration[]> {
  const data = await request<{ registrations: AbdmFacilityRegistration[] }>("/abdm/registry/facilities", {
    feedback: false,
  });
  return data.registrations;
}

export async function saveAbdmFacilityRegistration(
  body: Record<string, unknown>,
): Promise<AbdmFacilityRegistration> {
  return request<AbdmFacilityRegistration>("/abdm/registry/facility", { method: "PUT", body });
}

export async function submitAbdmFacilityRegistration(branchId?: string | null): Promise<AbdmFacilityRegistration> {
  // The page raises its own message, which says a verifier still has to look at it (ADR-057).
  return request<AbdmFacilityRegistration>("/abdm/registry/facility/submit", {
    method: "POST",
    body: { branchId: branchId ?? null },
    feedback: false,
  });
}

/**
 * Amends a facility HFR has already verified.
 *
 * A separate call from `saveAbdmFacilityRegistration`, which refuses once a registration is
 * verified: re-registering a building that already holds a Facility ID would give it a second
 * national identity, and the Facility ID is the `hipId` the rest of ABDM knows us by.
 */
export async function updateAbdmFacilityRegistration(
  body: Record<string, unknown>,
): Promise<AbdmFacilityRegistration> {
  // The page says what happened — "Sent to HFR", not "Saved." — because the two differ here.
  return request<AbdmFacilityRegistration>("/abdm/registry/facility/update", {
    method: "POST",
    body,
    feedback: false,
  });
}

/** One facility as HFR describes it. Every field but the id and name may be absent. */
export interface AbdmFacilitySearchHit {
  facilityId: string;
  facilityName: string;
  facilityStatus: string | null;
  ownership: string | null;
  facilityType: string | null;
  systemOfMedicine: string | null;
  address: string | null;
  stateName: string | null;
  districtName: string | null;
  subDistrictName: string | null;
  pincode: string | null;
}

export interface AbdmFacilitySearchResult {
  facilities: AbdmFacilitySearchHit[];
  total: number;
  pages: number;
  page: number;
}

export interface AbdmFacilitySearchParams {
  facilityName?: string;
  facilityId?: string;
  ownershipCode?: string;
  stateLGDCode?: string;
  districtLGDCode?: string;
  subDistrictLGDCode?: string;
  pincode?: string;
  page?: number;
  resultsPerPage?: number;
}

/**
 * Searches HFR for a facility that may already be listed.
 *
 * `feedback: false` because an empty result is the answer, not a failure — and it is the *good*
 * answer when somebody is checking that their hospital is not already registered.
 */
export async function searchAbdmFacilities(
  params: AbdmFacilitySearchParams,
): Promise<AbdmFacilitySearchResult> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") q.set(k, String(v));
  }
  return request<AbdmFacilitySearchResult>(`/abdm/registry/facility/search?${q}`, { feedback: false });
}

// --- HPR enrolment, one clinician at a time (ADR-097) -----------------------------------------
//
// Four calls in a fixed order, each one gating the next: check-and-start, Aadhaar OTP, mobile OTP,
// then the professional profile. The order is the registry's, not ours — an HPR ID is only minted
// once both identities are proven, which is why the wizard cannot let a step be skipped.

export async function startAbdmHprEnrolment(body: {
  providerId: string;
  aadhaar: string;
  category: "doctor" | "nurse" | "pharmacist";
}): Promise<AbdmHprEnrolment> {
  return request<AbdmHprEnrolment>("/abdm/registry/professional/start", { method: "POST", body, feedback: false });
}

export async function verifyAbdmHprAadhaarOtp(body: { providerId: string; otp: string }): Promise<AbdmHprEnrolment> {
  return request<AbdmHprEnrolment>("/abdm/registry/professional/aadhaar-otp", {
    method: "POST",
    body,
    feedback: false,
  });
}

export async function sendAbdmHprMobileOtp(body: { providerId: string; mobile: string }): Promise<void> {
  await request<void>("/abdm/registry/professional/mobile-otp/send", { method: "POST", body, feedback: false });
}

export async function verifyAbdmHprMobileOtp(body: { providerId: string; otp: string }): Promise<AbdmHprEnrolment> {
  return request<AbdmHprEnrolment>("/abdm/registry/professional/mobile-otp/verify", {
    method: "POST",
    body,
    feedback: false,
  });
}

export async function completeAbdmHprEnrolment(body: {
  providerId: string;
  email: string;
  firstName: string;
  lastName?: string;
  registrationCouncil: string;
  registrationNumber: string;
  systemOfMedicine?: string;
}): Promise<AbdmHprEnrolment> {
  return request<AbdmHprEnrolment>("/abdm/registry/professional/complete", {
    method: "POST",
    body,
    feedback: false,
  });
}

export async function listAbdmHprEnrolments(): Promise<AbdmHprEnrolment[]> {
  const data = await request<{ enrolments: AbdmHprEnrolment[] }>("/abdm/registry/professionals", { feedback: false });
  return data.enrolments;
}

/** One entry in a registry reference list, normalised to a shape a picker can render. */
export interface AbdmMasterOption {
  code: string;
  label: string;
}

/**
 * The registry's reference lists, normalised (HFR-014…038, ADR-096).
 *
 * HFR and HPR publish no schema for these, and the two registries disagree with each other about
 * key names — `code`/`value`, `id`/`name`, sometimes wrapped in `data`. Rather than guess one shape
 * and render an empty dropdown when it differs, this accepts the forms actually seen and falls back
 * to the raw string. An option that arrives unrecognisable shows its own value rather than blank,
 * because a picker with invisible entries is worse than an ugly one.
 */
function normaliseMasterList(raw: unknown): AbdmMasterOption[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown[] })?.data)
      ? (raw as { data: unknown[] }).data
      : Array.isArray((raw as { results?: unknown[] })?.results)
        ? (raw as { results: unknown[] }).results
        : [];

  return list
    .map((item): AbdmMasterOption | null => {
      // HFR returns fixed-width codes, space-padded — ownership comes back as `"P         "`.
      // Carrying that padding into the next request is fatal rather than untidy: the registry
      // validates `facilityType`'s ownershipCode against `^(?i)(G|P|PP)$`, which a padded value
      // fails, and the whole call 500s. Trimmed here, once, at the only place codes enter the app.
      if (typeof item === "string") return { code: item.trim(), label: item.trim() };
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const code = o.code ?? o.id ?? o.value ?? o.key ?? o.lgdCode;
      const label = o.value ?? o.name ?? o.label ?? o.text ?? o.title ?? code;
      if (code == null) return null;
      return { code: String(code).trim(), label: String(label ?? code).trim() };
    })
    .filter((o): o is AbdmMasterOption => o !== null);
}

export type AbdmFacilityMasterKind =
  | "states"
  | "districts"
  | "subDistricts"
  | "facilityType"
  | "facilitySubType"
  | "ownerSubtype"
  | "specialities"
  | "masterData"
  | "masterTypes";

/**
 * Reads one registry reference list.
 *
 * `code` scopes an LGD list to its parent and `type` selects which list `masterData` returns. The
 * rest are the named filters HFR's POST lists require — notably `facilityType`, which needs BOTH an
 * ownership and a system of medicine, so it can only be offered after those two are chosen.
 */
export interface AbdmFacilityMasterParams {
  code?: string;
  type?: string;
  ownershipCode?: string;
  systemOfMedicineCode?: string;
  facilityTypeCode?: string;
  ownerSubtypeCode?: string;
}

export async function abdmFacilityMaster(
  kind: AbdmFacilityMasterKind,
  params?: AbdmFacilityMasterParams,
): Promise<AbdmMasterOption[]> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
  const suffix = q.toString() ? `?${q}` : "";
  const raw = await request<unknown>(`/abdm/registry/master/${kind}${suffix}`, { feedback: false });
  return normaliseMasterList(raw);
}

export async function abdmHprMaster(kind: string): Promise<AbdmMasterOption[]> {
  const raw = await request<unknown>(`/abdm/registry/hpr-master/${kind}`, { feedback: false });
  return normaliseMasterList(raw);
}

/**
 * Records what a human verifier decided (ADR-096).
 *
 * HFR has no status webhook, so until it does an operator transcribes the outcome. `verified` also
 * adopts the issued facility id as our `hipId`, which is why it is a write and not a display state.
 */
export async function recordAbdmFacilityVerification(body: {
  branchId?: string | null;
  status: "under_review" | "verified" | "rejected";
  facilityId?: string;
  message?: string;
}): Promise<AbdmFacilityRegistration> {
  return request<AbdmFacilityRegistration>("/abdm/registry/facility/verification", { method: "POST", body });
}

export async function exportAbdmBulk(kind: "professionals" | "facilities"): Promise<AbdmBulkExport> {
  return request<AbdmBulkExport>(`/abdm/registry/bulk/${kind}`, { feedback: false });
}

export async function importAbdmBulk(
  kind: "professionals" | "facilities",
  rows: Record<string, string>[],
): Promise<AbdmImportOutcome> {
  // The page reports matched/unmatched/ambiguous itself; a generic "Saved." would say less.
  return request<AbdmImportOutcome>(`/abdm/registry/bulk/${kind}`, { method: "POST", body: { rows }, feedback: false });
}

// --- Consents other providers hold over our records (ADR-100) ---------------------------------

export interface AbdmHeldConsent {
  consentId: string;
  abhaAddress: string;
  hiuId: string | null;
  hipId: string | null;
  purposeCode: string | null;
  hiTypes: string[];
  accessMode: string | null;
  dateRangeFrom: string | null;
  dateRangeTo: string | null;
  dataEraseAt: string | null;
  grantedAt: string | null;
}

export interface AbdmConsentEvent {
  consentId: string;
  event: "granted" | "revoked" | "expired" | "erased";
  hiuId?: string;
  hiTypes?: string[];
  recordedAt: string;
}

export async function listAbdmConsents(): Promise<{ consents: AbdmHeldConsent[]; history: AbdmConsentEvent[] }> {
  return request<{ consents: AbdmHeldConsent[]; history: AbdmConsentEvent[] }>("/abdm/consents", { feedback: false });
}

/** Finds the patient an ABHA belongs to before a history is requested (HIU_FLOW_101). */
export async function lookupAbdmAbha(identifier: string): Promise<{
  outcome: "verified" | "unverified" | "not_found" | "ambiguous";
  patient?: { id: string; uhid: string; name: string; abhaAddress: string | null; abhaNumber: string | null };
  nextStep: string;
}> {
  return request(`/abdm/history/lookup/abha?identifier=${encodeURIComponent(identifier)}`, { feedback: false });
}

/** Resends the verification code, throttled server-side (CRT_ABHA_106). */
export async function resendAbdmOtp(body: {
  transactionId: string;
  aadhaar?: string;
  mobile?: string;
}): Promise<{ transactionId: string; mobileHint?: string; resendsLeft: number }> {
  return request("/abdm/otp/resend", { method: "POST", body });
}
