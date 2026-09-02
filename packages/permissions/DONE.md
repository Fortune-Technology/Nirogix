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

---

## 2026-08-26 — Module & Capability registry (ADR-085, P1)

**What:** `MODULE_REGISTRY` — the canonical `Domain → Module → Capability` catalog shared FE/BE.
Adds `ModuleCategory` (the 11 domains), `LifecycleStatus` (`BUILT`/`AVAILABLE`/`PLANNED`/`FUTURE`),
per-module `capabilities` / `hardDependencies` / unlocked permission keys, the type-safe
`CAPABILITIES` map (mirrors `PERMISSIONS`), and helpers (`registryModule`, `moduleCapabilities`,
`capabilityDef`, `capabilityDependents`, `isModuleBuilt` / `isCapabilityBuilt`). Module keys, names
and hard-dependencies mirror the backend's original `moduleCatalog.ts` **exactly** — no key added or
removed — so the backend list becomes a thin derived view (one source of truth). Capabilities are
declared only for shipped sub-features (built-only retrofit): `billing.services`, `opd.referral`,
`emr.ai_assist`, `laboratory.result_files`, `abdm.{verification,facility,scan_share}`. The 8 live
modules are `BUILT`; the rest are `AVAILABLE` with no capabilities.

**Why:** ADR-085 — the capability tier plus **one** registry the backend (`requireModule` /
`requireCapability`) and every frontend consume, instead of scattered lists. Only a `BUILT` entry is
ever entitled to a real screen/API or marketed as available (ADR-038); a registry row is not a claim
the module exists.

**Testing status:** typecheck + build green; `dist/` rebuilt (dist-consumed by the backend).
Registry integrity is asserted by `hms_backend` `registry.test.ts` (14 pure tests). Full backend
suite 351 green.

---

## 2026-08-26 — Registry expanded to the full decomposition (ADR-085)

**What:** `MODULE_REGISTRY` grew from the 17 legacy entitlement keys to the whole functional
decomposition — **11 domains · 42 modules · 246 capabilities**. Compact `mod()` / `cap()` builders
keep it readable. Added `alwaysOn` to `ModuleRegistryDef` for Platform Core (Platform Services),
which is never sold or switched off per tenant and so renders as *Required* rather than togglable.

The **seventeen pre-existing keys keep their exact key, name and hard dependencies** (a test pins
this) — changing one would change what an existing tenant can be granted. Everything new lands as
`AVAILABLE`.

**Honesty rule, enforced by a test:** an unbuilt module may now *describe* its capabilities so the
architecture, dependency graph and admin surface are complete, but **a non-`BUILT` module may not
declare a `BUILT` capability** — nothing unbuilt is ever enforced, advertised, or shown as working.
Only the 9 `BUILT` modules (patient, appointment, emr, opd, abdm, billing, pharmacy, laboratory,
platform_services) carry `BUILT` capabilities.

**Testing status:** typecheck + build green, `dist/` rebuilt; `registry.test.ts` now 16 tests
(adds domain-coverage, legacy-key and honesty assertions); full backend suite **355** green. Live
API confirms 11 categories / 42 modules / 246 capabilities for a seeded tenant.

---

## `abdm.profile.update` (ADR-084)

**What:** a fifth ABDM key, for correcting the patient's profile **at ABDM**. Separated from
`abdm.verification.perform` because reading a national identity register and writing to it are
different acts, and from `abdm.verification.link` because that one only ever touches our own chart.

Granted to **org_admin only** — deliberately not in the receptionist's default set. A hospital that
wants its front desk to amend ABDM records grants the key on purpose rather than inheriting the
ability from a role that exists to register patients.

**Testing status:** `dist/` rebuilt; 378 backend tests pass, including a case proving the front desk
is refused by default and one proving the audit records which fields changed and never their values.

## ABDM Milestone 3 permissions (ADR-092, ADR-095)

Two keys, because asking and reading are different acts. `abdm.history.request` puts a named
doctor's registration number in front of a patient and commits the hospital to destroying whatever
comes back; `abdm.history.view` reads another hospital's clinical record. A role that may open a
chart is not thereby entitled to pull a national history onto it.

Granted to **doctor** (both) and **org_admin** (view only). The front desk gets neither: a consent
request must name a clinician the patient can recognise, and an administrator reading a pulled
history for support is a different thing from an administrator raising the request. The
`abdm.external_history` capability is registered as **PLANNED** — describing a module is not a claim
it exists (ADR-085), and no health record has been exchanged with ABDM in any environment.

## 2026-09-02 — The Organization Admin may do anything inside its own hospital (ADR-125)

`org_admin` was configuration-plus-read-only: it defined departments, doctors, a price list and a
workflow, and could not correct a patient's phone number, book an appointment, check anybody in or
take a payment. The person a hospital holds accountable could not fix what they were accountable
for — and could lift the restriction themselves in two clicks, since the same role holds
`platform.rbac.manage`, so the boundary was only slowing them down.

**Added:** `patient.record.create` / `.update`, `appointment.booking.create` / `.cancel`,
`opd.visit.checkin` / `.update`, `opd.case.manage`, `opd.referral.create` / `.update`,
`clinical.immunization.manage`, `emr.vitals.record`, `emr.encounter.view` / `.write`,
`billing.invoice.create`, `billing.payment.collect`, `pharmacy.stock.view` / `.manage` /
`pharmacy.dispense.create`, `laboratory.order.view` / `test.manage` / `result.enter` / `result.verify`.

**Still withheld, and why each is a boundary rather than an oversight:** everything outside this
hospital (`platform.tenants.manage`, the support surface, cross-tenant analytics, the vendor's own
platform branding, the global master-data catalogue), and `abdm.history.request` — a consent
request carries a named clinician's medical registration number to the patient, and an
administrator has none to carry. Reading a history a doctor already pulled stays permitted.

**The clinical grant is reversible per hospital, which is the point.** A hospital that wants its
administrator kept out of the chart denies `emr.encounter.view` / `.write` on that account:
explicit DENY beats the role (invariant #3), applies on the next request, can be time-bound, and is
audited. The old marketing line — "an Organization Admin cannot read the clinical record" — is
retired in the same change (capability reference v2.25).

Existing tenants receive the wider role through `reconcileSystemRoles()` inside `db:migrate`, which
is additive only: no permission is removed and a customised role keeps its customisation. The
frontend needed no change — every button was already gated on a permission key rather than a role.

## 2026-09-02 — A refusal that can be acted on, and a role that stops going stale (ADR-126)

**`org_admin` is now derived rather than listed** —
`ALL_PERMISSIONS` minus `OPERATOR_ONLY_PERMISSIONS` (six keys that reach across tenants or edit
the shared master catalogue) minus `CLINICIAN_ONLY_PERMISSIONS` (`abdm.history.request`, which
carries a named clinician's registration number to the patient). 68 of 75 today, and a key added
next release reaches the administrator by default instead of silently not reaching them. Still not
a wildcard, so the operator keys stay out by construction.

**`GET /api/v1/rbac/access?permission=…`** explains a refusal: the permission's human label and
key, the module and whether this hospital has it, and **the roles that grant it read from the
tenant's own `role_permissions`** — so a cloned or renamed role appears without anyone hard-coding
a role name, and a role holding the wildcard counts. `reason` is module-first
(`module_not_enabled` → `granted` → `permission_missing`) because the two failures have different
owners: a module is the hospital's subscription and no administrator can grant past it. Requires a
session and nothing more; the response shape is closed and names no patient, account or other
tenant, and a test asserts exactly that.

`PERMISSION_LABELS` in `@hms/permissions` names all 75 keys; `permissionLabel()` derives a readable
sentence for a key this build has never seen, because a tenant's custom role can carry one from a
later release. `permissionModuleKey()` derives permission → module from `MODULE_REGISTRY`, so there
is no second list to drift.

**Testing status:** 6 new API tests; **762 backend tests pass** (was 756). OpenAPI validates with
the new route documented.

## 2026-09-02 — The desk could not read the workflow that draws its own form (ADR-129)

A receptionist opening **Book appointment** got *Not permitted*, beside a form that then worked.
`GET /workflow-config` requires `platform.workflow.view`, which the receptionist did not hold — and
the workflow configuration is what that form is built from (ADR-113): where vitals are taken decides
whether the vitals fields render, when the fee is due decides whether payment gates the
consultation, and the consultation-type and case-type vocabularies fill two of its dropdowns.

The key had been scoped as though the configuration were the administrator's private setting. Four
screens read it — the check-in and booking form, the vitals queue, the patient chart's cases block,
and the fee schedule — and only the last belongs to an administrator.

**`platform.workflow.view` now goes to receptionist, doctor, branch_admin and cashier** as well as
the administrator; not to the pharmacist or lab technician, who reach none of those screens. The
split that matters is untouched: *view* is reading how the hospital runs, **`platform.workflow.manage`
is deciding it**, and only the administrator holds the second. Widening the route to any
authenticated session was the alternative and was rejected — it would leave the permission enforced
by nothing, and a page guard on a key no endpoint checks is a boundary in name only.

**And a failure the caller already handles no longer raises a toast.** `getWorkflowConfig` is
fetched with `feedback: false` (ADR-057's own opt-out). Every call site already treated "no config"
as "use the platform defaults" — the behaviour a hospital that has configured nothing gets anyway —
so a hospital that denies this key on one account now sees that account's form fall back, rather
than an error beside a form that works.

Existing hospitals pick the key up through `reconcileSystemRoles()` in `db:migrate`, additively.

**Testing status:** verified as `reception@citycare.example` — **Book appointment**, **Check in**
and the **Vitals queue** all load with no toast, and `GET /workflow-config` returns 200 where it
previously returned 403.
