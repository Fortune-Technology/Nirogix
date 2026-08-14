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
