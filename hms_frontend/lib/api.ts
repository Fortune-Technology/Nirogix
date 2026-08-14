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
