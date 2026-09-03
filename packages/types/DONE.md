# @hms/types — DONE.md

Append-only implementation log. Newest at the bottom.

---

## 2026-08-14 — Shared API contracts (Phase 0 / Task #12)

**What:** Populated the shared type package with the request/response contracts the Portal type-checks against, mirroring the backend controllers.

**Added:** `ApiError` (canonical error envelope), `Paginated<T>` (pagination envelope), `AuthUser`/`LoginRequest`/`LoginResponse`/`RefreshResponse`/`MeResponse`, `MyPermissionsResponse`/`Role`, `Provider`/`Specialty`, `AuditEntry`.

**Decisions:** Hand-authored contracts (not generated) kept in lock-step with the backend controllers — when a controller's response shape changes, the matching type here changes in the same PR. Types only, no runtime code; permission _strings_ live in `@hms/permissions`.

**Testing status:** `typecheck` green; cross-checked implicitly by `hms_frontend`'s typecheck/build (the API client and pages consume these types).

## 2026-08-16 — Organization profile + setup status contracts (ADR-049)

**What:** `OrganizationProfile` and `UpdateOrganizationProfileRequest` (every field nullable — a document prints the lines that exist), plus `SetupStep`, `SetupStepKey` and `SetupStatus` for the Hospital Setup Console. `contactLines` is deliberately part of the contract rather than composed in the Portal, so the print header and the "how this prints" preview cannot drift from each other.

**Testing status:** `typecheck` green in both the backend and the Portal.

## 2026-08-16 — Department contracts (ADR-050)

**What:** `Department`, `CreateDepartmentRequest`, `UpdateDepartmentRequest`; `departments` added to `SetupStepKey`; `departmentId` added to `CheckInRequest` and `Visit`. `Visit.department` stays as the legacy free-text name so existing screens keep compiling and rendering.

**Testing status:** `typecheck` green in both the backend and the Portal.

## 2026-08-16 — Registration and letterhead contracts (ADR-056)

**What:** `RegistrationSettings`, `RegistrationRequestItem`, `PublicRegistrationContext`; `OrganizationProfile` extended with the public identity and letterhead fields (`displayName`, `secondaryPhone`, `supportEmail`, `letterheadHeader`, `letterheadFooter`, `signatoryName`, `signatoryDesignation`).

`PublicRegistrationContext` carries a hospital name, a city and the on/off flag — nothing else, because it is served to an unauthenticated caller. `RegistrationRequestItem` deliberately has no `tenantId`: the backend projects it away, and leaving it out of the type keeps a frontend from expecting it back.

**Testing status:** `typecheck` green across the backend, the Portal and the patient app.

## 2026-08-17 — Letterhead image + page size on OrganizationProfile (ADR-065)

`OrganizationProfile` gains `letterheadImageUrl` (short-lived, read-only) and `documentPageSize`. A new `DOCUMENT_PAGE_SIZES` tuple + `DocumentPageSize` union is the one shared contract for the settings selector, the backend Zod enum and the print layer. `UpdateOrganizationProfileRequest` now also omits `letterheadImageUrl` (it is upload-only, via its own multipart route), so only `documentPageSize` rides the partial text update.

**Testing status:** `typecheck` green across the backend, the Portal and `@hms/ui`.

## 2026-08-19 — Compiled `dist/` output (ADR-075)

**What:** The package now builds — `tsconfig.build.json` emits CommonJS + declarations to `dist/`, and `main`/`types`/`exports` point there instead of at raw `src/index.ts`. A `dev` watch script keeps `dist/` fresh under root `npm run dev`.

**Why:** Same failure shape as `@hms/permissions` — a plain-Node consumer resolving `main` to raw TypeScript cannot boot. The backend does not import this package _today_, but it is the declared backend/frontend contract package, so both halves of the recurrence path close together (ADR-075). If the backend ever imports it, it must also be added to `hms_backend`'s `dependencies`.

**Testing status:** builds clean; full-repo typecheck 13/13; Portal production build green against the `dist/` entry.

## 2026-08-20 — `AuditEntry.requestId` (ADR-082, SECURITY-AUDIT L-3)

**What:** the audit row now carries the correlation id shared with the structured log, the error tracker and the response’s `X-Request-Id` header. Nullable: rows written before the column existed, and events raised outside an HTTP request (jobs, seeders), have none.

**Testing status:** `dist/` rebuilt (this package is dist-consumed by the backend); typecheck green across every workspace.

---

## ABDM / ABHA contracts (ADR-084)

**What:** `AbdmCapabilities`, `AbhaPrefill`, `AbhaMatchCandidate`, `AbhaVerificationResult`,
`AbdmOtpSent`, `AbdmPendingShare`, `AbhaIdentifierType` and `AbdmFacilityConfig`, plus
`abhaAddress` / `abhaVerifiedAt` / `abhaSource` on `Patient`. Two things are deliberately absent
from every type here: the Aadhaar number (sent on one request, never returned) and any ABDM token
(server-side only) — so a frontend cannot come to depend on receiving either.

**Testing status:** `dist/` rebuilt (dist-consumed by the backend); typecheck green across every
workspace, Portal production build green.
