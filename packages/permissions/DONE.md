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


## 2026-08-16 — `ai.portal.access` widened to every staff role (ADR-055)

**What:** The key moved from "held by no role, granted per person" (ADR-053) to **held by every system role** — org_admin, branch_admin, doctor, receptionist, pharmacist, lab_technician, cashier, with super_admin covered by WILDCARD.

**Why the original was wrong in practice:** it made the portal unreachable for the people it is for. Every seeded role hit the *Access restricted* screen; only super_admin got in, and only incidentally through WILDCARD. It also mis-identified the risk — the thing that must never happen is a **patient** reaching AI tooling, and that is enforced by the principal-type check, not by this key. Keeping it narrow bought no protection against the actual threat while guaranteeing a refusal on first use.

**The lever survives.** An org_admin can still DENY the key for an individual, and an explicit deny beats a role grant. Widening a default is not the same as removing control.

**Reaches existing tenants** via `reconcileSystemRoles()` on the next `db:migrate` — verified against all three seeded tenants.

**Testing status:** the test that asserted no role held it now asserts every staff role does, and a second test pins that the key remains in the catalog so it can still be denied. Verified live: all seven hospital roles plus the platform owner get **200**; a patient token still gets **401**, as does no token at all.

## 2026-08-19 — Compiled `dist/` output for the backend's production boot (ADR-075)

**What:** The package now builds — `tsconfig.build.json` emits CommonJS + declarations to `dist/`, and `main`/`types`/`exports` point there instead of at raw `src/index.ts`. A `dev` watch script keeps `dist/` fresh under root `npm run dev`.

**Why:** `hms_backend` in production is plain `node dist/server.js`; its compiled `require('@hms/permissions')` resolved to raw TypeScript and Node died at boot with `SyntaxError: Unexpected identifier 'as'`. The Next.js apps were immune (`transpilePackages`), which is why local dev never surfaced it. Turbo's `^build` + `outputs: dist/**` were already wired — the package just had nothing to build.

**Testing status:** turbo builds this package before `hms_backend`; `node -e "require('@hms/permissions')"` from the backend resolves compiled output; full-repo typecheck 13/13, Portal production build green, backend suite 162/162.

---

## ABDM / ABHA permission keys (ADR-084)

**What:** four keys for ABDM Milestone 1 — `abdm.verification.perform` (run a lookup at the desk),
`abdm.verification.link` (attach a verified ABHA to a chart), `abdm.facility.view` /
`abdm.facility.manage` (the hospital's own HFR facility registration). Verifying and linking are
separate on purpose: a lookup reads national data, while linking changes an identifier on a clinical
record. The receptionist role gets verify + link; org_admin gets those plus the facility keys.

**Testing status:** `dist/` rebuilt (this package is dist-consumed by the backend). Backend suite
317/317 with the new keys enforced at the route boundary. **Existing tenants seeded before this
change do not hold these keys until their roles are re-seeded** — recorded in `BACKLOG.md`.
