# @hms/permissions — KNOWLEDGE.md

The single source of truth for permission strings and the system-role catalog, shared by `hms_backend` (enforcement) and `hms_frontend` (menu/route visibility). Read after root `CLAUDE.md`.

## What's here

`src/index.ts`:

- **`PERMISSIONS`** — the dot-hierarchy permission catalog (`module.submodule.action`, e.g. `patient.record.view`, `providers.manage`, `audit.log.view`). Add new keys here as modules land.
- **`PermissionKey`** type · **`ALL_PERMISSIONS`** · **`permissionModule(key)`** (the module a key belongs to) · **`WILDCARD` (`'*'`)** — a role/override holding it grants everything (super_admin).
- **`SYSTEM_ROLES`** — the reduced MVP role set (8 roles: super_admin, org_admin, branch_admin, doctor, receptionist, pharmacist, lab_technician, cashier) with each role's default permissions. Seeded per tenant by the backend RBAC service; tenants clone + customize without growing the count.
- **`org_admin` is derived, not listed (ADR-126)** — `ALL_PERMISSIONS` minus `OPERATOR_ONLY_PERMISSIONS` and `CLINICIAN_ONLY_PERMISSIONS`, so a permission key added by a later release reaches the administrator by default and _withholding_ one is the deliberate act that has to be written down. 68 of 75 today. It is still not `WILDCARD`: `super_admin` holds that, so the operator keys stay out by construction.
- **`platform.workflow.view` is held by every role whose screen reads the workflow (ADR-129)** — receptionist, doctor, branch_admin and cashier, as well as the administrator. The configuration decides what the check-in form, the vitals queue and the cases block _render_, so reading it is not an administrative act; `platform.workflow.manage` stays the administrator's alone. The general rule: a key named for the screen that edits a setting is the wrong key for the screens that read it.
- **`PERMISSION_LABELS` / `permissionLabel(key)`** name every key in words, for the screen that has to explain a refusal (ADR-126); an unknown key gets a derived sentence rather than a blank, because a tenant's custom role can carry one from a later release. **`permissionModuleKey(key)`** derives permission → module from `MODULE_REGISTRY` — never a second list — which is what lets a guard check the module before the permission, in the order the server enforces.
- **`org_admin` is "anything inside this hospital" (ADR-125)** — administration _and_ every operational and clinical action, including the encounter. It withholds only what leaves the hospital (`platform.tenants.manage`, the support surface, cross-tenant analytics, platform branding, the global master-data catalogue) and `abdm.history.request`, because a consent request carries a named clinician's registration number to the patient and an administrator has none. A hospital that wants the narrower split denies the keys it disagrees with on that account — explicit DENY beats a role grant (invariant #3) — rather than needing a code change. Widening reaches existing tenants through `reconcileSystemRoles()`, which is additive only.
- **`MODULE_REGISTRY`** (ADR-085) — the canonical `Domain → Module → Capability` catalog shared FE/BE: `ModuleCategory` (the 11 domains), `LifecycleStatus` (`BUILT`/`AVAILABLE`/`PLANNED`/`FUTURE`), each module's `capabilities`, `hardDependencies` and unlocked permission keys. `CAPABILITIES` (type-safe capability keys, mirrors `PERMISSIONS`), `ALL_CAPABILITIES`, `MODULE_CATEGORIES` (the 11 domains in display order) + `categoryLabel`, and helpers `registryModule` / `moduleCapabilities` / `capabilityDef` / `capabilityDependents` / `isModuleBuilt` / `isCapabilityBuilt`. The backend's `moduleCatalog.ts` is a thin derived view — this registry is the single module list.

## Rules

- **One source of truth.** Both the backend (`requirePermission(key)`) and the Portal (`useCan(key)`, `<Can>`, nav filtering) import keys from here — so the UI mirror and server enforcement never drift. Never hard-code a permission string in either app.
- **Semantics live in the backend** (this package is just the vocabulary + defaults): effective = union(role perms) + grants − denies; **explicit DENY always wins**; `WILDCARD` = all. Overrides can be time-bound. See `hms_backend` RBAC (ADR-010).
- **Adding a permission:** add the key to `PERMISSIONS`, attach it to the appropriate `SYSTEM_ROLES` entries, then gate the backend route and (if user-facing) the Portal nav/guards. Types only — no runtime dependencies.
- **Module & capability are two entitlement tiers, both runtime-checked in the backend** (ADR-085). A capability is _what the system supports_; a permission is _who may use it_. `MODULE_REGISTRY` is the vocabulary + defaults + lifecycle status; enablement, `requireModule`/`requireCapability` enforcement and the deny-by-exception resolution all live in `hms_backend`. Only a `BUILT` entry is ever entitled to a real screen/API or marked available in marketing (ADR-038) — a registry row is not a claim the module exists. Add a capability only where a genuine, independently-toggleable sub-feature ships.
- **`ai.portal.access` is held by every staff role** (ADR-055, superseding ADR-053's per-person grant). What keeps patients out of the AI Portal is the **principal-type check**, not this key — a patient is refused before any permission is read. The key still exists so a tenant can DENY it for an individual.
- **A new key does not reach existing tenants on its own.** `provisionTenantRbac` runs at onboarding, so without a reconcile the key is enforced by the route while no current customer's role holds it — the feature 403s for everyone who signed up first. `reconcileSystemRoles()` in `hms_backend` runs during `db:migrate` and closes that gap; it is additive only, so a tenant's own role customisation survives a deploy (ADR-049).

## Build (ADR-075)

- The package **compiles to `dist/`** (`tsconfig.build.json` → CommonJS + declarations); `main`/`types`/`exports` point at `dist/`, never at `src/`. `hms_backend` in production is plain `node dist/server.js`, so a raw-source entry point breaks its boot. Turbo's `^build` orders this build before any consumer; the package `dev` script (`tsc --watch`) keeps `dist/` fresh under root `npm run dev`.
- The plain `tsconfig.json` stays check-only (`tsc --noEmit`).

## Verify

- `npm run typecheck -w @hms/permissions` · `npm run build -w @hms/permissions`. Behaviour is exercised by the backend RBAC tests; runtime resolution by `node -e "require('@hms/permissions')"` from `hms_backend`.

## `emr.encounter.amend` (ADR-134)

Correcting a note that is already signed is not the same act as writing one, so it is not the same
key. A signed consultation is the record the hospital stands behind; reopening it is deliberate,
reason-bearing, and separately grantable — a hospital can let every clinician write freely and
still choose who may reopen a closed record. Held by `doctor` (the service additionally holds them
to an encounter that is theirs) and reaching `org_admin` by derivation (ADR-125, ADR-126).

It is not a bypass. The amendment still records who, when, what changed and why, and **re-signing
stays on `emr.encounter.write`** — the signature itself has not changed meaning.
