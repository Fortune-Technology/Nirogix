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
