// The platform admin app's endpoint surface (ADR-051, ADR-054).
//
// The HTTP core — token handling, the single in-flight refresh, the 401 retry, error
// classification and the one-notification-per-call rule — lives in `@hms/client` and
// is shared by every frontend. What stays here is deliberately narrow: the
// platform-administration endpoints and nothing clinical. There is no patients,
// appointments, EMR, pharmacy, laboratory or billing call, and there should never be
// one — an operator works inside a hospital through an audited support session in the
// Portal, not by calling clinical APIs from this origin.

import type {
  AuditEntry,
  BrandingTokens,
  ModuleCatalogItem,
  OnboardTenantRequest,
  OnboardTenantResponse,
  Paginated,
  PlatformBranding,
  PlatformBrandingScope,
  PlatformStats,
  PlatformTrends,
  StartSupportSessionRequest,
  StartSupportSessionResponse,
  Tenant,
  TenantDetail,
} from "@hms/types";
import { createApiClient, notifyError, notifySuccess } from "@hms/client";

const client = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1",
});

const { request, send, parseError } = client;

/** The client the AuthProvider drives. */
export const apiClient = client;

export { ApiRequestError, NetworkError, TimeoutError } from "@hms/client";
export const { setAccessToken, getAccessToken, setOnSessionExpired, tryRefresh, login, logout, me, myPermissions } =
  client;

export async function changePassword(body: { currentPassword: string; newPassword: string }): Promise<void> {
  await request<void>("/auth/change-password", {
    method: "POST",
    body,
    feedback: { success: "Password changed. Sign in again with the new one." },
  });
}

// ---- Platform administration ----------------------------------------------

export async function listTenants(): Promise<Tenant[]> {
  return (await request<{ tenants: Tenant[] }>("/admin/tenants")).tenants;
}

export async function getTenant(id: string): Promise<TenantDetail> {
  return request<TenantDetail>(`/admin/tenants/${id}`);
}

export async function onboardTenant(body: OnboardTenantRequest): Promise<OnboardTenantResponse> {
  return request<OnboardTenantResponse>("/admin/tenants", {
    method: "POST",
    body,
    feedback: { success: "Hospital onboarded." },
  });
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

/**
 * Starts a support session (ADR-037). The token belongs to the TARGET user in the
 * TARGET tenant, and is handed to a Portal tab — never used on this origin (ADR-051).
 */
export async function startSupportSession(body: StartSupportSessionRequest): Promise<StartSupportSessionResponse> {
  return request<StartSupportSessionResponse>("/admin/support-sessions", { method: "POST", body });
}

export async function getPlatformStats(): Promise<PlatformStats> {
  return request<PlatformStats>("/admin/stats");
}

export async function getPlatformTrends(months = 12): Promise<PlatformTrends> {
  return request<PlatformTrends>(`/admin/trends?months=${months}`);
}

/**
 * Liveness + readiness for the health tile. Deliberately tolerant: a failure here
 * is itself the signal, so it resolves to a status rather than throwing into the
 * shared error toast.
 */
export async function getSystemHealth(): Promise<{ api: boolean; db: boolean }> {
  const api = await request<{ status: string }>("/health").then(() => true).catch(() => false);
  const db = api
    ? await request<{ status: string }>("/health/ready").then(() => true).catch(() => false)
    : false;
  return { api, db };
}

// ---- Platform branding (ADR-024) -------------------------------------------
// Two independent scopes: "marketing" (public site) and "hms" (Portal product default).
// The GET is public; the writes require `platform.branding.platform.manage` and live
// only here — the Portal keeps the read, because it applies the default at bootstrap.

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
  const token = client.getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
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

// ---- Audit -----------------------------------------------------------------

export async function listAudit(
  opts: {
    page?: number;
    pageSize?: number;
    search?: string;
    severity?: string;
    /** Inclusive date window over created_at (YYYY-MM-DD) — the end-of-day report uses `from === to`. */
    from?: string;
    to?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  } = {},
): Promise<Paginated<AuditEntry>> {
  const q = new URLSearchParams();
  q.set("page", String(opts.page ?? 1));
  q.set("pageSize", String(opts.pageSize ?? 20));
  if (opts.search) q.set("search", opts.search);
  if (opts.severity) q.set("severity", opts.severity);
  if (opts.from) q.set("from", opts.from);
  if (opts.to) q.set("to", opts.to);
  if (opts.sortBy) q.set("sortBy", opts.sortBy);
  if (opts.sortDir) q.set("sortDir", opts.sortDir);
  return request<Paginated<AuditEntry>>(`/audit?${q.toString()}`);
}
