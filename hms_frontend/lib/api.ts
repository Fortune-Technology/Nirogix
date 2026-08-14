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
} from "@hms/types";

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

export class ApiRequestError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

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
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, _retry = false, refreshOn401 = true } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && refreshOn401 && !_retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...opts, _retry: true });
    if (onSessionExpired) onSessionExpired();
    throw await parseError(res);
  }

  if (!res.ok) throw await parseError(res);

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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
  });
}

export async function logout(): Promise<void> {
  try {
    await request<{ message: string }>("/auth/logout", { method: "POST", refreshOn401: false });
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
  return request<OnboardTenantResponse>("/admin/tenants", { method: "POST", body });
}

export async function setTenantStatus(id: string, status: string): Promise<Tenant> {
  return request<Tenant>(`/admin/tenants/${id}/status`, { method: "PATCH", body: { status } });
}

export async function grantTenantModule(id: string, module: string): Promise<void> {
  await request(`/admin/tenants/${id}/modules`, { method: "POST", body: { module } });
}

export async function revokeTenantModule(id: string, key: string): Promise<void> {
  await request(`/admin/tenants/${id}/modules/${key}`, { method: "DELETE" });
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
  return request<Patient>("/patients", { method: "POST", body });
}

export async function getPatient(id: string): Promise<Patient> {
  return request<Patient>(`/patients/${id}`);
}

export async function updatePatient(id: string, patch: Partial<CreatePatientRequest> & { status?: string }): Promise<Patient> {
  return request<Patient>(`/patients/${id}`, { method: "PATCH", body: patch });
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
  return request<{ id: string; status: string }>("/appointments", { method: "POST", body });
}

export async function cancelAppointment(id: string, reason?: string): Promise<{ id: string; status: string }> {
  return request<{ id: string; status: string }>(`/appointments/${id}/cancel`, { method: "POST", body: { reason } });
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
  return request<Visit>("/visits/check-in", { method: "POST", body });
}

export async function updateVisitStatus(id: string, body: UpdateVisitStatusRequest): Promise<Visit> {
  return request<Visit>(`/visits/${id}/status`, { method: "PATCH", body });
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
  return request<Invoice>(`/invoices/${id}/payments`, { method: "POST", body });
}

// ---- EMR / Clinical Workflow (hms_backend/src/modules/emr) ------------------

export async function openEncounter(visitId: string): Promise<Encounter> {
  return request<Encounter>("/encounters/open", { method: "POST", body: { visitId } });
}

export async function saveEncounter(id: string, body: SaveEncounterRequest): Promise<Encounter> {
  return request<Encounter>(`/encounters/${id}`, { method: "PUT", body });
}

export async function signEncounter(id: string): Promise<Encounter> {
  return request<Encounter>(`/encounters/${id}/sign`, { method: "POST" });
}

export async function searchIcd10(q: string): Promise<Icd10Code[]> {
  return request<Icd10Code[]>(`/icd10?q=${encodeURIComponent(q)}`);
}

// ---- Org-Admin: users & branches -------------------------------------------

export async function listUsers(): Promise<UserListItem[]> {
  return (await request<{ users: UserListItem[] }>("/users")).users;
}

export async function createUser(body: CreateUserRequest): Promise<{ id: string; tempPassword: string | null }> {
  return request<{ id: string; tempPassword: string | null }>("/users", { method: "POST", body });
}

export async function getUser(id: string): Promise<UserDetail> {
  return request<UserDetail>(`/users/${id}`);
}

export async function updateUser(id: string, patch: { status?: string; fullName?: string }): Promise<void> {
  await request(`/users/${id}`, { method: "PATCH", body: patch });
}

export async function assignUserRole(id: string, roleKey: string): Promise<void> {
  await request(`/users/${id}/roles`, { method: "POST", body: { roleKey } });
}

export async function removeUserRole(id: string, roleKey: string): Promise<void> {
  await request(`/users/${id}/roles/${roleKey}`, { method: "DELETE" });
}

export async function addUserOverride(
  id: string,
  body: { permission: string; effect: "GRANT" | "DENY"; validUntil?: string },
): Promise<void> {
  await request(`/users/${id}/overrides`, { method: "POST", body });
}

export async function revokeUserOverride(id: string, overrideId: string): Promise<void> {
  await request(`/users/${id}/overrides/${overrideId}`, { method: "DELETE" });
}

export async function listBranches(): Promise<Branch[]> {
  return (await request<{ branches: Branch[] }>("/branches")).branches;
}

export async function createBranch(body: { code: string; name: string }): Promise<Branch> {
  return request<Branch>("/branches", { method: "POST", body });
}

export async function updateBranch(id: string, patch: { name?: string; isActive?: boolean }): Promise<Branch> {
  return request<Branch>(`/branches/${id}`, { method: "PATCH", body: patch });
}

// ---- Tenant branding -------------------------------------------------------

export async function getCurrentBranding(): Promise<Branding> {
  return request<Branding>("/branding/current");
}

export async function updateBranding(patch: {
  brandColor?: string | null;
  secondaryColor?: string | null;
}): Promise<Branding> {
  return request<Branding>("/branding", { method: "PUT", body: patch });
}

export async function resetBranding(): Promise<Branding> {
  return request<Branding>("/branding", { method: "DELETE" });
}

/** Upload a logo/favicon (multipart). Returns the updated branding (with the new asset URL). */
export async function uploadBrandingAsset(kind: "logo" | "favicon", file: File): Promise<Branding> {
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(`${BASE_URL}/branding/${kind}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as Branding;
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
  return request<PlatformBranding>(`/platform-branding/${scope}`, { method: "PUT", body: { tokens } });
}

export async function resetPlatformBranding(scope: PlatformBrandingScope): Promise<PlatformBranding> {
  return request<PlatformBranding>(`/platform-branding/${scope}`, { method: "DELETE" });
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
  const res = await fetch(`${BASE_URL}/platform-branding/${scope}/${kind}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PlatformBranding;
}
