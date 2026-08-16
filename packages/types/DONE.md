# @hms/types — DONE.md

Append-only implementation log. Newest at the bottom.

---

## 2026-08-14 — Shared API contracts (Phase 0 / Task #12)

**What:** Populated the shared type package with the request/response contracts the Portal type-checks against, mirroring the backend controllers.

**Added:** `ApiError` (canonical error envelope), `Paginated<T>` (pagination envelope), `AuthUser`/`LoginRequest`/`LoginResponse`/`RefreshResponse`/`MeResponse`, `MyPermissionsResponse`/`Role`, `Provider`/`Specialty`, `AuditEntry`.

**Decisions:** Hand-authored contracts (not generated) kept in lock-step with the backend controllers — when a controller's response shape changes, the matching type here changes in the same PR. Types only, no runtime code; permission *strings* live in `@hms/permissions`.

**Testing status:** `typecheck` green; cross-checked implicitly by `hms_frontend`'s typecheck/build (the API client and pages consume these types).

## 2026-08-16 — Organization profile + setup status contracts (ADR-049)

**What:** `OrganizationProfile` and `UpdateOrganizationProfileRequest` (every field nullable — a document prints the lines that exist), plus `SetupStep`, `SetupStepKey` and `SetupStatus` for the Hospital Setup Console. `contactLines` is deliberately part of the contract rather than composed in the Portal, so the print header and the "how this prints" preview cannot drift from each other.

**Testing status:** `typecheck` green in both the backend and the Portal.

## 2026-08-16 — Department contracts (ADR-050)

**What:** `Department`, `CreateDepartmentRequest`, `UpdateDepartmentRequest`; `departments` added to `SetupStepKey`; `departmentId` added to `CheckInRequest` and `Visit`. `Visit.department` stays as the legacy free-text name so existing screens keep compiling and rendering.

**Testing status:** `typecheck` green in both the backend and the Portal.
