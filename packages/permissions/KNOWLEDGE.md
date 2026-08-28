# @hms/permissions — KNOWLEDGE.md

The single source of truth for permission strings and the system-role catalog, shared by `hms_backend` (enforcement) and `hms_frontend` (menu/route visibility). Read after root `CLAUDE.md`.

## What's here

`src/index.ts`:

- **`PERMISSIONS`** — the dot-hierarchy permission catalog (`module.submodule.action`, e.g. `patient.record.view`, `providers.manage`, `audit.log.view`). Add new keys here as modules land.
- **`PermissionKey`** type · **`ALL_PERMISSIONS`** · **`permissionModule(key)`** (the module a key belongs to) · **`WILDCARD` (`'*'`)** — a role/override holding it grants everything (super_admin).
- **`SYSTEM_ROLES`** — the reduced MVP role set (8 roles: super_admin, org_admin, branch_admin, doctor, receptionist, pharmacist, lab_technician, cashier) with each role's default permissions. Seeded per tenant by the backend RBAC service; tenants clone + customize without growing the count.
- **`MODULE_REGISTRY`** (ADR-085) — the canonical `Domain → Module → Capability` catalog shared FE/BE: `ModuleCategory` (the 11 domains), `LifecycleStatus` (`BUILT`/`AVAILABLE`/`PLANNED`/`FUTURE`), each module's `capabilities`, `hardDependencies` and unlocked permission keys. `CAPABILITIES` (type-safe capability keys, mirrors `PERMISSIONS`), `ALL_CAPABILITIES`, `MODULE_CATEGORIES` (the 11 domains in display order) + `categoryLabel`, and helpers `registryModule` / `moduleCapabilities` / `capabilityDef` / `capabilityDependents` / `isModuleBuilt` / `isCapabilityBuilt`. The backend's `moduleCatalog.ts` is a thin derived view — this registry is the single module list.

## Rules

- **One source of truth.** Both the backend (`requirePermission(key)`) and the Portal (`useCan(key)`, `<Can>`, nav filtering) import keys from here — so the UI mirror and server enforcement never drift. Never hard-code a permission string in either app.
- **Semantics live in the backend** (this package is just the vocabulary + defaults): effective = union(role perms) + grants − denies; **explicit DENY always wins**; `WILDCARD` = all. Overrides can be time-bound. See `hms_backend` RBAC (ADR-010).
- **Adding a permission:** add the key to `PERMISSIONS`, attach it to the appropriate `SYSTEM_ROLES` entries, then gate the backend route and (if user-facing) the Portal nav/guards. Types only — no runtime dependencies.
- **Module & capability are two entitlement tiers, both runtime-checked in the backend** (ADR-085). A capability is *what the system supports*; a permission is *who may use it*. `MODULE_REGISTRY` is the vocabulary + defaults + lifecycle status; enablement, `requireModule`/`requireCapability` enforcement and the deny-by-exception resolution all live in `hms_backend`. Only a `BUILT` entry is ever entitled to a real screen/API or marked available in marketing (ADR-038) — a registry row is not a claim the module exists. Add a capability only where a genuine, independently-toggleable sub-feature ships.
- **`ai.portal.access` is held by every staff role** (ADR-055, superseding ADR-053's per-person grant). What keeps patients out of the AI Portal is the **principal-type check**, not this key — a patient is refused before any permission is read. The key still exists so a tenant can DENY it for an individual.
- **A new key does not reach existing tenants on its own.** `provisionTenantRbac` runs at onboarding, so without a reconcile the key is enforced by the route while no current customer's role holds it — the feature 403s for everyone who signed up first. `reconcileSystemRoles()` in `hms_backend` runs during `db:migrate` and closes that gap; it is additive only, so a tenant's own role customisation survives a deploy (ADR-049).

## Build (ADR-075)

- The package **compiles to `dist/`** (`tsconfig.build.json` → CommonJS + declarations); `main`/`types`/`exports` point at `dist/`, never at `src/`. `hms_backend` in production is plain `node dist/server.js`, so a raw-source entry point breaks its boot. Turbo's `^build` orders this build before any consumer; the package `dev` script (`tsc --watch`) keeps `dist/` fresh under root `npm run dev`.
- The plain `tsconfig.json` stays check-only (`tsc --noEmit`).

## Verify

- `npm run typecheck -w @hms/permissions` · `npm run build -w @hms/permissions`. Behaviour is exercised by the backend RBAC tests; runtime resolution by `node -e "require('@hms/permissions')"` from `hms_backend`.
