// The Portal's single HTTP client for the hms_backend API.
//
// - Access token is held in memory only (never localStorage) — on a full reload
//   the session is re-established from the httpOnly refresh cookie via /auth/refresh.
// - Every request sends `credentials: 'include'` so the refresh cookie flows, and
//   `Authorization: Bearer <token>` when authenticated.
// - A 401 triggers a single silent refresh + retry; if that fails the session is
//   considered expired and `onSessionExpired` fires so the AuthProvider can react.
// - The backend's canonical `{ error: { code, message } }` shape is unwrapped into
//   typed errors. Security is enforced server-side; the client only reflects it.
// - USER FEEDBACK LIVES HERE (ADR-026). Every failure, and every state-changing
//   call, raises exactly one notification through the shared @hms/ui toast via
//   lib/feedback.ts. Pages never write their own toast logic; a call opts out
//   with `feedback: false` (or tunes the copy with `success: "…"`) only where the
//   screen itself is the feedback (e.g. sign-in, which navigates).

import type {
  ApiError,
  LoginRequest,
  LoginResponse,
  MeResponse,
  MyPermissionsResponse,
  Provider,
  Specialty,
  AuditEntry,
  Paginated,
  Tenant,
  TenantDetail,
  ModuleCatalogItem,
  OnboardTenantRequest,
  OnboardTenantResponse,
  UserListItem,
  UserDetail,
  CreateUserRequest,
  Branch,
  Role,
  Branding,
  PlatformBranding,
  PlatformBrandingScope,
  BrandingTokens,
  PlatformStats,
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
  SaveEncounterRequest,
  Icd10Code,
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
import { ApiRequestError, NetworkError, TimeoutError } from "./apiErrors";
import { notifyError, notifySuccess, successMessage } from "./feedback";
import { formatPaise } from "./money";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}
export function setOnSessionExpired(cb: (() => void) | null): void {
  onSessionExpired = cb;
}

export { ApiRequestError, NetworkError, TimeoutError } from "./apiErrors";

/** Requests that outlive this are aborted and reported as a timeout, never left hanging. */
const REQUEST_TIMEOUT_MS = 30_000;

async function parseError(res: Response): Promise<ApiRequestError> {
  let code = "ERROR";
  let message = res.statusText || "Request failed";
  let details: unknown;
  try {
    const body = (await res.json()) as ApiError;
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    /* non-JSON body — keep the status text */
  }
  return new ApiRequestError(res.status, code, message, details);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Internal: prevents infinite refresh recursion. */
  _retry?: boolean;
  /** When false, a 401 is returned as an error without attempting a refresh. */
  refreshOn401?: boolean;
  /**
   * Notification control (ADR-026). Default: failures always notify; state-changing
   * methods also notify on success. `false` silences both (the screen is the
   * feedback); `{ success: "…" }` sets the fallback copy used when the API returns
   * no `message` of its own — a function builds that copy from the response;
   * `{ success: false }` keeps only the failure toast.
   */
  feedback?: false | { success?: string | false | ((payload: never) => string); error?: false };
}

/** Runs the fetch, converting a dead connection or a stalled request into typed errors. */
async function send(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new TimeoutError();
    throw new NetworkError("Network request failed", err);
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, _retry = false, refreshOn401 = true, feedback } = opts;
  const mutating = method !== "GET" && method !== "HEAD";

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await send(path, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (feedback !== false && feedback?.error !== false) notifyError(err);
    throw err;
  }

  if (res.status === 401 && refreshOn401 && !_retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...opts, _retry: true });
    if (onSessionExpired) onSessionExpired();
    const expired = await parseError(res);
    if (feedback !== false && feedback?.error !== false) notifyError(expired);
    throw expired;
  }

  if (!res.ok) {
    const failure = await parseError(res);
    if (feedback !== false && feedback?.error !== false) notifyError(failure);
    throw failure;
  }

  const payload = res.status === 204 ? (undefined as T) : ((await res.json()) as T);

  if (mutating && feedback !== false && feedback?.success !== false) {
    notifySuccess(successMessage(payload, feedback?.success, method));
  }

  return payload;
}

// ---- Session ---------------------------------------------------------------

/** Exchange the refresh cookie for a new access token. Returns true on success. */
export async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      accessToken = null;
      return false;
    }
    const data = (await res.json()) as { accessToken: string };
    accessToken = data.accessToken;
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: payload,
    refreshOn401: false,
    // Sign-in is the one screen that owns its own feedback: success navigates to
    // the dashboard, and failure renders inline on the form (built from the same
    // describeError() copy), so a toast would just say it twice.
    feedback: false,
  });
}

export async function logout(): Promise<void> {
  try {
    await request<{ message: string }>("/auth/logout", {
      method: "POST",
      refreshOn401: false,
      feedback: { success: "Signed out." },
    });
  } finally {
    accessToken = null;
  }
}

export async function me(): Promise<MeResponse> {
  return request<MeResponse>("/auth/me");
}

export async function myPermissions(): Promise<MyPermissionsResponse> {
  return request<MyPermissionsResponse>("/rbac/permissions");
}

export async function listRoles(): Promise<Role[]> {
  return (await request<{ roles: Role[] }>("/rbac/roles")).roles;
}

// ---- Resources -------------------------------------------------------------

export async function listProviders(): Promise<Provider[]> {
  const data = await request<{ providers: Provider[] }>("/providers");
  return data.providers;
}

export async function listSpecialties(): Promise<Specialty[]> {
  const data = await request<{ specialties: Specialty[] }>("/specialties");
  return data.specialties;
}

export async function listAudit(page = 1, pageSize = 20): Promise<Paginated<AuditEntry>> {
  return request<Paginated<AuditEntry>>(`/audit?page=${page}&pageSize=${pageSize}`);
}

// ---- Admin / onboarding (Super-Admin) --------------------------------------

export async function listTenants(): Promise<Tenant[]> {
  return (await request<{ tenants: Tenant[] }>("/admin/tenants")).tenants;
}

export async function getTenant(id: string): Promise<TenantDetail> {
  return request<TenantDetail>(`/admin/tenants/${id}`);
}

export async function onboardTenant(body: OnboardTenantRequest): Promise<OnboardTenantResponse> {
  return request<OnboardTenantResponse>("/admin/tenants", { method: "POST", body, feedback: { success: "Hospital onboarded." } });
}

export async function setTenantStatus(id: string, status: string): Promise<Tenant> {
  return request<Tenant>(`/admin/tenants/${id}/status`, {
    method: "PATCH",
    body: { status },
    feedback: { success: "Tenant status updated." },
  });
}

export async function grantTenantModule(id: string, module: string): Promise<void> {
  await request(`/admin/tenants/${id}/modules`, {
    method: "POST",
    body: { module },
    feedback: { success: "Module granted." },
  });
}

export async function revokeTenantModule(id: string, key: string): Promise<void> {
  await request(`/admin/tenants/${id}/modules/${key}`, { method: "DELETE", feedback: { success: "Module revoked." } });
}

export async function listModuleCatalog(): Promise<ModuleCatalogItem[]> {
  return (await request<{ modules: ModuleCatalogItem[] }>("/admin/module-catalog")).modules;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  return request<PlatformStats>("/admin/stats");
}

export async function getOrgSummary(): Promise<OrgSummary> {
  return request<OrgSummary>("/dashboard/summary");
}

// ---- Patients --------------------------------------------------------------

export async function listPatients(page = 1, pageSize = 20, search?: string): Promise<Paginated<Patient>> {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) q.set("search", search);
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
  opts: { date?: string; branchId?: string; providerId?: string; status?: string } = {},
): Promise<Visit[]> {
  const q = new URLSearchParams();
  if (opts.date) q.set("date", opts.date);
  if (opts.branchId) q.set("branchId", opts.branchId);
  if (opts.providerId) q.set("providerId", opts.providerId);
  if (opts.status) q.set("status", opts.status);
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
  opts: { page?: number; pageSize?: number; patientId?: string; status?: string } = {},
): Promise<Paginated<InvoiceListItem>> {
  const q = new URLSearchParams();
  q.set("page", String(opts.page ?? 1));
  q.set("pageSize", String(opts.pageSize ?? 20));
  if (opts.patientId) q.set("patientId", opts.patientId);
  if (opts.status) q.set("status", opts.status);
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

export async function listLabOrders(status?: string): Promise<LabOrder[]> {
  const q = status ? `?status=${status}` : "";
  return request<LabOrder[]>(`/lab-orders${q}`);
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
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
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

// ---- Platform branding (super-admin; ADR-024) ------------------------------
// Two independent scopes: "marketing" (public site) and "hms" (Portal product default).
// The GET is public; writes require platform.branding.platform.manage (super-admin).

export async function getPlatformBranding(scope: PlatformBrandingScope): Promise<PlatformBranding> {
  return request<PlatformBranding>(`/public/branding/${scope}`);
}

export async function updatePlatformBranding(
  scope: PlatformBrandingScope,
  tokens: BrandingTokens,
): Promise<PlatformBranding> {
  return request<PlatformBranding>(`/platform-branding/${scope}`, {
    method: "PUT",
    body: { tokens },
    feedback: { success: "Platform branding saved." },
  });
}

export async function resetPlatformBranding(scope: PlatformBrandingScope): Promise<PlatformBranding> {
  return request<PlatformBranding>(`/platform-branding/${scope}`, {
    method: "DELETE",
    feedback: { success: "Platform branding reset." },
  });
}

export async function uploadPlatformBrandingAsset(
  scope: PlatformBrandingScope,
  kind: "logo" | "favicon",
  file: File,
): Promise<PlatformBranding> {
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await send(`/platform-branding/${scope}/${kind}`, {
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
  const branding = (await res.json()) as PlatformBranding;
  notifySuccess(kind === "logo" ? "Logo updated." : "Favicon updated.");
  return branding;
}
