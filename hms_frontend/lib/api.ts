// The Nirogix Portal's endpoint surface (ADR-051, ADR-054).
//
// The HTTP core — access token in memory, the single in-flight refresh, the 401 retry,
// canonical error unwrapping and the one-notification-per-call rule (ADR-026) — lives
// in `@hms/client` and is shared by every frontend, so the security-relevant half
// cannot drift between apps. What stays here is this audience's endpoints: hospital
// staff. There is no platform-administration call in this file; those live in the
// admin console on its own origin.

import type {
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
  Invoice,
  InvoiceListItem,
  RecordPaymentRequest,
  Encounter,
  EncounterSummary,
  SaveEncounterRequest,
  Icd10Code,
  CreateProviderRequest,
  UpdateProviderRequest,
  AssignSpecialtyRequest,
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

export async function getDashboardOverview(days = 14): Promise<DashboardOverview> {
  return request<DashboardOverview>(`/dashboard/overview?days=${days}`);
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
