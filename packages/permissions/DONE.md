# @hms/permissions — DONE.md

Append-only implementation log. Newest at the bottom.

---

## 2026-08-13 — Permission catalog + system roles (Phase 0 / Task #5)

**What:** Established the shared dot-hierarchy permission catalog and the reduced MVP system-role set, consumed by both the backend (enforcement) and the Portal (visibility).

**Added:** `PERMISSIONS` catalog, `PermissionKey`/`ALL_PERMISSIONS`/`permissionModule()`, `WILDCARD`, and `SYSTEM_ROLES` (8 roles + defaults).

**Decisions:** Single source of truth so UI menus and server enforcement can't drift. Semantics (DENY-over-GRANT, temporary overrides, cache) live in the backend RBAC engine (ADR-010); this package is the vocabulary + role defaults.

---

## 2026-08-14 — Catalog grown alongside modules (Tasks #7–#12)

**What:** Extended the catalog as Platform Core modules landed — added `AUDIT_VIEW`, `NOTIFICATION_SEND`/`VIEW`, `FILE_UPLOAD`/`VIEW`/`DELETE`, and `PROVIDER_VIEW`/`MANAGE` (`providers.view|manage`), each wired into the relevant `SYSTEM_ROLES`. The Portal (`useCan`, `<Can>`, nav) now consumes these keys directly.

**Testing status:** `typecheck` green; enforcement exercised by the backend RBAC/module tests and verified live in the Portal (org_admin vs receptionist menu + 403).

## 2026-08-16 — `platform.organization.manage` (ADR-049)

**What:** One new key, `ORG_PROFILE_MANAGE: 'platform.organization.manage'`, granted to `org_admin`. It guards the hospital's own identity (registered address, contact details, registration number, GSTIN) and the Hospital Setup Console's status endpoint.

**Why its own key rather than reusing `platform.branding.manage`:** a GSTIN is not a colour. A hospital may reasonably want the person who maintains its legal details to be someone other than the person who picks its logo, and merging the two would have made that impossible without an override.

**Note for every future key:** `provisionTenantRbac` runs at onboarding only, so a key added here does not reach tenants that already exist. `reconcileSystemRoles()` in `hms_backend` now runs during `db:migrate` and closes that gap — additive only, so a tenant's own customisation survives.

**Testing status:** `typecheck` green; enforcement verified live (org_admin reaches the console; receptionist gets 403 on both routes and no sidebar entry).

## 2026-08-16 — `platform.departments.*` (ADR-050)

**What:** `DEPARTMENT_VIEW` and `DEPARTMENT_MANAGE`. View is deliberately wide — org_admin, branch_admin, doctor and receptionist — because the front desk books into a department and the doctor works one. Manage is org_admin only.

**Testing status:** `typecheck` green; gates verified live (receptionist 200 on read / 403 on create, pharmacist 403 on both).
