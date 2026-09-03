# Architecture Decision Records (DECISIONS.md)

Append-only. Each entry records **why** an architecturally significant decision was made — not *what* the code does (KNOWLEDGE.md) or *when* it shipped (DONE.md). Never rewrite an existing ADR; supersede it with a new one.

See `resources/rules.md` (Architecture Decision Records) and `resources/development-plan.md` §19.

---

## ADR-001 — Modular monolith over microservices for MVP
**Status:** Accepted (seed)
**Context:** Small team, greenfield, need fast delivery and low operational overhead; modules must still be sold/provisioned independently.
**Decision:** All module code deploys as a single modular-monolith application. Modules own routes/controller/service/repository and communicate via domain events or defined service interfaces — never direct imports of another module's internals.
**Consequence:** No microservices, Kubernetes, service mesh, or message broker without a later, explicit ADR. Clean module boundaries keep future extraction (Laboratory, Notification Engine first) realistic.

## ADR-002 — PostgreSQL with Row-Level Security for multi-tenancy
**Status:** Accepted (seed)
**Context:** Complete tenant isolation is an invariant; database-per-tenant is operationally heavy at MVP scale.
**Decision:** Shared database, shared schema, `tenant_id` on every tenant-scoped table, enforced by PostgreSQL RLS policies. Tenant context is set server-side per request; never trusted from client input. Schema-per-tenant / database-per-tenant reserved as a premium isolation tier.
**Consequence:** Every table ships with `tenant_id` + an RLS policy; every module has a tenant-isolation test.

## ADR-003 — RBAC with user-level overrides, over pure RBAC or full ABAC
**Status:** Accepted (seed)
**Context:** Need per-user grants/denies and time-bound access without a role explosion or a full policy engine at MVP.
**Decision:** RBAC + `user_permission_overrides` (grant/deny, optional validity window). Effective permission = union of roles' permissions + grants − denies; explicit DENY always wins. ABAC (WHICH-DATA/WHEN) fields are reserved in the check interface but not implemented for MVP.
**Consequence:** One resolution path for role, override, and temporary permissions. No parallel temporary-access engine.

## ADR-004 — Module entitlements as a runtime check, not a deployment decision
**Status:** Accepted (seed)
**Decision:** Entitlement is a runtime DB check (`requireModule()` before permission checks). `tenant_entitlements` materialized per (tenant, module, optional branch), with a state machine, never physically deleted.
**Consequence:** Selling/provisioning a module never requires a deploy or infra change.

## ADR-005 — E2E Networks as primary hosting provider
**Status:** Accepted (seed)
**Decision:** Primary hosting on E2E Networks (MeitY-empanelled, India data-sovereignty), managed PostgreSQL (E2E DBaaS) as a separate service from day one; Cloudflare in front for CDN/WAF/DDoS.
**Consequence:** India-residency posture for PHI; PM2/VM topology is an operational choice, not an architectural lock-in.

## ADR-006 — India-resident object storage as the default for PHI
**Status:** Accepted (seed) — legal justification **Pending Verification**
**Decision:** PHI-bearing files stored in India-resident object storage (E2E Object Storage) behind a FileStorageService; default-private buckets + short-lived signed URLs; DB stores metadata/references only.
**Consequence:** Conservative design decision. Not to be presented as a confirmed legal mandate until verified against a primary ABDM/MeitY source.

## ADR-007 — Provider abstraction over direct SDK dependencies
**Status:** Accepted (seed)
**Decision:** Every external provider (MSG91, AWS SES, object storage, DBaaS) sits behind an internal service (NotificationService/SmsService/EmailService, FileStorageService). No module holds a direct SDK dependency.
**Consequence:** Providers are swappable configuration, not load-bearing assumptions in business logic.

## ADR-008 — FHIR-aligned Provider/PractitionerRole model for specialty-agnostic core
**Status:** Accepted (seed)
**Decision:** Core clinical entities (Patient, Provider, Encounter, Diagnosis, Prescription, Invoice) are strongly typed and fixed. Provider/specialty aligns to FHIR Practitioner/PractitionerRole; specialty-varying structured data uses admin-configurable form templates, not per-specialty schema.
**Consequence:** Adding a specialty is a data change, not a migration. No EAV for core entities.

## ADR-009 — Vertical-slice, module-by-module MVP delivery
**Status:** Accepted (seed)
**Decision:** Deliver backend+frontend+integration+tests+docs+staging demo per module, not horizontal layers.
**Consequence:** Every milestone is demoable end-to-end on staging before the next starts.

## ADR-010 — Permission cache bounded by earliest temporary-override expiry
**Status:** Accepted (v2.2 review correction)
**Decision:** A cached permission set containing temporary overrides carries a cache expiry no later than the earliest `valid_until` among them. Setting `revoked_at` triggers immediate, targeted cache invalidation.
**Consequence:** A temporary or revoked permission can never remain effective in a stale cache entry.

## ADR-011 — Break-glass notification tenant-configurable; review never mutates RBAC
**Status:** Accepted (v2.2 review correction) — not implemented at MVP
**Decision:** When break-glass is built, admin/compliance notification is tenant-configurable, and post-event review is review-only — it never alters a user's role/permissions as a side effect.
**Consequence:** The authorization flow reserves a single insertion point for break-glass; MVP builds the reservation, not the feature.

## ADR-012 — Drizzle ORM over Prisma
**Status:** Accepted (this project)
**Context:** Tenant isolation via PostgreSQL RLS is an architectural invariant; RLS policies must be authored and maintained alongside the schema, and a per-request transaction must set the tenant GUC that RLS policies read.
**Decision:** Use **Drizzle ORM** (`drizzle-orm` + `drizzle-kit`) as the query layer and migration tool for `hms_backend`, over Prisma.
**Rationale:** Drizzle is SQL-first and thin — raw RLS `CREATE POLICY` statements and a per-request transaction that runs `SELECT set_config('app.tenant_id', $1, true)` are natural and explicit, with full SQL control over policies and indexes. Prisma's richer DX carries more magic and needs a client-extension pattern to set the session GUC per query, adding indirection precisely at the security-critical layer.
**Consequence:** The `runWithTenant()` transaction helper (Platform Core) is the single place tenant context is set; every repository runs inside it. Migrations are authored as Drizzle migrations with hand-written RLS policy SQL alongside generated DDL.

## ADR-013 — Monorepo keeps existing folder names; no `apps/*` rename
**Status:** Accepted (this project)
**Context:** The architecture specifies a pnpm+Turborepo monorepo with `apps/backend|portal|marketing` + `packages/*`. The repository already had `hms_backend`, `hms_frontend`, `marketing` committed and pushed to GitHub.
**Decision:** Adopt the Turborepo monorepo (package manager decided separately — see ADR-014) but **keep the existing folder names** (`hms_backend`, `hms_frontend`, `marketing`) rather than renaming to `apps/*`. Shared libraries live under root-level `packages/*` (`@hms/types|ui|config|utils|permissions`). A future mobile app is a root-level `mobile/` workspace member.
**Rationale:** Avoids churn on already-pushed folders while delivering the shared-package benefits the design depends on. `hms_frontend` **is** the Portal referenced as `apps/portal` in the source docs.
**Consequence:** `resources/architecture.md`, `resources/architecture.html`, and `resources/development-plan.md` are aligned to these names. Any later rename would itself be a new ADR with all doc paths updated in lockstep.

## ADR-014 — npm workspaces over pnpm (Turborepo retained)
**Status:** Accepted (this project) — supersedes the package-manager portion of the architecture's original "pnpm workspaces" statement and ADR-013.
**Context:** The architecture originally specified pnpm workspaces. pnpm is **not installed** in the development environment (only npm 10.9.2 / Node 22), and the team wants to run the whole monorepo from the root with plain `npm run …` commands (`npm run install:all`, `npm run dev`) without installing/enabling an extra package manager.
**Decision:** Use **npm workspaces** as the package manager (root `package.json` `"workspaces"` field, single root `package-lock.json`), and **retain Turborepo** as the task orchestrator (it is package-manager-agnostic). Root scripts: `install:all` (= `npm install`), `dev`/`build`/`lint`/`test`/`typecheck` (= `turbo run …`), `format` (Prettier). `packageManager` field pinned to `npm@10.9.2` (required by Turborepo to resolve the workspace).
**Rationale:** Zero extra tooling to onboard; `npm install` at root installs every workspace; Turborepo still gives concurrent `dev`, per-package labelled logs, caching, and affected-detection. Workspace package refs use `"*"` (npm does not support the `workspace:*` protocol).
**Consequence:** Deleted `pnpm-workspace.yaml`; removed per-app npm lockfiles in favour of one root lock; `resources/architecture.md`/`.html`, `resources/development-plan.md`, `CLAUDE.md`, and the root `README.md` reference npm. Verified: `npm run install:all` + `npm run dev` start backend (4000) + portal (3000) + marketing (3001) together.

## ADR-015 — Defense-in-depth tenant scoping (app-layer filter + RLS)
**Status:** Accepted (this project)
**Context:** The architecture relies on PostgreSQL RLS for tenant isolation, so queries inside `runWithTenant` need not filter by `tenant_id`. But a query that matches by a **non-tenant-unique** column (module key, role key, email) leaks across tenants if RLS is ever bypassed — and a **superuser** connection bypasses RLS entirely, which is the default local/dev connection (`DATABASE_URL=postgres`). An entitlement test surfaced this by seeing another tenant's row.
**Decision:** Queries that select/update by a non-tenant-unique column ALSO filter by `tenant_id` explicitly (belt-and-suspenders). RLS remains the primary DB-layer guarantee; the app-layer filter is defense-in-depth and makes correctness independent of the connection role. Queries matched by a globally-unique id (user_id, role_id, session_id) don't need it.
**Consequence:** Entitlement, RBAC (role-by-key, listRoles) and auth (login-by-email) service queries carry explicit `tenant_id` filters. Production must still connect as a non-superuser so RLS backstops id-based queries too.

## ADR-016 — MSG91 for transactional email (consolidating over AWS SES)
**Status:** Accepted (this project) — supersedes the Architecture Document's original AWS SES choice for email.
**Context:** The architecture chose AWS SES (ap-south-1) for transactional email and MSG91 for SMS/WhatsApp. SES is the cheapest per email (~₹8/1k) but is a second vendor with its own production-access approval, bare API, and reputation management. MSG91 (India-based, already being onboarded for SMS/WhatsApp with DLT) also offers transactional email.
**Decision:** Use **MSG91 for email as well as SMS/WhatsApp** at MVP — one India-resident vendor, one contract/dashboard/bill, simpler compliance story. The per-email cost difference is negligible at MVP volume. Everything sits behind the `EmailProvider`/`SmsProvider` abstraction (ADR-007), so this is a config/adapter choice, not a rewrite.
**Consequence:** `modules/notification/providers/` has MSG91 adapters + a dev log provider selected by config (`MSG91_API_KEY`). Architecture Document's Transactional Email Service section is updated to MSG91. Revisit AWS SES only if email volume grows enough that per-email cost dominates — swapping back is a new adapter behind the same interface.

## ADR-017 — Cloudflare R2 for object storage (no AWS)
**Status:** Accepted (this project) — refines the architecture's E2E Object Storage default toward Cloudflare R2 per an explicit "no AWS" directive.
**Context:** File/image storage sits behind the `FileStorageProvider` abstraction. The first adapter used `@aws-sdk/client-s3` — the standard S3-protocol client that Cloudflare R2's own docs recommend, and **not** an AWS service. But the "aws" in the package name conflicts with a firm no-AWS directive, and the team wants Cloudflare across services (Cloudflare is already the edge — CDN/WAF/DNS).
**Decision:** Use **Cloudflare R2** (S3-compatible object storage) as the object store, accessed via the **MinIO client** (`minio`) — a mature, non-AWS S3-compatible client. Removed all `@aws-sdk/*` packages. `FILE_STORAGE_PROVIDER=r2`, `R2_*` env. The same adapter works with any S3-compatible store (e.g. E2E Object Storage) by endpoint.
**Consequence:** No AWS dependency or account anywhere (email = MSG91 per ADR-016, storage = R2). **COMPLIANCE:** R2 defaults to global auto-placement; for PHI the bucket MUST be jurisdiction-pinned to India (architecture.md → File Storage flags this) and the metadata/log pipeline kept in-region, or India-residency for health data is not met. E2E Object Storage remains the drop-in alternative if a stricter MeitY-empanelled residency guarantee is needed.

---

## ADR-018 — Portal session model + RBAC-driven UI (client guards are UX, not security)
**Status:** Accepted (this project) — Phase 0 Portal foundation (Task #12).
**Context:** The Portal (`hms_frontend`, Next.js 16) runs on a different origin from the API. It needs a session model and a way to render each role's workspace. Invariant #2 forbids treating frontend visibility as security.
**Decision:** (1) **Session:** the access token is held **in memory only** (never `localStorage`, to avoid JWT XSS exfiltration); the long-lived refresh token stays in the backend's **httpOnly `SameSite=Lax` cookie**. On load/reload the Portal silently re-establishes the session via `POST /auth/refresh`, then loads `/auth/me` + `/rbac/permissions`. A 401 triggers one silent refresh + retry. (2) **RBAC-driven UI:** the menu and page guards (`useCan`, `<Can>`, `<RequirePermission>`) derive from the user's *effective* permission set, using the **same `@hms/permissions` keys the backend enforces with** — but these are **UX only**; every endpoint independently re-checks `auth → module → permission`. (3) **Design system:** all visual values come from `@hms/ui` tokens (`--hms-*`, Light default + Dark via `data-theme`), mapped into Tailwind's `@theme`; one Standard `DataTable` for all tabular data; tenant branding overrides a single `--hms-brand` token at runtime.
**Consequence:** No token in web storage; a hard reload costs one refresh round-trip (accepted). Menu/keys never drift from the server because both import `@hms/permissions`. Re-theming (Light/Dark, per-tenant brand) is a token swap, not a rebuild. Backend needed **no change** — existing `cors({origin:true,credentials:true})` + the `SameSite=Lax` refresh cookie already work cross-port. Client-side route guards must never be relied on for authorization; server checks are the boundary.

---

## ADR-019 — Ops baseline: versioned deploy/CI-CD/backup config + error-tracking abstraction
**Status:** Accepted (this project) — Phase 0 Ops (Task #14).
**Context:** The real infrastructure (E2E VM, managed PostgreSQL, Redis, Cloudflare, R2) is provisioned outside this repo, but the plan requires the VM/Nginx/PM2/deploy-pipeline and the backup+restore procedure to be **captured as versioned config from the start**, and requires structured logging + error tracking + a *drilled* restore (development-plan §16 IaC posture, §18 DevOps, §23).
**Decision:** Keep a lightweight, versioned **`deploy/`** baseline in the repo: PM2 ecosystem (3 apps), an Nginx reverse-proxy template (api/portal/marketing, Cloudflare real-ip), `backup.sh` (nightly `pg_dump` + verify + off-box copy to R2 + retention), `restore-drill.sh` (restores the latest dump into a throwaway DB and checks row counts — so recovery is a *proven* path), and a runbook. CI/CD: keep `ci.yml` (every push) and add `deploy-staging.yml` (auto-deploy on merge to `staging`; migrations run **before** app rollout; PM2 zero-downtime reload; all hosts/keys are GitHub environment secrets). **Error tracking** is a thin abstraction (`observability/errorTracker.ts`, ADR-007 pattern): logs `error.captured` by default, forwards to Sentry/GlitchTip when `SENTRY_DSN` is set — no call-site change. The **seed** ships 2+ Indian-context demo tenants with a user per role (staging only).
**Consequence:** Environments are reproducible and the later container migration has a documented baseline. Restore is runnable/drillable today; RPO/RTO are defined and validated in Stage 3. Secrets never enter the repo. The deploy templates require real hosts/DB to execute — they are not exercised in local/CI, so their first real run is validated at staging bring-up. Swapping in a real error tracker or a different process manager/host later is config, not an app rewrite (modular-monolith/PM2-decoupled per ADR-001).

---

## ADR-020 — Tenant onboarding is operator-driven (Super-Admin-created), not public self-registration
**Status:** Accepted (this project) — records the model that PRD/plan already imply; scopes the surface that builds it (development-plan §20A).
**Context:** A hospital/organization must be created (tenant + modules + first admin + branches) before anyone can use it. The PRD names a "Super Admin (SaaS) panel — tenant onboarding, plans, module provisioning" (Part I) and lists Tenant/User/Permission Management as Platform Core (Part IV/V). The development-plan states provisioning is **operator-driven at MVP**, with self-serve plan management + payment-integrated billing **explicitly deferred** (§296, R5, memory.md). Today the primitives exist as services (`provisionTenantRbac`, `grantModule`, `assignRoleByKey`, `branches`) but are wired only in `seed.ts` — there is no onboarding API or UI, so creating an org means editing the seed script.
**Decision:** Onboarding is **operator-driven**: a platform **Super Admin** creates a tenant through a Super-Admin-guarded **Platform Admin surface** (API + Portal UI, development-plan §20A) that provisions, in one flow: tenant → initial module entitlements → the **first `org_admin`** (temporary password now; email invite via `NotificationService` later) → initial branch(es). From then on, the tenant's `org_admin` self-manages users, roles/overrides, and branches **within** the tenant via the Org-Admin surface. **Tenant isolation is automatic** — the RLS template already applies to every `tenant_id` table, so a newly created tenant is isolated the instant its row exists; no per-tenant setup. **Public self-registration and payment-integrated self-serve plans remain out of scope** and are built in the Enterprise/Scale track (development-plan §25). Super-Admin/platform operations run **outside** `runWithTenant` (they are cross-tenant by nature) and are gated by a new `platform.tenants.manage` permission (super_admin/wildcard); every provisioning action is audited.
**Consequence:** No rewrite — this commits to exposing the existing provisioning services behind a `requireAuth` + Super-Admin-guarded `/api/v1/admin/*` API and a Portal Super-Admin area, replacing "edit the seed". The operator can onboard the first pilot from the UI. Self-serve stays deferred (no signup page, no gateway) until the Enterprise track. See [ADR-021] for the branding half of the tenant's setup.

## ADR-021 — Tenant branding is persisted server-side, extending the Phase-0 token layer
**Status:** Accepted (this project) — scopes the branding-admin surface (development-plan §20A).
**Context:** Phase 0 built the **branding token layer** (every visual value derives from `--hms-*`; the whole UI re-skins from `--hms-brand`), and the Settings page demonstrates it with colour presets applied through a **client-only (localStorage)** override. The `tenants` table has **no branding columns**, so per-tenant branding is not yet persisted; there is no colour picker, logo, or favicon upload. The PRD lists Branding (tenant logo, colours, typography — Part VIII) and Settings as Platform Core surfaces; rules.md requires branding be "tenant-configurable values consumed from the centralized branding system."
**Decision:** Persist branding **per tenant (optionally per branch)** in a `tenant_branding` table (tenant-scoped + RLS; nullable `branch_id` = org-wide default with optional branch override): brand/secondary colours, `logo_file_id`, `favicon_file_id`, typography JSON, `updated_at`/optimistic-lock. Logos/favicons are stored via the existing **`FileStorageService`** (no new storage path). The Portal loads the active branding at **session bootstrap** (`GET /branding/current`) and applies it by setting the `--hms-*` CSS variables — the **same seam** the current localStorage demo uses — so **no component changes** are required. Editing is an Org-Admin Settings surface (`platform.branding.manage`): colour picker (primary/secondary), logo + favicon upload with preview, reset-to-default, live preview. Light/Dark stays a per-user toggle; per-tenant *palette* customization layers on the token override.
**Consequence:** Purely additive — the token layer already routes every colour through `--hms-brand`, so this swaps the localStorage demo for server-persisted config without refactoring components. Branding survives across sessions/devices and renders for all of a tenant's users, in both themes; a second tenant sees its own. Deeper white-labelling (letterheads, per-branch overrides, custom fonts) extends the same table without schema churn.

---

## ADR-022 — The System Super Admin lives in a dedicated platform org, not a customer hospital
**Status:** Accepted (this project) — refines ADR-020.
**Context:** The System Super Admin is the **platform owner** (the vendor, Takoriya Technology LLP) who provisions the HMS to hospitals and operates across all tenants. Every user in the system belongs to a tenant (a `tenants` row) so that `requirePermission` can resolve the caller's role within their tenant. Initially the seeded super-admin was placed **inside the CITYCARE hospital** (`superadmin@citycare.example`) purely for login convenience — which conceptually makes the platform owner a member of a customer hospital. That is wrong: a hospital's own Org Admin should be the top of *that hospital*, and the vendor should sit above all hospitals, unattached to any.
**Decision:** Seed a **dedicated platform org** — tenant code `PLATFORM`, name "Takoriya Technology LLP" — that holds only the vendor's operators (the System Super Admin, `owner@takoriya.example`). It has **no modules, no branches, and no clinical data** (it is not a hospital). Customer hospital tenants (CITYCARE, SUNRISE, …) contain **no `super_admin` user** — their top role is `org_admin`. The super-admin still resolves `WILDCARD` from its `super_admin` role *within the PLATFORM tenant*, so cross-tenant onboarding (ADR-020) is unchanged; `runWithTenant(targetTenantId)` scopes each per-tenant operation to the hospital being provisioned.
**Consequence:** The two tiers are now clean — **Tier 0 = the platform owner (PLATFORM org)**, **Tier 1+ = each hospital (org_admin → … → cashier)**. A hospital can never hold a platform owner. The `PLATFORM` org appears in the operator's tenant list (it is a `tenants` row); a future `is_platform` flag could hide it from the customer-tenant list if desired, but that is not needed for correctness. No schema change — this is purely how the seed populates tenants/users.

---

## ADR-023 — Cross-tenant platform analytics are aggregate-only and super-admin-gated
**Status:** Accepted (this project) — governs the System Admin platform dashboard (development-plan §20B, user-journeys.md §1.3).
**Context:** The System Super Admin needs **platform-wide statistics across every tenant** (total orgs, hospitals, doctors, patients, staff, appointments, active/inactive counts, per-module entitlement usage). But the tenancy invariant (#1) and RLS scope *every* tenant-data query to a single `app.tenant_id`, and invariant #2 forbids one tenant's data leaking to another. A naive "see all rows" path would break isolation and expose PHI across hospitals.
**Decision:** Platform analytics return **aggregates only** — counts and metrics, **never another tenant's row-level records** (no patient rows, no clinical detail crossing a tenant boundary). Access is gated by `platform.tenants.manage` (super-admin/WILDCARD only). Read path, by scale:
- **MVP:** compute counts from the **platform-managed, non-RLS tables** directly (`tenants`, `branches`, entitlement counts) and, for tenant-scoped counts, **iterate tenants with `runWithTenant` summing COUNT(*)** — correct under a non-superuser app role, cheap at a few tenants.
- **At scale:** a **materialized `platform_metrics` snapshot** refreshed by a scheduled job (BullMQ), so the dashboard reads one small table instead of fanning out; or a dedicated **read-only `BYPASSRLS` role used strictly for aggregate queries** (never for row reads), whichever the ops posture prefers.
Org Admins get the **same dashboard scoped to their own tenant** via the normal RLS-enforced path (no special role) — invariant #2 holds unchanged.
**Consequence:** The System Admin gets true platform-wide visibility without ever seeing a hospital's PHI; the aggregate-only rule is the boundary. The implementation can start as a per-tenant aggregation loop and evolve to a snapshot table without changing the API contract or the security model. Any future "drill into a specific tenant's data" capability for support must be a separate, explicitly-audited, consent-bounded feature — not part of the analytics read.

---

## ADR-024 — Platform-level branding (Marketing + HMS scopes); the marketing site becomes dynamic
**Status:** Accepted (this project) — implements the design rule that Marketing and Portal branding are independent, System-Admin-managed scopes (resources/DESIGN.md §9.6). Complements ADR-021 (per-tenant branding).
**Context:** ADR-021 persists **per-tenant** branding (each hospital re-skins its own Portal via `--hms-brand`). Separately, the **vendor** (Super Admin, the PLATFORM org — ADR-022) needs to brand **two vendor-owned surfaces**: the **public marketing site** and the **HMS product default** (the palette a tenant sees before it sets its own). These are **platform-global**, not tenant data, and must be **independent** of each other (changing marketing must never touch the Portal, and vice versa). The marketing site is currently **fully static** (no backend calls, by design), so it cannot pick up admin-edited colours without a consumption path. Branding values must be centralized tokens (never hardcoded) and scalable to primary/secondary/accent/background/button/etc.
**Decision:** Add a **platform-global** `platform_branding` table keyed by `scope` (`'marketing' | 'hms'`, one row each) — **not tenant-scoped, no RLS** (it is vendor config, gated by permission, and holds no PHI). Each row carries a **scalable `tokens` JSONB** (validated shape: `primary, secondary, accent, background, surface, foreground, border, buttonBg, buttonFg`, all optional `#RRGGBB`), plus `logo_file_id`, `favicon_file_id`, `version`. Writes are **Super-Admin-gated** by a new permission **`platform.branding.platform.manage`** (WILDCARD/super_admin only) — distinct from the per-tenant `platform.branding.manage` org_admins hold. A **public, CORS-scoped `GET /public/branding/marketing`** (no auth) lets the marketing origin read its tokens. **Marketing becomes dynamic:** its root layout does a **server-side ISR fetch** of that endpoint and injects the resolved `--mk-*` overrides in an inline `<style>` before render (**no flash**, still CDN-cacheable; falls back to the built-in tokens if the API is unreachable). The **Portal** applies the platform **`hms`** default first, then layers the **per-tenant override (ADR-021)** on top. Assets use the existing **`FileStorageService`**. Super-Admin edits both scopes from a new Portal screen (two independent panels).
**Consequence:** The marketing site trades *fully-static* for *ISR-dynamic* (one cached backend read) in exchange for admin-controlled branding — a deliberate, reversible move (remove the fetch to revert). A new **platform-global table outside RLS** is introduced, justified because it is vendor-owned config, permission-gated, and PHI-free (consistent with ADR-023's platform-global tables). The two scopes are **independent by construction** (separate rows, separate token seams: `--mk-*` vs `--hms-*`). Per-tenant branding (ADR-021) is unchanged and now layers cleanly over the `hms` platform default. The scalable JSONB token shape absorbs future tokens without migrations. This extends ADR-021's centralized token seam rather than replacing it.

---

## ADR-025 — Money is integer paise on a standalone Financial Transaction Infrastructure
**Status:** Accepted (this project) — establishes the money convention (none existed) while building MVP-0 slice 1.3 (OPD & Check-in + Billing Core).
**Context:** Invariant #8 requires a single **Financial Transaction Infrastructure** where invoice/line-item/payment/tax primitives live, consumed (never reimplemented) by every billing-capable module. Slice 1.3 builds it first, and the codebase had **no prior money/amount/currency handling and no stated convention** — so this decision defines it. It must be correct and idempotent because Pharmacy, Lab, IPD, Insurance, and Financial Management all extend this one engine by adding a **new line-item type** (development-plan §24, §694).
**Decision:** Money is stored as an **integer number of paise** (₹1 = 100 paise) in **`bigint` columns** (`{ mode: 'number' }`, exact to 2^53 paise — comfortably hospital-scale) — never floats/`numeric`, so arithmetic is exact. Tax is **basis points** (`tax_rate_bps`, 1800 = 18% GST); all line/invoice totals are **computed server-side** in the `billing` service. The primitives are three tenant-scoped tables — `invoices`, `invoice_line_items`, `payments` (RLS auto-applied) — and **only** the `billing` module touches them. Payments are **idempotent**: the request carries an `idempotencyKey`, backed by a `unique(tenant_id, idempotency_key)` constraint + `onConflictDoNothing`, so a retried collection returns the original without double-charging (the notification-service idempotency pattern). The clinical **`opd`** module opens a bill only by calling `billing.createInvoice` (a draft consultation-fee invoice at check-in); it never reads or writes money tables. Invoice numbers use the tenant-monotonic count-format-retry allocator (like the patient UHID), guarded by `unique(tenant_id, invoice_number)`.
**Consequence:** One correct, idempotent money engine that later modules extend by adding a line-item type — no re-implementation, no float drift. The paise/bps integer choice keeps totals exact and the wire contract simple; the frontend formats via a small `formatPaise` helper and sends rupee input back as paise. Because OPD consumes billing through a service call (not the HTTP route), check-in can open a bill without granting the receptionist `billing.invoice.create`. A future move to multi-currency or `numeric` decimal would be a schema migration behind the same service contract, not a rewrite.

## ADR-026 — One centralized API-feedback layer with a token-driven Toast in `@hms/ui` (shadcn as pattern, not dependency)
**Status:** Accepted (this project) — establishes the permanent API-feedback standard for both frontends.
**Context:** Every mutating call in the Portal (and the marketing contact form, once wired) needs to tell the user what happened, and the backend already returns useful text — a `message` on success and the canonical `{ error: { code, message, details? } }` on failure. Today there is **no toast/notification component anywhere** (`@hms/ui` has `Alert` only) and no shared feedback path, so each new module would grow its own `if (success) … / if (error) …` handling and its own copy — divergent wording, silent failures, and a real risk of leaking a raw provider/stack error or PHI into the UI. shadcn/ui's Toast is the obvious ergonomic reference, but installing it means adopting Radix + the shadcn/Tailwind generator conventions into a codebase whose visual system is the token-driven `@hms/ui` (`--hms-*` / `--mk-*`, Light + Dark, per-tenant accent) — a second component library the design and dependency rules forbid.
**Decision:** Build **one** `Toaster` + `toast()` primitive **in `@hms/ui`**, styled entirely from design tokens with Lucide icons (spec: `resources/DESIGN.md` §5), following the shadcn/ui Toast **API and behaviour as a reference pattern without taking the dependency**. Notifications are raised from the **shared API client** (`hms_frontend/lib/api.ts` and the marketing equivalent), which classifies the outcome, extracts the API's own message, and picks the variant — page code does not write toast logic. The layer normalizes every failure mode (network, timeout, validation, 401, 403, 409, 429, 5xx, unstructured response), shows backend messages verbatim when usable, falls back to generic copy only when nothing usable is returned, and never renders stack traces, backend internals, or PHI — full detail goes to the structured logger / `errorTracker` (ADR-019).
**Consequence:** One implementation, one set of accessibility guarantees (`role="status"` / `role="alert"`, keyboard dismiss, reduced-motion), one place to change wording or placement, and both themes plus every tenant accent for free. Modules gain feedback by calling the API client, not by writing UI. The cost is that shadcn upgrades are not consumed automatically — the pattern is copied deliberately, which is the same trade already made for `Button`/`Card`/`DataTable`. Rules: `resources/rules.md` → API Feedback & Notification Rules.

## ADR-027 — SEO lives on the marketing site; the Portal is never indexable
**Status:** Accepted (this project) — establishes the permanent SEO/AEO/GEO standard and the private-surface boundary.
**Context:** The product needs search visibility in a specific market (hospital/clinic software, India, Gujarat, Ahmedabad), and the marketing site already ships `sitemap.ts`, `robots.ts`, and root-level metadata with Organization JSON-LD. At the same time the Portal is a multi-tenant clinical application: any crawler-visible string from it could expose a hospital's name, a staff member, or worse. Without a stated boundary, "add SEO" would drift into the Portal (share previews, indexable public pages, analytics on authenticated routes) and into fabricated trust signals (reviews, ratings, certification claims) that the PRD Regulatory Register already prohibits.
**Decision:** **All product SEO is owned by `marketing/`.** Public marketing routes carry unique per-page metadata, canonicals from `NEXT_PUBLIC_SITE_URL`, one `<h1>` and semantic structure, OG/Twitter metadata, and JSON-LD only for what the page actually shows (`Organization`, `SoftwareApplication`, `LocalBusiness`, `BreadcrumbList`, real `FAQPage`) — never fabricated reviews or ratings. Keywords are **mapped per page to matching intent** (the mapping lives in `marketing/KNOWLEDGE.md`) and used naturally or not at all; stuffing, hidden text, and duplicate metadata are prohibited. The **Claude SEO Skill** (https://www.claudeseoskill.com/) is the implementation reference, subordinate to this project's content guardrails. **`hms_frontend/` is `noindex, nofollow` end to end** — a Portal `robots.ts` disallows crawling, `/login` included — and no patient/tenant/staff/operational data may appear in metadata, a URL path, an OG image, or a sitemap. The same boundary governs telemetry: no PHI or tenant-identifying data to any analytics platform.
**Consequence:** Search intent is served by the surface designed for it, and the clinical application has one unambiguous rule (private, uncrawlable) instead of case-by-case judgement. Marketing SEO can grow (module pages, location pages, resources/blog) without ever touching Portal code. A genuinely public future Portal route (e.g. a patient-facing booking page) would need its own ADR to change this default, with an explicit data-exposure review. Rules: `resources/rules.md` → SEO / AEO / GEO Rules.

## ADR-028 — shadcn/ui installed as a CLI + reference layer; `@hms/ui` stays the canonical kit
**Status:** Accepted (this project) — extends ADR-026, which stands.
**Context:** ADR-026 chose to follow shadcn/ui as a *pattern* without taking the dependency, and the shared Toast was built that way. The owner then asked for shadcn to be installed for real in **both** `hms_frontend` and `marketing`, together with the official **shadcn agent skill** (`skills add shadcn/ui`) — but explicitly as **reference + CLI only**, not as a replacement for the design system. Without a recorded boundary this would drift into two competing component kits, and `shadcn init` had already demonstrated the risk: it rewrote `--font-sans`, injected a neutral OKLCH palette, switched dark mode to a `.dark` class the apps do not use, and **overwrote `marketing/components/ui/Button.tsx`**, the site's own token-driven button.
**Decision:** Install the shadcn CLI and config in both apps (`components.json`, `lib/utils.ts`, `@base-ui/react` + `class-variance-authority` + `clsx` + `tailwind-merge` + `tw-animate-css`; the `shadcn` CLI itself is a **devDependency**), with these boundaries:
1. **`@hms/ui` remains the single canonical component kit.** Shipped product UI comes from `@hms/ui`; shadcn is a source of *patterns and scaffolding*, pulled in with `shadcn add`, then reviewed and restyled before it ships.
2. **shadcn renders on our tokens, never its own palette.** Each app maps shadcn's semantic contract (`--background`, `--primary`, `--border`, `--radius`, `--sidebar-*`, `--chart-*`, …) onto `--hms-*` (Portal) / `--mk-*` (marketing) in `globals.css`. Its `.dark` block is deleted and `@custom-variant dark` is redefined to `[data-theme="dark"]`, the switch both apps actually use — so Light/Dark, per-tenant accent (ADR-021) and platform branding (ADR-024) cascade into shadcn components with no second palette.
3. **No collisions with existing components.** Marketing's `ui` alias points at `components/shadcn/`, not `components/ui/`, so the CLI can never overwrite the marketing kit again. The demo `button.tsx` generated by init was deleted rather than left unused.
4. **ADR-026 is unchanged:** notifications stay on the one `@hms/ui` toast raised from the shared API client. Replacing it with shadcn's would need a new ADR.
5. The **shadcn agent skill** (plus the bundled `migrate-radix-to-base`) is installed at `.agents/skills/`, symlinked into `.claude/skills/`. It reads `components.json` and `shadcn info`, so agents get this project's real configuration instead of guessing.
**Consequence:** `shadcn add <component>` now works in both apps and produces on-brand, theme-aware output — a fast path to primitives `@hms/ui` lacks (Select, Dialog, Command, Popover). The cost is a dependency set that is currently **unused in shipped bundles** (nothing imports `@base-ui/react` yet) and two `lib/utils.ts` files whose `cn` duplicates `@hms/ui`'s; both are scaffolding the CLI requires. If a shadcn component graduates into a real screen, it is reviewed like any other component (tokens, both themes, a11y) — and if the kit ever becomes the primary source, that is a new ADR superseding this one.

## ADR-029 — The Standard DataTable is rebuilt on TanStack Table, following the shadcn Data Table pattern
**Status:** Accepted (this project) — supersedes the implementation (not the intent) of the Phase-0 `DataTable`.
**Context:** `@hms/ui`'s `DataTable` (83 lines) rendered columns + rows with loading/empty/error states, and 12 Portal screens use it — but it had no sorting, pagination, search, filtering, column visibility, or row selection, so each screen was on course to grow its own. rules.md has always required one table covering all of it; the owner additionally specified the **shadcn/ui Data Table** as the reference implementation, which is a documented *pattern* over **TanStack Table** (`@tanstack/react-table`) rather than a component you can `shadcn add`.
**Decision:** Keep exactly one table, in `@hms/ui`, and rebuild its engine on **`@tanstack/react-table`** — headless, ~14 KB gzipped, framework-agnostic, actively maintained, no styling of its own. The parts mirror the shadcn composition (`DataTable`, `DataTableToolbar`, `DataTablePagination`, `DataTableColumnHeader`, `DataTableViewOptions`, `DataTableFacetedFilter`) but are styled entirely from `--hms-*` tokens and use Lucide icons, so Light/Dark and per-tenant accent hold. The column API stays a **superset of the existing one** (`{ key, header, cell }` plus optional `sortable`, `filterable`, `hideable`, `accessor`, `align`, `width`), so the 12 existing screens keep working and opt into features by adding flags rather than being rewritten. Client-side mode is the default; a server-side mode takes `pageCount`/`total` plus `onStateChange` and is what large datasets (patients, audit, MIS) use. Optional URL/query-state sync makes a table view linkable.
**Consequence:** One dependency added, audited under the Dependency Rules: TanStack Table is the engine behind the shadcn reference, is tree-shakeable, and replaces code we would otherwise hand-write and re-debug per module. Sorting/filtering/pagination semantics become identical platform-wide, and new modules ship a *configuration*, not a table. The trade-off is that the table's internals are now a third-party model — acceptable because it is headless (no visual lock-in) and the public props stay ours.

## ADR-030 — `DD/MM/YYYY` everywhere in the UI, formatted only by `@hms/utils`
**Status:** Accepted (this project).
**Context:** Ten screens formatted dates with bare `toLocaleDateString()` / `toLocaleString()`, which renders in the **viewer's machine locale** — `08/15/2026` on a US-configured browser, `15/08/2026` on an Indian one. For a clinical record that is not a cosmetic inconsistency: `08/09/2026` is ambiguous between 8 September and 9 August, and the platform serves Indian hospitals where `DD/MM/YYYY` is the norm.
**Decision:** Every user-facing date renders as **`DD/MM/YYYY`** (`DD/MM/YYYY HH:mm` with a time), produced by the centralized helpers in **`@hms/utils`** — `formatDate`, `formatDateTime`, `formatTime`, `formatDateRange`, `parseDate`, `toApiDate`, `isValidDate`, `compareDates`. Transport format is untouched: APIs, the database, and query parameters stay ISO-8601, and conversion happens once at the display boundary. No component calls `toLocaleDateString()`, hand-rolls a format, or adds a date library; date inputs convert through the same utility. No `date-fns`/`dayjs`/`moment` dependency — the formatting we need is a few dozen lines and stays deterministic across locales and timezones.
**Consequence:** Dates read identically for every user regardless of their machine locale, and a future change (a tenant-configurable format, a Hindi locale, hospital-specific timezone handling) happens in one module. Any component rendering a date is reviewable against a single rule.

## ADR-031 — The toast stays in `@hms/ui` after evaluating `@shadcn/toast`
**Status:** Accepted (this project) — confirms ADR-026 now that shadcn is actually installed (ADR-028).
**Context:** ADR-026 built the notification system in `@hms/ui` following the shadcn Toast *pattern*, because at the time shadcn was not installed and the Dependency Rules forbid a second UI library. Once shadcn was installed as a CLI + reference layer, the obvious question was whether to replace ours with the real registry component. `@shadcn/toast` (base-nova) was inspected before deciding: it is Base UI's toast (`@base-ui/react` + shadcn's `button`), and — contrary to the usual hook-only assumption — it exposes a module-level `createToastManager()`, so it *could* be driven from our API client outside React. It also brings swipe-to-dismiss, stacked-card animation, and upstream maintenance, and its classes (`bg-popover`, `text-muted-foreground`) already resolve to `--hms-*` after the init remap.
**Decision:** Keep the `@hms/ui` implementation. The deciding factor is packaging, not features: shadcn components install **per app** (`components/ui/`), so adopting it means either two copies (Portal + marketing — exactly what the one-system rule prohibits) or moving it into `@hms/ui` and making **`@base-ui/react` a runtime dependency of the shared package**, which currently ships nothing to the browser. Our version already satisfies every stated requirement — one system for both apps, variants on the semantic tokens, Lucide icons, the API's own message, `role="alert"`/`status`, Esc and manual dismiss, auto-dismiss with hover/focus pause, de-duplication, reduced-motion — and is verified live in both themes.
**Consequence:** No `@base-ui/react` in the shipped bundle and one notification implementation, unchanged. The cost is that swipe-to-dismiss and Base UI's stacking animation are not free — if either becomes a requirement, or `@base-ui/react` becomes a runtime dependency for another reason (Select, Dialog, Combobox are the likely first), revisit this with a superseding ADR: at that point the packaging objection disappears.

## ADR-032 — The toast IS shadcn/ui's Base UI Toast, adapted into `@hms/ui`
**Status:** Accepted (this project) — **supersedes ADR-031** and the toast half of ADR-026 at the owner's direction.
**Context:** ADR-031 kept the hand-written toast, on the argument that adopting `@shadcn/toast` would mean either two per-app copies or `@base-ui/react` as a runtime dependency of the shared package. The owner chose the registry component anyway: the platform should use the real shadcn component rather than an implementation of its pattern.
**Decision:** Generate the component with `shadcn add @shadcn/toast` (base-nova) and **move it into `@hms/ui`** (`src/components/toast/toast.tsx`) so there is still exactly one notification system for both apps. `@base-ui/react` becomes a real dependency of `@hms/ui`. Three deliberate adaptations, each annotated in the file so a future `shadcn diff` stays readable: `cn` comes from this package; shadcn's `Button` dependency is replaced with our `.hms-btn` classes (the shared kit must not carry a second button); and Base UI's `className`-as-a-function state API is merged rather than dropped. The viewport is lifted on desktop so it clears the shared `BackToTop`. **`src/toast.ts` is now a thin adapter** over Base UI's `createToastManager()` that preserves the existing call-site API (`toast.success(...)`, `toast.error({title, description})`) and adds de-duplication — both required because the shared API client raises every notification from plain TypeScript, outside React. Tailwind now compiles `@hms/ui` sources in both apps via `@source`, since the component ships Tailwind classes that resolve to `--hms-*` / `--mk-*` through the existing token remap.
**Consequence:** We get Base UI's behaviour for free — swipe-to-dismiss, hover/focus pause, F6 focus movement, stacked-card animation, upstream maintenance — and the old bespoke store, its `.hms-toast*` CSS, and the per-app generated copies are deleted. Costs: `@base-ui/react` now ships to the browser in both apps (it was installed but unused), and **toast removal is animation-completion driven** rather than timer driven, so a toast persists while a tab is backgrounded and clears when it is shown again. Notification content, variants, tokens, dark mode and de-duplication were verified live; dismissal timing was **not** verifiable in the agent's preview pane (it does not composite frames, so CSS animations never run) and should be eyeballed once in a real browser.

## ADR-033 — Mobile is an app shell: bottom bar + top-right drawer, desktop unchanged
**Status:** Accepted (this project).
**Context:** Both frontends were responsive in the ordinary sense — the Portal hid its sidebar under `md` and the marketing site collapsed its header into an inline panel — but on a phone that reads as a shrunken desktop. Hospital staff use the Portal one-handed, walking, on a phone; the destinations they need all day were two taps away behind a hamburger, and the marketing site's mobile panel pushed the page down instead of behaving like navigation.
**Decision:** Under the breakpoint, both surfaces present an **app shell**: a fixed **bottom navigation bar** with **at most five** primary destinations (icon + label, active state, safe-area padding), and a **hamburger in the top right** opening a **slide-out drawer** for everything else. Both come from one shared implementation in `@hms/ui` (`BottomNav`, `NavDrawer`, `NavDrawerItem`, `NavDrawerSection`) — never re-implemented per app. The drawer locks background scroll via the shared `useScrollLock` + `data-lenis-prevent`, traps focus, and closes on Esc / backdrop / navigation. **The Portal's five are derived from the same permission-filtered nav as the sidebar** (ordered by day-to-day use in `lib/nav.ts`), so a phone never offers a route the user cannot open; **the marketing site chooses its own five** from its information architecture (Home, Modules, Specialties, Pricing, Demo) rather than copying the clinical menu. **Desktop is untouched** — the Portal keeps its sidebar, marketing keeps its header nav, and the bottom bar is never rendered above the breakpoint.
**Consequence:** One navigation system to maintain for both apps, and the mobile experience matches what staff expect from a native app. Costs: page content needs bottom padding (`.hms-bottomnav-offset`) so the fixed bar never covers it, and the five-slot limit forces a real decision about what matters — which is the point. Adding a module means deciding whether it earns a slot or lives in the drawer.

## ADR-034 — Specializations are one reusable system, configured per specialty
**Status:** Accepted (this project).
**Context:** The marketing site described the product horizontally (platform, modules, security) but never answered the question a buyer actually asks: *does this work for my specialty?* The risk in answering it is the usual specialty-page pattern — twenty near-identical pages with the name swapped, which is thin content, bad for search, and dishonest about what differs.
**Decision:** Build **one specialization system**: `lib/specialties.ts` holds the data (22 specialties), `components/specialties/` holds the reusable presentation (`SpecializationCard`, `SpecializationGrid`, `SpecializationFeatureList`, `SpecializationModules`, `SpecializationSection`), and `/specialties` renders the full grid. **A dedicated `/specialties/[slug]` page exists only for specialties with genuinely differentiated content** — cardiology, dentistry, pediatrics, gynecology, physiotherapy, radiology — each stating that specialty's operational challenges, how configurable modules answer them, which modules a practice like it enables, and what gets configured. The rest appear on the index with a one-line summary until there is real content to justify a page. **The claim is always "configured differently", never "we have a module for your specialty"**: every page repeats that specialties differ in configuration, not code, and that a missing capability is named during the demo rather than after purchase.
**Consequence:** A new specialty is a data entry, not a new layout — "one reusable specialization system → many specialty configurations". Search intent ("hospital management software for cardiology") is served by pages with substance, and the honest disclaimer keeps the content inside the PRD's Regulatory Register guardrails. The judgement call moves to content: promoting a specialty to its own page requires writing real material for it, which is the gate that keeps the section from going thin.

## ADR-035 - Self-service profile: one screen for every role, editing only your own account
**Status:** Accepted (this project).
**Context:** Every authenticated user needed a place to see their account and change their password, and the obvious failure mode is a profile page per role plus an endpoint that takes a user id from the request body. The users table carries email, full name, status, MFA flag, last login and created-at; it has no phone, department, designation or avatar column.
**Decision:** One `/profile` screen built from reusable pieces (`ProfileHeader`, `ProfileAvatar`, `ProfileField`, `ProfileInfoCard`, `ProfileEditableCard`, `ProfileSecurityCard`), reached from the avatar and the nav. Two self-service endpoints: `PATCH /auth/profile` and `POST /auth/change-password`, both taking the user id **from the verified access token, never the body**, so the endpoints cannot be turned into an admin surface. The password change requires the current password (a stolen access token alone must not be enough) and **revokes every session for the user**, including the caller's, so the client signs in again. Fields the schema does not carry are **omitted rather than faked**.
**Consequence:** Adding a role needs no profile work. Phone, department, designation, avatar and notification preferences require an additive migration plus admin UI, tracked in BACKLOG.md; `PublicUser` gained status, lastLoginAt and createdAt, and `/auth/me` now returns the role keys already present in the token, at no query cost.

## ADR-036 - Rate limiting is tiered by risk; CORS is an allowlist in production
**Status:** Accepted (this project) - from the production security audit (SECURITY-AUDIT.md, H-1 and H-2).
**Context:** The API had **no rate limiting at all**, so `POST /auth/login` was open to credential stuffing and every expensive endpoint to application-layer DoS. Separately, `cors({ origin: true, credentials: true })` reflected any caller's origin while allowing credentials, which would let any website make authenticated cross-origin calls with a signed-in user's refresh cookie.
**Decision:** Rate limiting is **tiered by what an endpoint costs and what abusing it buys**, not one global number: a 300/min baseline across `/api/v1`; 10 per 15 minutes on credential routes, keyed by IP with successful logins not counted; 20 per 15 minutes on account-takeover-adjacent operations; and an expensive tier for uploads and reports. Authenticated requests key by user id so one user behind a hospital's shared NAT cannot exhaust the allowance for their colleagues. Refusals use the canonical `429 TOO_MANY_REQUESTS`, which the existing frontend feedback layer already renders. **CORS becomes an explicit allowlist in production** (`CORS_ORIGINS`), logging an error rather than silently allowing everything when unset; development keeps the permissive behaviour, where localhost ports move and the cookie is not `Secure`.
**Consequence:** Deployment now has a required variable (`CORS_ORIGINS`) and limits that must be tuned against real traffic; `RATE_LIMIT_IN_DEV=true` exercises them locally, since limits are skipped outside production so tests and local work are not throttled.

## ADR-037 - System Admin is a separate application context, not a super-powered tenant admin
**Status:** Accepted (this project) - partially implemented; see Consequence for what is deliberately not built yet.
**Context:** A super_admin resolves WILDCARD, so the single `NAV_ITEMS` list rendered **every** clinical destination for them: Patients, OPD, Pharmacy, Laboratory, Billing. The vendor's operator was therefore looking at a duplicate of every hospital's HMS, on top of the platform screens. That is wrong in three ways: it invites cross-tenant clicking with no explicit act of entering a hospital, it makes the platform surface grow every time a clinical module ships, and it blurs the security boundary the tenancy invariants depend on. Support staff also need to reproduce a customer's problem, and today the only ways are asking for the customer's password or querying the database directly.
**Decision:** Treat the platform as its **own application context** with its own sidebar, dashboard, permissions and audit expectations - not "tenant admin with more permissions".
- **Navigation splits by context.** `PLATFORM_NAV` (dashboard, tenants, branding, security + audit, profile) carries **no clinical items**; `NAV_ITEMS` stays the hospital's menu. `navForContext()` picks by whether the caller holds `platform.tenants.manage`, which only the vendor's super_admin resolves (ADR-020/022). This is UX routing; every endpoint still re-checks server-side.
- **Entering a hospital is explicit.** An operator reaches clinical screens only by starting a **support session** against a named tenant and user - never by a silently broader sidebar. Inside a session the normal tenant sidebar and the impersonated user's permissions apply, and the session must be visibly marked with an exit action.
- **New permissions, separately grantable** so support roles can be scoped later without handing out everything: `platform.support.view`, `platform.support.impersonate`, `platform.analytics.view`.
- **Impersonation rules (to build):** requires explicit permission; never exposes or requires the target's password; records initiator, target tenant, target user, start, end and a reason/ticket reference as audit events; grants exactly the target's permissions and never escalates (an operator cannot impersonate into more than the target holds, and cannot impersonate another platform operator); ends with an explicit exit that is itself audited.
- **Platform analytics stay aggregate-only** (ADR-023): counts and metrics, never another hospital's row-level records.
**Consequence:** The sidebar separation and the permission keys are in place now. **Not built, and deliberately not faked:** the support-session/impersonation flow, and the revenue half of the platform dashboard - there is no subscription, plan, or tenant-billing table anywhere in the schema (the `billing` module invoices *patients*, and paid plans are deferred to the Enterprise track by ADR-020), so MRR, ARR, subscription distribution, storage usage, uptime and support tickets have **no data source**. Those tiles will be built when the data exists rather than rendered with invented numbers; the metrics that do exist (tenants, active/inactive, new registrations, users, doctors, branches, module distribution, failed logins, security events, recent activity) are real today.

## ADR-038 - The marketing site states availability, and imagery must earn its place
**Status:** Accepted (this project).
**Context:** The marketing content was PRD-traceable but written in the present tense for the *whole* catalogue - 25 modules, FHIR, ABDM, DICOM, WhatsApp, payment gateways, "Runs on E2E Networks", "Most popular" on a pricing package - while what exists is Phase 0 plus the MVP 0/1 clinic core, verified locally and not yet deployed. Traceability alone does not stop a customer reading a roadmap as an inventory, and the complaint we are preventing is "your website says you have this, the product does not".
**Decision:** Two rules, both binding and both in `resources/rules.md`.
- **Claim accuracy.** Every claim traces to the PRD, architecture, development plan, a defined phase, or shipped code - and a capability planned for a later phase is **never written as currently available**. Screenshots, mockups, statistics, and illustrations are claims too. The site therefore carries an availability model rather than prose promises: `marketing/lib/availability.ts` defines `built` / `planned`, every module and integration carries a status, each clinic-core module page splits *what it does today* from *planned for this module*, and a shared `ReleaseNote` states the product's stage wherever the catalogue appears. Security practices are split the same way into *enforced today* and *commitment*. No popularity or adoption badge exists while we have no customers to count.
- **Imagery.** No image for decoration. The default visual language is typography, product UI, mockups, diagrams, data visualisation, brand geometry, and motion; an image ships only where it communicates better than the type already there, is proposed first (page, reason, aspect ratio, generation prompt, brand fit), and cannot imply an unsupported capability. No stock or generic healthcare photography.
**Consequence:** The site reads as a pre-release product with a published roadmap, which is what it is; breadth is still visible but labelled. A module's status changes **in the same change that ships it** - `lib/availability.ts` and the module's `live` / `planned` split are part of the Definition of Done for any shipped feature, not a marketing chore afterwards.

## ADR-039 - One Action column: `TableActions` replaces per-table row controls
**Status:** Accepted (this project) - supersedes the `ActionMenu`-only guidance in ADR-029.
**Context:** Row-level operations had drifted into a different shape per table: Patients used `ActionMenu`, Branches a secondary `Button` toggling active state with no confirmation, OPD and Appointments a row of labelled buttons, and the tenant-detail and user-detail screens bare `<button>` chips with an `X` that revoked a module, a role, or a permission override on one click. Same intent, five presentations, and destructive actions with no confirmation.
**Decision:** One Action-column system in `@hms/ui` (`components/table-actions/`): `TableActions` groups up to three inline icon actions, built from `ViewAction` / `EditAction` / `DeleteAction` / `ToggleAction` and the generic `TableAction` for context-specific operations, with `MoreActions` (the former `ActionMenu`, migrated and deleted) for the overflow. `actionsColumn()` fixes the column itself - last, right-aligned, headed "Actions", never sortable or hideable. The components own iconography, sizing, spacing, hover/active/focus, tooltips, accessible names, disabled reasons, loading state, confirmation, and permission gating; a module supplies intent only. An action the user is not permitted is not rendered - a UX affordance, never the boundary, since the server re-checks regardless.
**Consequence:** Every table's actions look and behave identically, and every destructive one confirms. `ActionMenu` is gone rather than kept alongside (clean-code rule); the tenant module list and the user's role and override lists became real DataTables in the process. New capability goes into the shared components, never into a page.

## ADR-040 - Branding comes from one token, and each app maps the shared components onto its own scope
**Status:** Accepted (this project).
**Context:** Two defects with one root cause. In the Portal, applying a tenant accent wrote the **same** hex into `--hms-brand` and `--hms-brand-hover`, so a branded control reverted to a flat colour on hover and had no pressed state - branding held at rest and broke on interaction. On the marketing site, shared `@hms/ui` components (back-to-top, bottom nav, drawer, toast) resolved `--hms-*`, which that app never defines, so they rendered the Portal's default teal instead of the marketing accent and ignored a platform-branding override entirely.
**Decision:** **Only `--hms-brand` is ever set.** Hover, pressed, subtle, and the focus ring derive from it in the token layer (`color-mix`, darkening on light and lightening on dark), so overriding the one slot re-skins every state; `applyBrandColor` and the no-flash script set that slot alone. **Each app maps the shared tokens onto its own scope once, in its global stylesheet** - marketing points `--hms-*` at `--mk-*` for both themes - rather than teaching components about two token sets. No component-level colour literal, in any form.
**Consequence:** A brand change propagates to buttons, links, navigation, table actions, the back-to-top control, and every interactive state, in both apps and both themes, with no component edits. The cost is one bridge block per consuming app, which is where a scope mapping belongs.

## ADR-041 - The platform is named Nirogix; internal identifiers keep the `hms` prefix
**Status:** Accepted (this project).
**Context:** The product had no name - "HMS" served as both the product and the industry term for a hospital management system. `nirogix.com` is now registered and Nirogix is the official name. A literal find-and-replace was available and wrong in two directions: it would have stripped "HMS" out of marketing copy where it is a legitimate search term hospitals actually type, and it would have renamed the `@hms/*` package scope, the `--hms-*` tokens, the `.hms-*` class names, and the `hms_backend/` and `hms_frontend/` directories - nearly every file in the repository - for zero user-visible gain.
**Decision:** **Nirogix is the product name in every user-visible string, document, and configuration:** the Portal title and shell, the login screen, the marketing wordmark and metadata, legal pages, the OpenAPI title, PM2 process names, the Nginx template, deployment docs, and the source-of-truth documents in `resources/`. **Internal identifiers deliberately keep their `hms` prefix** and are not to be renamed opportunistically: the two application directories, the `@hms/*` workspace scope, the design tokens, the CSS class names, and the local database name. **"HMS" survives in marketing copy only as the industry search term** - "HMS Software for Hospitals" targets real search intent (`marketing/KNOWLEDGE.md` keyword map) - never as the name of our product. Historical entries in `DONE.md` files and accepted ADRs are left as written, because both are append-only records of what was true when they were written.
**Consequence:** One rename, no churn: the brand is consistent everywhere a customer, hospital, or integrator can see it, while the codebase's internal vocabulary stays stable and diffs stay reviewable. The cost is a deliberate mismatch between the product name and the internal prefix, which this ADR and the note in `CLAUDE.md` exist to explain to anyone who wonders whether it was an oversight. Renaming the internals later remains possible as its own mechanical change, if a reason ever appears.

## ADR-042 - Flat, second-level hosts under one domain, per environment
**Status:** Accepted (this project) - the host map is `resources/domains.md`.
**Context:** With `nirogix.com` registered, the environments needed a structure that would not have to change later. The proposal on the table nested the test tier a level deeper (`test.portal.nirogix.com`). That shape has a concrete cost: Cloudflare Universal SSL and most free wildcard certificates cover `*.nirogix.com` and **not** `*.*.nirogix.com`, so every third-level host needs Advanced Certificate Manager or a per-host certificate. Separately, several candidate subdomains (admin, auth, webhooks) would have created new origins - and therefore new session, CORS, and audit surfaces - for boundaries the application already enforces server-side.
**Decision:** **One registrable domain, every host second-level, environment as a prefix.** Production is `nirogix.com` (with `www` 301'd to it), `portal.nirogix.com`, `api.nirogix.com`; staging is `staging.nirogix.com`, `portal-staging.nirogix.com`, `api-staging.nirogix.com`; development is localhost only, with `*-dev` names reserved should a shared dev tier ever earn its place. `docs`, `status`, `cdn`, and `mail` are reserved for the API reference, the uptime page, R2-backed file delivery, and the email sending identity. **Admin, authentication, and webhooks deliberately get no host:** System Admin is already a context inside the Portal (ADR-037), tokens are minted by the API which owns the refresh cookie, and inbound webhooks need the same validation, rate limiting, idempotency, and audit trail as every other endpoint. **Cookies are host-only** - no `Domain=.nirogix.com` - so a staging session can never be replayed against production, and `CORS_ORIGINS` lists only that environment's own origins (ADR-036).
**Consequence:** One wildcard certificate covers the platform, staging and production cannot cross-contaminate sessions or data, and adding a tier or a service is a naming decision rather than a restructuring. Per-tenant vanity hosts stay explicitly out of scope: tenant context comes from the authenticated session and never from the URL, and changing that would need its own ADR. Every environment URL now lives in `resources/domains.md` §8 and reaches the apps through configuration only.

## ADR-043 - System Admin dashboard: grouped navigation, token-drawn charts, and no metric without a source
**Status:** Accepted (this project) - builds on ADR-037 (System Admin is its own application context) and ADR-023 (aggregate-only cross-tenant reads).
**Context:** The platform screen was a flat list of stat tiles plus a "not reported yet" note - honest, but not a dashboard an operator could run a SaaS business from. A production reference design was supplied to work from. Its layout patterns are good; its *content* is a different product's: MRR, ARR, expansion revenue, plan mix, "top paying hospitals", storage provisioned across regions, uptime percentages, API request volume, webhook success rates. **None of those have a data source here** - there is no subscription, plan, or tenant-billing table in the schema, no metering, and no uptime monitor. Copying the layout with plausible-looking numbers in it would have produced a screen that lies to its only user.
**Decision:** Adopt the *structure*, derive the *content* from real rows.
- **Every tile is a query.** Growth comes from each record's own `created_at` via a new `GET /admin/trends` (monthly hospital / staff / patient / appointment series, each with a running cumulative seeded by everything created before the window); adoption from live entitlements; security from the audit trail, per day by severity; health from the API's own liveness and readiness probes. A period with no rows is a zero, never an interpolated point.
- **What has no source is named, not drawn.** Revenue, subscriptions, storage, uptime history and support tickets remain listed as pending on the screen itself. A wrong number on an operator's dashboard is worse than a missing one.
- **Navigation is grouped, and groups are the extension point.** `PLATFORM_NAV_GROUPS` / `TENANT_NAV_GROUPS` carry labelled sections (Customers · Platform · Account for the operator; Clinical · Revenue · Organization · Account inside a hospital). A new screen joins a group; a genuinely new area of the product adds one - the shell, the mobile drawer, and the permission filtering keep working untouched. A group whose every item is denied disappears rather than sitting above nothing. **No item is a placeholder for an unbuilt screen** (plans and subscriptions, platform reporting, integrations and API keys, system configuration, support tickets are recorded in the development plan and join a group when they are built).
- **Charts are ours, not a library's.** `AreaChart`, `BarChart`, `StatCard` and `UsageBar` in `@hms/ui` are dependency-free SVG/CSS on the design tokens: colours are passed in as tokens, so every chart follows Light/Dark and a tenant accent, and the platform avoids both the bundle cost and a second styling system to keep on-brand (rules.md → Dependency Rules). Each chart repeats its numbers in a visually-hidden table, and the hover cursor snaps to a real data point rather than reading out an interpolation.
- **`/dashboard` stops being a second platform dashboard.** It rendered a weaker copy of the platform stats plus the clinical quick links ADR-037 exists to prevent; a platform operator is now redirected to `/platform`, except inside a support session, where the hospital's own view is the point.
**Consequence:** The screen scales with the product: adding a metric means adding a query, and adding a section means adding a group. The reference design's revenue-facing half stays unbuilt on purpose, and the pending list is the running record of what a future Enterprise-track billing model would unlock. The chart components are deliberately small - genuinely new visualisation needs (geospatial, real-time streaming) would justify revisiting the no-dependency decision with its own ADR.

## ADR-044 - One dashboard layout, configured per role
**Status:** Accepted (this project) - extends ADR-043 (the System Admin dashboard) to every seat in a hospital.
**Context:** A second production reference design arrived, for a hospital administrator, with more role dashboards behind it (doctor, nurse, receptionist, lab technician, branch). Building each as its own page would have produced six screens that drift apart, and the reference's content again describes a different product: bed occupancy across 620 beds, IPD admissions, operating-theatre lists, department performance, approval queues. Nirogix has no in-patient, theatre, department or approval model, so those panels have no data source. What the reference *does* get right is the shape - context line, title, range control, KPI row, then panels - and that shape is worth having everywhere.
**Decision:** **One layout, many configurations.** `components/dashboard/DashboardShell` supplies the skeleton (`DashboardShell`, `KpiGrid`, `DashboardRow`, `RangeChips`, `PanelRow`, `PanelEmpty`); each role is a configuration of it, not a page design:
- **Hospital admin** - revenue billed vs collected, today's OPD load by hour, doctors on duty, low stock, registrations, capacity, quick actions.
- **Clinical roles** - doctor, receptionist, pharmacist and lab technician share **one** `ClinicalDashboard` component parameterised by role, because they differ in *which* work they own, not in how a dashboard reads.
- **Everyone else** - a `StaffDashboard` fallback that degrades to what the user's permissions actually reach, rather than to an empty screen.
- **Which dashboard you get is permission-derived, not role-name-derived.** A hospital can rename its roles; what someone is allowed to do is the truth. `/dashboard` picks: platform operator → redirect to `/platform`, can manage users or branches → hospital admin, clinical permission → that clinical view, otherwise the staff fallback.
- **One endpoint feeds them all.** `GET /dashboard/overview` is RLS-scoped to the caller's own hospital and returns only real rows: today's check-ins bucketed by hour and split scheduled/walk-in, today's queue counts, billed vs collected per day, registrations per day, total outstanding, pending lab orders, low-stock drugs, and today's load per provider. The clinical day is bucketed in **server-local time**, not UTC - an India-hosted deployment must not push the evening clinic into tomorrow.
- **The reference's unbuildable half is simply absent.** No bed board, no theatre list, no department table, no approvals queue: they are named in the development plan as waiting on the modules that would produce them (ADR-043's rule, applied again).
**Consequence:** A new role dashboard is a configuration and a few panels, not a design exercise, and a hospital's screens read as one product. The cost is a shared component that must stay generic - a role needing a genuinely different information architecture (a ward-level nursing board, say) should get its own layout and its own ADR rather than bending this one.

**Two defects surfaced while building it, both fixed:**
1. **Concurrent refresh storm.** `tryRefresh()` was not de-duplicated, so a page firing several requests at once turned one expired access token into one `POST /auth/refresh` per request. Each rotated the same `sessions` row in its own transaction, they serialised on that row lock, and the connection pool drained until every request timed out - reproduced on the local database as three `idle in transaction` sessions blocking six more. Refreshes now share a single in-flight promise. **Still open (`BACKLOG.md`):** the server holds its transaction across the rotation, so a genuine burst can still queue; that belongs with the session-rotation work in flight.
2. **The staff fallback advertised routes the user could not open** - it listed every tenant navigation item rather than the permitted ones, so a cashier saw links to Pharmacy, Users and Branches that would only ever 403.

## ADR-045 - DNS stays at GoDaddy; TLS is Let's Encrypt on the origin, with no edge tier
**Status:** Accepted (this project) - refines ADR-042, whose host map is unchanged.
**Context:** `resources/domains.md` was written assuming a Cloudflare zone: Universal SSL for `*.nirogix.com`, Cloudflare Access gating staging, the edge WAF absorbing abuse, and `deploy/nginx/nirogix.conf.template` restoring real client IPs from Cloudflare headers. The domain is registered at GoDaddy and its nameservers are `ns27`/`ns28.domaincontrol.com`, so none of that existed - the documentation described infrastructure we did not have, which is worse than describing none.
**Decision:** **Keep DNS at GoDaddy** and drop the edge tier for now. Consequences accepted deliberately: **certificates** are per host from Let's Encrypt via certbot on the VM (HTTP-01, so port 80 stays reachable); **staging is protected by Nginx basic auth** plus an `X-Robots-Tag: noindex` header, with the marketing app serving `Disallow: /` when `NEXT_PUBLIC_ENVIRONMENT=staging`, because a staging copy of a hospital system sits on public DNS with no access gate in front of it; **the origin IP is public**, so the VM firewall is the only network boundary; and **there is no WAF, DDoS absorption or edge caching** - the application's own tiered rate limiting (ADR-036) is the only such control in the request path. **`cdn.nirogix.com` is blocked, not merely reserved:** an R2 custom domain requires the zone to be on Cloudflare, so PHI documents continue to be served as short-lived signed URLs minted by the API through `FileStorageService`, which is what the architecture already does.
**Consequence:** `resources/domains.md` now describes the real arrangement, and the Nginx template no longer claims a Cloudflare origin certificate or trusts Cloudflare's `CF-Connecting-IP` (trusting that header without the proxy in front would let any caller spoof their own IP and defeat the IP-keyed rate limits). Moving to an edge later is a nameserver change plus re-issuing certificates - not a re-architecture - and the reasons to do it are recorded here: staging access control, DDoS absorption, and the R2 custom domain.

## ADR-046 - Universal date and time format: `DD/MM/YYYY`, `hh:mm AM/PM`
**Status:** Accepted (this project) - **supersedes the time half of ADR-030**, whose `DD/MM/YYYY HH:mm` (24-hour) is replaced. The date half is unchanged.
**Context:** ADR-030 fixed dates at `DD/MM/YYYY` and times at 24-hour `HH:mm`, on the grounds that 24-hour is unambiguous on a clinical record. In practice the platform's users - Indian hospital front desks, clinicians, pharmacists and cashiers - read and speak 12-hour time, and a schedule showing `16:45` is read more slowly than one showing `04:45 PM`. Mixed formats across modules would be worse than either choice.
**Decision:** One standard, everywhere a person reads a value:
- **Date** `DD/MM/YYYY` - `16/08/2026`, always zero-padded.
- **Time** `hh:mm AM/PM` - `04:45 PM`, always with the meridiem.
- **Together** `DD/MM/YYYY, hh:mm AM/PM` - the comma is part of the standard.
- **Transport is unchanged:** ISO-8601 for APIs, the database, query strings and `<input type=…>` values (`toApiDate`, `toApiDateTime`, `toApiTime`). Conversion happens once, at the display boundary.
- **Formatting lives in `@hms/utils` only**, and rendering in `@hms/ui`'s `DateDisplay` / `TimeDisplay` / `DateTimeDisplay`, which emit `<time datetime="…">` so a screen reader gets the unambiguous instant while the human gets the platform format. `formatTimeParts()` splits the meridiem out so schedules and pickers can render it as a **badge** rather than letting AM/PM blend into the numerals.
- **The two abbreviated forms a chart axis needs** - `formatMonthLabel("2026-08") → Aug 26` and `formatDayLabel("2026-08-16") → 16/08` - are also in `@hms/utils`. They exist because twelve `DD/MM/YYYY` labels cannot fit across an axis, and they are the **only** abbreviated date forms in the platform. A module never hand-rolls one.
**Consequence:** Changing the platform's format again is one edit in `@hms/utils`. The cost of this change was one test file and a handful of call sites, precisely because ADR-030 had already centralised formatting - which is the argument for keeping it centralised. Midnight and noon are the cases a naive `% 12` gets wrong, so they are pinned by test (`12:00 AM` / `12:00 PM`).

## ADR-047 - Print prints the document, not the application
**Status:** Accepted (this project).
**Context:** "Print" on the invoice and lab-report screens called `window.print()` on the page itself, so the output carried the sidebar, the topbar, the page header, the collect-payment form and the table's action buttons. That is a screenshot of an interface, not a document - unacceptable for an invoice, a receipt, a lab report or anything a hospital hands to a patient or files. Hiding the shell with `@media print` would have been the cheap fix, and it is the wrong one: the shell stays in the DOM, screen styles keep leaking onto the page, and nobody can see what will actually come out of the printer until it does.
**Decision:** **A printable document is its own route, in its own layout.** `app/(print)/` is an authenticated route group with **no application shell** - no sidebar, topbar, bottom bar or back-to-top - so what you see on screen is what prints. `/print/invoice/[id]` and `/print/lab-order/[id]` exist today; a new document is a new template under the same group.
- **One document kit** in `@hms/ui` (`components/print/`): `PrintDocument` (branded header, title, reference, meta, footer, confidentiality notice, generated-at stamp), plus `PrintSection`, `PrintFields`, `PrintTable`, `PrintTotals`, `PrintSignatures` and `PrintNote`. The page geometry, A4 `@page` margins, **repeating table headers across pages** (`display: table-header-group`), row and block break-avoidance, and print colour retention live in the stylesheet - a module supplies content, never print plumbing.
- **Structure is per document type, not one template forced on everything.** The invoice has line items, totals, payments and a receipt note; the lab report has a result table with reference ranges, an interpretation note and a verifying signature. They share the kit, not the layout.
- **Branding is the hospital's, or the platform's - never a mix.** `useDocumentBrand()` reads `GET /branding/current`, which is RLS-scoped to the caller's own tenant, so one hospital's logo or accent can never reach another's paperwork. With nothing configured, the document falls back to the Nirogix default. Printing waits for the brand to resolve, so a document is never produced without its own header.
- **Authorization is unchanged and re-checked:** the same `RequirePermission` as the screen, the same RLS-scoped endpoint. A user cannot print what they could not open, and the document contains only that record - no application state, no other patients, no debug data.
- **Print and PDF are the same artefact.** "Save as PDF" is the browser's own dialog over this same markup, which is why the two cannot drift. If a server-rendered PDF is ever needed (emailing a receipt, archiving), it renders **this template** headlessly rather than becoming a second definition of the document.
**Consequence:** Every future printable - prescription, discharge summary, appointment slip, statement, certificate - is a template plus a route, and inherits branding, pagination, signatures and the confidentiality notice for free. What is **not** solved: the hospital's address, phone, email, website and registration/GST numbers are not in the schema, so the header renders name and logo only. A tax invoice legally needs more than that, and `BACKLOG.md` U-8 names it as the blocker rather than the document inventing a placeholder address.

## ADR-048 - Date and time ENTRY: shadcn's date picker, promoted into `@hms/ui`
**Status:** Accepted (this project) - completes ADR-046, which fixed the display format but left entry on native controls.
**Context:** ADR-046 made every *displayed* date `DD/MM/YYYY` and every time `hh:mm AM/PM`. Entry was still six native `<input type="date">` / `type="datetime-local"` controls, and a native date input renders **in the browser's locale** - the same field reads `16/08/2026` on one machine and `08/16/2026` on another, with `05/01/2027` ambiguous on both. On a clinical record that is a data-entry defect, not a cosmetic one, and it made the standard hold at display while breaking at the keyboard.
**Decision:** Adopt **shadcn/ui's Base UI date picker** (Popover + Calendar) and promote it into the canonical kit, per ADR-028's rule that shadcn is a CLI + reference layer and `@hms/ui` is the kit:
- **`Calendar`** is the generated shadcn calendar restyled onto `--hms-*` and wired to our own `cn` - not shadcn's `lib/utils` and not shadcn's `Button`, both of which the generator pulled in and which would have been a second button system next to `@hms/ui`'s. The generated copies were deleted after promotion (clean-code rule: regenerable scaffolding does not stay).
- **`DateField`** owns its own text and its own calendar: typed and picked in `DD/MM/YYYY`, emitting ISO `YYYY-MM-DD`. Unparseable or out-of-range input restores the last good value rather than leaving a half-typed date for the form to submit.
- **`TimeField`** is `hh:mm` plus an **AM/PM toggle**, matching how the platform displays time and how hospital staff read a schedule; the value crossing the boundary stays 24-hour `HH:mm`, so nothing downstream learns about the meridiem.
- **`DateTimeField`** composes the two into one ISO instant rather than inventing a third control.
- **`react-day-picker` is the one new dependency**, and it sits in `packages/ui` where the kit lives. It earns its place: an accessible month grid with roving focus, keyboard navigation, disabled ranges and outside-day handling is genuinely hard to get right, and getting it wrong is a clinical defect. Its own `date-fns` dependency stays **internal to the calendar** - every date the platform renders still goes through `@hms/utils` (ADR-046), so ADR-030's "no date library for formatting" holds.
**Consequence:** The format standard now holds at entry as well as display, on every machine, and a new form gets it by importing a field. Both apps share the components, so the marketing site would render them identically if it ever needed one. The cost is ~30 KB of calendar in the Portal bundle and one more dependency to keep current; the alternative was hand-building an accessible month grid, which is the kind of thing that looks cheap and is not.

## ADR-049 - The Hospital Setup Console configures what the product actually has
**Status:** Accepted (this project) - creates the tenant-admin configuration surface promised by development-plan §20A, and closes `BACKLOG.md` U-8.
**Context:** After a hospital is onboarded by an operator (ADR-020), its own administrator had no single place to make it operational. Branding sat under a personal Settings page next to a theme toggle; branches, providers and users were three unrelated screens; the hospital's registered address, phone and GSTIN did not exist at all, so ADR-047's invoice printed a name and a logo and nothing a tax invoice legally needs. There was also no answer to "how far am I?" - nothing computed whether a hospital was ready to open.

The obvious reference designs for this screen (and the one the request arrived with) show tabs for Departments, Sub-departments, Procedures, Services & Packages, Treatment Plans and Ward/Room/Bed setup. **None of those exist in this product.** There is no department entity - `visits.department` is a free-text string; there is no service, package, procedure or treatment-plan model; and wards and beds belong to IPD, which is Phase 2 (`resources/phases.md`). Building tabs for them would have meant either inventing scope or shipping screens that open onto nothing.
**Decision:** Build the console over the configuration areas the product genuinely has, and record the rest rather than draw it.
- **`/settings` becomes the Hospital Configuration console**, with tabs for Setup overview, Hospital information, Branding and Enabled modules, and an overview grid linking to the areas that already have screens (branches, providers, users, the lab test master, the pharmacy drug master). **No area gets a second implementation** - the console is how they are found, not a copy of them.
- **Progress is derived, never stored.** `GET /setup/status` computes each step from the hospital's real data on every read, so a "finished" setup that later loses its only branch reports itself incomplete again. There is no wizard-completed flag to go stale, and the console is not a one-time flow - it is the permanent home of this configuration (requirement: setup must not be the only way in).
- **A step for a module appears only when the tenant is entitled to it** (ADR-004). A clinic without Laboratory is not told its setup is incomplete because it has no test master.
- **`organization_profile` is a new tenant-scoped table**, not columns on `tenants`: `tenants` is the tenancy boundary itself and is platform-managed, while this is data the hospital owns. Carrying `tenant_id` means it inherits the RLS policy mechanically. Every field is optional and the document header prints the lines that exist - **a wrong address on a tax invoice is worse than no address**, which is why nothing is defaulted or invented. Branch-level overrides are deliberately not built; the schema change is additive when a customer needs it.
- **One new permission, `platform.organization.manage`**, held by org_admin. Separate from `platform.branding.manage` on purpose: a GSTIN is not a colour, and a hospital may want different people responsible for each. Reading the profile needs only authentication, exactly like `GET /branding/current`, because printed documents and the Portal header need it and RLS already makes "any authenticated user" mean "of this tenant".
- **Adding a permission key now reaches existing tenants.** `provisionTenantRbac` only ran at onboarding, so a key added later would be enforced by the routes while no current customer's org_admin held it. `reconcileSystemRoles()` runs in `db:migrate`, is additive-only (it never removes a role or a grant, so tenant customisation survives a deploy), and is idempotent.
- **Appearance moved to `/profile`.** A theme is one person's preference, not the hospital's configuration; leaving it in Settings was what made that page feel like a drawer of unrelated switches.
**Consequence:** A hospital administrator has one console that says what is configured, what is next, and what is waiting on what - and every tick in it is true because it is measured, not remembered. Invoices can now carry a legally complete supplier header. What is explicitly **not** solved, and is recorded in `BACKLOG.md` rather than implied by an empty tab: departments and sub-departments, services, packages and procedures, treatment plans, ward/room/bed setup, billing and tax configuration, a custom-role editor, and per-branch profile overrides. Each of those is a data-model decision first and a screen second; the console gains a step the day one lands, because the step list is derived from what exists.

## ADR-050 - Departments are a real entity; the rest of the "hospital setup" catalogue is not
**Status:** Accepted (this project) - adds a Platform Core entity that Phase 0 should have had, and explicitly refuses the rest.
**Context:** ADR-049 built the Hospital Setup Console over the configuration the product actually had, and recorded eight absent areas in `BACKLOG.md` rather than drawing tabs for them. Reviewing that list against what a real clinic needs on day one separates two genuinely different things.

**Departments were a modelling defect, not a missing feature.** The only trace of one was `visits.department`, a free-text `varchar(80)` typed at check-in. That cannot be listed, cannot be reported on ("Ortho", "ortho" and "Orthopaedics" are three departments), cannot carry a head, cannot be retired, and cannot be referenced by a doctor. Every clinic routes patients by department and reads its register by department, so this is not deferrable scope - it is a hole under features that already shipped.

**The rest of the catalogue is genuinely later scope.** Sub-departments and procedures are taxonomy that departments plus a service catalogue already express. Services and packages are a real gap but a billing-model change, and belong with the priced catalogues that exist (lab tests, drugs). Treatment plans appear in no PRD section and no phase. Wards, rooms and beds belong to IPD - Phase 2 - and the MVP's stated segment is clinics and nursing homes **without inpatient beds** (`resources/phases.md`); shipping a bed table without admission, nursing, discharge and bed billing produces a furniture inventory, not a module.
**Decision:** Build departments now, at Platform Core, and leave the rest where the plan puts them.
- **`departments` is tenant-scoped** (`tenant_id` → RLS applies mechanically) with a nullable `branch_id` following the platform's convention: **NULL = organization-wide**, a branch id = that branch only. A single-site clinic never sets it.
- **Not module-gated.** A department is organisational structure every entitled clinical module reads, exactly like a branch. `requireModule` would be wrong: it belongs to Platform Core, not to one purchasable module.
- **`specialty_code` ties a department to the FHIR-aligned specialty catalog** rather than starting a second, competing taxonomy next to `practitioner_roles`.
- **Deactivated, never deleted.** Visits and encounters reference departments, and last year's register must still name the department it happened in. The only row action is a toggle, its confirmation states how many doctors are attached, and deactivation is audited at `notice`.
- **The free-text column stays.** `visits.department` keeps the value for rows that already have one, and check-in now writes both - the new `department_id` and the department's *name* into the old column - so every existing read keeps working while the migration stays additive and reversible. The text column is deprecated, and goes when no row needs it.
- **Referential rules live in the service, not only in the request schema.** A department cannot be scoped to another hospital's branch, headed by another hospital's provider, or reuse a code; a visit cannot be checked into a department that is another tenant's or retired. Building the tests surfaced why this matters: the uppercase-code normalisation existed **only** in the Zod schema, so `createDepartment` called from the seed stored `ortho` and the case-sensitive unique index happily accepted `ORTHO` beside it. Invariants belong where every caller passes, not at one edge.
- **Two permissions, not one.** `platform.departments.view` is held by org_admin, branch_admin, doctor and receptionist - the front desk books into a department and the doctor works one. `platform.departments.manage` is org_admin only.
**Consequence:** Departments are now a first-class part of setup (the console gained a step, and doctors depend on it), of check-in, and of the provider model. What is still deliberately absent, with the reason rather than a stub: sub-departments and procedures (folded into departments + the service catalogue when that lands), **services and packages** (the next real gap - `BACKLOG.md` E-3, and the one to build after this), treatment plans (no scope), and ward/room/bed setup (Phase 2, and only worth building as the whole IPD slice). The console derives its step list from what exists, so each of those gains a step the day its model does - and not before.

## ADR-051 - Five frontends, one backend: an origin per audience
**Status:** Accepted (this project) - **supersedes the deployment half of ADR-037** (System Admin stays a separate application *context*, but is now a separate *application*), and **supersedes `resources/domains.md` §5** rows for "Admin / backoffice" and "Customer-facing patient portal", which had decided the opposite.
**Context:** The platform had two frontends: the Portal (`hms_frontend`, every staff role plus the System Admin context) and the marketing site. Three audiences are now recognised as needing their own front door - the vendor's own operators, patients, and an AI surface - and the owner has asked for each to be its own application.

ADR-037 deliberately kept System Admin inside the Portal, and `domains.md` §5 recorded the reason: a separate host "would fork the session model and double the auth surface to protect, for a boundary the permission system already enforces server-side". That reasoning was sound and is now outweighed by three things it did not weigh. A platform operator and a receptionist share a JavaScript bundle, so a bug in operator code ships to every hospital. The two have different release cadences and different blast radii. And a patient audience makes a shared origin untenable regardless - a patient must never be one route away from a staff screen.
**Decision:** Five frontends, one backend, one origin per audience.

| App | Audience | Dev | Production |
|---|---|---|---|
| `marketing` | Public | `:3001` | `nirogix.com` |
| `hms_frontend` | Hospital staff | `:3000` | `portal.nirogix.com` |
| `admin` | Vendor operators | `:3002` | `admin.nirogix.com` |
| `patient` | Patients | `:3003` | `patient.nirogix.com` |
| `aiportal` | Authorised staff + operators | `:3004` | `nirogix.ai` |
| `hms_backend` | All of them | `:4000` | `api.nirogix.com` |

- **Folder names stay** (`hms_frontend`, `hms_backend`) - ADR-013 and ADR-041 hold. The new apps are `admin/`, `patient/`, `aiportal/`. A repo-wide rename buys nothing and invalidates every path in every document.
- **The backend is the only place any boundary is enforced.** Five frontends do not mean five authorization models: each one is a rendering surface, and every route it calls still runs `authenticated → tenant entitled → user permitted → business rule`. A frontend guard remains UX only (invariant #2), and that matters more now, not less - `admin` and `aiportal` are exactly the URLs someone will type by hand.
- **One origin per audience, host-only cookies.** Each app gets its own entry in `CORS_ORIGINS`. The refresh cookie stays host-only on the API, so no app can replay another's session, and no `Domain=.nirogix.com` cookie is ever set.
- **The System Admin context leaves the Portal.** `hms_frontend` keeps only tenant navigation; the platform context, its routes and its sidebar move to `admin`. This is what makes the split real rather than cosmetic - otherwise operator code still ships to hospitals.
- **`nirogix.ai` is the AI origin**, not a subdomain of `nirogix.com`. A different registrable domain means a different cookie scope by construction, which is the correct boundary for a surface with its own access rule.
- **The design system is shared, the business logic is not.** Every app imports `@hms/ui`, `@hms/types` and `@hms/permissions`, so typography, forms, tables, dialogs, toasts, empty/error/loading states, theming and accessibility behave identically. Nothing that decides *who may do what* is duplicated into a frontend.
**Consequence:** Five deployable apps, five origins, five `CORS_ORIGINS` entries, five certificates, and five build pipelines - real operational cost, accepted for the isolation it buys. `domains.md` is rewritten around this. What does **not** change: one backend, one database, one permission catalog, one audit trail, and tenant context that still comes only from the authenticated session and never from the URL or the app that called.

## ADR-052 - Patient identity is platform-level, with a link per hospital
**Status:** Accepted (this project) - the design the `patient` frontend is built on. Implementation follows this record.
**Context:** Patients have no login today. `users` is staff: tenant-scoped, keyed by organization code plus email. `patients` is a clinical record with no credentials at all. The obvious move - make a patient a `user` - breaks on the first real case: **a patient registered at three hospitals is one person**. A tenant-scoped principal would give them three accounts, three passwords, and no way to see their own history across the hospitals that hold it. That collides with the platform's first invariant, which resolves tenant from the session.
**Decision:** A patient principal that lives **above** the tenancy boundary, linked into it.
- **`patient_identity`** is platform-managed (no `tenant_id`, like `tenants`), keyed by a **verified** mobile number or email. Verification is the whole point: an unverified contact value is a claim, not an identity, and must never unlock a medical record.
- **`patient_identity_link`** is tenant-scoped (RLS applies) and joins one identity to one hospital's `patients` row. The link is created by the **hospital**, during its own registration flow - never by the patient. This is what "no public signup" means structurally, not just as a missing button.
- **The session carries the identity, the request resolves the tenant.** A patient signs in once, then chooses which hospital's records to view; the backend resolves the tenant **from the link**, re-checks it on every request, and scopes reads by RLS as usual. The URL never carries tenancy.
- **A patient principal is not a `user`.** It cannot hold staff permissions, cannot be granted one by an override, and is refused by `requireAuth` on every staff route - not by omission but by an explicit principal-type check, so a future permission grant cannot accidentally open a staff route to a patient.
- **Read-mostly, and only their own.** The portal exposes what the hospital has already given the patient: their profile, appointments, invoices and lab reports. It writes nothing clinical.
**Consequence:** One patient, one login, many hospitals - which is what patients actually experience. The costs are real and accepted: a second authentication principal, contact verification (OTP) with its own rate limiting and audit, a link lifecycle the hospital owns, and a cross-tenant identity table that must never leak which *other* hospitals a person attends. That last one is a genuine privacy risk and is why the identity table stores no hospital list the patient has not asked for; the link list is read per request, scoped, and audited.

## ADR-053 - The AI Portal ships as an authorization boundary, with no AI behind it
**Status:** Accepted (this project) - deliberately builds the security half and none of the product.
**Context:** `aiportal` was requested as the fifth frontend. There is **no AI capability anywhere in approved scope**: not in the PRD, not in the architecture, not in any phase. `phases.md` places it under *Postponed / Build-as-Sold* with a condition attached - "requires a CDSCO classification check before any diagnostic-support feature is built" - and ADR-038 plus the marketing capability reference both forbid claiming AI. Building a portal whose product does not exist is how a shell becomes a promise.
**Decision:** Ship the boundary, not the product.
- The app exists, uses the shared design system, and has **login only** - no signup, matching every other authenticated surface.
- Access is a real permission, **`ai.portal.access`**, checked server-side. It is granted to no role by default: an operator grants it deliberately.
- **A patient principal is refused explicitly**, by principal type, before any permission is consulted (ADR-052). Rejection is audited. Frontend route guards are not the control and never will be.
- The landing page states, in the product's own words, that no AI capability is enabled yet. It does not describe, illustrate or hint at one.
- Nothing is marketed. The capability reference lists the portal's status honestly and the never-claim list keeps every AI phrase on it.
**Consequence:** When an AI capability is scoped and approved - with the CDSCO check recorded first for anything touching diagnosis or treatment - it lands behind a boundary that already exists and has already been tested. Until then the repo contains a locked door and no room behind it, which is the honest state, and the capability reference says exactly that.

## ADR-054 - `@hms/client`: one implementation of the parts that must not drift
**Status:** Accepted (this project) - the shared frontend foundation ADR-051 made necessary.
**Context:** Splitting into five frontends duplicated more than layout. The admin console started life with copies of the Portal's `apiErrors.ts`, `feedback.ts`, `auth.tsx` and `Can.tsx`, and the two `api.ts` files carried the same ~140 lines of plumbing: access-token handling, the single in-flight refresh, the 401-retry, canonical error unwrapping, and the one-notification-per-call rule.

Two copies is tolerable. Five is a guarantee of drift - and the half most likely to drift is the security-relevant half: *when* a session is treated as expired, *whether* a failure is announced, and *whether* a message from the server is safe to render. A 5xx that leaks a backend internal into a toast is a defect that would then exist in one app and not another, which is worse than having it in both.
**Decision:** Extract the shared foundation into **`@hms/client`**, and draw the line at the audience boundary.
- **Shared:** typed errors; the feedback layer (ADR-026's single-notification rule and its "never render a 5xx message" guard); the HTTP core as a factory, `createApiClient({ baseUrl })`; the session endpoints every shell needs; the session/permissions context; and the `Can` / `RequirePermission` guards.
- **Per app:** the **domain endpoints**. Each frontend builds its own client and exposes only what its audience may call - which is exactly what keeps clinical calls out of the admin console and platform-administration calls out of the Portal (ADR-051). A shared *client* must not become a shared *API surface*, or the split it supports is undone from the inside.
- **Also per app:** the 403 panel, because each application sends a refused user somewhere different, and navigation. `RequirePermission` takes the panel as a prop rather than assuming one.
- **The provider is parameterised over the client** (`<AuthProvider api={apiClient}>`), so session bootstrap, refresh, expiry and permission resolution have one implementation while the endpoint surface stays narrow.
- Each app keeps thin re-export shims at the old paths (`lib/auth`, `lib/feedback`, `lib/apiErrors`) so pages import from one place and the move needed no page edits.
**Consequence:** `patient` and `aiportal` are wired to `@hms/client` before they have a line of their own code - the point of doing this now rather than after they copied the plumbing. The cost is a package boundary to respect: anything genuinely audience-specific must **not** drift into it, and the first sign of that going wrong will be a domain endpoint appearing in `@hms/client`. The feedback tests moved with the code, so the package owns its own proof.

## ADR-055 - AI Portal access is every staff role; the patient boundary is what matters
**Status:** Accepted (this project) - **supersedes the access-grant decision in ADR-053.** Everything else in ADR-053 stands: no AI capability, empty `capabilities`, audited entry, patients refused by type.
**Context:** ADR-053 granted `ai.portal.access` to **no role**, so an operator had to grant it per person. The reasoning was that a surface which may one day process clinical information should start closed.

In practice that made the portal unreachable for the people it is for. Every seeded role got the *Access restricted* screen; only `super_admin` reached it, and only incidentally, through WILDCARD. The owner's intent is that the AI Portal is for **the whole hospital team plus platform operators — everyone except patients**.

The per-person model also mis-identified where the risk actually is. The thing that must never happen is a **patient** reading AI tooling over their own records, and that was never enforced by this permission: it is enforced by the **principal-type check**, which refuses a patient before any permission is consulted (ADR-052). Keeping the key narrow bought no protection against the threat it appeared to address, while guaranteeing that the first person to open the portal saw a refusal.
**Decision:** Grant `ai.portal.access` to every system role - org_admin, branch_admin, doctor, receptionist, pharmacist, lab_technician, cashier - with super_admin covered by WILDCARD.
- **The key stays.** Widening the default does not remove the lever: an org_admin can still **DENY** it for one person, and an explicit deny beats the role grant (invariant #3). A hospital that wants to withhold AI tooling from a particular account still can.
- **Nothing else about the boundary changes.** A patient principal is refused by type, entry is still audited at notice, and `capabilities` is still empty with a test asserting it stays empty.
- **`reconcileSystemRoles()` carries it to existing tenants** on the next `db:migrate`, so hospitals onboarded before this change get it without re-onboarding.
**Consequence:** The portal is reachable by the team it was built for, and the access-restricted screen now means what it should - a deliberate denial, not the default state. The cost is that "who may open the AI Portal" is now a role-level answer rather than a per-person one; when a real AI capability lands, that question should be re-examined **per capability** rather than assumed to inherit this grant. A capability touching diagnosis or treatment may well deserve its own key, and the CDSCO classification check is still required before any such feature is built.

## ADR-056 - Patient self-registration by QR: the token *is* the tenant, and a submission is a request
**Status:** Accepted (this project) - the first unauthenticated write path in the product. Extends ADR-049 and holds ADR-052's line.
**Context:** A hospital wants a QR code at reception that a patient scans to send their details ahead. Two things could have gone wrong, and both are the kind that are discovered in production.

The first is **tenant resolution**. If the hospital is identified by anything the browser sends - a query parameter, a body field, a header - then "scan Hospital A's poster, land in Hospital B's records" is one edited request away, and the only thing standing between the two is a validation someone has to remember to write. The second is **what a submission means**. ADR-052 established that the hospital decides who becomes a patient record; "no public signup" is structural there, not a missing button. A QR form that writes straight into `patients` would quietly reverse that, and a hospital would find strangers in its patient list.

There is also a narrower question: what may a QR contain? It is printed on a poster in a public corridor and photographed by anyone. Anything encoded in it is published.
**Decision:** An opaque per-tenant token in the URL, resolving server-side to a **registration request**.
- **The QR encodes a URL and an opaque token, nothing else.** No tenant id, no patient id, no configuration, nothing authenticating. The token is 24 random bytes, base64url, not derived from anything internal.
- **The backend resolves the hospital from the token, on every public call.** Never from the body, a header or a query parameter. That is what makes "a QR for Hospital A can never register a patient under Hospital B" structural: there is no field in which to name a different hospital.
- **A submission writes to `registration_requests` and nothing else.** ADR-052 stands - the hospital still decides who becomes a patient record. The front desk verifies the person, checks for a duplicate, and converts.
- **Unknown token, retired token, and registration switched off all fail identically (404).** The endpoint must never become a way to ask which hospitals exist, or which are open.
- **Off by default; a hospital opts in.** Disabling keeps the token, so pausing over a holiday does not mean reprinting posters. Retiring a printed QR is the separate, deliberate `regenerate` - audited, and every existing poster stops working immediately.
- **Two permissions, split along the line that matters.** *Seeing* the queue is `patient.record.view`; *approving or rejecting* is `patient.record.create`, the same permission as registering a patient by hand. Binding both to the latter locked out the org_admin who switches registration on and prints the QR - the one person guaranteed to check whether anything arrived - while giving no protection, since approval was already gated. Both actions are audited at notice; the request row is kept and marked, because it is the provenance of a chart nobody on staff typed.
- **Rate-limited at the sign-in tier.** A public form behind a printed poster is exactly what a script finds.
- **Letterhead reuses `organization_profile`,** rather than a second identity store: the header line, footer text and default signatory sit beside the address they print above, so a hospital that corrects its phone number corrects it everywhere at once.
**Consequence:** A hospital can print one poster and stop typing addresses at the counter, without the platform gaining a public signup or a second way for a record to appear in a tenant. The costs are accepted: one public endpoint pair to keep watching, a review queue that someone must actually work, and a token whose regeneration invalidates physical objects in the world - which is why regenerating is a separate, confirmed, audited action rather than a side effect of switching the feature off.

## ADR-057 - React Toastify replaces the shadcn/Base UI Toast; the notification API does not change
**Status:** Accepted (this project) - **supersedes the toast implementation in ADR-032.** ADR-026's rule about *who* raises a notification is untouched and is the reason this swap cost nothing at the call sites.
**Context:** ADR-032 adopted shadcn/ui's Base UI Toast. It worked, but it carried a cost that grew with the number of frontends: ~200 lines of generated component whose styling lived in Tailwind utility classes, resolved onto `--hms-*` only indirectly through each app's shadcn token remap. Verifying "does a toast follow the tenant accent in Dark" meant reading four files in two packages.

The owner asked for React Toastify. That is a reasonable request on its own terms - it is the more widely known library, and its placement, timing, stacking, pausing and drag-to-dismiss behaviour are well-tested - but the question worth answering was *what must not change while swapping the engine*.
**Decision:** Swap the engine. Keep the seam.

- **The call-site API is byte-for-byte the same.** `toast.success(...)`, `toast.error({ title, description })`, `toast.warning`, `toast.info`, `toast.loading`, `toast.dismiss`, `toast.update`, with the same `ToastOptions`. **No page changed, and no page could have** - every notification already goes through the shared API client, which is ADR-026's whole point. A migration that touches call sites would have meant ADR-026 was not being followed.
- **The library stays inside `@hms/ui`.** Only two modules know `react-toastify` exists: the adapter (`src/toast.tsx`) and the viewport it mounts (`src/components/Toaster.tsx`). Anything outside this package that imported it would be configuring its own toast system, which is exactly what this decision forbids.
- **It remains callable from plain TypeScript with no React mounted**, because the shared API client raises every notification and is not a component.
- **De-duplication moved into the library.** The de-dupe key *is* the toast id, and liveness is read with `toast.isActive`. The previous adapter kept its own `Map` of key to id, which could hold an entry for a toast the user had already dismissed; that class of bug is now unrepresentable.
- **Theme and branding come only from the tokens.** Every `--toastify-*` variable is re-pointed at `--hms-*` in one block in `@hms/ui/styles.css`. No colour is passed at a call site, no component holds one, and the library's own `theme` prop is deliberately pinned to `light` and neutralised - Light/Dark is one definition, not two. A tenant changing `--hms-brand`, or a user switching to Dark, re-skins every toast with nothing else to update. Verified live: with `data-theme="dark"` and an accent of `#c026d3`, the surface, text, border, icon, accent edge and progress bar all resolved to the tokens.
- **Top-right, below the app bar**, on every application and breakpoint. The library's own `<=480px` rule sets `top`, `left` and `width` as literal values rather than through its variables, so the mobile offsets override the properties directly - without that, a toast on a phone covers the navigation.
- **Status is never carried by colour alone**: every variant renders a distinct icon *and* a title in words, and errors and warnings additionally take `role="alert"` where the rest take `role="status"`.
- **`@hms/ui` is the right home**, and each app still mounts `<Toaster />` itself. The marketing site mounts none: it has no authenticated API surface and no notifications, and giving it one would be pushing tenant behaviour onto a public page.
**Consequence:** One toast system, one package that knows the library, one palette mapping. The shadcn Toast component, its 200 lines and its Tailwind-class styling are deleted; `@base-ui/react` stays a dependency because `DateField` uses its Popover. The cost is a new runtime dependency and a stylesheet whose class names are the library's - which is why the token mapping is written in one commented block rather than scattered, and why the mobile override notes *why* it exists. If React Toastify is ever swapped again, the same seam makes it another one-file change.

## ADR-058 - Seeders are per environment, and refuse to run anywhere else
**Status:** Accepted (this project). The guard is built; the staging and production seeders are specified here and tracked in `BACKLOG.md`.
**Context:** There was one seeder, `db:seed`, with **no environment check of any kind**. It invents two hospitals, fourteen staff accounts with a known password, doctors, departments and patients. Pointed at a production `DATABASE_URL` - a copied env file is the realistic accident, not malice - it would interleave fake patients with real clinical records. There is no clean undo: the rows carry real-looking UHIDs and sit in the same tables, so removing them later means distinguishing invented people from actual ones after the fact.

The second, quieter problem: staging wants a *deterministic* dataset so automated E2E assertions stay valid, and production wants **no** dataset at all - only the bootstrap configuration a system needs to exist. One file cannot honestly serve three intentions.
**Decision:** One seeder per environment, each stating which environment it is for, each refusing to run anywhere else.

- **`development`** - realistic synthetic data for building and testing against: platform owner, demo hospitals, users across every role, doctors, staff, departments, patients, appointments. Synthetic throughout; **never real patient information**, and the passwords are known dev defaults precisely so nobody mistakes them for credentials.
- **`staging`** - a controlled dataset shaped like production, **deterministic** so QA, E2E and regression assertions can depend on it. Sized for demonstrations, not for load.
- **`production`** - **bootstrap configuration only**: the permission catalogue, system roles, and where genuinely required a first administrator account. No hospitals, no patients, no appointments, no demo anything. It runs explicitly, is idempotent, and is documented.

**The guard is the load-bearing part** (`src/scripts/seedGuard.ts`):
- A seeder declares its `intended` environment and throws unless `NODE_ENV` matches. A development seeder is refused in staging too, because staging's determinism is a contract that demo rows would break.
- It **additionally inspects `DATABASE_URL`** and refuses a non-production seeder against a host that does not look like development or staging. `NODE_ENV` is set by whoever runs the command; the connection string is the thing that actually decides which database gets written.
- The production seeder additionally requires `CONFIRM_PRODUCTION_SEED`, so it cannot run as a side effect of a script or a deploy step.
- Every seeder prints its target (credentials redacted) before the first write, so the destination is never inferred.
- A refusal exits **2**, distinct from a failure's 1, and prints a plain sentence rather than a stack trace - a stack trace invites someone to "fix" the guard.

**Deliberately awkward.** A seeder that adapts to its surroundings is a seeder that will one day adapt into production. Making the wrong command fail loudly is worth more than making the right command convenient.
**Consequence:** Three files where there was one, and a developer with a stale `NODE_ENV` sees a refusal instead of a seed. Accepted: the failure mode on the other side is fabricated patients in a live hospital database, which is a clinical-safety and regulatory problem, not an inconvenience. The guard shipped first because the risk existed the moment `db:seed` did.

## ADR-059 - One communication service; MSG91 stays behind it
**Status:** Accepted (this project). Extends ADR-016 (MSG91 as the provider) with the service contract and the OTP surface.
**Context:** The platform already routes SMS and email through `NotificationService` with MSG91 behind a provider interface (ADR-016), which is the right shape. Two gaps: there is **no OTP surface** - patient sign-in generates and stores its own six-digit code and sends it as an ordinary SMS - and the service is two loose functions rather than one named seam, which is what invites a module to reach past it.

MSG91 offers a managed OTP flow (send / verify / retry) with its own template and retry semantics. Whether to adopt it or keep generating codes locally is a real decision: the local implementation already hashes codes at rest and rate-limits, and it works identically for email, which the managed flow does not.
**Decision:** A single `CommunicationService` is the only thing that talks to a provider, and it exposes `sendEmail`, `sendSms`, `sendOtp`, `verifyOtp`, `resendOtp`.

- **Frontend never calls MSG91.** The path is Frontend → HMS API → CommunicationService → provider. The auth key is server-side only, and no template id, sender id or key appears in any bundle.
- **Every credential comes from configuration** - auth key, template ids, sender id, DLT entity, sending domain, from-name and from-address. None hard-coded, all named in `.env.example` as placeholders only.
- **OTP generation stays ours for now.** Codes are hashed at rest, single-use, expiring and rate-limited, and the same code path serves email and mobile. MSG91's managed flow may replace the transport later without changing the service's signature - which is the point of the seam.
- **Transactional messages are audited against the product's workflow**, not invented: sign-in codes, contact verification, password reset, hospital onboarding and approval, user invitation and activation, appointment confirmation / cancellation / reschedule, and administrative notices that a person must act on. **Nothing else.** A notification nobody needs trains people to ignore the ones they do.
- **A message is never sent that a person did not cause or need**, and no message carries clinical detail beyond what its purpose requires.
**Consequence:** One place to change providers, one place to review what the platform is allowed to send, and a credential surface that lives entirely in configuration. The cost is that adding a channel means extending the service rather than calling an SDK where it is convenient - which is the constraint, not a side effect. Live sending stays blocked on the operator checklist in `BACKLOG.md` (DLT registration, verified sending domain, approved templates), and until those exist the log provider is used and nothing leaves the machine.

## ADR-060 - Every editable record needs a correction path
**Status:** Accepted (this project). Extends ADR-039, which standardised *how* row actions look; this decides *which must exist*.
**Context:** ADR-039 built the Action column and settled its iconography, permissions, confirmation and accessibility. What it never said is which actions a table owes its users. An audit found the consequence: `appointments` and `pharmacy/stock` have **no row actions at all**, and `billing` and `opd` offer View only.

The concrete failure is mundane and common. A receptionist types a patient's name wrong. The record displays, correctly gated and audited, and there is no way to fix it. The data is wrong permanently, in a clinical system, because nobody decided the table needed an Edit.
**Decision:** **A record that can be displayed incorrectly must have a permitted, safe way to be corrected.** That is the rule; the rest follows from it.

- **Actions are chosen per table** from role, permission, record state and business rule - view, edit, delete, activate, deactivate, approve, reject, restore, or something module-specific. Not every action on every table: an action nobody may use is noise, and an action that contradicts a record's state is a bug waiting to be clicked.
- **Destructive actions confirm first**, through the shared `ConfirmDialog`, saying what will actually happen.
- **Clinical and administrative records prefer soft delete or deactivation.** Nothing medical is destroyed because someone clicked Delete unless the retention policy explicitly permits it - and retention, not convenience, is what decides.
- **The button is never the boundary.** Hiding Edit is UX. The backend re-checks permission on every call, so a direct API request from an unauthorised user is refused regardless of what was rendered.
- **Important changes are audited** - who, what, when, which record, and previous/new values where the audit policy requires them.
- **One editing pattern per workflow shape** - dialog, drawer or page, chosen by the record's complexity, built from the shared form and validation components. A bespoke edit implementation per table is how six subtly different save behaviours appear.
**Consequence:** Reviewing every table is now a Definition-of-Done item rather than something noticed when a user complains. The cost is that adding a table means deciding its actions deliberately, including deciding that a table is legitimately read-only - which is a defensible answer, but has to be an answer rather than an omission.

---

## ADR-061 - Application identity: favicon and default branding across the five frontends
**Status:** Accepted (this project). Applies ADR-040 (branding from the theme) and ADR-027 (noindex Portal surfaces) to each app's browser-level identity.
**Context:** An audit of all five frontends found the browser tab told the truth on only two of them. `marketing` and `hms_frontend` carry the Nirogix mark at `app/icon.svg`; `patient` (:3002), `admin` (:3003) and `aiportal` (:3004) still shipped Next's default `favicon.ico` and the untouched `create-next-app` scaffolding (`next.svg`, `vercel.svg`, `window.svg`, `globe.svg`, `file.svg`). Three of five product surfaces showed the framework's logo, or nothing, where the product's mark belongs.
**Decision:** An app states its identity through the Next App Router file/metadata conventions, never a hand-placed default asset.

- **The browser-tab icon is `app/icon.svg`** carrying the Nirogix mark — the same geometry as `BrandMark` in `@hms/ui`, with literal colours because a favicon renders outside the page's token scope. **One mark for all five**: they are one product on five origins, not five brands.
- **The `<title>` is per app** and set in each layout's `metadata` (marketing, Nirogix Portal, the patient portal, Platform Admin, AI Portal). No tab reads "Create Next App", a placeholder, or a sibling app's name.
- **In-app logos come from the shared system, not per-app copies.** `BrandMark` (token-driven) is the platform's own mark; a tenant's uploaded logo replaces it wherever the Portal shows one (branding admin, ADR-040). Marketing maps `--hms-* → --mk-*`, so the same component is on-brand there. No app duplicates a logo file.
- **Open Graph / social preview belongs only to the indexable surface.** `marketing` owns `opengraph-image.tsx`; the four `noindex` apps (ADR-027) carry no social image by design — a preview for a page no crawler may fetch is dead weight and a tenant-identifying leak risk.
- **No framework default ships.** `create-next-app` scaffolding is deleted in the same change that scaffolds an app, not later (clean-code gate).

The verification surface is fixed: browser tab, login page, header, sidebar, mobile navigation, and error/loading screens all resolve their mark from `BrandMark` (or the tenant logo), so a single source drives every appearance.
**Consequence:** Fixes the three default-favicon tabs. A new frontend inherits the rule — add `app/icon.svg` with the mark and a per-app `<title>` in the scaffolding change, and never leave `favicon.ico` or `*.svg` scaffolding behind. When a designed logo exists (BACKLOG U-3), it replaces the monogram in `BrandMark` and in the `icon.svg` files together, in one change.

---

## ADR-062 - Interactive, semantically-aware KPI stat cards
**Status:** Accepted (this project). Extends ADR-043, which built `StatCard` and forbade fabricated deltas.
**Context:** `StatCard` (ADR-043) already renders one KPI tile from tokens with a period-over-period delta and — the part that matters most — `invertDelta`, so a fall is coloured good or bad by what the metric *means* (wait time down is good; revenue down is bad). What it could not do is act as a destination. A dashboard number the user cannot click through to the records behind it is a dead end, and dashboards had begun hand-rolling clickable tiles around the component.
**Decision:** `StatCard` stays the one KPI tile for every dashboard — System Admin, Hospital Portal, and every role dashboard. No dashboard hand-rolls a stat card.

- **Semantic delta is the rule, not a nicety.** A trend's colour (`hms-stat__delta--good` / `--bad`) is decided by what the metric means, never by the sign alone. Not every decrease is bad; `invertDelta` (or an explicit neutral state) carries that intent, and a delta may only be passed when a real prior period exists (no fabricated deltas, ADR-043).
- **A card is clickable only when a click has a genuine destination or action** — Total Patients to the Patients table, Today's Appointments to Appointments filtered to today. A clickable card is a real link/button with proper hover, `focus-visible`, keyboard (Enter/Space) and active states and an accessible name; a card with nowhere useful to go stays static. Clickability is never added for visual uniformity.
- **Configuration only, per card:** label, value, unit / comparison label, Lucide icon, delta with direction and semantic meaning, optional sparkline/trend, optional destination, loading state (value `null` renders a skeleton, never a zero), and permission visibility — a tile the user may not act on is not rendered, matching the Action-column rule (ADR-039).

**Consequence:** This extends ADR-043 rather than replacing it — `StatCard` gains an optional destination and the interactive states that come with it. Rolling the clickable behaviour into the component and wiring the dashboards to it is tracked in BACKLOG; until then the existing static tiles remain correct, just not yet linked.

---

## ADR-063 - DataTable: every column visible by default, structured filtering, server-side where it matters
**Status:** Accepted (this project). Sharpens ADR-029 (the Standard DataTable) into two enforceable defaults.
**Context:** The Standard DataTable (ADR-029) already defaults to showing every column — a column is hidden only when its config sets `defaultHidden` — and already supports search, faceted filters, multi-level sorting, column visibility, and a server mode. Two gaps remained. First, a module can quietly over-use `defaultHidden`, so a user opens a table and does not see data that exists. Second, server mode reports only `page` / `pageSize` / `search` / `sort` back to the caller (`server.onChange`); a faceted filter changes local table state the API never receives, so on a large, server-paged dataset a structured filter silently filters only the page in the browser.
**Decision:**

- **All applicable columns are visible by default.** `defaultHidden` is an exception that needs a stated UX or performance reason in the column config, not a habit; a table shows its complete, relevant dataset on first render. The column-visibility control still lets a user hide or show columns by hand — a user choice, never the default.
- **A table provides the structured filters its module needs**, not a bare search box where the data is structured. Patients: name / ID / phone or email where permitted / gender / status / doctor / department / registration date-range. Appointments: patient / doctor / department / date-range / status / type. Users: name / email / role / department / status / branch. Billing: patient / invoice number / payment status / date-range / amount-range. The exact set is each module's business call. Filters use the shared toolbar controls — clear labels, multi-select where it fits, date-range and amount-range where it fits, search, clear-all, active-filter indicators, and a proper empty-results state — in the one fixed order **Search → Filters → Sort → Column visibility → Actions → Pagination**.
- **Large datasets filter on the server.** The table's `server` contract carries the active structured filters alongside `page` / `pageSize` / `search` / `sort`, so server-side search, filter, sort and pagination are one path and the browser never downloads a whole table to filter it. (Completing the `server.onChange` filter payload is the engineering follow-up in BACKLOG.)
- **No one-off tables.** Anything the Standard DataTable can express is configured, never re-implemented.

**Consequence:** Reaffirms the all-columns default as a rule a reviewer can enforce, and names the two fixes needed to honour it fully — an audit of existing `defaultHidden` usage, and completing server-side filter propagation. Both are tracked in BACKLOG; the table's public configuration does not change for callers that already show all columns and filter client-side.

---

## ADR-064 - Every DataTable column is left-aligned
**Status:** Accepted (this project). Narrows ADR-029 (the Standard DataTable) and the right-alignment ADR-039 gave the Action column.
**Context:** The DataTable let each column pick an alignment (`align: "left" | "center" | "right"`), and several used it — numeric columns (invoice total, balance, token, quantity, HTTP status) and the Action column were right-aligned, on the usual convention that figures scan better on a shared right edge. In a mixed table that produced headings and neighbouring columns sitting at different edges for no reason the user could see, and it read as inconsistent between the Portal and the admin console.
**Decision:** **Every DataTable column is left-aligned — heading and cells alike — with no exception.** The per-column `align` option is removed from the `Column` type, so a table cannot opt a column out: the `th`, the sort control and every `td` render left. The Action column (ADR-039) is left-aligned like the rest — still last and shrink-to-fit, only no longer right-aligned. This is **DataTable-only**: the print document kit (`PrintTable`) keeps its own alignment, because a printed invoice legitimately right-aligns money.
**Consequence:** One alignment across every table in both apps, enforced by the type rather than by convention — a new table cannot reintroduce a right-aligned column, and a reviewer has nothing to check. The `hms-cell--right/center` and `hms-th__sort--right/center` styles and every `align:` in a DataTable config were deleted as dead. If a numeric column's right edge ever genuinely aids reading, that becomes a deliberate, documented exception — not a per-page choice.

---

## ADR-065 - Letterhead image and configurable document page size
**Status:** Accepted (this project). Extends ADR-056 (the letterhead lives on `organization_profile`) and ADR-047 (the print document kit).
**Context:** ADR-056 gave a hospital the *text* letterhead — a header line, a footer strip and a default signatory — printed around content that already carried the logo, name, address and accent from Branding and Hospital information. Two things were still missing. Most Indian hospitals already have a **pre-designed letterhead** (name, logo, registration, address laid out as one printed strip) and want to use exactly that image rather than reconstruct it from fields. And every printed document was hard-wired to A4 — the sheet width in `.hms-doc` and the print `@page size` were literal — so a hospital that prints prescriptions on A5 or a US-based deployment on Letter/Legal had no way to say so.
**Decision:**

- **A letterhead image is part of the hospital's identity, so it lives on `organization_profile`**, as a `letterhead_image_file_id` resolved to a short-lived URL on read — the same file-storage path and the same tenant scope as the branding logo (ADR-040), never a second store. It is uploaded and removed through its own multipart route (`POST`/`DELETE /organization/profile/letterhead-image`, `platform.organization.manage`), and changes are audited. **When an image is set it becomes the document header** — the constructed name/logo/contact block is replaced, because a hospital that has uploaded a full letterhead strip has already put its identity in the image — and the document's own title moves to a bar beneath it.
- **Page size is one reusable configuration, never an A4 special case.** `document_page_size` (`A4` default, `A5`, `LETTER`, `LEGAL`) drives both the on-screen sheet width and a CSS `@page size` the print document injects itself (a bare `@page` cannot be scoped by selector, and the document renders one-per-page in a print route). A single geometry table maps each size to a width and a page keyword; adding a size is one row. `PrintDocument` takes a `pageSize` prop so a specific document type can override the hospital default without a new store.
- **Stored assets are embeddable cross-origin.** The token-authorized file content route now sets `Cross-Origin-Resource-Policy: cross-origin`: the frontends and every print document run on their own origins while the API serves the file, so helmet's default `same-origin` policy was silently blocking the branding logo and the letterhead alike. Access stays gated by the signed, short-lived token in the URL.

**Consequence:** A hospital uploads the letterhead it already prints and every invoice, receipt, prescription and report wears it, on the paper size it actually uses, with no per-document code. The same fix restores cross-origin embedding for the branding logo. The letterhead image prints once at the top of the document, matching the existing header behaviour; repeating it as a running header on every page of a multi-page document is a deliberate follow-up tracked in BACKLOG, not built here.

---

## ADR-066 - The OPD journey is enforced server-side: payment gates, master-linked orders, and locks
**Status:** Accepted (this project). Hardens ADR-025 (Financial Transaction Infrastructure) and the MVP-0/1 clinical slices; complements ADR-060 (correction paths).
**Context:** The clinical stack shipped in Phase 1 worked as a happy path but relied on the UI to keep the sequence honest. Nothing stopped a consultation on an unpaid visit; a re-saved draft encounter deleted and re-inserted its prescriptions and lab orders wholesale, which cascade-deleted an entered lab result and orphaned dispenses; draft-encounter orders already appeared in the pharmacy worklist; free-text orders had no link to the drug/test masters, so an unmatched lab order silently billed nothing and the consultation fee was whatever integer the browser sent; optimistic locking was check-then-act; dispense, payment and check-in were TOCTOU-racy; and a patient could be registered twice with the same phone and name without warning.
**Decision:**

- **Payment before consultation is a server rule.** Opening a *new* encounter and moving a visit to `in_consultation` both refuse (409) while the visit's invoice has an outstanding balance. Re-opening an existing encounter is always allowed.
- **The price of care comes from configuration, not the client.** `providers.consultation_fee_paise` is the check-in default (an explicit override is still accepted and audited); prescriptions may carry `drug_id` and lab orders `test_id`, validated against the tenant's masters, with names snapshotted server-side. A test-linked lab order is billed **at sample collection** (so cash can be taken before testing); result entry stays the fallback for free-text orders matched later. One billed line per clinical record is enforced by `hasSourceLine` + a DB unique index on `(tenant_id, source_module, source_ref)`.
- **A re-save never destroys downstream work.** `saveEncounter` syncs by row id: rows still `ordered` are updated/inserted/deleted to match the input; anything a downstream module has progressed (dispensed, collected, resulted) is immutable history and survives every save. Signing respects the visit state machine, bumps the visit version, and completes the originating appointment.
- **Pharmacy dispenses signed consultations only** — the worklist filters drafts out and `dispense` re-checks it — under `SELECT … FOR UPDATE` on the prescription and its batches. Payments lock the invoice row, answer idempotency-key retries with the original result, and refuse overpayment and settled invoices. Check-in, UHID and invoice-number allocation serialize on per-tenant advisory locks; visit/encounter updates are compare-and-swap on `version`.
- **Duplicate registration is a decision.** Same phone + (same name or same date of birth) → 409 `DUPLICATE_PATIENT` with the matching charts; proceeding needs `allowDuplicate`, and approving a QR request can instead **link the existing chart**.
- **Reading the chart is its own capability**: `GET /encounters/:id` and `GET /patients/:id/encounters` (signed history) under `emr.encounter.view`; a doctor's queue is `GET /visits?mine=true`, resolved from `providers.user_id` server-side. The doctor role reads the drug master (`pharmacy.stock.view`) because prescribing needs the formulary; dispensing stays with the pharmacist.

**Consequence:** The journey — register → check in → pay → consult → order → collect/dispense → result → settle — holds even against a hostile or buggy client, concurrent staff, and same-day re-registration. Clinical history can no longer be destroyed by an edit. The remaining financial gaps (invoice void/credit note, refunds, receipts as entities, a services/price catalogue beyond consultation + the two masters) stay tracked in BACKLOG (E-3, E-6) rather than silently absorbed here.

---

## ADR-067 - Services & packages catalogue, and manual billing lines
**Status:** Accepted (this project). Closes BACKLOG E-3's catalogue half; consumes ADR-025 (Financial Transaction Infrastructure).
**Context:** The only priced catalogues were the lab test master and the drug master, so a clinic could not bill a dressing, an injection, a procedure, or distinguish a follow-up from a new consultation — and an invoice, once opened by check-in, could gain lines only from dispensing and lab results. BACKLOG E-3 called this "the one remaining item that blocks ordinary clinic billing."
**Decision:** A tenant-scoped **`services` catalogue** (code unique per tenant and uppercased, name, department context, integer-paise price, bps tax, active flag) owned by hospital configuration (`billing.services.view|manage`, org_admin manages, cashier reads). Billing consumes it through **`POST /invoices/:id/lines`**: a catalogue line is **server-priced** — the client sends an id and a quantity, never a price — while a custom one-off line (description + price) stays possible for the genuinely uncatalogued. Ad-hoc service lines deliberately carry **no `sourceModule`/`sourceRef`**: the one-line-per-source dedupe exists for clinical records billed by machines, and the same dressing can legitimately be billed twice on one visit. The Portal gains the catalogue screen, an "Add item" flow on the invoice, and manual invoice creation (`POST /invoices` finally has a UI). Deactivate, never delete — billed lines are history. Packages (bundled services) remain the E-3 remainder.
**Consequence:** Ordinary clinic billing works: consultation via provider fee, drugs via dispensing, labs via collection, everything else via the catalogue or a typed line. Tax profiles / payer catalogues / numbering series stay E-6.

---

## ADR-068 - Referrals are pointers between visits, consumed by check-in
**Status:** Accepted (this project). Extends the OPD visit model (ADR-025's visit half, ADR-066).
**Context:** The workflow needed "doctor refers the patient to another department; the patient's information is transferred there." The dangerous reading is copying clinical data between department-shaped stores; the platform already has one chart per patient, so "transfer" must mean routing, not duplication.
**Decision:** A tenant-scoped **`referrals`** table: from-visit, patient, from-provider, to-department (required), to-provider (optional), mandatory reason, `pending → completed | cancelled`. The doctor raises it from the consultation (`opd.referral.create`, doctor role); the worklist (`opd.referral.view`, doctor + receptionist + org_admin) is the receiving side's queue. **Check-in is what completes a referral**: `POST /visits/check-in` accepts `referralId`, takes the patient (never trusted from the client alongside it), defaults department/provider from it, links `resulting_visit_id`, and flips it to completed inside the same transaction with CAS on `pending` — two desks cannot both consume one referral, and a cancelled or used referral checks in nobody. The receiving doctor opens the same chart; the patient's history IS the transfer. No referral is deleted; a wrong one is cancelled.
**Consequence:** Cross-department routing with provenance and a worklist, no second copy of any clinical fact, and the existing payment/queue/consultation rules apply unchanged to the resulting visit.

---

## ADR-069 - Provider weekly rosters, bookable slots, and public appointment requests
**Status:** Accepted (this project). Closes BACKLOG E-8's roster half; applies the ADR-056 pattern to booking; second entry in the ADR-056 public-surface register.
**Context:** Appointments were free-form timestamps — no availability model, so no slot picking and nothing to hang public booking on. The product needed "hospital gets a link/QR; patients request appointments" without violating ADR-056's rule that the product must not casually gain unauthenticated write paths.
**Decision:** Three pieces, deliberately separable:
- **`provider_schedules`** — recurring weekly windows (weekday, HH:mm start/end, slot minutes), replace-the-week editor under `providers.manage`. **Opt-in enforcement:** a provider with no active windows keeps free-form booking; with windows, `bookAppointment` refuses a start outside them (409) — one rule for staff, converted requests and any future channel.
- **`GET /providers/:id/slots?date=`** — the day's windows cut into slot starts minus booked appointments; `hasRoster:false` tells the UI to fall back to free-form entry. Times are hospital wall clock (single-timezone deployment profile), appointments stay timestamptz.
- **Public appointment REQUESTS** — a second opaque token + toggle on `organization_profile` (`/public/booking/:token`), same contract as ADR-056: tenant resolved server-side from the token, sign-in-tier rate limit, uniform failure for unknown/retired/disabled, and the submission is a **request row** (`appointment_requests`), never an appointment or a patient. The front desk converts it: patient through the DUPLICATE_PATIENT flow (link existing or knowingly create), appointment through the same `bookAppointment` as staff — roster and double-booking rules identical. The patient app serves the public form; the Portal gets the settings page, poster, and review queue.
**Consequence:** Booking gains structure without breaking unconfigured hospitals, and the public surface register holds at exactly two entries, both request-shaped. Reminders/notifications on approval stay with the ADR-059 transactional-coverage audit.

---

## ADR-070 - Lab verification & report files; ledgered stock corrections & suppliers; env-gated AI drafting and browser dictation
**Status:** Accepted (this project). Extends ADR-066 (lab lifecycle), ADR-060 (correction paths), ADR-053 (AI boundary discipline).
**Context:** Four workflow gaps with one shared theme — sign-off and provenance: results reached the patient portal the moment a technician typed them; a report was one varchar with no attachable document; a wrong stock figure had no permitted correction; and "AI prescriptions / voice input" had to exist without becoming a stub, a liability, or a second notification-style bolt-on.
**Decision:**
- **Lab:** `resulted → verified` (`laboratory.result.verify`, its own key so a hospital can split enter/verify by DENY-override). **The patient portal shows verified orders only**; the doctor's view never waited on verification. Re-entering a result (the ADR-060 correction) drops the order back to `resulted` and clears the sign-off — a corrected value is re-verified or it is not released. `lab_results.file_id` attaches the report document through the existing file module (short-lived URLs on both the staff and portal reads).
- **Pharmacy:** `suppliers` (who a batch came from; batches carry `supplier_id`) and **`stock_adjustments`** — a correction is a signed delta + mandatory reason in its own ledger row, applied under `FOR UPDATE`, never below zero, never a silent UPDATE. Closes the BACKLOG "correcting a wrong stock figure" row.
- **AI prescription drafting:** exists **only when `ANTHROPIC_API_KEY` is configured** — `GET /ai/capabilities` reports it and the Portal renders no control otherwise (a feature that is absent, never disabled chrome). The draft endpoint (`emr` module, `emr.encounter.write`) sends the clinical minimum — complaint, ICD codes, vitals summary, the hospital's formulary names — and **never a patient identifier**; it returns rows into the same form the doctor could have typed, matched to the drug master where names align, and nothing persists until the doctor saves. Audited (`emr.ai_draft`). One provider call site, no SDK dependency.
- **Dictation** is the browser's own speech engine appending into the note fields — rendered only where the engine exists, no audio ever touches the backend.
**Consequence:** The lab chain matches practice (enter → verify → release), stock figures become correctable with provenance, and the AI/voice asks land inside the product's honesty rules: marketing may say exactly what is true — drafting exists on deployments configured for it, and a doctor signs everything.

---

## ADR-071 - Three canonical environments: development, staging, production (`local` retired, `test` is the runner only)
**Status:** Accepted (this project). Relates to ADR-058 (one seeder per environment), ADR-042/ADR-051 (host map), issue #7 (dev quick-login gate), issue #9.
**Context:** The environment vocabulary had drifted — `local`, `dev`, `development`, `test`, `testing`, `stage`, `staging`, `prod`, `production` all appeared across `.env` files, the frontend quick-login gate, docs and heuristics, and `local` vs `development` were used interchangeably for a developer's machine. That ambiguity is a foot-gun for a product where "is this production?" gates real safety behaviour: rate limiting, secure cookies, seeder refusal (ADR-058), the PHI bucket boundary, and the dev-only test-user credentials (issue #7).
**Decision:**
- The application has **exactly three** environments: **`development`** (a developer's local machine), **`staging`** (the shared QA/demo deployment), **`production`** (the live product). One identifier per side: **`NODE_ENV`** on the backend, **`NEXT_PUBLIC_ENVIRONMENT`** (build-inlined) on every frontend. Both name the same three values.
- **`local` is retired** in favour of `development`. The dev machine still runs on `localhost` — that is a host, not an environment name. (`FILE_STORAGE_PROVIDER=local` is unrelated: it names the on-disk storage backend.)
- **`test` is not a deployment environment.** It is the value the test runner (Vitest / CI) sets, kept in the backend Zod enum only so importing config during a test run validates instead of `process.exit(1)`. It behaves as non-production everywhere — `isProd` is false, and `seedGuard` normalises it to `development`.
- **Validation.** The backend validates `NODE_ENV` at boot (Zod enum; an unsupported value such as `local`/`prod`/`stage` exits with a clear message). The frontends treat an unset value as `development`, gate dev-only features to `development`/`staging` with **inline, build-folded** comparisons (so a production bundle physically drops the code and its credentials — issue #7, never a function call that would defeat the fold), and `console.warn` in development on a non-canonical value.
- **Infrastructure-name heuristics stay broad, and are documented as separate from the model.** The seeder's `DATABASE_URL` check and env.ts's `R2_BUCKET` marker still recognise a non-production resource by name fragments (`dev`/`local`/`test`/`staging`/…). They guard against a *mislabelled resource*, not against the environment identifier, so their tolerance is deliberate and commented as such.
**Consequence:** One vocabulary end to end. "Which environment am I?" has a single, validated answer, and every safety switch keys off it consistently. Each app's `.env.example` names the three environments and states what each turns on. Retiring `local` touched only the frontend gate + `.env`/`.env.example`; the backend was already on the three values (its enum already rejected `local`).

---

## ADR-072 - System master data + hospital custom data (predefined catalogues)
**Status:** Accepted (this project). Relates to ADR-008 (specialty catalog as global seeded data), invariant #1 (RLS isolation), invariant #5 (no EAV on core entities), issue #13.
**Context:** Hospital Admins re-typed standardised reference data (lab tests, drugs, services, departments) from scratch on every tenant, and there was no vaccination model at all. We want predefined, seeded master data for common/standard items, plus hospital-specific custom values, **without weakening tenant isolation**. The obvious "one table, `tenant_id NULL = system`" idea does not work here: the uniform RLS policy is `tenant_id = current_setting('app.tenant_id')`, which excludes NULL rows (fail-closed), so a NULL-tenant "system" row would be invisible to everyone, and making it visible means editing the security-critical, uniformly-applied `tenant_isolation` policy.
**Decision:**
- **Two tables, one read model.** `reference_catalog` = **system** master data: **global, no `tenant_id`** (so the RLS auto-policy — which only targets `tenant_id` tables — never applies, exactly like `specialties`/`platform_branding`), keyed `(category, code)` with a jsonb `attributes` for pre-fill hints, seeded from code data-files in **all three** environments (so production has it, like the specialty catalogue). A hospital can read it but has no way to write it. `tenant_reference_items` = **hospital custom** data for simple-list categories (e.g. vaccines): tenant-scoped, so it receives the standard isolation policy and one hospital's custom items are invisible to another. The API unions the two by `category`, tagging each row `system|custom`.
- **Richer priced catalogues keep their existing tenant tables.** `lab_tests` / `drugs` / `services` stay tenant-scoped for custom+priced rows and gain a **nullable `catalog_code`** recording which catalogue item a row was adopted from (NULL = pure custom) — additive, so no existing hospital record or configuration breaks. Their add-forms gain "choose from catalogue" (pre-fills name/code/sample/form/unit; the hospital always sets its own **price**) alongside "add custom". Departments pre-fill from the catalogue. Vaccinations (greenfield) use the catalogue + `tenant_reference_items`, consumed by a patient immunisation record.
- **No change to security-critical code.** `rls.ts` is untouched; the `WITH CHECK` guarantee that a tenant can only ever author its own rows is preserved, and a tenant physically cannot create or overwrite a system row.
- **Invariant #5 respected:** `attributes` is display/pre-fill metadata for a reference list, not clinical data of record. Patients, encounters, `lab_tests` and `drugs` stay strongly typed — no EAV on core entities.
- **Governance:** system catalogues are seeded from code (like specialties, no runtime write path); a new `platform.catalog.manage` permission (super_admin via WILDCARD) is reserved for a future System-Admin catalogue editor. Custom priced items keep their existing manage permissions (`LAB_MANAGE`, `PHARMACY_MANAGE`, `BILLING_SERVICES_MANAGE`, `DEPARTMENT_MANAGE`); custom vaccines are gated by the immunisation management permission.
**Consequence:** Setup is materially faster (pick a predefined item instead of re-typing), the platform stays flexible (custom per hospital when the list does not fit), tenant isolation is untouched, and adding or updating catalogue data later is a seed change with **no frontend change** — even a new category needs no migration.

---

## ADR-073 - Per-hospital (branch) availability of master data — an overlay, not a fork
**Status:** Accepted (this project). Extends ADR-072 (master data). Relates to invariant #1 (RLS isolation), issue #14.
**Context:** Within ONE organization, different hospitals carry different items — Hospital 1 stocks Drug A, Hospital 2 does not. But the master tables (`drugs`, `lab_tests`, `services`, and the vaccine catalogue) were **tenant-only**, so an item the org added was available at *every* hospital. Inspection confirmed: organization isolation already holds (RLS on `tenant_id`); historical records are **snapshot-based** (a prescription/invoice/lab order copies name+price at the time), so disabling an item later is history-safe; and there is **no** server-side "current branch" today (branch is client-supplied). The `branch_id` "NULL = org-wide" convention is well established.
**Decision:**
- **One overlay/exception table `branch_item_availability`** (`tenant_id`→RLS, `branch_id`, `item_type`, `item_ref`, `is_available`, `price_override_paise`). The master row's `is_active` is the **organization default**; a row here is the **per-branch exception**; NO row = inherit the default. Resolution: an item is available at a branch iff `master.is_active AND NOT (overlay.is_available = false)`. This keeps **one item identity** — no duplication, and every ADR-072 catalogue link and snapshot in history stays valid — and it is **organization-isolated for free** because it carries `tenant_id` (RLS auto-applies).
- **We did NOT put `branch_id` on the master tables** — that would fork item identity per branch, duplicate data, and break the `drugId`/`testId`/`catalog_code` links. **Departments are excluded**: they already carry `branch_id` natively, so they are per-hospital by construction.
- **The backend enforces it, not just the UI.** The read models (`listDrugs`, `listTests`, `listServices`, and `listCatalog` for vaccines) accept an optional `branchId` and filter out items disabled for that branch, applying any price override. A config screen (org_admin, new permission `platform.catalog.availability.manage`) sets the overrides; a dedicated `GET /branch-availability/items` lists the org's items with their per-branch state, so the configuring admin needs no pharmacy/lab **view** permission.
- **Per-hospital STOCK and full pricing are deferred** (issue #14, the "full" option): distinct inventory per hospital needs a server-side **current branch** (branch in the session/token, a validated branch switcher, and user↔branch membership) — a change to authentication. The overlay ships without it; a per-branch **price override** is included because it needs no session change.
**Consequence:** An organization can enable/disable — and re-price — each master item per hospital, enforced at the database/API layer with no cross-organization or cross-hospital leakage and no risk to historical records. Adding a real per-branch stock dimension later is additive (a `branch_id` on `drug_batches` plus the current-branch chain), not a rework.

---

## ADR-074 - Operator org code is `NIROGIX`; organization-code login is case-insensitive
**Status:** Accepted (this project). Relates to ADR-022 (two-tier tenancy — the operator org), ADR-051 (the Admin console), ADR-071 (the environment gate). Fulfils a request to sign in to the platform as `nirogix`.
**Context:** The vendor's operator org (ADR-022) was seeded with the code `PLATFORM`, but the org is **named** Nirogix and operators reach for the product name, not an internal keyword. Login resolved the tenant by an **exact, case-sensitive** match (`eq(tenants.code, code)`), so `nirogix` / `Nirogix` / `NIROGIX` all failed against `PLATFORM`. Three backend services resolve "the operator org" by a hardcoded literal — `patient-identity` (verification is sent from the operator org, never a hospital), `platform-branding` (the platform's own default scopes), and `admin` onboarding (the reserved operator code) — and three seeders (`seed.ts`, `seed.staging.ts`, `seed.production.ts`) create it. Inspection confirmed the literal appears **only** in those spots plus the frontend quick-login lists; no test hardcodes it.
**Decision:**
- **The operator org code is `NIROGIX`** — canonical uppercase, consistent with `CITYCARE` / `SUNRISE`. The three magic lookups and three seeders now use `NIROGIX`; the running dev DB was migrated **in place** (a code rename on the existing row, so the two Platform Admins and all operator data stay attached — no duplicate org). `PLATFORM` is retired as a code (the word survives only as the *concept* "platform operator", never as a login value).
- **Organization-code login is case-insensitive** — `resolveTenantByCode` compares `lower(code) = lower(input)` (limit 1). Codes stay stored canonical/upper; they may be typed in any case on **every** sign-in form (operator and hospital alike). Codes are unique and uppercase by convention, so the case-folded read stays single-row.
- **Dev/staging quick-login ("Test credentials") now spans both consoles.** It already existed on the Portal (`:3001`); it is added to the **Admin console** (`:3003`) offering the two Platform Admins. Both fill the *same* form and post to the *same* API (never a second auth path) and **fold out of a production build** by construction — the account list is built behind the inline `NEXT_PUBLIC_ENVIRONMENT` gate (ADR-071), so the minifier drops it to `[]` in production.
**Consequence:** An operator signs in to the console that is theirs by typing `nirogix` in any case; the operator org is named and coded consistently; and no tenant-isolation or clinical behaviour changes — the three lookups still target the same single operator row, now by its new code. Renaming a code later is the same in-place migration; it is not a data fork.

---

## ADR-075 - Workspace packages the backend consumes at runtime ship compiled `dist/` output
**Status:** Accepted (this project). Relates to ADR-013/ADR-014 (monorepo + Turborepo), ADR-010 (RBAC — `@hms/permissions` is the permission-key source of truth).
**Context:** `hms_backend` in production is plain `node dist/server.js` — no bundler, no TS loader. Every `packages/*` workspace pointed `main`/`types` at raw `src/index.ts` with **no build script**, so the backend's compiled `require('@hms/permissions')` resolved to raw TypeScript and Node died at boot with `SyntaxError: Unexpected identifier 'as'`. The five Next.js apps never hit this because `transpilePackages` compiles workspace source on the fly; the backend has no such layer. The Turbo pipeline was already shaped for the fix — `build` has `dependsOn: ["^build"]` and `outputs: ["dist/**"]`, and `.gitignore` covers `dist/` — the packages simply had nothing to build.
**Decision:**
- **`@hms/permissions` and `@hms/types` compile to `dist/`** via a per-package `tsconfig.build.json` (CommonJS, declarations + declaration maps; the plain `tsconfig.json` stays check-only for `tsc --noEmit`). `main`/`types` and a conditional `exports` map point at `dist/` — Node's CJS resolver, tsc under `moduleResolution: Node`, and the Bundler-resolution frontends all land on compiled output.
- **Dependency order is Turbo's existing `^build`** — nothing new to wire. `npm run build` (CI, the staging deploy script, and a bare local build) now emits the packages before any consumer compiles against them.
- **Dev keeps live rebuilds:** each of the two packages gains `"dev": "tsc -p tsconfig.build.json --watch --preserveWatchOutput"`, so root `npm run dev` (turbo, persistent tasks) keeps `dist/` fresh while frontends and `tsx watch` consume it. On a fresh clone, run a build once (or let the watcher's initial emit land) before the apps resolve the packages.
- **The other four packages stay source-only on purpose.** `@hms/ui`, `@hms/client`, `@hms/utils` are consumed exclusively by Next.js apps through `transpilePackages` (`@hms/ui` ships `.tsx`/CSS that a bare `tsc` build would mishandle), and `@hms/config` is config files. **The rule this ADR establishes:** any package a non-bundled runtime (today: `hms_backend`) starts importing must first gain the same `dist/` build + entry-point shape — never point a plain-Node consumer at raw source.
- `@hms/types` is built now even though the backend does not import it today: it is the declared backend/frontend contract package, and building both closes the recurrence path instead of half of it. (If the backend ever imports it, it must also be added to `hms_backend`'s `dependencies` — it is not there today.)
**Consequence:** Production boot no longer parses TypeScript. The failure mode is structurally gone for the two RBAC/contract packages, the guardrail for future packages is written down, and dev ergonomics are unchanged (watch mode) at the cost of one extra initial emit. Verified: turbo builds `@hms/permissions` before `hms_backend`; `node -e "require('@hms/permissions')"` resolves compiled output from the backend; full-repo typecheck 13/13; Portal production build green; backend suite 162/162.

---

## ADR-076 - Staging deploys are affected-only, diffed against the last successfully deployed commit
**Status:** Accepted (this project). Relates to ADR-014 (Turborepo), ADR-075 (compiled package output), the 2026-08-18 OOM incident (deploy/README.md § Incidents).
**Context:** Every merge to `staging` rebuilt all six workspaces and reloaded every PM2 app on a shared VM that also hosts five unrelated live projects. The 2026-08-18 OOM incident was contained by `--concurrency=2` + swap, but the deploy still did maximal work for minimal change — a marketing copy edit rebuilt the backend and restarted it. This changes what "deploy" means (an intentional partial deployment), so it is recorded deliberately.
**Decision:**
- **The diff baseline is `.last-deploy-sha` on the VM** — the last *successfully* deployed commit, written only after build + migrate + reload all pass, untracked (survives `git reset --hard`), gitignored. More reliable than the checked-out HEAD across force-pushes and interrupted deploys; HEAD is only the first-run fallback. A vanished baseline commit or a **same-commit redeploy** (`workflow_dispatch` recovery) falls back to full build + full reload — recovery must never be scoped.
- **Turborepo's `--filter=...[<baseline>]` decides what is affected** — never a hand-rolled path diff. The `...` prefix pulls in dependents, so a `packages/types` change rebuilds `hms_backend` and every portal importing it; the graph comes from declared workspace `dependencies` (all verified present). A docs-only push yields an empty set: no build, no migrate, no reload — the marker still advances.
- **Migrations run only when `hms_backend` is in the set.** They stay additive/idempotent (running always would be safe); the condition makes the deploy log truthful.
- **PM2 reloads only the affected apps**, `pm2 reload deploy/ecosystem.config.cjs --only <names> --env staging`, with candidate names **intersected against the apps actually defined in the ecosystem file** (read at deploy time via `node -e`) — patient/admin/aiportal join automatically when BACKLOG F-5 uncomments them, with no workflow edit.
- **`/etc/nirogix/ports.env` is sourced (`set -a`) before any PM2 command and is now required** — fixes a latent bug: a non-interactive SSH shell reads no `.bashrc`, so PM2 re-parsed the ecosystem with unset `NIROGIX_PORT_*` and default ports on a shared box. Missing file aborts the deploy before PM2 is touched.
- **The GitHub runner's full build stays** — it is the compile gate that keeps a broken commit off the VM, on hardware with memory to spare. `--concurrency=2` stays on both VM build paths; affected-only shrinks work, it does not replace the cap.
- **Manual rollback must reset the marker** (`echo <sha> > .last-deploy-sha`, or delete it) — otherwise the next deploy diffs against the rolled-back-FROM commit and skips rebuilding exactly what the rollback reverted (documented in deploy/README.md § Rollback).
**Consequence:** A typical single-app change builds one workspace and reloads one process; shared-package changes fan out exactly as far as the dependency graph says; VM peak load drops without weakening the OOM guardrails. Cost: deploy correctness now depends on the baseline marker being honest — which is why it only ever advances after full success and why rollback instructions include it.

---

## ADR-077 - Quick-login is Portal-only and environment-true; the Admin console never offers test credentials
**Status:** Accepted (this project). Partially supersedes ADR-074 (its "quick-login spans both consoles" bullet). Relates to ADR-058 (one seeder per environment), ADR-071 (environment gate), issue #7.
**Context:** Two credential-hygiene faults. (1) The Portal's "Test credentials" dialog showed the **development** seeder's accounts (CityCare, dev default password) in **staging** too — accounts that do not exist in the staging database, while the accounts that do exist there (`seed.staging.ts` — QA General Hospital / `QAHOSP`) were not offered. (2) ADR-074 had added the same quick-login to the **Admin console**; but the operator accounts are **real platform credentials** on staging and production — a surface that displays, hints at, or pre-fills them is a credential leak by design, and the owner has directed that no operator password ever be written into the repository.
**Decision:**
- **The Admin console has no quick-login, in any environment.** `admin/components/auth/QuickLogin.tsx` and `admin/lib/devUsers.ts` are deleted (clean-code rule: migrate → verify → delete); the login page's helper and the `.env.example` quick-login knobs go with them. Operators type org code `NIROGIX` (case-insensitive, ADR-074) + email + password — nothing on the surface knows a credential.
- **The Portal's list is environment-true** (`hms_frontend/lib/devUsers.ts`): a development build carries the dev seeder's accounts, a staging build the **staging** seeder's QAHOSP accounts, production none. The gate stays inline-literal (`NEXT_PUBLIC_ENVIRONMENT` comparisons) so the minifier constant-folds — each bundle **physically contains only its own environment's list** (a staging bundle has no dev account, and vice versa; verified by grepping built chunks).
- **The staging list contains no platform-operator account.** On staging those credentials are real; the QAHOSP passwords are the deterministic QA values already committed in `seed.staging.ts` (ADR-058), which remains their single source. The dialog's badge and reseed hint follow the environment (`db:seed` vs `db:seed:staging`).
- **No real credential is ever written to this repository** — not in code, docs, seeds, or ADRs. Real operator passwords live only with the operators.
**Consequence:** What the dialog offers is exactly what exists in that environment's database, staging QA gets one-click sign-in with the accounts that are actually there, and the operator console presents a uniform, credential-silent login everywhere — production behaviour and staging behaviour no longer differ on the admin surface.

---

## ADR-078 - No deploy baseline means full build — the HEAD fallback is retired
**Status:** Accepted (this project). Supersedes ADR-076's bullet that the checked-out HEAD serves as the first-run diff baseline.
**Context:** ADR-076's fallback assumed the VM's checked-out HEAD approximates "what is live" when `.last-deploy-sha` does not exist yet. Staging run #6 (2026-08-19) disproved it: run #5 had already `git reset` HEAD to its commit before dying at the PM2 step, so run #6 diffed from a commit that was checked out but **never deployed**, found only workflow-file changes, skipped the build and reload, and left run #5's Portal bundle stale — while advancing the marker, making every later diff blind to the gap.
**Decision:** The baseline comes **only** from `.last-deploy-sha`. No marker — first run, or the file removed — means **full build + full reload**, same as an unusable baseline or a same-commit recovery redeploy. HEAD proves what is checked out, never what is live.
**Consequence:** Bootstrap and post-failure states cost one full deploy instead of silently under-deploying; the marker remains the single honest record of live state (deploy/README.md § Incidents, 2026-08-19 second finding).

---

## ADR-079 - Light is the first-load theme everywhere; the OS preference is never consulted
**Status:** Accepted (owner decision). Amends `resources/DESIGN.md` §7's first-visit rule.
**Context:** The five apps disagreed: the Portal, Admin, Patient and AI Portal already defaulted to Light, but marketing's first visit honoured `prefers-color-scheme`, so a visitor with an OS dark preference saw the marketing site dark while every product surface opened light. The owner directed one rule for all surfaces.
**Decision:** Every app's first load is **Light**, regardless of the OS setting — `prefers-color-scheme` is consulted nowhere. **Dark is only ever an explicit user choice**, made with the in-app toggle, persisted per app (each app has its own key on its own origin), and restored by the pre-hydration no-flash script on later loads. All five no-flash scripts now share the same shape: `stored === 'dark' ? 'dark' : 'light'`.
**Consequence:** A consistent, deliberately-light first impression on every surface; dark mode remains fully supported but opt-in. The only behaviour change is marketing's first visit on a dark-preference OS.

---

## ADR-080 - The Portal quick-login lists hospital roles only — never a platform operator, in any environment
**Status:** Accepted (owner decision). Widens ADR-077 (which had removed operator accounts from staging but kept them in the development list).
**Context:** The owner directed that platform-operator credentials never surface through the normal application login UI, in any environment — the Portal is the hospital-staff surface, and even the synthetic dev default password on an operator card normalises treating operator credentials as test data. Separately, the staging list was missing a Branch Admin because the staging seeder never created one, so staging QA could not exercise that role.
**Decision:** The two Platform Admin cards are removed from the development list too — `hms_frontend/lib/devUsers.ts` now contains hospital roles only in every environment (operators type their credentials on the Admin console, which has no quick-login at all, ADR-077). The staging seeder gains `qa.branchadmin@qahospital.example` (`branch_admin`, QAHOSP) and the staging list shows it — the card exists because the seeded user exists, never the other way round. Reaching staging requires one `npm run db:seed:staging` on the VM (idempotent — it creates only the missing user).
**Consequence:** No surface, bundle, or environment carries an operator credential in its quick-login; staging QA covers all seven hospital roles including Branch Admin.

---

## ADR-081 - Forgot-password flow: signed 30-minute JWT link + hashed single-use row
**Status:** Accepted (this project). Relates to ADR-052/ADR-058/ADR-059 (principals, seeders, communication seam), SECURITY-AUDIT M-5 (enumeration/timing), ADR-076-era session rules.
**Context:** Staff and operators had no self-service path from a forgotten password (BACKLOG: "password reset / email-invite flow"); recovery meant an admin issuing a temporary password. Any design must not create an enumeration oracle, must not weaken the session rules, and must reach the user only through the one CommunicationService seam.
**Decision:**
- **Token = signed JWT (30 min TTL, `prt: 'pwreset'` type pin, per-issue nonce) + tenant-scoped `password_reset_tokens` row storing only the SHA-256 hash.** The unauthenticated consume route verifies the signature FIRST and enters the RLS tenant context from the verified claims — the `/auth/refresh` pattern — so the table keeps standard tenant isolation with no RLS exception. The type pin means an access/refresh token can never be replayed as a reset link.
- **`POST /auth/forgot-password`** (`orgCode`, `email`, `client: portal|admin`) is deliberately uniform: unknown org, unknown email, inactive user — same 202, same message, nothing created. The link's origin comes from new server config (`PORTAL_URL` / `ADMIN_URL`, per environment from `resources/domains.md`), **never from a request header**. Sign-in rate tier.
- **`POST /auth/reset-password`** collapses every token failure (bad signature, expired JWT, expired row, unknown, already used, inactive user) into one 401 message. Success: password updated under the shared `PasswordSchema` (min 10 / max 200 — now extracted to one place), the used row **and every other outstanding row for the user** consumed, **every session revoked** (same rule as change-password), audited `auth.password.reset.completed`. Change-password also gained its previously missing audit entry.
- **Email goes through `sendEmail`** (CommunicationService; provider failures are contained and cannot alter the response). The dev log provider now logs the body so the link is exercisable locally.
- **Frontends:** `/forgot-password` + `/reset-password` pages on the Portal and the Admin console (same `@hms/ui` composition as their login pages), a "Forgot password?" link on both login forms; outcomes render inline (`feedback: false`), matching the login form's own convention.
**Consequence:** Self-service recovery on both consoles with no enumeration surface, no second auth mechanism, and session semantics identical to a password change. Vitest covers request/consume/single-use/expiry/revocation (5 cases); staging/production must set `PORTAL_URL`/`ADMIN_URL` on the VM.

## ADR-082 - Closing the open security findings: account lockout, CSP, upload sniffing, one password policy, request correlation, idle sessions
**Status:** Accepted (this project). Closes SECURITY-AUDIT H-3, M-1, M-2 (remainder), M-4, M-6, L-1…L-5. Relates to ADR-036 (rate-limit tiers), ADR-057 (one toast), ADR-054 (shared client), ADR-058 (seeders), ADR-081 (reset flow).
**Context:** The 15/08/2026 review left one High, three Medium and five Low findings open. They are the operational half of security — the parts that only matter once real traffic, real staff and a real workstation exist — and Stage 3 (production readiness) cannot be signed off with them outstanding.
**Decision:**
- **Account lockout (H-3).** Rate limiting is per IP and per route, so it never sees a slow distributed attempt against one known email. `users` now carries `failed_login_attempts` / `failed_login_at` / `locked_until`; five consecutive failures lock for 60s, doubling per further failure to a 15-minute ceiling, and the streak expires after 15 minutes so an occasional mistyped password never locks anyone. The lock is stated ONLY to a caller who supplied the correct password (a 429 naming the wait); every other caller gets the same `Invalid credentials`, so it is not an enumeration oracle. Attempts made while locked never extend it, so a third party cannot hold an account shut. Crossing the threshold audits `auth.login.locked`, attempts against a lock audit `auth.login.blocked`, and a sustained attempt escalates to `critical`. A successful sign-in, a change-password and a completed reset all clear the state. The policy is pure and unit-tested; the endpoint behaviour is API-tested.
- **Content-Security-Policy (M-1).** One builder in `@hms/utils`, two shapes. The four authenticated apps get a per-request nonce from `proxy.ts` (Next 16 renamed the middleware convention) with `strict-dynamic`; the root layout stamps the same nonce on the one inline script each app owns. The marketing site is statically rendered — a per-request nonce would end that — so it keeps a strict policy with `'unsafe-inline'` for scripts only, an explicit trade recorded in the code: it renders no user input, holds no session and reaches no PHI. Every app also sends `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a `Permissions-Policy` that leaves only the microphone (dictation, ADR-070). `img-src` carries the API origin as well as `https:` — found by loading the running Portal, where tenant logos are served over http from `localhost:4000`.
- **Statement timeouts (M-2 remainder).** The pool sets `statement_timeout` (30s) and `idle_in_transaction_session_timeout` (15s), both configurable. Application caps bound the queries we wrote; these bound the ones we did not, and the idle-transaction timeout also fences the open-transaction failure mode seen during refresh-rotation work. The migration runner opts out for its own session, where slow DDL is expected.
- **Upload content validation (M-4).** `fileSniff.ts` checks magic bytes for every allowed type and requires them to agree with the declared MIME; `text/plain` is accepted only when the payload is valid UTF-8 with no NUL or control bytes. Enforced once, in the single `uploadSingle` choke point, before anything is written to storage.
- **One password policy (M-6).** `passwordPolicy.ts` replaces `z.string().min(10)`: 12–200 characters, at least three character classes, a blocklist matched after folding leetspeak, and no password built from the holder's own email, name or organization code. It applies to self-service change, the reset flow, administrator-created accounts and the production bootstrap seeder alike, and the generated temporary password now comes from a CSPRNG with no fixed prefix (it was `Hms-` + six bytes). Breach-API lookup (HIBP k-anonymity) is deliberately NOT added — a third-party network call on the credential path of a PHI system is a decision for the compliance owner, and is recorded in `BACKLOG.md`.
- **Request correlation (L-3).** One id per request, generated at the edge, echoed as `X-Request-Id`, attached to every pino line and to the error-tracker event, and stored on every `audit_log` row (new `request_id` column) through an AsyncLocalStorage — so a service-level audit five calls deep needs no extra parameter. An inbound id is honoured only when it is plainly an id, and replaced otherwise, so a caller cannot poison the log or the audit table.
- **Idle sessions (L-5).** `useIdleSignOut` in `@hms/client` ends a session after 15 minutes without interaction, revoking it server-side and saying so through the shared toast. Activity is shared across tabs via `localStorage`, so one tab never signs a user out of another. Used by the staff `AuthProvider` and by the patient portal's own `SessionProvider` (ADR-052 keeps the principals separate; the risk of a screen left open in a corridor is the same on both).
- **Operational (L-1, L-2, L-4).** `server_tokens off` in the Nginx template. API documentation (Swagger UI **and** the raw spec) now defaults off in production instead of the spec being served unconditionally. CI fails on a high or critical advisory in shipped dependencies (`npm audit --omit=dev --audit-level=high`) and reports dev-tool advisories without failing — the gate immediately surfaced a real one, `drizzle-orm` <0.45.2 (SQL injection via improperly escaped identifiers, GHSA-gpj5-g38j-94v9), so drizzle-orm was upgraded 0.38.4 → 0.45.2 and drizzle-kit to 0.31.10 in the same change.
**Consequence:** No open finding above Low remains. Two accepted positions stay documented rather than fixed: CSRF (M-3) is still carried by `SameSite=Lax` plus the CORS allowlist, and marketing's script policy is inline-permissive by design. The cost is a per-request nonce on the four app frontends (they already render per request) and a bcrypt comparison on a locked account, which is what keeps the locked and unlocked paths indistinguishable by timing.
---
## ADR-083 - Specialty-aware experience: effective features = tenant modules ∩ provider specialty ∩ permissions
**Status:** Accepted (this project). Relates to ADR-004 (module entitlements as a runtime check), ADR-008 (FHIR-aligned specialty-agnostic core), ADR-010 (permission cache invalidation), ADR-034 (specializations are one configured system), ADR-049/ADR-050 (organization_profile, departments), invariant #2 (frontend visibility is never security). Introduces the **Specialty & Module Experience Spine** milestone (`resources/development-plan.md` §20C, `resources/phases.md`).
**Context:** The product is a specialty-*agnostic* OPD core (ADR-008). Specialty already exists as first-class but **inert** metadata — `specialties` catalog (17 codes), `practitioner_roles.specialty_code` (FHIR PractitionerRole), `departments.specialty_code`, and the `specialty_form_templates` scaffold (backend CRUD, no UI, no consumer). Nothing about a doctor's or a clinic's specialty changes what is shown or permitted: there is no `if (specialty === …)` anywhere in product code. The owner wants each specialty to feel like a purpose-built application — a pediatrician sees Vaccination and Growth, not OT or antenatal; a gynaecologist sees antenatal and OT; a dentist sees an odontogram — **without** hard-coding a workflow per specialty, and **without** making specialty a security boundary. Two real gaps block this today: (1) the Portal sidebar filters by **permission only** (`nav.ts` `NavItem` has `perm`, no `module`; `navGroupsForUser` never consults entitlements), so a role that holds `laboratory.order.view` shows the Laboratory item even at a tenant that never bought Laboratory — the menu and the enforced boundary disagree; (2) the session carries no module set (`@hms/client` loads `user` + permission `Set` only), and there is no canonical typed module list, so the client cannot cheaply align with the boundary the backend already enforces.
**Decision:**
- **Two axes, one enforced boundary.** The effective feature set for a user is **Tenant Enabled Modules ∩ Provider Specialty Module Set ∩ User Permissions**. The enforced security boundary is unchanged — exactly ADR-004 + RBAC: `authenticated → tenant entitled to the module (requireModule) → user permitted the action (requirePermission) → business logic`. **Specialty is never an enforcement point.** It narrows the *view*; it can never widen access. A pediatrician at a clinic that never enabled Immunisation does **not** get Immunisation — specialty ∩ tenant-modules is an intersection, never a union. This keeps invariant #2 intact: the nav change below is UX aligning with an already-enforced boundary, not new security.
- **Specialty sets the defaults; the organization overrides them.** A specialty maps (as data) to **required / recommended / optional** modules. Choosing a specialty (or facility type) at onboarding expands to a module set fed into the existing `grantModule` hard-dependency closure — replacing the fixed `DEFAULT_MODULES`. The org admin then enables/disables any module within its hard-deps: the specialty is a **starting preset, not a lock** (e.g. Pediatrics defaults Growth = ON, a clinic may set it OFF).
- **Layering (the owner's model, made real without a second enforcement point):** `Organization → Facility Type / Enabled Modules (tenant-scoped, enforced) → Provider Specialty (personalizes) → Module Configuration (org overrides + form templates) → Permissions (RBAC) → UI + API + Workflow`.
- **Representation — data as code, beside the existing catalogs.** (a) `MODULE_CATALOG` is promoted to shared and typed: a `ModuleKey` union plus per-module UI metadata (display name, nav group, icon, and the permission keys it unlocks) so nav and backend agree on **one** list — closing gap C (modules are untyped `string[]` today, a "module" being merely `key.split('.')[0]`). (b) A new `SPECIALTY_MODULE_MAP` (`specialtyCode → { required, recommended, optional: ModuleKey[] }`) seeded from code next to `SPECIALTY_CATALOG` / `moduleCatalog.ts`. (c) A tenant **facility type / primary specialty** persisted on `organization_profile`; provider specialty already lives on `practitioner_roles`. (d) The **entitled module set is shipped into the session** (extend the session bootstrap / `/auth/me` payload) so the client filters without a permission-prefix heuristic — closing gaps A and B.
- **The nav becomes module-aware.** `NavItem` gains a `module` key; `navGroupsForUser` filters by `moduleEnabled(module) && can(perm)`. Dashboard KPI cards and quick actions move from hard-coded per-role JSX to a **config-driven registry** keyed by `{ module, permission, specialty? }`, so the dashboard follows entitlements and specialty the same way the sidebar does.
- **Specialty-specific clinical features are independent modules, never core branches.** Odontogram / dental charting, antenatal & obstetric records, pediatric growth tracking, psychiatric assessment each become a **new** `moduleCatalog` entry + routes gated by `requireModule` + `requirePermission` + a nav item carrying its module + optional `specialty_form_templates` for the structured fields (no EAV on core entities, invariant #5). The shared core — patient, appointment, OPD, EMR, prescription, billing, authentication, user management — stays untouched.
- **Adding a specialty later = data, plus at most one module.** A row in `SPECIALTY_CATALOG`, a row in `SPECIALTY_MODULE_MAP`, and — only if it needs a genuinely new clinical feature — one new module. No core workflow is rewritten. This is the concrete answer to the "new specialty without touching the core" requirement.
- **Delivery is split so nothing greenfield blocks the foundation.** The **Specialty & Module Experience Spine** (typed shared module catalog, `SPECIALTY_MODULE_MAP`, modules-in-session, module-aware nav + dashboard/quick-action registry, specialty-preset onboarding, an org module-configuration screen) is a foundational milestone (§20C) that lands **before** any greenfield specialty feature. The greenfield features themselves stay where the roadmap already places them — Phase 4 **Specialty Clinical Modules** (§21) — but now plug into the spine as configuration rather than as bespoke workflows.
**Consequence:** The platform becomes genuinely configurable-per-specialty with a single enforced boundary, not one hard-coded workflow per doctor — and it scales cleanly to all three shapes the owner named (single-specialty clinic, multi-specialty hospital, future specialties). Until the spine ships, specialty stays inert metadata and **nothing about today's enforcement, workflows, or the five frontends changes** — the decision reshapes the roadmap, not the running system. Each piece flips a test case (`testcases.md`), a manual step (`docs/manual-testing-guide.md`) and a marketing "BUILT" status (`marketing/lib/availability.ts`, the capability reference) only in the change that actually ships it. This ADR records the target architecture and the sequencing; it authorises no code by itself.
---
## ADR-084 - ABDM Milestone 1: ABHA verification at registration, as its own entitled module
**Status:** Accepted (this project). Relates to ADR-004 (module entitlements), ADR-007 (provider pattern), ADR-016/ADR-059 (one provider seam), ADR-026/ADR-057 (API feedback), ADR-029 (extract a pattern on its second use), ADR-039/ADR-060 (row actions), ADR-052 (patient identity), ADR-056 (public endpoints), ADR-058 (seeder environment guards), ADR-082 (security baseline), invariant #2 (frontend visibility is never security), invariant #5 (no EAV on core clinical entities). Implements `resources/development-plan.md` §36 (M1 only) and the ABDM row in `resources/phases.md`.
**Context:** The front desk retypes what a patient already holds nationally. ABDM Milestone 1 is the sanctioned way to stop doing that: verify an ABHA (Ayushman Bharat Health Account) by Aadhaar OTP, by an existing ABHA identifier, or by the patient scanning the hospital's facility QR, and fill the registration form from the verified profile. M2 (HIP — linking care contexts) and M3 (HIU — consented record fetch) stay out of scope: the plan already records that they need legal and compliance review before any code exists. Only NHA's **V3** APIs are implemented — V1/V2 implementations are rejected at the sandbox-exit review, so a V1 path is a defect even if it works.
**Decision:**
- **A new entitled module, `abdm`, not an extension of `patient`.** A hospital can only use ABDM after it has registered a facility with NHA, so the capability is per tenant, sold and switched per tenant, and gated `requireAuth → requireModule('abdm') → requirePermission`. Four keys: `abdm.verification.perform` (front desk), `abdm.verification.link` (attaching a verified ABHA to a chart — separated because it changes an identifier on a clinical record), `abdm.facility.view` / `abdm.facility.manage` (org_admin).
- **Credentials split by who they belong to.** NHA issues **one** client id/secret to the registered *application* (Nirogix) — server configuration, never per tenant, never visible to a hospital. Each *hospital* registers its own HFR facility and receives its own facility id, which is tenant data (`abdm_facility_config`), is sent as `X-HIP-ID`, and is what the Scan-and-Share callback resolves the tenant from. Putting a facility id in server config would make every hospital transact as whichever one was configured last.
- **ABDM verifies an identity; it never creates a chart.** Every flow ends at a *prefill* the operator reviews and submits through the ordinary patient endpoint, or at a *link* onto a chart that already exists. The manual form is untouched and remains the fallback for an unreachable gateway, a failed OTP, a sandbox rate limit, or a patient with no Aadhaar — a registration desk cannot depend on a third party being up.
- **Consent is a required `true`, checked before the OTP is sent.** An OTP that reached a patient's phone without consent has already happened by the time an after-the-fact check would run. The timestamp and a `consentVersion` are stored, so consent taken under later wording is distinguishable.
- **A raw Aadhaar number never outlives the request.** It is RSA-encrypted (`RSA/ECB/PKCS1Padding`, NHA's published certificate — V3 also requires the **OTP** to be encrypted), sent, and left to go out of scope. What persists is a masked hint (`XXXXXXXX1234`), enforced three ways: the application masks, a `CHECK` constraint on `abdm_transactions.identifier_hint` refuses anything Aadhaar-shaped, and `security/redaction.ts` scrubs Aadhaar-shaped values out of every log line, error-tracker event and audit metadata blob. The scrub is at the **log boundary, not the request boundary** — rejecting 12-digit values at the edge would break the one flow that legitimately carries one.
- **Every ABDM token is encrypted at rest** (`security/encryption.ts`, AES-256-GCM, versioned envelope, new shared primitive). If `ENCRYPTION_KEY` is unset the token is **discarded**, never stored in the clear: losing it costs one re-verification, a plaintext bearer credential against a national health identity costs considerably more. The linking token is captured now although M1 does not use it, because ABDM only offers it at verification time.
- **New vs returning patient, in NHA's recommended order, with the second pass never automatic.** An exact verified ABHA-number match is conclusive → `returning`. A demographic match (name + gender + birth year) is offered as candidates → `ambiguous`, for a human to confirm: two people share a name, a gender and a birth year, and merging the wrong charts is a clinical safety incident, not a data-quality one. An ABHA already on another chart in the same hospital refuses the link (409).
- **`abhaVerifiedAt` is what separates a proved ABHA from a typed one.** Only a completed ABDM flow may set it; editing `abhaNumber` by hand clears it, resets the source to `manual` and drops the linking token — otherwise the verified flag would vouch for a value ABDM never saw.
- **Scan and Share is the second public write path, held to ADR-056.** The tenant is resolved server-side from the HFR facility id **in the path**; it writes no clinical row (only a pending verification a human acts on); it answers an identical `202 {accepted:true}` for a known, unknown or disabled facility so it cannot enumerate hospitals; it is rate-limited at the sign-in tier; it is audited against the tenant with no actor.
- **`mock` is a first-class provider, not a fallback.** The ABDM sandbox rate-limits OTPs to a handful per number per day, so a build that could only run against the gateway could not be developed against, could not run in CI, and could not be demonstrated. The mock holds a real RSA keypair, so the encryption path is genuinely exercised, and it refuses to construct in production — a simulated ABHA in a live hospital is a fabricated identity. Boot-time guards additionally refuse `gateway` without credentials, production pointed at the sandbox, or non-production pointed at production ABDM.
- **Every ABDM endpoint path lives in one file** (`abdm.constants.ts`), the same containment the MSG91 adapter uses: an external contract we do not control is pinned in one place, so verifying it against NHA's official V3 Postman collection is a diff to one file rather than an audit of the module.
**Consequence:** A hospital entitled to `abdm` can verify or create an ABHA at the desk in three ways, with the fastest (Scan and Share) leading when it is configured, and fall back to typing with nothing lost. 62 automated tests cover the flows, the matching, the isolation, the redaction and the encryption; the full backend suite (317) stays green. Going live is an organizational path, not a code one — NHA functional testing, a WASA/CERT-In "Safe to Host" certificate, and HTC approval — and swapping sandbox for production is configuration only. Existing tenants seeded before this change do not hold the four new permission keys until roles are re-seeded (`BACKLOG.md`).
---
## ADR-085 - Module & Capability Engine: a capability tier under modules, one canonical registry, engine as the forward standard
**Status:** Accepted (this project). **Extends ADR-083** (the Specialty & Module Experience Spine — it does not supersede it; every clause of ADR-083 stands and this ADR adds a tier beneath it). Relates to ADR-004 (module entitlements as a runtime check), ADR-008 (specialty-agnostic FHIR core), ADR-009 (vertical-slice delivery), ADR-010 (permission-cache invalidation), ADR-016/ADR-059 (one provider/communication seam), ADR-026/ADR-057 (centralized API feedback), ADR-029 (extract a pattern on its second use), ADR-038 (marketing may never advertise unbuilt capability), ADR-072/ADR-073 (system vs. custom master data, per-branch availability overlay), invariant #2 (frontend visibility is never security), invariant #5 (no EAV on core clinical entities), invariant #6 (entitlement/override/audit records are never physically deleted), invariant #8 (one Financial Transaction Infrastructure). Reshapes `resources/development-plan.md` (new §20D) and `BACKLOG.md` §3; changes no running behaviour by itself.
**Context:** The owner supplied a full functional decomposition of Nirogix — an 11-domain / 86-module / 260+-capability map (the `Nirogix Flow Diagram` / `Nirogix Module Map` design docs) — and a binding architectural brief: every module must be independently enable/disable-able **and** deeply interconnected through shared domain entities, one authoritative service per concern, events and contracts; the same codebase must fit a single-doctor clinic, a dental or pediatric clinic, a maternity or multispecialty hospital, and future specialties, by **configuration** rather than by a fork per specialty. Measured against the code today, the foundation is already right and must not be rebuilt: the shared domain is single-owner (`patient`, `appointment`, `opd`, `emr`, `billing` = the one invoice+payment service, `pharmacy`, `laboratory`, `referral`, `provider`), tenant isolation is PostgreSQL RLS via `runWithTenant`, entitlement is a runtime check (`tenant_entitlements` + `requireModule`), disable never deletes (entitlements are soft-state), and a typed domain-event bus exists. Four real gaps separate that foundation from the brief: (1) **entitlement granularity stops at the whole module** — there is no capability (sub-module) tier, so `OT = ON but OT Billing = OFF` cannot be expressed; (2) there is **no single canonical registry** — `MODULE_CATALOG` is a 17-entry backend `string[]`-ish list with no categories/capabilities/metadata, the Portal nav is a separate hand-kept list, and the 11/86/260+ decomposition lives only in the design doc; (3) **cross-module interconnection is wired by direct service imports** (`opd`/`lab`/`pharmacy` → `billing.service`) with the event bus present but only representatively subscribed (`encounter.signed`, `invoice.created`, `payment.received`, `lab.result_ready` are published with no functional consumer), and two rules are copy-pasted (the pay-before-consult guard across OPD+EMR with an identical error string, the visit-invoice-attach pattern across lab+pharmacy); (4) the frontend never holds the entitled-module set in session and gates on **permission only** (ADR-083's gap A/B, restated). Crucially, **almost none of the 86 modules is built** — IPD/ICU/OT/Emergency, Radiology, Blood Bank, and every specialty beyond inert catalog metadata do not exist as running code. The owner's explicit instruction: make the engine the **standard every future module is built to**, and for now **retrofit only the sections that already exist** — do not stand up 260 capability rows in front of screens that are not there.
**Decision:**
- **A capability tier sits beneath the module tier; both are entitlements, both are runtime-checked, neither is a security bypass.** Effective feature set becomes **Tenant Enabled Modules ∩ Tenant Enabled Capabilities ∩ Provider Specialty Set ∩ User Permissions** — ADR-083's intersection with one more narrowing factor. The enforced chain gains one composable link: `authenticated → requireModule(key) → requireCapability(moduleKey, capabilityKey) → requirePermission(permKey) → business logic`. A capability is **what the system supports**; a permission is **who may use it** (ADR-083's two-axis rule, kept distinct — a hospital disabling a capability overrides every role that holds its permission). `requireCapability` resolves against the same soft-state, org-vs-branch, effective-window model as `requireModule`, and is cached beside the permission set (ADR-010 bounds still apply). A capability defaults to its module's state on grant, so a module with no capability configuration behaves exactly as it does today.
- **One canonical registry, `Domain → Module → Capability`, shared by backend and every frontend.** `MODULE_CATALOG` is promoted (per ADR-083) and extended into a typed three-tier catalog seeded from the design decomposition: a `Category`/`Domain` (CORE, HOSPITAL, CLINIC, BILLING, ADD_ON, SPECIALTY, CLINICAL, PATIENT_ENGAGEMENT, REPORTING, AI, PLATFORM), a `Module` (`key`, `name`, `category`, `status`, `defaultEnabled`, `hardDependencies`, `capabilities[]`, unlocked permission keys, nav metadata), and a `Capability` (`key`, `moduleKey`, `name`, `status`, `dependencies`, permission keys). The registry is the single source both `requireModule`/`requireCapability` and the nav/dashboard read — there is no second module list. **Data-as-code beside the existing catalogs** (`moduleCatalog.ts`, `SPECIALTY_CATALOG`, `SPECIALTY_MODULE_MAP`), with a seeded DB mirror only where a foreign key or per-tenant configuration needs one; the code registry stays authoritative to avoid drift.
- **A registry entry carries a lifecycle status, and status is the honesty gate.** Every module/capability is `AVAILABLE` (defined in the registry, not yet built), `BUILT` (running code behind it), or `PLANNED`/`FUTURE`. The 86-module map may be seeded in full so the architecture is visible and future work has its slot, but **only a `BUILT` entry is ever entitled to a real screen or API, and only a `BUILT` entry may move to `built` in `marketing/lib/availability.ts` or the capability reference (ADR-038).** Listing a module in the registry is not a claim that it exists.
- **The engine is the binding standard for every new module; existing modules are retrofitted onto it, nothing is rewritten to reach it.** Going forward, a module is not "done" unless it is a registry entry (domain + capabilities + dependencies + status), gated by `requireModule`(+`requireCapability` where it has sub-capabilities) then `requirePermission`, surfaced through module-aware nav, and connected to other modules through the shared domain + events/contracts rather than a private reimplementation. **For now the retrofit is scoped to the modules that already run** — the ~8 live modules get their registry entries, their capability breakdown only where a real sub-feature toggle exists, and the session/nav wiring of ADR-083; unbuilt modules stay `AVAILABLE` registry rows with no enforcement surface. This is the owner's "remember the rule for the future, implement for the built sections now."
- **Interconnection is a first-class layer, not per-module glue.** The shared domain entities stay single-owner (one Patient, one Appointment, one Encounter, one Invoice+Payment service — invariant #8); cross-module reactions move onto the domain-event bus with real subscribers (`encounter.signed → billing charge capture`, `payment.received → receipt/portal/reporting`, `lab.result_ready → portal/notification`), and the two copy-pasted rules (pay-before-consult, visit-invoice-attach) are extracted into shared services on their next touch (ADR-029). A module consumes another module's capability through a defined service interface or event, never by reaching into its internals or duplicating its logic — there is exactly one Payment implementation, surfaced everywhere by reuse.
- **Reusable domain UI is extracted the second time it is needed, into the shared kit.** Composed domain widgets that today live per-app (`PaymentSummary`, `PaymentHistory`, `AppointmentSummary`, `PatientSummary`, `PrescriptionSummary`, `LabResultSummary`) become shared components consuming the one authoritative source, so OPD, the patient profile, Billing, the Patient Portal, the dashboard and reports render the same payment/appointment/result the same way (ADR-029). `@hms/ui` stays generic; domain-composed widgets get a shared home rather than five copies.
- **The configuration hierarchy is layered but keeps one enforcement point.** Effective configuration is resolved top-down — Platform default → Tenant → Facility/Branch → Department → Specialty preset → Provider → Role → User — and a lower layer can only narrow, never widen, what a higher layer disabled (a provider cannot enable a capability the org turned off). "Facility" maps onto the **existing** `branch` layer (nullable `branch_id` = org-wide) rather than a new hierarchy node; a genuine facility-hierarchy entity is deferred until a customer needs more than tenant→branch→department (`BACKLOG.md`). Specialty and provider layers are ADR-083's, now also able to narrow at capability granularity.
- **Every module/capability configuration change is audited, and disabling never destroys history (invariant #6).** A capability toggle writes an audit row (org/branch, actor, module, capability, old→new, timestamp, optional reason), exactly as `grantModule` does today. Disabling a module or capability hides its nav, protects its APIs and stops new operations, but existing clinical and financial records stay readable to authorized users (RLS-scoped) — a hospital that turns Laboratory off in 2026 still reads its 2025 lab reports. Dependency closure runs at configure time both ways: a capability cannot be enabled without its module and its declared dependencies, and disabling a depended-upon module/capability warns with the dependents it would break rather than silently cascading.
**Consequence:** Nirogix gains the vocabulary the brief needs — module **and** capability entitlements, one canonical `Domain→Module→Capability` registry shared front-to-back, an interconnection layer of shared entities + events + contracts, reusable domain widgets, and a layered configuration resolver — while the parts the brief also demanded and that already exist (single-authoritative payment, tenant isolation, disable≠delete, no EAV, no per-specialty fork) are preserved untouched. Because the engine is introduced as the **forward standard with a built-only retrofit**, no running workflow, screen or tenant changes on the day this lands: the registry can describe all 86 modules while only the ~8 live ones are entitled and enforced, and marketing status stays honest by construction (ADR-038). Existing tenants keep their exact behaviour — their currently-entitled modules map to registry entries with all capabilities defaulting on, so nothing they can do today stops working. Each capability toggle, event subscriber, extracted service and shared widget flips a `testcases.md` case, a `docs/manual-testing-guide.md` step and a marketing status **only in the change that actually ships it**. This ADR records the target architecture, the capability tier and the sequencing (`resources/development-plan.md` §20D); like ADR-083 it authorises no code by itself.
---

## ADR-086 - Notification wiring: centralized email templates, a platform-message catalogue, event-driven sends, and an email preview
**Status:** Accepted (this project). Relates to ADR-016 / ADR-059 (one CommunicationService/provider seam — MSG91 behind an abstraction), ADR-026 / ADR-057 (centralized API feedback; the shared client prefers the backend's own `message`), ADR-030 / ADR-046 (DD/MM/YYYY, hh:mm AM/PM, ₹), ADR-081 (password-reset link flow), ADR-082 (password policy), ADR-085 (wire the published-but-unconsumed domain events). Implements the notification half of the "reuse existing infra, no parallel system" brief.
**Context:** Before this change, exactly one business action sent a message (the password-reset email, built inline as plain text in `auth.service`). Every other domain event (`appointment.booked/cancelled`, `payment.received`, `lab.result_ready`, `encounter.signed`, `patient.registered`, `visit.checked_in`) was published but had **no** notification subscriber. There was no HTML email layer, no central place to see what the product can send, and no way to preview an email without triggering its business action. In-app "platform messages" were 67 success strings hardcoded per call in two frontends' `lib/api.ts`; there is no in-app notification centre and the codebase deliberately avoids faking one. The existing infrastructure was sound and had to be reused, not replaced: the `notification.service` send/log/idempotency path, the provider abstraction, the domain-event bus, and the shared client's "backend message wins" feedback rule.
**Decision:**
- **One email layout + one central template catalogue, both pure.** `notification/email/layout.ts` renders every email from structured content into branded, table-based, inline-styled, responsive HTML **and** a plain-text twin; untrusted text is HTML-escaped. `notification/email/email-templates.ts` is THE catalogue — a typed registry (`EmailTemplateDataMap` → `subject`/`build`/`sample` per key) a developer opens to see everything the product can email. Business logic never builds email HTML; it calls `sendAppEmail(template, data)` on the CommunicationService, which resolves the tenant's accent + org name (falling back to the Nirogix default; **no** tenant logo, because it is a short-lived signed URL that would be dead by open-time), renders, and hands HTML to the existing `sendEmail` (log + idempotency + graceful provider-failure handling). Dates/money are formatted to the platform rules (`email/format.ts`) before reaching a template.
- **Emails are wired to the events a user genuinely benefits from — email only, deduped, anti-spam.** `notification.subscribers.ts` (registered once at startup beside the existing subscribers) reacts to `appointment.booked`, `appointment.cancelled`, `payment.received`, `lab.result_verified` (a **new** event published at verification — the point of portal release, not raw result entry), and `patient.registered`, each sending only when the patient has an email on file and each deduped by a per-entity idempotency key. Onboarding (`onboardTenant`) and staff creation (`createUser`) send a welcome email with a **set-your-password link** (reusing the reset-token flow with a longer `PASSWORD_SETUP_TTL`, so no plaintext password is emailed; the operator temp-password handover still works — non-breaking). Password reset-completed and self-service change send a security confirmation. **Deliberately not wired** (no notification spam): `visit.checked_in`, `encounter.signed`, `invoice.created` (the receipt fires on `payment.received`), `user.logged_in`. A subscriber failure is caught and logged by the event bus and never affects the business action; welcome sends are additionally wrapped so a mail problem can never fail onboarding/user-create.
- **Platform (in-app) messages are a backend-owned catalogue, kept a separate channel from email.** `notification/messages.ts` is the single source of canonical success/info copy; a controller returns `{ message: MESSAGES.x }` and the shared client shows it identically in every frontend (backend message wins over any inline fallback). Email and platform-message are wired **independently per action** — an action gets the channel(s) that make sense, never both by default. No in-app notification centre is introduced.
- **An email preview tool, reusing the admin surface.** Two operator-gated read-only endpoints (`GET /admin/email-templates`, `GET /admin/email-templates/:key/preview`) list the catalogue and render a template from its own sample data (no tenant data touched), documented in OpenAPI. A new admin page (`/email-templates`, nav under Platform) shows the catalogue grouped by category and renders the selected email in a sandboxed iframe with its subject — so design and copy are verifiable without sending anything.
- **One new config key.** `PATIENT_URL` (added to env + `.env.example` + `.env` in lockstep) supplies the "view in portal" link in patient emails; blank ⇒ the button is simply omitted. No other new configuration — email still rides the existing `MSG91_*` (blank ⇒ the dev log provider, so the whole path is exercisable locally).
**Consequence:** The product now sends the emails a hospital actually needs, from the correct backend action, through one reusable branded template system a developer can review in one file and preview in the console — with no parallel notification stack, no duplicated inline HTML, and no notification spam. Nothing that worked before changed shape: the reset email now renders through the catalogue, onboarding still returns its temp password, and every send remains idempotent and provider-failure-safe. Transactional **SMS** stays intentionally unsent (the job payload gained a `templateId` field so it is ready) until DLT template registration lands (`BACKLOG.md` I-1); email is live the moment `MSG91_API_KEY` is set. Each newly wired email/message flips its `testcases.md` case in the change that ships it.
---
## ADR-087 - ABDM Milestone 2 (HIP): care contexts are pointers, consent artefacts are deleted
**Status:** Accepted (this project). Builds on ADR-084 (M1 identity). Relates to ADR-056 (public endpoints), ADR-046 (date format), invariant #5 (no EAV), invariant #6 (audit records are never deleted). Implements `resources/development-plan.md` §36 for M2 (HIP); M3 (HIU) remains out of scope.
**Context:** M1 proved who the patient is. M2 makes the hospital a **Health Information Provider**: records it creates become discoverable in any PHR app and, with the patient's consent, shareable with other providers. NHA's M2 has four parts — care-context linking, consent handling, FHIR packaging and encrypted data transfer. This ADR covers the first two, which are the foundation the other two stand on and the only two that transmit no clinical content.
**Decision:**
- **A care context is a pointer, never content.** The HIE-CM is data blind by design, so a context carries an opaque reference and a label and nothing else. The label is **generated by us** from the visit's date and setting (`OPD records from 03/10/2026`), never composed from a diagnosis, drug or result, and `assertNonClinicalLabel` **refuses** a label carrying clinical vocabulary rather than sanitising it — a caller that built a label some other way is a bug to fix at the source, and a disclosure to the consent manager cannot be taken back.
- **One care context per visit, carrying many HI types.** A single OPD visit routinely produces a prescription, a lab report and an invoice; a patient looking for "my visit on the 3rd" expects one entry. `hi_types` is therefore an **array**, not the single value a naive reading of the link payload suggests — ABDM's per-`hiType` grouping is a wire-format detail, not a reason to fragment what the patient sees. The reference number is the visit id: already unique per tenant, already what every record in that visit hangs off, and meaningless outside this system.
- **Care contexts are created from domain events, not from clinical code.** `encounter.signed`, `lab.result_verified` and `invoice.created` already fire; the subscriber is entitlement-checked and best-effort, so **no ABDM failure can break a clinical action**, and signing a consultation stays a clinical act that knows nothing about ABDM. `lab.result_verified` is used deliberately in preference to `lab.result_ready` — an unverified result is not something to publish to a national network. The subscriber only *records* that a shareable record exists; the linking call is a separate resumable step, which is what makes running it behind an event safe.
- **Only a VERIFIED ABHA is linkable.** A hand-typed ABHA number was never proved (ADR-084); linking national health records on the strength of an unverified string would attach one person's records to another person's identity.
- **A consent artefact is DELETED on revoke, expiry or ABHA opt-out** — not flagged inactive. NHA's certification checks the row is gone, and the reasoning holds independently: an artefact we keep is an authorisation we might act on. This does **not** breach invariant #6, because the two are different objects — the **audit event** (granted, revoked, by whom, when, for which consent id) is written and survives, while the **artefact** does not. History stays answerable without leaving a live permission lying around. Expiry is additionally **swept proactively** rather than trusted to a callback, because a missed notification would otherwise leave a live authorisation behind.
- **The consented care contexts are stored as a JSON snapshot, not a join.** They are a record of what the patient agreed to, and a foreign key would let a later edit to our own records quietly rewrite the terms of a consent.
- **Every transfer passes one gate, and it fails closed.** `checkConsentForTransfer` refuses on a missing artefact, an expired one, a different requester, an unlisted HI type, or a window wider than the grant — and says which, because "expired" and "this HIU was never granted access" are very different incidents to an auditor.
- **ABHA opt-out clears the identity, never the chart.** The clinical record was made under the hospital's own duty of care and stays (invariant #6); what is deleted is the national identity attached to it and every authorisation that flowed from it.
**Consequence:** The foundation of M2 is in place and fully testable locally — 19 tests covering label safety, per-visit accumulation, verified-ABHA-only linking, and all four mandatory consent cases (grant, revoke, expire, opt-out) plus the transfer gate. Nothing here calls ABDM or moves a clinical record. **The remaining M2 work is blocked on infrastructure**: every linking, discovery and transfer flow is an inbound webhook, which needs a public HTTPS endpoint with a valid certificate (`BACKLOG.md` I-5), and encrypted transfer additionally needs a JRE on the VM for the Fidelius CLI and Redis for the 20-minute SLA. Two mandatory HI types — **DischargeSummary** (needs the unbuilt IPD module) and **WellnessRecord** (needs standalone wellness capture) — cannot be produced from current data and are recorded as open questions for NHA rather than stubbed, because an empty clinical document is worse than an honest gap.
---
## ADR-088 - ABDM health records: structured FHIR bundles, not attachment-wrapped ones
**Status:** Accepted (this project). Builds on ADR-087 (care contexts, consent) and ADR-084 (M1 identity). Relates to ADR-047 (printing is browser-side, no server PDF), ADR-072 (LOINC-coded lab master), invariant #5 (core clinical entities are strongly typed).
**Context:** ABDM accepts a health record in two forms — a *simple* bundle wrapping a PDF or image, or a *structured* bundle carrying coded data — and the standard advice, repeated in the brief we were given, is to ship simple bundles first because they are quicker. NHA also states that every integrator is expected to produce structured data within a couple of years of compliance. Which of the two is actually cheaper depends entirely on what the product already holds.
**Decision:**
- **Structured bundles from the start.** For this codebase the usual advice is inverted. We generate and store **no PDFs** — printing is a browser-rendered route (ADR-047) and the backend has no PDF library — so a "simple" bundle would mean adding a headless-Chromium pipeline purely to manufacture an attachment. Meanwhile the data is already partly coded: **ICD-10** on every diagnosis, **LOINC** on lab tests where the master knows it, and vitals as discrete columns. Structured is the smaller change *and* the destination, so the detour is skipped.
- **Never invent a code.** Where a real code exists it travels with its system (ICD-10, LOINC). Where we hold only a name — a drug, a vaccine — the resource carries `text` and **no** `coding`. Deriving a SNOMED or ATC code from a drug name would produce a document that looks machine-readable and is wrong, and a wrong code in a national health record is more dangerous than an absent one.
- **Never emit an empty element.** Optional fields are omitted rather than sent as `null` or `""`, because a present-but-empty element asserts that something was measured and found absent.
- **Units are converted at the boundary.** Temperature is stored as tenths of a degree and weight in grams; the document carries °C and kg with UCUM codes. Blood pressure is **one** Observation with systolic and diastolic components, as LOINC models it — emitting them as unrelated readings loses the fact that they were taken together.
- **Only verified results leave.** A lab result without `verified_at` is a working note, not a finding; publishing one invites a clinical decision on a number nobody has signed off. This is the same rule the care-context subscriber applies at the other end of the pipeline.
- **Money comes from the stored line total**, never recomputed from unit price × quantity. The invoice the patient settled is the authority, and any rounding or adjustment the billing service made has to survive into the record they read back. (Found while testing: the first implementation recomputed it.)
- **An empty document is refused, not sent.** `ABDM_NOTHING_TO_SHARE` rather than a Composition with no content — pushing a clinical record that says nothing into a patient's PHR app is worse than telling the caller there was nothing to send.
- **Seven of eight HI types.** Prescription, DiagnosticReport, OPConsultation, ImmunizationRecord, HealthDocumentRecord, Invoice and — because we hold discrete vitals — WellnessRecord. **DischargeSummary is the one genuine gap**: it requires an inpatient admission and the IPD module does not exist. It stays absent rather than being emitted empty, and is an open question for NHA (`BACKLOG.md`), on the owner's decision of 25/08/2026.
- **The FHIR types are hand-written, not a dependency.** A full R4 type set is thousands of optional fields describing resources we will never produce, each one a way to emit something ABDM does not expect. A narrow hand-written subset makes the compiler enforce the shape rather than merely permit it.
**Consequence:** Every supported record type can be produced as an NRCES-profiled FHIR document from real rows, with 16 tests asserting the mapping itself — ICD-10 preserved, units converted, blood pressure kept whole, unverified results excluded, paise converted to rupees from the authoritative total, and the Composition first as the format demands. What is **not** yet done: validation against a real FHIR validator in CI (NRCES publishes one; `BACKLOG.md`), and the transfer that carries these bundles, which is blocked on the same inbound-webhook infrastructure as the rest of M2.
---
## ADR-089 - HIP-initiated linking: a resumable sweep, not an inline call
**Status:** Accepted (this project). Builds on ADR-087 (care contexts, consent) and ADR-088 (FHIR bundles). Relates to ADR-084 (verified ABHA, encrypted credentials), ADR-056 (public endpoints).
**Context:** ABDM's instruction is to link a care context "as soon as the health record is ready to be shared". Doing that literally — a gateway call inside the clinical write — collides with two facts about the protocol: linking needs a **link token**, and acquiring one is **asynchronous** (we POST a demographic-auth request, NHA delivers the token to our webhook); and linking is a network call to a government gateway that can be slow or down.
**Decision:**
- **Linking is a separate, resumable sweep.** The care context is recorded the instant a record is finalised (ADR-087); the link is attempted afterwards, over `pending` contexts. Running the sweep twice is safe, running it late costs only latency, and **a consultation can never fail to save because NHA was slow**.
- **Token acquisition admits it is asynchronous.** There is no `getToken()` that blocks: `linkTokenFor` returns what we hold, `requestLinkToken` asks, and the sweep retries once the webhook lands. A row exists with `requested_at` and no token — the honest in-between state. One request per address is outstanding at a time, because the webhook is the only thing that resolves it and asking again merely adds callbacks.
- **Expiry is read from the token's own `exp` claim**, not assumed from NHA's "about six months", and a token inside a one-day renewal margin is treated as absent — a link that starts with a token about to die fails at the moment a patient is waiting for their record. The claim is used **only** to decide when to renew, never to authorise, so the unverified signature is not a security question.
- **Link tokens are encrypted at rest or discarded**, like every ABDM credential (ADR-084): a plaintext link token is standing permission to write to somebody's national health record.
- **Only a verified ABHA is ever linked.** A hand-typed identifier was never proved; asking a national registry to trust it would be our error, not the patient's.
- **One call per patient, not per context.** ABDM notifies every subscribed PHR app on each link, so a visit that produced four records should reach the patient as one notification. The `hi_types` array fans out into ABDM's per-type patient blocks at the boundary — the fan-out is a wire format, not a reason to fragment the model (ADR-087).
- **Optimistic on accept, corrected by callback.** Contexts are marked linked when the gateway accepts the request; the `on_carecontext` webhook only acts on **failure**, putting them back to `pending` so the sweep retries. Success confirmations deliberately do not rewrite `linked_at`, which would drift away from when the record actually became shareable. Failures are believed, because the alternative is a desk that thinks records reached the patient when they never did.
- **The SMS fallback is the only branch where a phone number leaves the system**, so it carries its own audit entry — recording that we texted this patient, never the number — and refuses to text a patient whose records are already linked, which would be intrusive and pointless.
**Consequence:** The linking client is complete and testable today against a recording mock: 23 tests covering token lifetime and encryption, refusal on an unverified ABHA, the exact payload shape, one-call-per-patient batching, sweep idempotency, failure-callback retry semantics, and that the payload carries no clinical information. **It cannot complete a round trip until the bridge URL is registered**, which needs TLS on the staging API host (`BACKLOG.md` I-5) — the mock records the request rather than sending it, which is the only part of an asynchronous protocol we can control before the webhook exists.
---
## ADR-090 - Discovery and user-initiated linking: ambiguity means no match
**Status:** Accepted (this project). Builds on ADR-087 (care contexts), ADR-089 (HIP-initiated linking). Relates to ADR-016/ADR-059 (one communication seam), ADR-066 (duplicate-patient detection), ADR-056 (public endpoints).
**Context:** A patient who never gave us their ABHA can still find their records: they pick our facility in a PHR app, ABDM forwards a **discovery** request carrying verified identifiers (ABHA address, mobile, name, gender, year of birth) and optionally one they typed themselves (a hospital registration number), and we answer with the care contexts we hold. They then choose some, we verify them with an OTP, and the link is made. The entire risk of the flow sits in one question — **who is this?** — and its failure mode is handing one patient another patient's records.
**Decision:**
- **Ambiguity means no match, always.** If more than one chart fits, we answer with nobody rather than choosing. Twins on a household mobile are ordinary in India; the duplicate-patient guard (ADR-066) means our own data deliberately contains same-name, same-phone charts. Guessing between them is a disclosure, and the cost of refusing is that a patient repeats the search with better details.
- **A verified ABHA address is conclusive on its own**, and stops the search — ABDM proved it, not us, and looking for demographic agreement afterwards would only invent ways to reject a match that is already established.
- **Demographics require mobile AND name AND year of birth together**, with gender as a consistency check. Any one of them is a coincidence.
- **A self-declared registration number is never sufficient alone.** It is guessable, mistypeable, and readable off somebody else's card; treating it as proof would turn our own UHID sequence into an attack surface. It may only **break a tie** between demographic candidates — the weaker-signal role ABDM describes for it.
- **The requested care contexts are intersected with what we actually hold for that patient.** Reference numbers arrive from outside; a caller able to name any reference could otherwise have another patient's records attached to their ABHA.
- **The OTP is ours, and it goes to the number on the chart.** ABDM permits either their verified number or ours; we use ours, because an ABDM-verified number proves the ABHA while the chart's number is what this hospital actually confirmed with the patient. It runs through the platform's existing communication seam (ADR-016/059), inheriting hashing at rest, the five-attempt limit, the ten-minute life, the DLT template, and the rule that the code is never returned to a caller. The store is scoped to one **link request**, not to a destination, so two requests in flight from two apps cannot verify each other.
- **Every outcome answers the gateway, including refusal.** A wrong code replies `on-confirm` with an empty patient list rather than throwing: the patient's app is waiting, and a hanging screen is worse than a clear "that code was wrong".
- **Every discovery is audited, matched or not** — and records only which *kinds* of identifier matched, never their values. A run of unmatched discoveries against similar demographics is what an attempt to enumerate patients looks like, and that pattern is only visible if the misses are recorded too.
- **Contexts linked this way go through the same `markLinkResult` path** as HIP-initiated linking, so `status` means one thing however a context got there.
**Consequence:** The patient-driven half of M2 is complete and testable against the recording mock — 15 tests, most of them asserting that the right answer is *nobody*. **One caveat is recorded honestly:** the three **inbound** paths ABDM calls us on are not in the Milestone 1 collection and the M2 documentation shows only the gateway side, so they follow the confirmed Scan-and-Share convention and are marked unverified in `abdm.constants.ts` and `BACKLOG.md`. A wrong inbound path fails silently — the gateway simply never reaches us — which is exactly why it is flagged rather than assumed.
---
## ADR-091 - Data transfer: consent is re-checked at the moment of sending, and nothing leaves unencrypted
**Status:** Accepted (this project). Builds on ADR-087 (care contexts, consent artefacts), ADR-088 (FHIR bundles), ADR-089 (linking), ADR-090 (discovery). Relates to ADR-084 (encrypted ABDM credentials), invariant #6 (records are never deleted).
**Context:** The end of the M2 chain: a Health Information User holds a consent artefact and asks for a patient's records. We build them, encrypt them for that HIU, push them to a URL the HIU nominates, and tell the gateway how it went — within twenty minutes. This is the only place in the product where clinical records leave the hospital, so every decision here is made against a single failure mode: a patient's medical history reaching somebody entitled to none of it.
**Decision:**
- **Consent is re-checked immediately before sending, not when the request arrived.** A patient can revoke in the seconds between, and consent artefacts are *deleted* on revoke (ADR-087) — so the artefact we hold at the instant of sending is the only one that means anything. The request is acknowledged first and the check happens in the worker, which is precisely why it must be re-run there.
- **There is no plaintext fallback, on any path.** A missing Fidelius jar, a missing JRE, a malformed HIU key — every one of them ends the transfer and tells the gateway it failed. A "degraded mode" that pushed readable records to a third party would be the single worst defect this system could have, so the code is written so that no path reaches the push without a ciphertext. `FIDELIUS_CLI_PATH` being unset disables record transfer rather than weakening it.
- **Fidelius, NHA's own implementation, does the cryptography** — on the owner's instruction and for a good reason: an assessor recognises it, and hand-rolling the key-derivation details of somebody else's ECDH profile is how interoperability failures are found in production instead of in review. The cost is a JRE as a deployment dependency, which is accepted and recorded.
- **What is sent is the intersection of three things, never the request alone:** the care contexts the request names, the care contexts the consent covers, and the HI types the patient agreed to. The request says what the HIU *wants*; the consent says what they *may have*. A record type outside the consent is skipped silently; a care context outside it stops the transfer.
- **A refusal is always announced.** Every refusal path notifies the gateway with `ERRORED` rather than failing quietly — a HIU waiting on a transfer that will never arrive is worse than one told promptly that it will not — and is audited with the reason, because "expired", "revoked" and "granted to a different requester" are different incidents that an auditor must be able to tell apart from the log alone.
- **Partial delivery is a failed transfer.** If any page is rejected the whole flow is reported as errored, so the HIU re-requests rather than believing it holds a complete record.
- **Paging is bounded by bytes, not entry count.** One long admission can outweigh fifty prescriptions; a limit expressed in entries would pass our check and fail at the HIU. A single entry over the limit still ships alone, because refusing to send a large record is worse than sending one large page.
- **The push URL is deliberately not allowlisted.** The HIU nominates it, and the protection on that hop is that the payload is unreadable to anyone but the holder of the matching private key — not that we recognise the host. That call carries none of our gateway credentials, because nothing about it is us proving who we are.
- **The work runs on the queue, carrying only identifiers.** NHA allows twenty minutes, building and encrypting a year of records takes real time, and none of it should hold open the connection the gateway used to ask. No clinical data sits in Redis; the records are read when the job runs. The deadline is stored so lateness is *measurable* — a completed-but-late transfer is audited as a warning, which is how a pattern of near-misses becomes visible before NHA notices it at certification.
- **The checksum is of the plaintext, not the ciphertext** — base64 MD5, as NHA specifies. It is an integrity check the HIU performs after decrypting, not a security control of ours; confidentiality comes from the ECDH layer above it.
**Consequence:** M2's data-transfer half is complete and testable today against the recording mock — 15 tests, most of them asserting that nothing is sent: revoked consent, uncovered care context, unconsented record type, window outside the consented range, expired artefact, unknown facility. Two things remain genuinely blocked on infrastructure, both recorded in `BACKLOG.md`: the **inbound request path** is not in the Milestone 1 collection and is marked unverified in `abdm.constants.ts` like the discovery callbacks, and **no round trip is possible until the bridge URL is registered**, which needs TLS on the staging API host (I-5). A JRE and the Fidelius jar are now deployment prerequisites for anything beyond mock mode.
---
## ADR-092 - HIU consent: records held on loan, built to be deleted
**Status:** Accepted (this project). Begins Milestone 3 (HIU). Builds on ADR-084 (verified ABHA), ADR-087 (consent artefacts), ADR-091 (transfer). Relates to invariant #6 (records are never deleted) — which this deliberately inverts, see below.
**Context:** M2 answers other people's requests for our records. M3 is the opposite direction: a doctor asks a patient for permission to read the history other hospitals hold, and once granted we pull, decrypt and store **somebody else's clinical data on our own disk**, under a permission that can be withdrawn at any moment. NHA's two certification cases (`HIU_FLOW_202` revoke, `HIU_FLOW_301` expiry) both ask one question: *is the data actually gone?*
**Decision:**
- **These records are built to be deleted, and that inverts invariant #6 on purpose.** Every other clinical table holds records *we* created and must never lose; `abdm_hiu_records` holds records we *borrowed* and promised to destroy. So there is **no `deleted_at`, no soft flag, no archive** — the brief proposed one and it is rejected, because a soft-delete column invites exactly the bug the assessor tests for: a row hidden from the view and never actually purged. Revocation issues a real `DELETE`, and `consent_id` cascades so a purge cannot succeed halfway.
- **Stored as JSONB in the same PostgreSQL, not in object storage.** Deletion has to be atomic and provable; one `DELETE ... WHERE consent_id = $1` inside the same transaction that removes the consent is both. A blob delete is eventually consistent and lives outside that transaction, which is the wrong property for the one operation certification actually checks.
- **Expiry is decided by the clock, not by a status column.** `usableConsents` excludes anything past its erase date regardless of what its status says. A missed callback, an unrun sweep or a drifted clock must never become a licence to keep reading.
- **The sweep is an in-process timer, not a queued job.** A queue is right for work that must happen *once* across a cluster; this must happen *at all*. Every purge is an idempotent DELETE, so concurrent instances cost a little duplicated work and buy independence from Redis being up — a deletion obligation should not be one dependency away from silently not happening. It sweeps the M2 consent store too, which had no scheduler until now.
- **ABDM is acknowledged only after the records are gone.** The acknowledgement is our assertion that we complied; sending it first would make it a lie whenever the delete then failed.
- **The audit trail survives the deletion and holds metadata only** — who asked, which hospital, how many records, why destroyed. Proving compliance must not require keeping the very data we promised to destroy.
- **Two permissions, not one.** `abdm.history.request` puts this doctor's name and registration number in front of a patient and creates a destruction obligation; `abdm.history.view` reads another hospital's clinical record. A role that may open a chart is not thereby entitled to pull a national history onto it.
- **The doctor's registration number is mandatory and refused when absent**, rather than defaulted. It is the only thing identifying the human behind the request, and it is what the patient reads when deciding to grant — an anonymous clinician asking for a medical history is not a request anyone can meaningfully judge. It is also **snapshotted onto the request**, so a doctor leaving the hospital cannot change what the patient was shown.
- **Only a verified ABHA may be used.** A hand-typed identifier was never proved to belong to this person; acting on one could put a stranger's history in front of the doctor.
- **`CAREMGT` is the only purpose code sent** (owner's decision). `PATRQT` belongs to a patient-initiated pull that has no screen; `DSRCH` would need an ethics and governance framework this product does not have, and shipping a purpose we cannot govern is a liability rather than a feature.
- **A chart is the only trigger** (owner's decision). At registration no doctor is attached yet, so the requester field would be empty or wrong — and the pull should happen when there is a clinical reason for it.
- **One request fans out into many consents**, one artefact per hospital holding records, tracked individually because they expire and are revoked individually. An artefact we cannot tie back to a request is **dropped**, not stored orphaned: there would be no patient to attach records to, no doctor who asked, and no expiry to sweep.
**Consequence:** M3's permission layer is complete and tested — 16 tests, including both certification cases asserted by querying the table directly after a purge rather than trusting a return value. The purge exists **before** anything can be pulled, which is deliberate sequencing: the obligation is built before the capability that creates it. Slice 2 (Fidelius decryption and the inbound data push) and slice 3 (the unified timeline) follow. **The §36 legal and compliance review, already overdue for M2, now gates a materially larger surface** — this stores other hospitals' patient records — and is recorded in `BACKLOG.md` as blocking registration rather than build. Four M3 inbound paths are marked unverified for the same reason as M2's.
---
## ADR-093 - Pulling records in: nothing is stored that could not be decrypted and verified
**Status:** Accepted (this project). Milestone 3, slice 2. Builds on ADR-092 (HIU consent), ADR-091 (the outbound mirror). Corrects an unexecuted assumption in ADR-091 — see below.
**Context:** With a granted consent in hand, we ask a hospital for the records it covers. We generate an ECDH key pair, send the public half, and the hospital pushes encrypted records back minutes later on a connection we did not open. The asymmetry with M2 is the point: sending, we control what leaves and can refuse; receiving, the payload arrives from a stranger's system and we must decide what is safe to keep.
**Decision:**
- **Nothing is stored that we could not decrypt and verify.** An entry whose checksum does not match the decrypted content is discarded and counted as failed, never stored "just in case" — a doctor shown a partial or corrupted history has no way to know it is partial. The checksum is base64 MD5 of the plaintext, so it is verified *after* decryption; it is an integrity check, not a security control.
- **Failures are counted, not thrown.** A page holding nine good entries and one corrupt one yields nine records and a `partial` status, not zero records and an exception. The status and reason are recorded so the incompleteness is visible rather than inferred.
- **A fresh key pair per request, never a long-lived one.** One compromise should expose one document set, not every transfer ever made. The private half is stored because the push arrives later, and it is stored **encrypted at rest** (`encryptSecret`, ADR-084) — a readable private key is standing ability to decrypt somebody's medical history.
- **The keys die with the consent.** `abdm_hiu_data_transfers.consent_id` cascades, so purging a consent destroys not only the records but the only key that could read anything sent under it, including a re-delivery arriving afterwards.
- **Records arriving after a revoke are dropped unread**, and the flow is reported to ABDM as errored. The permission that would have justified storing them no longer exists, and the fact that they were already in flight does not revive it.
- **One unreachable hospital does not fail the others.** `requestAllRecords` continues past a HIP that refuses, because a partial history is worth more than none — provided the doctor is told which sources answered, which the per-transfer status carries.
- **A `link`-only entry counts as failed, not ignored.** Fetching an externally-hosted file is not supported yet; counting it as a silent success would present an incomplete history as a complete one.
- **The `notifier.type` is `HIU`**, the single field distinguishing this notify from ADR-091's. Sending `HIP` here would tell ABDM the wrong participant completed the flow.
- **A correction to ADR-091, recorded here rather than by editing it.** M2's `encryptForHiu` invoked Fidelius as `e <nonce> <publicKey> <payload>`, omitting our own key pair. Fidelius encrypts with **both** sides' material, so that call would have produced ciphertext no HIU could read. Building the decrypt side made the omission obvious: `d` plainly needs four key arguments, so `e` must too. Both now go through one `fidelius()` helper, so the argument order lives in exactly one place. **This is still unexecuted** — the jar has never run — but it is now wrong in one place instead of two, and consistent with the documented interface.
**Consequence:** M3 can ask for records and read them — 12 tests, most of them about the push being *wrong*: bad checksum, unreadable entry, unknown transaction, consent revoked in flight, multi-page delivery completing only on the last page. **494 backend tests across 52 files.** `ABDM_HIU_PUSH_BASE_URL` becomes a hard requirement and `dataPushUrl()` throws when it is unset, because ABDM accepts a request naming an unreachable endpoint and then silently delivers nothing — a failure that reads as a broken feature for as long as nobody checks. Slice 3 (the unified chronological timeline) is what turns these rows into something a doctor can read.
---
## ADR-094 - The external timeline: arrange, never interpret
**Status:** Accepted (this project). Milestone 3, slice 3. Builds on ADR-092 (HIU consent), ADR-093 (pulling records in).
**Context:** A patient who has been to four hospitals has four sets of records that mean little separately — a prescription from March is only useful beside the diagnosis from February. ABDM calls the merged result a longitudinal record, and it is what the doctor actually reads. The brief also suggested an optional generated summary of "key findings".
**Decision:**
- **One chronological feed across every source**, not a tab per hospital. Sorting is on the record's own clinical date, and an **undated record sorts last rather than being dropped** — a record without a usable date is still a record, and hiding it would be a silent omission from a clinical history.
- **The consent check lives in the query, not in the caller.** A record is returned only while a granted, unexpired consent still covers it, joined through the artefact and filtered on the **clock**. So a record becomes invisible the instant its permission lapses — before the purge sweep runs, and whether or not the revocation callback ever arrived. Deleting is the sweep's job (ADR-092); hiding is this file's; **neither depends on the other having happened**, which is what makes the guarantee hold when one of them fails.
- **Nothing clinical is computed.** An abnormal value is surfaced **only** when the source hospital's own FHIR `interpretation` says it is abnormal. We never compare a value against a reference range ourselves, because the range that matters belongs to the laboratory that ran the test. This code extracts and arranges; it never concludes.
- **The suggested "key findings" summary is declined**, and this is the one place the brief was not followed. An automatically generated clinical summary is a clinical claim this system has no standing to make, and one wrong summary read in a hurry by a busy clinician is worse than no summary at all. What is returned instead is counts, provenance, date span and a flag count — how much there is, where it came from, whether anything is marked — and the doctor reads the rest. The brief listed it as explicitly optional.
- **An allergy is always emphasised**, regardless of any interpretation code. It is the one line whose being missed causes direct harm, and that is a presentation decision rather than a clinical one.
- **Parsing is defensive and lossy rather than strict and fatal.** These bundles are written by other people's systems and may carry shapes we have never seen; an unrecognised resource is skipped. Losing one line of detail is recoverable, losing a whole record over a missing field is not.
**Consequence:** The pulled history is readable — 13 tests, including one that pins the boundary precisely: a record still physically on disk, with its consent lapsed and the sweep deliberately not run, must already be absent from the feed. **507 backend tests across 53 files.** `GET /api/v1/abdm/history/{patientId}/timeline` returns the merged feed with a counts-only summary. Slice 4 (the Portal UI) renders it; nothing in the Portal shows external history until then. Merging these entries with the hospital's *own* records into a single view is deliberately not done here — that is a presentation decision for the chart, and conflating borrowed records with our own in one service would blur the line the purge depends on.
---
## ADR-095 - The external history card: honest about what it does not know
**Status:** Accepted (this project). Milestone 3, slice 4 — completes M3's build. Builds on ADR-092…094. Relates to ADR-026/057 (one toast per event), ADR-046 (date format).
**Context:** The Portal surface for M3. A doctor opens a chart, asks the patient for permission to read their history elsewhere, waits for an answer they do not control, and eventually reads records that may vanish at any moment. Almost every state here is one the product cannot resolve on its own.
**Decision:**
- **The card shows the waiting state as a state, not as a spinner.** A consent request sits with the patient's own app, and they may answer in seconds, in a day, or never. "Waiting for the patient" with an explicit note that nothing arrives until they act is honest; a spinner would imply something is on its way.
- **Polling stops.** Every fifteen seconds while a request is genuinely outstanding, and never past a ten-minute ceiling. A patient who does not open their app must not leave a browser tab polling a national gateway for the rest of the day.
- **Records disappearing is explained in advance, in the UI.** A line under the timeline says the records vanish when consent is withdrawn or expires and our copy is deleted — so when it happens the doctor reads it as the system working, not as a fault. The empty state repeats it.
- **Only doctors with a registration number can be selected**, and when none exists the card says why rather than offering a button that always fails. The API refuses without one (ADR-092); the UI should not pretend otherwise.
- **The card renders what the API returns and adds no clinical judgement.** The "Abnormal finding" badge exists only where the source hospital's own FHIR said so (ADR-094). Nothing is computed, ranked, or summarised in the browser.
- **External history sits beside our own records, never merged into them.** Borrowed records disappear when consent lapses; ours never do. One combined feed would hide which is which at exactly the moment that matters.
- **`abdm.history.request` goes to doctors only; `abdm.history.view` also to org_admin.** The consent request carries a named clinician's registration number to the patient and commits the hospital to destroying the records — not a decision that belongs at the front desk. An administrator may read a pulled history for support and audit but may not raise a request, because a request must name someone the patient can recognise.
**Consequence:** M3 is code-complete and verified in a browser against the running stack. **The certification behaviour was demonstrated through the UI, not only in tests**: with a consent lapsed and the purge sweep deliberately not run — the record still physically on disk — the diagnosis, the lab value and the allergy were all absent from the doctor's screen, replaced by the empty state that explains why. Light and dark both take their colours from the tokens (the abnormal emphasis resolves to the dark warning token, not a literal). Two defects were found and fixed by looking: the shared client and the card each raised a toast for one event (ADR-057), and the source line printed the facility twice when a hospital names itself as its own organisation. **Nothing about certification changes: no health record has been exchanged with ABDM in any environment**, and the whole feature still waits on TLS, bridge registration, the Fidelius jar and the §36 review.
---
## ADR-096 - The Health Facility Registry: submitted is not verified, and the Facility ID is the hipId
**Status:** Accepted (this project). Begins Milestone 4 (NHPR), Part A. Relates to ADR-084 (M1 facility config), ADR-091/093 (the other two ABDM hosts).
**Context:** M4 lists the hospital itself in the national Health Facility Registry. It is the first ABDM milestone that moves **no patient data at all** — no consent, no encryption ceremony, no purge — so its risks are entirely different from M1–M3's. What it can get wrong is misleading an administrator about a months-long external process, and disagreeing with the earlier milestones about which facility we are.
**Decision:**
- **Every path in this milestone is read from NHA's published V4 OpenAPI documents, not inferred.** Both specs turned out to be publicly readable and are committed to `docs/abdm/`. This is a deliberate break from M1–M3, where several paths were guessed from an onboarding email and one — the bridge service registration — was **wrong**: the email shows an array of `{id, name, type, alias, endpoints}`, the real contract is `{facilityId, facilityName, HRP[{bridgeId, hipName, type, active}]}`. Guessing cost a week in M2; reading cost an afternoon here.
- **Submitted is never rendered as verified.** HFR routes every registration to a human verifier, so `submitted` and `verified` are separate states and the status machine refuses to conflate them. A green tick on submission would have an administrator believe they hold a Facility ID they do not, and discover otherwise when M2's service registration fails weeks later.
- **The `trackingId` is persisted before any later wizard step runs.** Registration is four calls, all quoting an id the first one mints; losing it means re-keying a forty-field form. A half-finished wizard an administrator can resume is a much better failure than a lost one.
- **The whole form is kept as JSONB, not just the indexed columns.** Somebody returning weeks later to fix a rejection needs it repopulated, and re-deriving forty fields from six would lose most of it. It holds facility details only — never a person.
- **An approved Facility ID is adopted as `abdm_facility_config.hipId`**, which M1–M3 already use and an org_admin types by hand today. Two ideas of "which facility are we" is a bug waiting for a busy afternoon. **But a *different* configured id is never overwritten** — a hospital may be live on one registered by hand months ago, and swapping it underneath a working integration would break every callback silently. That conflict is logged for a human.
- **Tenant-scoped with a nullable `branch_id`.** The brief was written for one hospital's in-house system; Nirogix is multi-tenant SaaS and tenants already have branches. A global row would have made the feature unusable for every tenant after the first.
- **Its own permissions**, `abdm.registry.*`, not `abdm.facility.*`. Those edit local configuration; these submit the organisation's details to a government registry under its name and create a public listing. org_admin only.
- **Master data is fetched and cached, never hard-coded.** LGD codes and facility types are the registry's to define; a local copy drifts silently into rejections that look like our bug.
**Consequence:** Part A is complete — 10 tests, **517 backend across 54 files**. Two facts were established against the live sandbox before a line was written, both contradicting the brief: our client **already holds** the `hfr` and `hp_id` roles (read from the session token's own claims), and the **ordinary gateway session token authenticates the registry host**, so there is no new credential — only a third base URL. `submitRegistration` is deliberately not exercised by the suite: it makes four live calls to a government sandbox, and registering a fictional hospital in a national registry on every `npm test` would be a bad idea. **A latent bug in M1 was found and fixed here:** `abdm_facility_config`'s unique constraint on `(tenant_id, branch_id)` did nothing for the commonest case, because PostgreSQL treats NULLs as distinct — a single-site hospital could accumulate unlimited facility-config rows. Both constraints are now `NULLS NOT DISTINCT`.
---
## ADR-097 - HPR enrolment: the dedup check comes first, and no Aadhaar is ever written down
**Status:** Accepted (this project). Milestone 4, Part B. Builds on ADR-084 (M1 Aadhaar encryption), ADR-096 (the registry client). Relates to ADR-092 (M3 needs a provider's registration number).
**Context:** Listing our doctors, nurses and pharmacists in the national Healthcare Professional Registry. It is M1's flow performed on a clinician instead of a patient — the same UIDAI eKYC, the same encryption — but the failure modes differ, because a professional identity is minted once and is meant to last a career.
**Decision:**
- **The duplicate check runs before anything is created, and its answer is believed.** Most Indian clinicians already hold an HPR id. A second one is not a spare row — it is a second national identity for a real person, and unpicking that is somebody's afternoon at a government helpdesk. A dedup call that itself *fails* does not block enrolment, but it is logged loudly, because proceeding blind is exactly how the duplicate happens.
- **No Aadhaar number is stored, returned, or logged.** It is encrypted with ABDM's certificate, sent, and forgotten; the row keeps only ABDM's `txnId`, which is a reference to a verification *they* hold. A stolen copy of `abdm_staff_hpr` therefore proves nothing about anybody. The OTP is encrypted on the same principle.
- **Registration numbers and HPR ids are deliberately NOT treated as secrets.** A council registration number is printed on prescriptions and an HPR id is designed to be public. Encrypting them would add ceremony without safety and make the feature harder to use; they are ordinary tenant data behind the ordinary permission.
- **The chain is resumable and its states are days apart.** A clinician who verifies Aadhaar on Monday and finishes on Thursday is normal. A transaction older than thirty minutes is refused with a clear 410 rather than failing three steps later with a message about something else.
- **Minting the id and registering the profile are one operation.** Splitting them would leave a doctor holding an HPR id with no council registration behind it, which is worse than not starting.
- **A verified registration number fills a *blank* provider field, never an existing one** — the same rule as ADR-096's facility id. M3's consent requests already require it (ADR-092), so a clinician who has just proved it to a registry should not type it again; but a hospital's own records may key on a value already on file, and replacing that is not this feature's business.
- **The published spec is incomplete for the Aadhaar chain, and that is stated in the code rather than hidden.** NHA's V4 document declares `verifyOTP` as taking only `txnId` — no OTP field — and `generateLink` with nowhere to put an Aadhaar number. Those two payloads are modelled on M1's proven ABHA shapes (the same eKYC underneath) and flagged unverified in `BACKLOG.md`, exactly as the M2/M3 inbound paths were. Every other path and payload here is read from the spec.
**Consequence:** Part B is complete — 10 tests, **527 backend across 55 files**. The registry client is stubbed in the suite rather than called: these are live government endpoints that mint real identities, and enrolling a fictional doctor on every `npm test` would be indefensible. What is asserted is our half — that the Aadhaar is ciphertext on the wire and absent from the row, the response and the audit entry; that an existing HPR id is found and recorded rather than duplicated; that a spent transaction is dropped; and that an existing registration number survives. **The Aadhaar chain has never been executed against the sandbox**, so the two unverified payloads remain the outstanding risk in this milestone.
---
## ADR-098 - Bulk onboarding: there is no bulk API, and ambiguity is refused rather than guessed
**Status:** Accepted (this project). Milestone 4, Parts A and B. Builds on ADR-096 (HFR), ADR-097 (HPR).
**Context:** The brief asked for "HFR bulk upload support" and "HPR bulk upload", citing a template and SOP downloadable from ABDM, for hospitals onboarding a whole existing roster at once.
**Decision:**
- **There is no bulk-upload API, and this was checked rather than assumed.** Both published V4 specs were searched for bulk, upload, import, template, csv, batch and multipart request bodies. HFR has nothing; HPR's only upload is `/apis/v1/uploads/upload-document`, which attaches one certificate to one professional. ABDM's bulk path is a **portal process** — their spreadsheet, their upload, their results — so building "a bulk upload client" would have meant building a client for something that does not exist.
- **What is built instead is the two ends the portal cannot do:** export the roster so nobody re-keys two hundred staff, and import the results so issued ids land against the right records rather than being matched by eye. The screen says plainly that the upload itself happens on ABDM's site.
- **Matching on import is strict, and ambiguity is refused.** Registration number first — unique and externally meaningful — then an exact full name, and only when it identifies exactly one *active* person. A row matching two people is reported and skipped. This is the mirror of M3's disclosure rule: an HPR id attached to the wrong clinician puts one real person's national identity on another person's record, and **nothing downstream would ever flag it**. A row a human must look at is a nuisance; that is a defect nobody notices.
- **There is deliberately no fuzzy matching.** "Close enough" is exactly the wrong standard when the payload is somebody's identity. A partial name matches nothing.
- **Anyone who already holds an id is excluded from the export**, because submitting them again invites the portal to mint a second identity for them.
- **The audit records counts, never the file.** The spreadsheet holds identities; an audit row is not the place for them.
- **Row numbers are reported as the administrator counts them** — header is line 1 — so "row 3" means row 3 in their spreadsheet, not index 2 in ours.
- **The column headings are derived from the verified API contracts, not from ABDM's template**, which is a downloadable spreadsheet we do not have. They are collected in one object per registry precisely so correcting them is a single edit, and that is flagged in `BACKLOG.md`.
**Consequence:** 12 tests, most of them about the import refusing. Verified end to end in a browser: exporting the real seeded roster produced the right columns with the id column blank, and importing a results file matched one row by registration number while naming the two that could not be matched, with their spreadsheet line numbers.
---
## ADR-099 - The registry screen: submitted is not done, and an unmatched row says which row
**Status:** Accepted (this project). Milestone 4, the Portal surface. Builds on ADR-096…ADR-098. Relates to ADR-057 (one toast per event).
**Context:** One screen for both national registries, under Hospital configuration. M4 moves no patient data, so the risks are not disclosure — they are misleading an administrator through a weeks-long external process nobody here controls.
**Decision:**
- **Submitted is never shown as done.** A submitted facility reads "Awaiting verification" with a line saying a verifier at ABDM still has to approve it and no Facility ID is issued until they do. A green tick would have somebody believe they hold an id they do not, and discover otherwise when the ABDM service registration fails a month later.
- **The screen is honest that bulk is a portal process**, in the copy, rather than presenting a button that implies we upload for them.
- **An import failure names the row and the reason**, and an ambiguous row names how many people it matched and what would disambiguate it. Silence, or a bare count, would leave an administrator with no way to act.
- **org_admin only** (`abdm.registry.*`). Listing the organisation in a government registry is not a clinical or front-desk act.
- **CSV parsing handles quoted cells.** A naive `split(",")` corrupts a hospital name containing a comma by shifting every later column — which would then match the wrong person. Excel's BOM is stripped so it does not become part of the first column's name.
**Consequence:** Verified in a browser against the running stack: the permission gate bounced a doctor to the dashboard; the page rendered for org_admin; the export returned the real seeded roster; a results file imported, matched one clinician by registration number and named the two failures with their line numbers; the enrolment persisted and re-rendered. Light and dark both resolve from the tokens. **678 tests across five workspaces.**
---
## ADR-100 - Closing the gaps the official ABDM test cases found
**Status:** Accepted (this project). Follows the audit of all 307 published NHA test cases for M1–M4. Amends ADR-084 (M1), ADR-087 (consent artefacts), ADR-092 (HIU consent). Relates to ADR-096/097 (M4).
**Context:** Auditing against NHA's own workbooks rather than our own reading of the specification found five code-level failures the internal test suite could not have caught, because each is a requirement about what an *assessor can observe*, not about what the code computes. Four are fixed here. The fifth is deliberately not.
**Decision:**
- **Consents become visible, without weakening the rule that they are deleted.** `HIP_INIT_GRANT / REVOKE / EXPIRE_CONSENT` all state their expected result as "seen in HMIS". That collides head-on with ADR-087, which destroys an artefact on revocation and does not bend. The resolution is that these are two different questions: the **artefact is the permission** and it is destroyed, while the **audit entry is the record that it existed and ended**, holds metadata only, and is never deleted (invariant #6). So the screen shows current permissions above and history below, and a revoked consent visibly moves from one to the other. That is what makes the deletion provable rather than merely claimed — and it is a better answer than either keeping the artefact or leaving an assessor with nothing to look at.
- **One ABHA number belongs to exactly one chart.** `TAGGING_UNIQUEPATIENTID_UNIQUEABHANUMBER`. Partial unique indexes on the **normalised** number and the lower-cased address, scoped to active charts: formatting must not be a loophole (`91-1234-5678-9012` and `911234567890` are one identity), and a soft-deleted chart must not permanently burn an ABHA. Our own discovery code already handled the duplicate state, which proved it was reachable rather than theoretical.
- **Resend is capped on the transaction, not in the browser.** `CRT_ABHA_106`. ABDM publishes no resend endpoint — a resend is the same request repeated — so the "twice, sixty seconds apart" rule is entirely ours to enforce, and enforcing it client-side would mean a reloaded page or a second tab could spend a patient's daily UIDAI allowance. **The Aadhaar flow requires the number to be supplied again, and that is deliberate**: we never store an Aadhaar (ADR-084), so there is nothing to replay; the browser still holds what was typed, and re-sending it costs nothing while storing it would create exactly the liability the whole design avoids.
- **An ABHA can be looked up before a history is requested.** `HIU_FLOW_101`. Previously the only way in was a chart already carrying a verified ABHA — right as far as it went, but it meant a walk-in whose ABHA had never been verified here could not be searched at all. The lookup deliberately does **not** invent an ABDM validation call: none exists in the published M1 collection, and guessing one is exactly how the M2 service-registration payload came out wrong. It returns the local match plus the honest next step, and the real validity check remains M1's verification flow, which puts an OTP in front of the patient.
- **Demographic / offline ABHA creation is NOT built, and is not stubbed.** `CRT_ABHA_301…309`, nine mandatory cases. The endpoint is absent from the published M1 Postman collection, the ABHA host publishes no OpenAPI document (unlike HFR and HPR, which do), and `enrol/byDocument` is a different thing — driving-licence enrolment, not demographic authentication. Building it would mean guessing a payload, a response and a provider signature, which is the precise mistake that cost a week in M2 and was found again in M4. **A stub that looks like progress is worse than an honest gap**, so this stays failed until NHA supplies the contract.
**Consequence:** Four of five gaps closed, with 18 tests that name the certification case they defend so a future regression fails in the assessor's language rather than ours. **557 backend tests across 57 files.** Two pre-existing defects surfaced on the way, both from the uniqueness index: `createPatient` used an unqualified `onConflictDoNothing()`, so a duplicate ABHA was silently retried as a UHID collision and reported as "could not allocate a UHID" — the wrong cause, and one a receptionist could never act on; and an M1 test was relying on two charts in one tenant sharing an ABHA number, which is the very state the new rule forbids. Both fixed. The demographic-mode gap and the 177 M4 screen cases remain the blockers to sign-off.
## ADR-101 - The consent callback a HIP had no way to receive

**Date:** 27/08/2026 · **Status:** Accepted

**Context.** Milestone 2 shipped with `revokeConsent()` implemented, unit-tested and correct: it
deletes the artefact, writes the audit event, and treats a re-sent revocation as a no-op. It was
also **unreachable**. Every caller was a test or the `abdm:m2check` diagnostic; no route in the
product could ever invoke it, because the callback ABDM uses to announce a consent change was never
built.

The consequence is the worst shape a consent defect can take. A patient withdrawing consent in their
PHR app changed nothing here — the artefact stayed live and went on authorising transfers — while
our own audit trail, having recorded only the grant, said the consent was still in force. The system
was wrong and self-consistently wrong, which is why no test caught it: everything that existed
passed.

It was found by reading NHA's own **Milestone 2 documentation** and the official **Milestone 2
Postman collection**, obtained from the ABDM sandbox portal. The same reading confirmed all seven
inbound paths that `abdm.constants.ts` had carried a warning against since M2 — every one inferred
from convention, every one correct — and confirmed the sixteen outbound paths besides. One missing
endpoint, zero wrong ones.

**Decision.**

- **Serve `/api/v3/consent/request/hip/notify`** (M2 §6.3.1) on the bridge URL, alongside the other
  gateway callbacks outside `/api/v1` for the reason ADR-084 already gives.
- **One path, three events, separated only by `status`.** `GRANTED` stores the artefact;
  `REVOKED` and `DENIED` delete it; `EXPIRED` deletes it. Deletion, never a flag — an artefact
  retained is an authorisation we might act on, and NHA checks the row is gone.
- **An unrecognised status stores nothing and deletes nothing, and says so in the log.** Guessing is
  unsafe in both directions: inventing a revocation destroys permission the patient still wants,
  inventing a grant fabricates permission they never gave. The schema is deliberately permissive so
  a formatting difference cannot discard a revocation; the strictness lives in the handler.
- **A grant naming no ABHA address is refused rather than stored.** Every transfer check matches on
  that address, so such a row would present as consent while behaving as though none existed.
- **Acknowledge after acting, never before.** `consent/v3/request/hip/on-notify` (M2 §6.3.2) is sent
  only once the artefact has actually been stored or purged, and carries the **inbound `REQUEST-ID`
  header** as its correlation id — not a body field. A failure to acknowledge is logged rather than
  thrown: the patient's wish has already been honoured locally and the gateway retries, so throwing
  would only discard that fact.
- **The stale warnings in `abdm.constants.ts` are removed**, replaced by what each path was verified
  against. A comment that says "unverified" long after verification trains the next reader to
  distrust the accurate ones.

**Consequence.** Three M2 certification cases move from failing to passing — *revoke a granted
request*, *consent status as revoked can be seen in the HMIS*, *records for revoked consent cannot be
seen in the system* — on logic that was already written. Twelve tests pin the behaviour, including
that an unknown status changes nothing and that the artefact is gone before the acknowledgement
claims it is.

The wider lesson is the one this project keeps relearning, now four times out of four: **the
published contract beats inference, and it beats it most on the endpoints nobody asked about.** The
six paths we worried over were all correct. The one that broke us was the one we never knew existed,
and no amount of re-examining what we had built would have surfaced it.

Two related gaps stay open and are recorded in `BACKLOG.md`: four acknowledgement callbacks we send
without listening for the reply, and demographic ABHA enrolment, whose contract the M1 collection has
now supplied (`authMethods: ["demo_auth"]` on an endpoint we already call).

## ADR-102 - The HFR registration form, and what running it against the real registry found

**Date:** 27/08/2026 · **Status:** Accepted

**Context.** Milestone 4's services shipped without screens, leaving 123 HFR and 60 HPR
certification cases failing for want of a form rather than for want of logic. This ADR covers the
facility-registration form; HPR enrolment and facility search/update follow.

The form is large — around forty fields across identity, ownership, location, contact, systems of
medicine, medical infrastructure and eight external programme identifiers — and every one traces to
a numbered case in NHA's HFR workbook.

**Decision.**

- **Save is not submit.** A draft saves in any state. Nobody has the CEA number and the ventilator
  count to hand in one sitting, and refusing to save an incomplete form loses an afternoon's typing.
  Completeness is checked once, at submit.
- **Submitted is never shown as approved**, continuing the rule the registry status screen already
  set: HFR routes every registration to a human verifier, and a green tick would have somebody
  believe they hold a Facility ID they do not.
- **The whole form lives in the row's `payload` jsonb**, so widening it needs no migration, and
  `FacilityDraft` is now `z.infer` of the request contract rather than a second hand-written shape.
  Forty fields is far too many for two descriptions to stay honest.
- **One `RegistryMasterSelect`** serves all twenty reference dropdowns (ADR-029). A list that fails
  to load says so in place rather than rendering empty — an empty dropdown reads as "this hospital
  has no options" rather than "the registry did not answer" — and it never raises a toast, because
  one outage would otherwise raise twenty (ADR-057).
- **Totals are stated, not computed.** The workbook asks an operator to be accountable for the bed
  totals; a mismatch against the itemised counts is pointed out, never silently corrected.

**What running it against the live sandbox found.** Three defects, none of which any amount of
re-reading the code would have surfaced, and all of which were shipped:

1. **Four of HFR's nine reference endpoints are POST, not GET** — `fetch-facility-type`,
   `fetch-facility-Sub-type`, `get-owner-subtype`, `get-specialities` — and take their filter in a
   JSON body. `registryMasterData` issued GET for all nine. Nothing threw: the four POST lists
   simply returned nothing, so four dropdowns were empty with no reason given.
2. **Facility type is not a free-standing field.** Its contract requires **both** an `ownershipCode`
   and a `systemOfMedicineCode`, so it can only be offered third in a chain. The form asked for it
   first, where it could never have populated. The field order is now
   *ownership → systems of medicine → facility type → sub-type*, which is a fact about HFR rather
   than a layout preference.
3. **HFR returns fixed-width, space-padded codes** — ownership comes back as `"P         "`.
   Carrying that padding into the next request is fatal rather than untidy: `facilityType`
   validates its `ownershipCode` against `^(?i)(G|P|PP)$`, which a padded value fails, and the call
   500s. Codes are now trimmed once, where they enter the application.

**Consequence.** The chain works end to end against the real sandbox — Private → Allopathy →
Hospital (code 40) → Civil Hospital / General Hospital / Nursing Home — and 263 ABDM backend tests
still pass.

The lesson repeats the one ADR-101 recorded, from the other direction. There it was the published
contract that beat inference; here it was **actually running the thing**. Two of these three bugs
are invisible to a type checker, a unit test and a code review alike, because an empty list is a
valid response and a padded string is a valid string. A screen that has never been pointed at the
system it integrates with has not been tested, however green its suite.

---
*Append new ADRs below with the next number. Never edit an accepted ADR — supersede it.*

## ADR-103 - The last three M4 screens: search before you register, amend after you are verified

**Status.** Accepted (30/08/2026). Extends ADR-096 (HFR), ADR-097 (HPR), ADR-102 (the registration form).

**Context.** The official test-case audit (ADR-100) put M4's missing screens at **177 of the 108
failing mandatory cases** — the single largest block on the matrix, and the only large one with no
external blocker. Registration shipped in ADR-102. The remaining three were HFR facility search (9
cases), HFR facility update (54) and the HPR enrolment wizard (60).

The APIs for two of them already existed and had been tested for weeks. What was missing was the
part a person uses, which is also the part NHA's workbook actually examines.

**Decision.**

1. **Search is offered before registration, and it is read-only.** One building must hold one
   Facility ID: that id is the `hipId` M1–M3 identify us by, so a hospital that registers a building
   HFR already holds breaks record linking for real patients — weeks later, with no obvious cause.
   The screen therefore sits *before* the forty-field form in reading order, and is linked from
   inside that form too, because the moment somebody doubts whether their hospital is listed is
   while they are filling it in. There is deliberately **no "use this facility" action**: a result
   is somebody's registry entry, and claiming one is a decision a human makes with evidence, not a
   button.

2. **A search with no filter is refused.** Every field is optional in HFR's
   `SearchFacilityRequestDTO`, which is a trap rather than a convenience: an empty body pages
   through the national registry. `page` and `resultsPerPage` explicitly do not count as filters.

3. **Update is a different act from registration, with its own route.** `saveDraft` has always
   refused a verified registration, precisely so nobody re-registers a building that already holds a
   Facility ID. That refusal needed a door beside it, not a hole in it — so `POST
   /abdm/registry/facility/update` exists separately from the save route's `PUT`, and the form
   unlocks only through an explicit "Update details" action. The Facility ID is never touched and
   the status stays `verified`: the facility *is* registered; what is in flight is a change to its
   details, and showing "awaiting verification" would tell an administrator their hospital had
   fallen out of the registry.

4. **The HPR wizard follows the registry's order and reads its position from stored status.** An
   HPR ID is a national identity minted from a real person's Aadhaar, so: the dedup check runs
   first and "they already have one" is reported as a **success**; the Aadhaar is typed, sent, and
   held nowhere — not in the database, not in component state past the call; and an interrupted
   enrolment resumes from the clinician's stored status rather than restarting with another OTP.

**Consequence.** All four M4 screens exist. Backend gains `searchFacilities` and
`updateRegistration`, both documented in OpenAPI, with 7 new tests — every one of them a *refusal*,
because the failures worth preventing here are silent ones. 583 backend tests pass.

**What this does not claim.** Building a screen and passing a case are different things, and only
the first is done. The audit has not been re-run. More importantly, **`updateRegistration` is
inferred rather than specified**: HFR's published V4 contract has no update endpoint at all, so
amending re-runs the four wizard calls against the stored `trackingId`, which is read off the
wizard's statefulness. The refusals are tested; the success path has never executed. A verified
facility registered by hand on ABDM's portal has no tracking id and is refused outright rather than
re-registered — the one failure mode that would be unrecoverable.

That is the same lesson ADR-102 recorded from the other direction: a screen that has never been
pointed at the system it integrates with has not been tested, however green its suite. Two of these
three have still never been pointed at it.

## ADR-104 - The HFR search contract, and an audit that cannot be re-run

**Status.** Accepted (30/08/2026). Corrects ADR-103. Qualifies ADR-100.

**Context.** Two findings from one attempt to re-run the ABDM certification audit.

**1. The audit is unreproducible.** `BACKLOG.md` stated that extraction and matrix generation were
scripted and that the report regenerated from `abdm_audit.json`. None of it is in this repository:
no data file, no extraction script, no matrix generator, and nothing of the kind has ever been
tracked in git. The 307 case identifiers survive only as prose and as the names of tests that defend
individual cases. The 14 committed NHA PDFs are API documentation and contain no test-case ids at
all.

So "169 mandatory, 33 pass, 108 fail, 26 blocked — NOT READY FOR SIGN-OFF" is a historical claim
that **cannot currently be checked or updated**, and it is the number the sign-off decision rests
on. That is recorded rather than quietly worked around, because the failure mode is specific: work
lands, the number is assumed to have improved, and nobody discovers otherwise until an assessor
says so.

**2. Reading the PDF found a bug in the search shipped hours earlier.** HFR's V4 OpenAPI marks every
field of `SearchFacilityRequestDTO` optional, so ADR-103 required "at least one filter" and guarded
against an empty search paging the national registry. NHA's own HFR API document says something
different:

> "If search is performed without facility id, then you must pass in all the required
> parameters(OwnershipCode, StateLGDCode,FacilityName) for a successful search."

All three together, or a Facility ID alone — which ignores every other parameter. `resultsPerPage`
has a floor of 10. The name is fuzzy-matched; everything else is exact.

**Decision.** The service now enforces HFR's two legal shapes and names which fields are missing, so
the form can mark them; the form offers those two shapes rather than a box of optional filters, and
disables the name group when a Facility ID is present. Six tests pin the rule.

One test was written and then deleted: proving "a Facility ID alone is legal" means getting past the
guard, and past the guard is a live call to a government gateway. It made one on every run before it
was removed. The guard is ours and is tested; the call is NHA's and belongs in `abdm:check`.

**Consequence.** The lesson is now recorded three times — ADR-101 (the published collection beat our
inference), ADR-102 (running it beat both), and here (**the prose document beat the machine-readable
schema**). A generated OpenAPI file describes the shape of a request, not the conditions under which
the server will accept it. The remaining PDFs in `docs/abdm/` have not been read this way, and
`pdftotext` extracts them cleanly.

The wider point is uncomfortable and worth keeping: two of the three screens ADR-103 shipped were
written against inference, and the first document opened afterwards contradicted one of them. The
audit that would have caught it is the one that no longer runs.

## ADR-105 - The certification matrix is derived, never transcribed

**Status.** Accepted (30/08/2026). Closes the finding in ADR-104. Supersedes ADR-100's case counts.

**Context.** ADR-104 recorded that the audit behind "33 pass / 108 fail / 26 blocked" could not be
re-run: no data file, no extractor, no matrix generator, none ever tracked. The owner then supplied
NHA's five published workbooks.

**Decision.** They are committed at `docs/testcasesofficial/`, and `hms_backend/src/scripts/abdm-audit.ts`
derives the matrix from them on demand — `npm run abdm:audit -w hms_backend`, with `--role` and
`--json`. It reads the `.xlsx` zip itself rather than shelling out, so it runs the same on a
developer's Windows machine, on the VM and in CI. It touches no database and makes no network call.

Three properties are deliberate:

1. **Derived, never transcribed.** The only inputs are NHA's files. A republished workbook changes
   the numbers by replacing a file, not by editing a document — which is precisely the failure mode
   ADR-104 was written about.
2. **The applicant type is a parameter, not an assumption.** A case's requirement is not the word in
   its own row: NHA scopes whole *sections* by applicant type, and a section header reading
   `Government` overrides every "Mandatory" beneath it. `CRT_ABHA_301…309` are the proof — each row
   says Mandatory, and they sit under *"Available Only for trusted entities"*. Private: out of scope.
   Government: mandatory. **M1 alone swings from 12 mandatory to 22.**
3. **It counts requirements and refuses to report results.** What passes is decided by NHA during
   functional testing. A local script that printed "108 fail" would be inventing an authority it
   does not have, which is how the last number outlived its own evidence.

**Consequence.** Today's workbooks hold **268 cases**, not 307: M1 43, M2 28, M3 8, M4-HFR 129,
M4-HPR 60. M4 matches ADR-100 exactly; M1, M2 and M3 do not, and each has a single sheet containing
exactly the count above, checked by hand. Either NHA revised them — M2 and M3 are both stamped
"UPDATED 22 Aug" — or the earlier count was wrong. **ADR-100's totals are superseded; cite the
script.**

For a private integrator: 26 mandatory, 3 conditional, 39 optional, 9 out of scope, 191 unstated.
The 191 are mostly M4's two workbooks, which are laid out differently from M1–M3 and need their own
reading before any M4 claim is made. "Unstated" is not "passing", and the report says so in its own
output rather than leaving it to be inferred.

**A bug worth recording.** The first version of the reader took only `sheet1.xml` and reported 9 HFR
cases instead of 129. It did not fail; it produced a smaller, plausible number. That is the same
shape of error as the audit this ADR replaces, and the reason the script now names any workbook it
cannot find rather than quietly totalling what it did read.

## ADR-106 - M4 classified: the workbooks were not silent, the parser was looking in one place

**Status.** Accepted (30/08/2026). Completes ADR-105.

**Context.** ADR-105 shipped a matrix in which 191 of 268 cases were "unstated" — 129 HFR and 57
HPR. The reading at the time was that NHA had left M4's requirement column empty and the two
workbooks needed their own interpretation.

That was wrong, and wrong in a way worth recording: **the requirements were there the whole time.**

**What the workbooks actually do.** NHA authors all five with merged cells, and the merge shifts the
columns differently in each:

- **M1–M3** put the requirement in column **B**.
- **HFR** uses column **D** for most rows, but column **B** for the entire Search API block
  (`HFR-001…009`) — because Function and Applicable To are merged from the block's first row.
- **HPR** uses column **A** for most rows and **D** for the first row of each merged group.

The first parser read column B and reported everything else as unstated. It did not fail; it
produced a smaller, plausible number — the same failure shape as the sheet-1-only bug in ADR-105,
and the same shape as the audit both ADRs exist to replace.

**Decision.** `resolveRequirementText()` searches columns D, B, A, C for a value that *looks like* a
requirement, rather than trusting a position. Unstated fell from 191 to 5.

**And they are not the same unit.** M1–M3 say "Mandatory"/"Optional" about a **scenario**. HFR and
HPR say "Yes"/"No" about whether a **data field is required**. Both are things an assessor checks;
they are not the same question, and adding them into one headline number flatters M4. `"Yes, if …"`
and `"Yes (only if …)"` are classified **conditional**, because a field that becomes required once
something else is chosen is a different demonstration from one that always is.

**Consequence.** For a private integrator: **114 mandatory, 16 conditional, 118 optional, 9 out of
scope, 5 unstated** across **262 distinct** cases. M4 alone carries 87 of the 114 mandatory, which
relocates the centre of gravity of the whole programme — it was reported as 26 mandatory a few hours
earlier, and that figure was really "26 in M1–M3, plus 186 I had not classified".

**262, not 268, and not ADR-100's 307.** The HFR workbook repeats its entire Bridge-linkage block
(`HFR-118…123`) on a second of its four sheets: 129 rows, 123 cases. ADR-100's "M4-HFR 129" counted
rows. The script dedupes by case id and prints how many rows it collapsed, because a matrix that
silently shrinks is the exact failure it exists to prevent.

The 5 remaining unstated are deliberate. NHA states the requirement once for a **pair** of alternates
(`CRT_ABHA_114`/`115`, `209`/`210`) and leaves the sibling blank; `HFR-013`/`HFR-067` ("to select the
country") carry none. Guessing would invent a requirement rather than read one, and the report says
so in its own output.

**The lesson, for the third time in three ADRs.** ADR-101: the published collection beat inference.
ADR-102: running it beat both. ADR-104: the prose document beat the machine-readable schema. Here:
**a number that looks reasonable is not evidence that the input was read completely.** Every one of
these was caught by going back to the primary source, and none by review of the code.

## ADR-107 - Fidelius through a file, and an evidence pack that gets worse when we ignore it

**Status.** Accepted (30/08/2026). Follows ADR-104 (which verified the argument order) and ADR-106.

### Part one — `--filepath` is not an optimisation

NHA documents Fidelius's `--filepath` flag for one reason: a terminal's *"'This command is too long'
(>8192 characters) limitation in case of long input strings"*. Every payload we encrypt is a
base64-encoded FHIR bundle, and one consultation's structured bundle clears 8192 characters
comfortably. Passing it as a command argument would have failed on the first real patient.

**The size-threshold version was rejected.** Sending small payloads as arguments and large ones
through a file produces a branch that every test fixture takes and no production payload does —
which is precisely the class of bug this integration keeps finding at the far end. So every
payload-bearing command (`se`, `e`, `d`) goes through the file; only `gkm`, which carries neither a
payload nor a key, is passed directly.

The cost is real and is treated as such: the file holds the plaintext bundle **and** our private
key. It is written inside a `mkdtemp` directory at mode 0700, the file itself 0600, and removed in a
`finally` so a Fidelius failure, a timeout or a thrown parse error all still clean up. Three tests
force the failing path with an unresolvable CLI path and assert nothing is left in the system temp
directory — the branch a test written against a working jar would never reach.

### Part two — the key material carries X.509

Fidelius's documentation recommends the uncompressed `publicKey` "for all encryption and decryption
operations", which is about the CLI's own arguments and is what we still pass there. It then carves
out this exact field: *"certain HIUs only accept the public key in the base64-encoded X.509 format,
specifically within the key material sent by the HIP, before decryption."* Both forms work for a HIU
that accepts either, so `keyMaterial.dhPublicKey.keyValue` now carries `x509PublicKey`, falling back
to `publicKey`. We were already capturing the X.509 form from `gkm` and discarding it.

### Part three — the evidence pack

`npm run abdm:evidence` joins the derived requirement matrix (ADR-105/106) to a curated statement of
where each case is demonstrated. The two halves are kept apart on purpose: deriving requirements
from a spreadsheet is safe, deriving *evidence* from code is not — a function named
`downloadAbhaCard` proves nothing about whether an assessor can download one. So evidence is
asserted by a person, in a file reviewed as a diff.

**A case with no entry reports as NOT EVIDENCED.** That default is the design: the pack should get
worse when NHA adds a case and nobody looks, because the alternative is a document that stays green
while the gap grows — which is what the previous checklist did.

First run, private applicant, mandatory and conditional only — **130 cases: 25 built, 2 partial, 16
unverified, 6 not built, 81 not evidenced.** 87 cannot be demonstrated today. The 6 not-built are
HFR's Bridge-linkage block, reachable only through the `abdm:bridge` CLI. The 81 are overwhelmingly
M4 field-level cases nobody has walked yet — and naming them is the point.

**It states what can be demonstrated. It does not claim a pass**, and says so in its own header;
that verdict is NHA's during functional testing.

## ADR-108 - Fidelius, executed

**Status.** Accepted (30/08/2026). Closes the open item in ADR-091, ADR-093 and ADR-107.

**Context.** Since M2 was built, every encrypted transfer in this system had run in mock mode, where
`cipher.ts` returns a clearly-marked `MOCK-NOT-ENCRYPTED:` envelope. The real invocation — argument
order, the shape of what comes back, the `--filepath` handoff — was written from NHA's documentation
and **had never executed once**. Successive ADRs recorded it as the highest-value verification
outstanding, and it stayed outstanding because it needed a JRE and the jar on a host.

**What was run.** On the India-resident staging node `e2e-131-182`: OpenJDK 17 (headless), Fidelius
CLI **1.2.0** unpacked at `/opt/fidelius`, `FIDELIUS_CLI_PATH` pointing at `bin/fidelius-cli` — the
launcher script, not a jar; the distribution is a script plus a `lib/` directory, and an earlier
version of this code assumed otherwise.

`npm run abdm:fidelius-check` then played both sides of an exchange locally, contacting nothing:

- a **23,253-character** FHIR bundle encrypted to 31,188 characters and decrypted **byte for byte**
- the checksum a HIU would verify, matching
- `x509PublicKey` returned by `gkm` and carried in `keyMaterial`, per ADR-107
- the parameter file — holding the plaintext and our private key — removed afterwards

**Consequence.** Three things are proven that could not be proven by reading:

1. **The argument order is right against the real jar.** ADR-104 verified it against NHA's worked
   example; this verifies it against the software. Inverting the sender/requester pairing produces
   ciphertext no HIU can read, and that pairing had never run.
2. **`--filepath` works for a payload no command line could carry.** 23,253 characters is well past
   the 8192-character limit NHA documents the flag for. Had this stayed as command arguments it
   would have failed on the first real patient, having passed every test fixture (ADR-107).
3. **The cleanup holds under load**, not only in the unit test that forces a failure.

**What it does not prove**, and the report says so itself: that ABDM can reach us — which needs the
HIP service registered — and that a real HIU accepts our key material. The encryption layer is no
longer the unknown; connectivity is.

**A note on where configuration lives.** The value was first exported in a login shell, where PM2
never sees it, and `pm2 env 0` does not list it even when correct because the app loads `.env`
through dotenv at boot. Neither is a bug; both cost a round trip. The check script reads the same
config the API does, which is why it is the honest verification and a shell `echo` is not.

## ADR-109 - The callers of our ABDM callbacks are now proved, not assumed

**Status.** Accepted (31/08/2026). Closes the critical finding of the M1–M4 compliance audit.
Amends ADR-056 (public endpoints), ADR-084, ADR-087, ADR-101.

**Context.** Every route ABDM calls was served with a rate limiter and a Zod body check and nothing
else. The reasoning was ADR-056's public-endpoint posture — tenant resolved server-side, no clinical
write, identical answers for every facility, rate-limited, audited — and that reasoning is correct
as far as it goes. **It defends against enumeration. It says nothing about forgery**, because it
assumed the caller was ABDM.

Auditing against NHA's own Postman collections found the assumption was load-bearing and unfounded.
A complete chain existed, entirely unauthenticated:

1. Obtain a facility id — HFR facility search is public, and is a screen we ship.
2. `POST /api/v3/consent/request/hip/notify` with that `X-HIP-ID`, `status: GRANTED`, and any ABHA
   address. `recordConsentGrant()` **creates** the artefact from caller-supplied data; the
   `signature` field is stored and never verified.
3. `POST /api/v3/hip/health-information/request` quoting that consent, with the caller's own
   `dataPushUrl` and their own `keyMaterial`.
4. The patient's records are built, encrypted **to the attacker's key**, and pushed to **their URL**.

`dataPushUrl` is `z.string().url()` — the schema comment reads *"accepted as any HTTPS URL by
design"*, which was true of the design and is the point. Every step passed validation.

**Decision.** `gatewayAuth.ts` verifies the inbound bearer JWT against NHA's published JWKS
(`/api/hiecm/gateway/v3/certs` — RS256, `use: "sig"`), and `requireAbdmGateway` guards all twelve
gateway routes. Notes on the shape:

- **`algorithms: ['RS256']` is pinned.** Without it a token nominates its own algorithm, which is
  the classic confusion attack; a test asserts `alg: none` is refused.
- **An unknown `kid` triggers exactly one forced refetch.** That is what rotation looks like.
  Refetching per failed token would let anyone with an invented `kid` drive traffic at NHA on our
  behalf.
- **`iss` and `aud` are logged, not enforced.** No genuine callback has ever been observed, and
  rejecting on a claim whose value we have never seen would be inventing a requirement — the exact
  mistake ADR-101, ADR-102 and ADR-104 each record.
- **401, not the uniform 202.** Hiding *which hospitals exist* is worth doing; hiding *that this
  endpoint needs a token* protects nobody and would make a genuine ABDM misconfiguration look like
  success.
- **`ABDM_CALLBACK_AUTH` defaults to `enforce`,** and a mistyped value falls back to `enforce`
  rather than open. `log` exists to observe one real callback before enforcing; `off` must never
  ship.

**Why this could be turned on immediately.** The bridge has `services: []` — ABDM has never called
these routes, so there was no legitimate traffic to break. Enforcing today costs nothing and closes
the hole. If NHA's callbacks carry a shape we reject, that fails closed, visibly, in the log.

**Consequence.** 18 unit tests against a local key pair (forged signature, `alg: none`, expiry,
unknown `kid`, missing `kid`, unreachable JWKS, empty JWKS, each mode) plus one API-level test that
flips enforcement on to prove the guard is **mounted**, not merely written — a correct guard nobody
applied is indistinguishable from no guard, and is the shape of the hole this closed. 609 backend
tests pass.

The suite otherwise runs with `ABDM_CALLBACK_AUTH=off`, because minting a valid token needs NHA's
private key; that split is documented in `test-setup.ts`.

**Still open.** The consent artefact's own `signature` is stored and not verified against the
consent manager's key. The transport is now authenticated, which removes the remote path; verifying
the artefact remains worth doing before real records move.

## ADR-110 - Reception collects the bill that check-in raised

**Context.** `checkIn()` asks the billing service to open a draft consultation-fee invoice, and
that is correct — OPD must never touch invoice tables itself (invariant #8). But the seeded
`receptionist` role held no billing permission at all: not `billing.invoice.view`, not
`billing.payment.collect`. The front desk therefore produced a bill on every check-in and could
then neither read it nor settle it, and the OPD queue's own Bill column linked somewhere the
receptionist was refused. A critical-path test asserted that 403 as if it were the design.

**Decision.** The receptionist role gains `BILLING_VIEW` and `BILLING_PAYMENT`. It does **not**
gain `BILLING_CREATE`.

The distinction is the workflow, not a compromise:

- **Reading and settling what the workflow raised** is front-desk work. The patient is standing
  there, the fee is the one the desk quoted when it picked the doctor, and the payment gate is what
  the consultation waits on.
- **Raising a bill of its own** stays with the cashier. Reception collects against charges the
  system generated; it does not invent them.

**Consequence.** The dead end is gone: check in, take the money, the doctor's gate opens. Every
payment is still recorded against the acting user and audited, and the invoice endpoints re-check
independently — the permission moved, the boundary did not. `reconcileSystemRoles()` runs in
`db/migrate.ts`, so existing tenants pick this up on the next migration without a data change.

The test that asserted the refusal now asserts the intended workflow: reception can list the
invoice check-in created, and is still refused `POST /api/v1/invoices`.

## ADR-111 - The application portals scroll natively; Lenis is the marketing site's alone

**Context.** `SmoothScroll` (Lenis) wrapped the Portal and the Admin app at the root, matching the
marketing site. On a working screen this is the wrong trade. Lenis takes over the document's scroll
and drives it from its own loop, so every region that has to scroll on its own — a long patient
page, a table with its own overflow, a dialog body, a sticky sidebar — has to be told about it with
`data-lenis-prevent`, and anything that is not told simply does not scroll. That failure mode is
not cosmetic: it is a page a user cannot reach the bottom of. The Admin shell already carried a
comment recording that `h-screen` had mysteriously stopped giving the sidebar a height, which is
the same root cause showing up as a layout bug.

Smooth scrolling earns its cost on a marketing page, where scrolling *is* the experience. It earns
nothing on a screen someone works in for eight hours.

**Decision.** Lenis runs on `marketing/` only. `hms_frontend`, `admin`, `patient` and `aiportal`
scroll natively. `SmoothScroll` stays in `@hms/ui` because the marketing site still uses it.

Two shared pieces had assumed Lenis was always present and were made to work either way:

- **`useScrollLock`** now pins the document itself and compensates for the scrollbar width, so an
  opening dialog no longer shifts the page sideways. It still stops and restarts Lenis when an
  instance exists, because a running smooth-scroll would keep animating the page behind an overlay.
- **`BackToTop`** takes its visibility from the native scroll position rather than from a Lenis
  callback, which never fired without a provider — the button was dead in both portals. It still
  returns through Lenis where Lenis is running.

`data-lenis-prevent` was removed from the Portal-only scroll regions it no longer means anything
on, and kept inside `@hms/ui`, whose components must keep working on the one app that still
smooth-scrolls. `lenis` was dropped from `hms_frontend`'s dependencies; nothing there imports it.

**Consequence.** The portals get the browser's own scrolling: correct nested containers, correct
`position: sticky`, correct anchor and focus scrolling, no library between the wheel and the page.
The Portal shell also moved from `min-h-screen`/`h-screen` to the `dvh` units the Admin shell
already used, so a phone's collapsing browser chrome does not leave the sidebar taller than the
viewport.

## ADR-112 - One Select, portalled

**Context.** `@hms/ui` had every form primitive except the most common one. Every dropdown in the
product was a raw `<select className="hms-input">` — around fifty of them. A native `<select>`
cannot show a second line, cannot be searched, cannot show a fee beside a doctor's name, renders
its list in the browser's chrome rather than the design tokens, ignores the tenant's accent, and on
a phone hands the user an OS wheel that ignores all of it. Picking one doctor out of forty meant
scrolling a native list with no search.

**Decision.** `Select` joins the kit as the one dropdown (ADR-029). It carries a label, an optional
second line, an optional right-aligned detail, grouping, extra search keywords, a clear affordance,
loading and empty states, and full combobox keyboard and ARIA behaviour. The search box appears
automatically past seven options, which is where reading stops being faster than typing.

**The panel is rendered into a portal and positioned in viewport coordinates.** An in-flow panel is
clipped by any ancestor with `overflow` — a dialog body, a scrolling table container, a card — and
that clipping is exactly what makes a dropdown feel cramped and half-usable. Positioning is
recomputed on scroll (capture phase, so ancestor scrolling counts) and on resize; the panel flips
above the trigger when the space below is too small, and its height is bounded by the room actually
available.

`--hms-text-xs` was added to the token scale rather than hard-coding the smallest text size inside
one component's rules.

**Consequence.** Converted first along the patient journey the dropdowns are worst in — check-in,
appointment booking, the appointment-request queue, the OPD queue filter, the billing service
picker. The remaining native selects elsewhere in the product are a mechanical sweep tracked in
`BACKLOG.md`; they are not blocking, and the component is now the only thing new screens should
reach for.

## ADR-114 - A demo database with a past, and still exactly three seeders

**Context.** The three environment seeders from ADR-058 worked, and what they produced could not
test the product. Development had two hospitals, five patients, one appointment and one visit; the
whole dataset lived on a single day. That is enough to prove login and RBAC, and nothing else. A
status filter with one value in it looks identical to a broken one. A date range that excludes
nothing is untested. Pagination never appears. A revenue chart has one point. A detail page with no
related records looks finished. Every manual test therefore began by creating records by hand, which
is slow, inconsistent between testers, and quietly biased towards the happy path — nobody hand-makes
a partially-paid invoice for a cancelled visit with an unverified critical lab result.

**Decision.** Still exactly **three seeders, one per environment**, and they remain the only files
anyone runs or edits — `seed.development.ts`, `seed.staging.ts`, `seed.production.ts`. Development's
seeder was renamed from the ambiguous `seed.ts` so the three read as a set. Each file declares
**what** its dataset is; a shared engine, `seedKit.ts`, builds it. `seedKit.ts` is not a seeder,
cannot be run, and exists so the same clinical story is not written twice and then allowed to drift.

The development and staging datasets now describe a hospital that has been open for a while: about
six weeks of completed traffic behind today, a live OPD queue this morning with a patient sitting in
every stage of the workflow, appointments ahead, invoices in every state, lab orders at every step,
stock that needs attention, and public form submissions waiting to be reviewed. Roughly 5-7 varied
records in every list, and both sides of every filter.

**Records are created through the real services, not by writing rows.** Numbering, invoicing, stock
deduction, referral consumption, the visit state machine and the audit trail therefore behave
exactly as they do in the product, and a seeded database cannot contain a combination the
application would refuse. The exceptions are named at their call sites and listed in `BACKLOG.md`:
appointment `no_show`, invoice `void`, payment `refunded`, lab order `cancelled` and result flag
`critical` are set directly, because the product has no action that produces them yet and the
filters that offer them need rows to find.

**Timestamps are then moved back** to the day the story says the visit happened. The services stamp
"now", which is correct for them and useless for a demo: a database with one day of history cannot
exercise a date range, a revenue trend, a collections report or an EOD summary. Backdating is a
fixture concern and touches only *when* - never a status, an amount or a relationship. The audit log
is append-only at the database level, so its history is inserted with its own timestamps rather than
backdated.

**Every choice runs through a PRNG seeded from the tenant code**, so a seeder against an empty
database always produces the same organisation, the same accounts, the same UHIDs in the same order
and the same queue. Staging's dataset stays the contract the E2E suite asserts against; development
gains reproducibility it did not have.

**Idempotency is split, deliberately.** Configuration, people and catalogues are topped up - created
when absent, never overwritten, so a re-run cannot undo what a tester has edited. The **clinical
story runs once**: replaying it would double every day's traffic, and the second pass would collide
with its own live queue, because a patient can only be in the OPD once at a time. Regenerating the
story is what `--reset` is for. That is the honest reading of "idempotent" - the script can be run
again safely, not that it invents a second past.

**`--reset` empties every tenant-scoped table and reseeds.** The table list is discovered rather than
maintained: a tenant-scoped table is one with a `tenant_id` column, which is the same rule that
decides where RLS is applied, so a table added next month is reset without anyone remembering. On
development the flag is enough; **staging additionally requires `CONFIRM_SEED_RESET=yes`**, because
staging is shared and a reset destroys whatever QA is part-way through.

**Production is unreachable from any of it, four times over.** `seed.production.ts` does not import
`seedKit.ts` at all - the import is absent, not merely unused, so there is no flag or code path in
it that reaches demo data. `requireEnvironment()` refuses a seeder outside its own environment.
`DATABASE_URL` is inspected separately, because the connection string is what actually decides which
database gets written. And the production seeder still requires `CONFIRM_PRODUCTION_SEED=yes`.
**There is no reset in production**: `resetSeedData()` lives in the engine production does not
import, so nothing in this repository can truncate a production table.

**Consequence.** `npm run db:seed -w hms_backend` is now the first step of manual testing rather than
a prelude to an hour of data entry, and `-- --reset` returns a poked-at database to a known state.
The dataset is documented in `docs/seed-data.md`, which also lists what still needs creating by hand
and why - uploaded files, ABDM exchanges, support sessions, single-use tokens, and any module that
is not `BUILT` (ADR-038). The cost is a bigger, opinionated fixture that has to be maintained
alongside the product: a new module means a new entry in the dataset and a new row in that document,
in the same change.

## ADR-113 - How a hospital runs its workflow is configuration, and vitals belong to the visit

**Context.** Two requests arrived together and turned out to be one problem.

The first: hospitals want vitals taken in different places — at the front desk while the patient
registers, in a nurse's room between check-in and the consultation, or by the doctor during it. The
second: the consultation fee is not always collected before the patient is seen, because a hospital
billing an employer or an insurer cannot work that way.

Neither could be built, for the same structural reason. Vitals were eight `vital_*` columns on
`encounters`. An encounter is created when the doctor opens the consultation, and
`getEncounterByVisit` refuses to create one while the fee is outstanding. **So a reading taken
before the consultation had nowhere to go, and a hospital that collected vitals at the desk was
asking for a row that could not exist.** The payment gate and the vitals problem were the same
column layout, seen from two directions.

### Vitals belong to the visit

`patient_vitals` is one row per **observation**: a set of readings taken at one moment, by one
person, at one point in the workflow (`check_in`, `pre_consultation`, `consultation`). The eight
columns are gone from `encounters`, and the migration copies every existing reading across before
dropping them.

Three consequences worth stating, because each was a decision rather than a side effect:

- **Readings accumulate; they are never edited in place.** A doctor who re-takes a blood pressure
  writes a second row. Two disagreeing numbers is a real clinical situation, and the earlier one is
  evidence. The consultation shows the latest and lists the trail beneath it with who took each.
- **The stage is kept** because it changes how a reading is interpreted. A pulse taken at a desk by
  a patient who has just climbed stairs is not the same observation as one taken in a quiet room.
- **The FHIR bundle's effective time is now when the reading was taken**, not when the encounter was
  signed. Dating a desk reading to the moment a doctor finished writing was wrong before; it is
  simply more obviously wrong once a reading can precede the note by an hour.

Which vitals a hospital collects is data (`vitals_required_params`, `vitals_optional_params` — text
arrays, so adding one is not a migration). What a reading *is* stays typed columns in exact integer
units. Invariant #5 is about the second thing, not the first.

`emr.vitals.view` / `emr.vitals.record` are their own permission pair rather than part of
`emr.encounter.*`. A hospital must be able to let an assistant take a blood pressure without also
handing them the clinical note.

### The workflow is configured, not coded

`hospital_workflow_config` resolves **branch, then organization, then platform defaults**. A branch
row is an override; saving one never edits the organization's. A tenant with no row at all gets
`vitals_mode: consultation_only` and `payment_timing: before_consultation` — *exactly* today's
behaviour, so shipping this changes nothing for anybody until they choose to change it. That is the
point of having defaults at all rather than backfilling rows.

Both settings are enforced server-side. `payment_timing` **moves** the gate; it does not move
enforcement into the client. `at_checkin` is the same gate as `before_consultation` — a hospital
choosing it is describing its own process, not weakening a rule. Only `after_consultation` lifts it,
and the invoice is still raised and still owed.

The vitals mode is checked as well as the permission. A client that sends `stage: check_in` to a
hospital which does not collect vitals at the desk is refused: the permission says *who* may record,
the mode says *where in the workflow* recording happens, and a front end cannot opt itself into
either.

**Required vitals are checked before the visit is created.** A required-field failure discovered
after the visit and its invoice existed would leave the desk holding a half-made check-in. Conversely
a reading that fails to save *after* a successful check-in is logged, not raised — the patient is in
the queue, and a lost blood pressure is re-taken in seconds, which is a far better outcome than
unwinding the visit.

The required list binds the desk, not the clinician. A doctor amending one number must not be forced
to re-enter the other five.

**This table is the home for workflow settings generally** — self check-in, payment-before-check-in,
walk-in policy — but a setting is added when the workflow it configures is built. A toggle nothing
reads is a promise the product does not keep.

**Consequence.** Two new tables (RLS applied automatically — `applyRls()` finds every table with a
`tenant_id`), a `/workflow-config` pair and three vitals routes, a Workflow tab in Hospital
configuration, a vitals section on check-in that appears only in `during_checkin`, a derived Vitals
queue screen for `after_checkin`, and one `VitalsFields` component shared by all three places a
reading is taken. `visits.reason` widened 500 → 2000 characters, because a chief complaint is a
paragraph. 20 new API tests; 642 backend tests pass.

**The queue is derived, never stored.** A visit is on it while it is checked in and no encounter
exists. Nothing has to be kept in step with the visit's own status, so it cannot drift out of
agreement with the OPD board.

## ADR-115 - One workflow brings a patient into the hospital; timing is a control, not a page

**Context.** Booking an appointment and checking a walk-in in were two screens asking almost exactly
the same questions — which patient, which doctor, which department, what for, how much — and
differing in one: **when**. Two forms meant two patient searches, two provider pickers, two ideas of
how long a chief complaint may be, and, as it turned out, two different sets of fields.

The duplication was not only cosmetic. Two things were genuinely missing before the forms *could*
be the same form:

- **An appointment had no department.** `visits.department_id` existed; `appointments` had nothing.
  A desk that chose Cardiology and then switched to "next Tuesday" lost the answer, because the
  endpoint had nowhere to put it.
- **Nothing recorded how the patient arrived.** `visits.visit_type` exists but answers a different
  question — *where* the patient is treated (`opd` today, inpatient later). There was no walk-in /
  appointment / follow-up anywhere, so the distinction the front desk makes constantly was not in
  the data at all.

**Decision.** One component, `VisitWorkflow`, with `timing: now | future` as a control inside it.
`now` checks the patient in and puts them in today's queue; `future` books a slot. Everything above
that line is written once and therefore cannot drift.

**The two routes stay.** `/opd/check-in` and `/appointments/new` are what the navigation, the OPD
queue, the patient chart, the referral worklist and everyone's bookmarks link to, and their
permissions genuinely differ (`opd.visit.checkin` versus `appointment.create`). They are now three
lines each: the same component, a different starting timing. That is the ADR-029 rule applied —
one implementation, configured, not two implementations kept in sync by hand.

The timing toggle is **only offered to someone holding both permissions**, and is hidden entirely
when the patient arrived from a booked appointment or a pending referral, neither of which can
become a future booking. Switching keeps every shared answer and resets only the half that no
longer applies.

### `arrival_type`, and why it is not `visit_type`

A new column on both `appointments` and `visits`: `walk_in`, `appointment`, `follow_up`.

It is deliberately **not** folded into `visit_type`. That column answers where the patient is being
treated; this one answers how they got here. An OPD follow-up is both, and one column can hold only
one value — conflating them would make both unusable.

**The intent travels on the appointment.** A patient who books a follow-up is still a follow-up when
they walk in a week later, and the desk checking them in never saw the booking. So check-in takes
the value from the appointment rather than the request, and a client claiming `walk_in` against a
booked follow-up is ignored rather than obeyed. A referral check-in is recorded as a follow-up for
the same reason: a patient sent on from another department did not arrive off the street.

Existing rows are backfilled honestly rather than defaulted: every appointment on the books was
booked as one, every visit predating the column was a walk-in because the desk had no other option,
and a visit already linked to an appointment is corrected to that appointment's intent.

`appointments.reason` widened 300 → 2000 to match `visits.reason` (ADR-113). One field in one form
with two limits depending on which button was pressed is a trap: the desk types a paragraph and
loses it by choosing "future".

**Deliberately not built.** `caseType: NEW | EXISTING` was part of the same request and is absent,
because **cases do not exist in the data model** — there is no `patient_cases` table for a control
to select from. A dropdown offering a choice nothing can store is worse than its absence. It stays
in `BACKLOG.md` with the rest of the case work.

Backend business logic is **not** merged: a future appointment has no token, no invoice and no
queue entry, and pretending one endpoint could produce both would be a worse abstraction than two
honest ones. What is now shared is the validation — both accept and check a department identically —
and the tests assert that symmetry, because the failure mode is quiet.

**Consequence.** Migration `0044`. 10 new API tests covering the shared answers, the arrival intent
surviving the wait, an invented arrival type refused at the edge, and what each timing actually
produces (a token and a bill, or neither). 652 backend tests pass. Every dropdown in the merged form
is the shared `Select` (ADR-112), the patient step the shared `PatientPicker`, and the vitals
section the shared `VitalsFields` (ADR-113) — the workflow is an assembly of pieces that already
existed rather than a fourth place they are re-implemented.

## ADR-116 - A case is what a follow-up follows

**Context.** The largest clinical unit the product had was the visit. A patient treated for a
fracture over six weeks was six unrelated rows, and nothing tied them together: ADR-115 added
`arrival_type: follow_up`, which records *that* a visit is a return but cannot record *what it
returns to*. The front desk's most ordinary question — "is this a new problem, or are they coming
back about the ankle?" — had no answer in the data.

**Decision.** `patient_cases`: a treatment episode with a number (`C-000001`), a title, where it is
being run, and whether it is still open. `visits.case_id` points at it, nullable.

### The decisions inside that, each of which could have gone the other way

**A patient may have several open cases, and a second one is never refused.** A diabetic being
managed long-term who breaks an ankle has two, treated by different doctors on different schedules.
Enforcing one-open-case-per-patient would be wrong about real medicine. Accidental duplicates come
from *not knowing* a case already exists, so the remedy is to make the open ones impossible to miss
at the moment a new one would be opened — the check-in picker loads them the instant a patient is
chosen, and the "new case" dialog says how many are already open — rather than to refuse the second.

**`case_id` stays nullable, and most visits will have none.** Forcing a case on every walk-in would
fill every chart with one-visit episodes nobody ever closes, which is worse than no cases at all: a
list of forty open "cases" is unreadable, and the feature stops being used.

**The title is free text and is not a diagnosis.** A case is opened at the front desk before anyone
has examined the patient. Requiring an ICD-10 code there would either block check-in or fill the
chart with receptionists' guesses. The coded diagnosis stays on the encounter, where a clinician
makes it.

**Check-in opens a case in the same transaction as the visit.** A case created by a check-in that
then failed is precisely the orphan record this feature exists to prevent — nobody would ever close
it, because nobody knows it is there. `openCaseTx` is exported in transaction-taking shape for that
one reason, and a test asserts a refused check-in leaves no case behind.

**Two permissions, not three.** `opd.case.view` and `opd.case.manage`. Opening a case *is* part of
checking a patient in, so the front desk holds manage rather than only view. Closing is guarded by a
business rule and an audit record instead of a third key nobody would know to grant.

**Closing is refused while a visit under the case is live.** Declaring an episode finished with the
patient in the waiting room is a mis-click or a race, and the alternative is a doctor opening a
consultation on a case already closed. Closing requires a reason, because "closed" with no reason is
unreadable to whoever opens the chart next.

**Reopening exists.** Treatment resumes and people mis-click, and the alternative — opening a second
case for the same episode — splits a patient's history in two with no way to put it back together.
Reopening erases the close reason from the row, so the audit entry is the only place it survives;
that entry therefore records it.

**Nothing is backfilled.** Every visit that already exists was recorded with no episode. Inventing
one per patient, or one per visit, would be guessing at clinical history and writing the guess into
the chart. A case is opened by someone who knows what it is for.

**Consequence.** Migration `0045`; RLS applied automatically. Six routes under `/api/v1/cases`, all
gated `requireModule('opd')` → `requireCapability('opd.case')` → `requirePermission`. A `CasePicker`
in the unified visit workflow (ADR-115) offering *no case* / *an existing open case* / *a new case*,
preselecting the latest open case when the desk has said "follow-up"; a `CasesCard` on the patient
chart; the case shown on the OPD queue, which is the answer to "why are they back?". 19 new API
tests — including that another patient's case is refused, that a closed case cannot silently take a
new visit, and that there is no delete route at all. 671 backend tests pass.

**Still open.** `visits.case_id` is set at check-in and never afterwards: a visit that should have
been filed under a case cannot be moved into one, which is the ADR-060 correction path and is not
built. Cases are also not yet what pricing reads — a follow-up consultation rate is still the same
`providers.consultation_fee_paise` as a first visit.

## ADR-117 - The consultation fee is a schedule, and charging otherwise is a decision with a name on it

**Context.** The consultation fee was one column: `providers.consultation_fee_paise`. A hospital
charging differently for a follow-up, or for cardiology, or for a senior consultant working the same
department as a junior, had exactly one way to express that — type the number by hand at every
check-in.

That is not a pricing policy. It is a policy held in a receptionist's head, applied inconsistently
across shifts, invisible to anyone auditing what the hospital actually charges, and impossible to
change centrally. The form even encouraged it: a blank "Consultation fee (₹)" field with the
doctor's default as a placeholder, which reads as an invitation to type something else.

**Decision.** `consultation_fee_rules`. A rule matches on any combination of **doctor**,
**department** and **how the patient arrived** (ADR-115's `arrival_type`). A NULL means *any*, which
is what lets one table hold both "every follow-up is ₹200" and "Dr Sharma's first visit is ₹800"
without either being a special case.

### The most specific rule wins, and specificity is a number

Doctor is worth 4, department 2, arrival type 1. Higher total wins.

The weights are not arbitrary and not merely a tiebreak: they encode the ordering a hospital means.
A named consultant's own fee overrides their department's, which overrides a blanket follow-up rate.
And because they are powers of two, the ordering is **total** — no two distinct combinations can
score the same, so there is never a tie to break by creation date or by luck. A unique index
(`NULLS NOT DISTINCT`, which is the point — without it Postgres treats every NULL as unique and the
constraint would never fire on the broad rules most likely to be duplicated) stops the same
combination existing twice.

A branch's own rule beats the organization's at equal specificity: it is a deliberate override for
that hospital, and therefore the more specific statement of the two.

**Nothing matching falls back to the doctor's own fee, then to zero** — exactly what check-in did
before this table existed. A hospital that never writes a rule sees no change, which is why there is
a fallback chain rather than a seeded default rule set.

### The schedule is binding, and an override is a named decision

A price list the front desk can silently ignore is decoration. So:

- **A different amount needs `billing.fee.override`**, which the receptionist role does **not** hold.
  A hospital grants it to whoever it trusts — per user, through the existing override mechanism
  (ADR-010) — so the supervisor at the desk can, and the desk cannot.
- **The permission is resolved from the session in the controller**, never taken from the body. A
  client asserting its own permission is not a permission.
- **Sending back the same amount is not an override.** A form that round-trips the number it was
  shown has not overridden anything, and refusing it would break every such form.
- **A reason is required**, because "₹200 instead of ₹800" with no explanation is indistinguishable
  from a mistake.
- **Both numbers are kept.** `visits.calculated_fee_paise` holds what the schedule said; the invoice
  holds what was billed. The gap between them *is* the override, and losing either half makes it
  unauditable. The audit entry carries both plus the reason, at `warning` severity — this is the
  kind of thing someone scanning a log should stop on.

### A rule is retired, never deleted

It is part of the explanation for every invoice it priced. What a rule *matches on* cannot be edited
either — change the price or retire it and write another — because editing the match conditions
would silently rewrite the explanation for past invoices without changing the invoices.

**Consequence.** Migration `0046`; RLS automatic. Four routes, gated `requireModule('billing')` →
`requireCapability('billing.fee_schedule')` → permission, including a `preview` the front desk calls
as it picks the doctor, so the fee is **quoted from the price list rather than remembered** — and
the form says where the number came from, which is what turns a price into an answer for a patient
who asks. A Fee schedule tab in Hospital configuration that lists rules most-specific-first, in the
order the server applies them, because a hospital writing overlapping rules has to be able to
predict the winner without reading documentation.

19 new API tests, most of them about the resolution order under deliberately overlapping rules. 690
backend tests pass.

**One thing the tests forced into the open.** Three existing service-level suites called `checkIn()`
with an explicit fee and no authorization — correct before, an override now. They were not "fixed"
by loosening the rule: each now states the authority it stands in for (`canOverrideFee: true` and a
reason), which is what a service-level test standing in for a permitted user should say out loud.

**Still open.** No effective dating: changing a price changes it from now, and the old value survives
only in the audit log and in the invoices it priced. Rules cover the **consultation fee** alone —
pharmacy, lab and services keep their own pricing. And a case (ADR-116) is not yet a pricing
dimension, so "the third visit of an episode is free" cannot be expressed.

## ADR-118 - Self check-in announces an arrival; the desk still creates the visit

**Context.** The request was for patients to check themselves in: identify at a kiosk, confirm, join
the queue. Everything needed for it now exists — the workflow-configuration table (ADR-113) for the
settings, cases (ADR-116) for what a visit belongs to, the fee schedule (ADR-117) so a price is
known without anyone typing it.

What does not exist, and deliberately, is permission for a public page to write a clinical record.
ADR-056 is explicit: a public submission **creates a record for a human to review**, and **never
writes to a clinical table**. A visit is a clinical record — it carries a queue token, opens an
invoice, and is what a consultation hangs off.

**Decision.** A patient **announces** their arrival; the front desk confirms, and confirming is what
creates the visit. `self_checkin_requests` is a request table, exactly like `registration_requests`
and `appointment_requests` before it.

This is not a watered-down version of the ask, and it is worth being precise about why. The patient
still does the queueing, at a kiosk or on their own phone. The desk's work drops from a full
check-in form to **one click**, because the appointment the hospital already booked says who the
patient is, which doctor, and which department. And the desk confirming *is* the identity check —
they are looking at the person, which is stronger than any credential a kiosk could collect.

Confirming runs the ordinary `checkIn`: same fee schedule, same case rules, same invoice, same
audit. There is deliberately no second check-in implementation on this path, because that is how the
two would quietly diverge.

### What the endpoint refuses to tell you

The security work here is almost entirely about non-disclosure, and two of the three decisions cost
something real.

**The reply never varies.** Matched, unmatched, or a hospital with self check-in switched off — the
caller gets the same 202 and the same sentence. A response that differed would turn a QR code on a
wall into an oracle answering *"is this mobile number a patient here, and are they due in today?"*
about a named person, to a caller who proved nothing.

**An announcement that matched nothing is still written.** This is the expensive one, and it is not
an oversight. An endpoint that only created a row on a match would leak the same fact through its
own side effects — anyone able to observe the board, or the row count, learns what the response
refused to say. It also turns out to be what the desk wants: "somebody tried to check in and we
could not find them" is a person standing in the lobby, and the board says **Needs a human** rather
than silently dropping them.

**Disabled behaves exactly like unmatched.** Nothing is written and the same sentence comes back, so
"does this hospital use self check-in?" is not answerable either.

The rest is the ADR-056 checklist, unchanged: tenant resolved from an opaque token **in the path**;
uniform 404 for a typo, a retired token and a suspended hospital; sign-in-tier rate limiting;
audited against the tenant **with no actor**, because there is no actor and inventing one would put
a fabricated name against a public action. The token is regenerable — the only way to retire a
poster that has been photographed or altered.

**The public path is not a way around a permission.** The board needs a session; confirming needs
`opd.visit.checkin`; turning the feature on needs `platform.organization.manage`. A patient scanning
a code buys a shorter queue, not authority.

**One field.** Everything else is on the appointment already. Asking a patient at a kiosk to retype
their name adds typing, adds error, and adds nothing — none of it would be trusted.

**Consequence.** Migration `0047`; RLS automatic. Seven routes, two of them public. A kiosk page in
the patient app, an Arrivals board in the Portal, a printable poster, and a Self check-in tab —
built as configurations of the same `PublicAccessPanel`, `PublicQrPoster` and `usePublicQr` the
other two surfaces already use, so this is a third instance of one pattern rather than a third
implementation. 20 new API tests, most of them asserting what is *not* disclosed. 710 backend tests
pass.

**Deliberately not built: automatic check-in with no desk step.** A hospital may well want it. It
would mean a public endpoint writing a visit, which contradicts ADR-056 — so it needs that ADR
amended, not worked around, and the amendment would have to say how identity is established without
a human looking at the patient. Recorded in `BACKLOG.md` as a decision for the owner.

**Also not built.** No OTP: SMS is still blocked on DLT registration, and an OTP would be security
theatre on a path whose output a human verifies face to face anyway. No identification by patient
ID, QR or appointment reference — the mobile number is what a patient has to hand and what the
hospital already holds. A walk-in with no appointment is told to go to the desk, because there is
nothing for the announcement to match.

## ADR-119 - The patient's record beside the check-in form, and files that know who they are about

**Context.** The front desk's second question, after "have we seen you before?", is "what for?" —
and answering it meant leaving a half-filled check-in, opening the chart, reading, and coming back.
The request was for the patient's history beside the form: previous visits, previous cases, previous
consultations *where permitted*, existing documents, and somewhere to attach the referral letter the
patient just handed over.

Four of those already existed. `PatientHistory` on the chart already showed visits, signed
consultations, invoices and lab orders, each permission-gated. So most of this was **extending one
component rather than writing a second**, which is the ADR-029 rule and also the only way the two
surfaces stay in agreement.

The fifth did not exist at all. **`file_metadata` has no patient link** — it stores branding assets,
letterheads and lab-report scans with equal indifference and knows nothing about who a file is
about. That is the right shape for a file store, and it is precisely why "show me this patient's
documents" could not be asked: the only references to files were single columns on other tables
(`tenant_branding.logo_file_id`, `lab_results.file_id`).

### `patient_documents`

A link table, not a column on `file_metadata`. The file store stays generic; the clinical attachment
concept lives beside the clinical records. `file_id` is a plain uuid with **no foreign key**,
matching the convention the existing references already use — files soft-delete and are retained for
audit, so a hard FK would either block that or cascade the attachment away with it. A deleted file
leaves its attachment behind reading `(file removed)`, because *that it was once attached* is part
of the record.

Visit and case are both optional and both useful: a referral letter handed over at the desk belongs
to the visit it arrived with, an MRI report to the episode, an insurance card to neither.

**Three ids, three ways to be wrong, all checked server-side.** The file must belong to this tenant
— the file store is shared infrastructure, and RLS protects the row only if the service actually
goes and looks for it. A named visit or case must belong to *this* patient. A document filed against
the wrong person is both a privacy breach and a clinical hazard, and nothing downstream would catch
it.

No new permissions: `file.document.view` and `file.document.upload` already answer "may this person
see and add documents?", and the front desk already holds both, because taking a referral letter at
the counter is front-desk work. Archived, never deleted, with a reason — the correction path from
ADR-060.

### The panel, and what it does not show

`PatientHistory` gained a `rail` layout (one column, newest four per block) and a Cases block, and
now renders in the check-in workflow beside the form.

**The permission gating is the interesting part, because the same component now renders for two very
different people.** A receptionist sees cases, visits, bills and documents. The **Consultations**
block — which carries chief complaints and ICD-10 diagnoses — requires `emr.encounter.view`, which
reception does not hold, so it is simply absent. A doctor opening the same panel sees everything.
The absence is not the boundary; the API is, and it re-checks every block.

**Only this hospital's own records.** Records held by *other* hospitals are ADBM territory: they
need the patient's consent and are requested by a **named clinician** from the chart (ADR-092).
Pulling them into a desk-side panel because a patient walked up would defeat the point of that
consent, so the panel does not, and says so.

The Cases block renders in the rail only. The chart already has `CasesCard`, which manages cases
rather than listing them; two cases blocks on one page would be duplication rather than richness.

**Consequence.** Migration `0048`; RLS automatic. Three routes on the patient module. A documents
card that both surfaces share, a two-column check-in on wide screens that stacks on anything
narrower — the form keeps its readable width rather than stretching, because a check-in form as wide
as a 27-inch monitor is harder to fill in, not easier. 13 new API tests, most of them about the
three ids. 723 backend tests pass.

**A pattern worth noting across the last few changes:** this is the fourth feature in a row whose
tests exposed a gap in the test harness's teardown ordering — `file_metadata` had never been cleaned
up because no harness tenant had ever uploaded a file. The harness only knows about tables features
have actually used.

**Still open.** Attaching happens against the *patient*, so at check-in the document is not yet
linked to the visit being created — the visit does not exist while the form is open. Linking it
afterwards, or holding the upload until submit, is a refinement nobody has asked for yet. There is
also no preview: opening a document is a new browser tab through a short-lived signed URL.

## ADR-120 - Consent status is a third thing, between asking and reading

**Context.** The request was to surface ABDM consent in the check-in workflow: say when consent is
required, let an authorised user initiate a request, show the current status, handle pending /
approved / rejected / expired, show protected history only when consent is valid, and make the whole
thing switchable per hospital.

Most of that already existed. `ExternalHistoryCard` (ADR-092…ADR-094) initiates requests, shows all
five states in the patient's own language, and the backend stops returning records the moment a
consent lapses. Three things did not.

### 1. The desk could not see the state, and the obvious fix was wrong

`abdm.history.view` gates two different things at once: seeing that a request is pending, and
reading another hospital's clinical records. The front desk needs the first — a patient at the
counter asks "did my old hospital send anything?" and somebody has to answer — and must not have the
second.

Granting reception `abdm.history.view` would have handed over borrowed medical records to answer a
scheduling question. So the permission is split: **`abdm.consent.status.view`** says *whether* a
consent exists and what state it is in. Three permissions now, for three genuinely different acts —
asking (which puts a named clinician in front of the patient and starts a destruction clock),
reading (another hospital's clinical data), and knowing that something is outstanding.

The endpoint is built to match, and what it **omits** is the design:

- **No source hospitals.** A name like "oncology centre" is a diagnosis by implication, delivered to
  someone with no clinical permission.
- **No record counts.** How many documents came back is a proxy for how ill somebody has been.
- **No requesting clinician.** The doctor's name and registration number are on the request for the
  *patient's* benefit (ADR-092), not the desk's.

What is left — states, counts, and when an active consent obliges us to have destroyed our copy — is
exactly what a desk can act on. A test asserts the response shape is closed, so a future field cannot
leak in unnoticed, and that the desk is still refused the requests, the records, and the ability to
ask.

### 2. Asking stays a doctor's job

This was raised as a concern before the work started and is recorded here as a decision rather than
an omission. The consent request carries a named clinician's registration number to the patient,
which is what they read when deciding, and it commits the hospital to destroying what comes back.
That is not a front-desk act, and ADR-092 stands. The desk can see that nothing has been asked, and
the card says who can ask.

### 3. "Configurable per hospital" was not actually true

`abdm.external_history` was marked **`PLANNED`** in the capability registry while M3 was built and
running, and — more to the point — **not one M3 route carried a capability gate.** A hospital
entitled to ABDM for ABHA verification alone silently had a national records pull.

The capability is now `BUILT` (the registry describes what the software does; whether it may be
*sold* is a separate question, and the marketing status stays IN DEVELOPMENT pending NHA
certification), and every M3 route is gated `requireModule('abdm')` → `requireCapability('abdm',
'abdm.external_history')` → `requirePermission`. Switching the capability off takes the status, the
requests and the timeline away together — which is what "enable or disable depending on the hospital
and integration requirements" has to mean.

**Consequence.** One permission, one endpoint, one card in the check-in rail, and a capability gate
on five existing routes. No migration. 13 new API tests, over half of them asserting absences. 736
backend tests pass.

**Unchanged, and worth stating because a reader of this ADR may assume otherwise.** No record has
been exchanged with ABDM in any environment. Production access still needs NHA functional testing, a
WASA certificate and Health Tech Committee approval. This ADR makes an existing, uncertified feature
correctly gated and correctly narrow; it does not make it live.

---

## ADR-121 - The two dimensions a real tariff turns on, in the hospital's own words

**Status:** Accepted · **Date:** 01/09/2026 · **Extends:** ADR-117 (the fee schedule), ADR-116 (cases), ADR-113 (workflow configuration)

### Context

The fee schedule shipped in ADR-117 prices on doctor, department and how the patient arrived. That
covers a hospital whose price list is a grid of doctors. It cannot express either of the two things
an Indian OPD tariff usually turns on:

- **"Teleconsultation ₹300, procedure room ₹150, review free."** What kind of consultation this is.
- **"Corporate patients are billed to the employer at the contract rate; camp patients pay ₹50."**
  What kind of arrangement the episode is being treated under.

Both were named in the request that produced ADR-115 through ADR-120, and both were left out at the
time. A hospital that needs them today has one option: type the number by hand at every check-in,
which is the practice ADR-117 exists to end.

### Decision

**Two more dimensions on a rule, and both vocabularies belong to the hospital.**

`consultation_type` on the visit, `case_type` on the case, and both on `consultation_fee_rules`
where NULL goes on meaning "any". The permitted values live in `hospital_workflow_config` as two
`text[]` columns, resolved branch-then-organization like every other workflow setting.

**Not an enum.** A teaching hospital's consultation types ("First OPD", "Review", "Procedure room")
and a corporate clinic's ("Employee", "Pre-employment medical") have nothing in common, and a fixed
list would be wrong for both. The alternative — a `consultation_types` table with ids and three more
joins — buys referential integrity for a word that a human reads off a screen next to a price.
Storing the hospital's own string is the honest shape, and the vocabulary check is what makes it
safe: **every writer goes through `assertConsultationType` / `assertCaseType`**, so a value that is
not in this hospital's list cannot reach a rule, a case or a visit. An empty vocabulary rejects
every value rather than accepting anything, because a hospital that has configured no consultation
types is one where a consultation type is meaningless.

**The case type lives on the case, not the visit.** A corporate arrangement, an insurance claim or a
medico-legal case is a property of the episode. Putting it on each visit would invite the third
follow-up to be recorded — and priced — as something the first two were not. It is read from the
case row at check-in and is **not a field on the check-in body at all**: a client-stated case type
would be a client-chosen price. A test sends one and asserts it changes nothing.

**Ordering: doctor (16) > department (8) > case type (4) > consultation type (2) > arrival type (1).**
Powers of two, so the ordering is total and no two combinations tie. The one judgement worth
defending is case type above consultation type: a corporate or camp rate is agreed in a contract and
is meant to hold whatever kind of consultation happens inside it. A hospital that disagrees writes
the rule naming both, which outranks either — that is what additive scoring is for.

**Removing a word is refused while an active rule prices it.** A rule naming a type that no longer
exists can never match again, so the hospital would go on seeing "Teleconsultation ₹300" in its
price list while every teleconsultation quietly fell through to something else. The error names the
types. Retired rules are ignored — they price history and match nothing.

**Everything starts empty, and empty means the question is not asked.** No field appears on the
check-in form, no dimension appears on the fee screen, every existing rule keeps NULL in both new
columns and goes on matching exactly what it matched before. A hospital that never opens the
workflow screen sees no change of any kind. That is the whole compatibility story, and it is the
same one ADR-113 told about vitals.

### Consequences

- One migration, `0049`, entirely additive. The duplicate-guard unique index is dropped and
  recreated over seven columns, because a unique index's column list is not alterable in place.
- The fee preview endpoint takes both new dimensions. It accepts a case type from the query, which
  is fine — a preview is a quote, and the charge is resolved from the case row regardless of what
  the form said.
- The case type is correctable (ADR-060): a case opened as general treatment that turns out to be an
  insurance claim is the ordinary case, and a type that could only be set once would be worked
  around by opening a second case — the duplicate ADR-116 exists to prevent. It changes what future
  visits are charged; invoices already raised are untouched, because re-pricing a paid consultation
  is a credit note, not an edit.
- Configuration changed, history did not. A visit recorded as a procedure stays a procedure after
  "Procedure" is removed from the vocabulary, and a test asserts it.
- 18 new API tests; **754 backend tests pass** (was 736). No new permission — the two vocabularies
  are workflow configuration (`workflow.config.manage`) and the price list is still
  `billing.fee_rules.manage`.

## ADR-122 - The staging seeder runs on every deployment, and never overwrites anything

**Status:** Accepted · **Date:** 02/09/2026 · **Extends:** ADR-058 (three seeders, one per environment), ADR-114 (a demo database with a past), ADR-076 (affected-only deploys)

### Context

Staging is where the manual regression script runs and where E2E asserts. Its dataset is a
contract — but a contract that only holds if somebody remembers to run `db:seed:staging` after
every deployment, which nobody does. A table shipped on Tuesday has no rows on staging until
Thursday, and the feature it belongs to cannot be tested until then.

The obvious fix — run the seeder from the deploy workflow — was not safe to do as the seeder
stood. It was idempotent in the weak sense: it would not *crash* on a second run, because most of
it was guarded by "is this table empty?". Two consequences followed from that shape, and both are
disqualifying for something running unattended on every deploy:

- **It overwrote work.** `updateOrganizationProfile`, `updateBranding`, `setSelfRegistration` and
  `setOnlineBooking` were called unconditionally. A tester who corrected the hospital's address, or
  turned a public form off to test the disabled state, lost it at the next deployment. So did an
  operator who suspended a tenant, deactivated a branch, or re-enabled the deliberately-disabled QA
  account — each of those was restated from the dataset on every run.
- **It could not add anything.** "Seed the catalogue while the table is empty" means a lab test
  added to the dataset in September never reaches a hospital seeded in July. Precisely the case an
  automatic seeder exists to cover.

### Decision

**The seeder converges on *present*, never on *the dataset's values*.**

Three mechanisms, in the order they are reached:

1. **A stable key per record, and creation only when it is missing.** A tenant by code, a user by
   email, a branch and a department by code, a provider by registration number, a lab test and a
   service by code, a supplier and a drug by name, a patient by **phone number**, a public request
   by the phone that submitted it, a notification by the idempotency key it already carried, an
   override by (user, permission). Never by display name: two real people share a name, and two
   services can both be called "Dressing". Found means **left alone, in whatever state it is in** —
   edited, renamed, repriced, deactivated. Missing means created. Nothing updates.

2. **A marker for every action that has no record of its own** — the new `seed_markers` table.
   Applying an organisation profile, a brand colour, a public-form toggle, the clinical history, a
   column backfill: each writes to rows that already exist, so each is done once and marked. The
   marker is written **after** the work succeeds, so a deploy that dies half-way finishes the job
   next time rather than declaring a partial history complete.

3. **Backfills that fill only NULL.** A column added to a table that already has rows is filled
   where nobody has entered a value and nowhere else, once, behind its own marker. The first is
   `services.department_id` — services seeded before the dataset named their department, which is
   why `/services` showed "—" in its Department column on every row (ADR-123).

**In the workflow, alongside migrations, under the same condition.** Seed definitions live in
`hms_backend`, so a dataset change always puts the backend in the affected set (ADR-076) and the
seeder always runs when the dataset moves. It runs *after* `db:migrate`, so a table added this week
exists before its rows are written.

**Four independent things keep it away from production**, because one would be a single point of
failure for an unrecoverable accident: the workflow triggers only on the `staging` branch against
the staging VM; `requireEnvironment('staging')` refuses unless `NODE_ENV` is exactly staging; the
same guard refuses a `DATABASE_URL` that does not look like a development or staging database; and
the workflow itself asserts `NODE_ENV=staging` in the VM's `.env` before invoking anything, so the
deploy log says *why* it stopped. **`--reset` is never passed from CI** — rebuilding the dataset
destroys whatever QA is part-way through, and stays a deliberate, announced act.

### Consequences

- One migration, `0050`, one new platform-managed table (`seed_markers`, no `tenant_id`, therefore
  no RLS policy — like `tenants` and `patient_identity`). `--reset` empties it with everything
  else, which is how a full rebuild is asked for.
- The seed report now distinguishes **created** from **kept**: "created nothing; kept 113 existing"
  is the healthy steady state of a staging deployment, and a log that could not say so was lying by
  omission. Every `*.kept` count is evidence that a re-run changed nothing.
- Verified by running the development seeder twice against a database holding 244 visits and 59
  patients, with four hand edits applied first (a renamed patient, a repriced service, an edited
  hospital city, a changed brand colour). Second run: **every table count identical except
  `audit_log`** — which grew because the seeder's own writes are audited, as they should be — and
  all four edits intact.
- The production seeder is untouched and still cannot reach this machinery: it does not import
  `seedKit.ts` at all, has no `--reset`, and demands `CONFIRM_PRODUCTION_SEED`.
- A no-op deployment seed costs one lookup per seeded record plus one per marker. On the staging
  dataset that is a few hundred indexed selects — seconds, once per deploy.

## ADR-123 - A missing value states which kind of missing it is

**Status:** Accepted · **Date:** 02/09/2026 · **Relates to:** ADR-029 (the Standard DataTable), ADR-047 (printed documents)

### Context

Roughly eighty places in the Portal rendered `—` for an absent value, each written by hand at the
call site. On `/services` every row read `Department: —`; on the OPD queue every walk-in read
`Provider: —`.

A dash is three different statements wearing the same clothes: *nobody has assigned this yet*,
*this cannot have a value*, and *the screen failed to fetch it*. A reader cannot act on it, because
they cannot tell which one they are looking at. It is also invisible to the table: the accessor
returned `"—"`, so a filter could not offer "unassigned" as a value and a search could not find
those rows.

`/services` was the case worth chasing to the bottom, because it turned out not to be a display
problem at all. The API returns `departmentName` from a real left join; the dataset simply never
named a department for any seeded service, so every service genuinely had none.

### Decision

**One component, and the call site states the reason.** `EmptyValue` / `ValueOrEmpty` /
`emptyLabel()` / `valueLabel()` in `@hms/ui`, with seven reasons: `unassigned`, `unspecified`,
`notRecorded`, `notConfigured`, `notApplicable`, `none`, `notAvailable`. Only the call site knows
which is true, so the reason is a required decision rather than a default.

**The accessor carries the same words as the cell.** `valueLabel(s.departmentName, "unassigned")`
means the Department filter offers "Not assigned" as a value and a search for it finds those rows —
"show me every service nobody has filed" becomes a question the table can answer.

**Fix the data where the data is the problem.** The dataset now names a department for every seeded
service, and a backfill fills `department_id` where it is NULL for hospitals seeded earlier
(ADR-122). One service is left deliberately unassigned, because "not assigned" is a state the
column has to render.

**A dash survives only where it is typography** — the `–` between the two ends of a reference range.
It is no longer a placeholder anywhere.

### Consequences

- Every table, list, detail page, card and print document in the Portal now says which kind of
  missing it is. Print documents use `emptyLabel()`, because a printed page needs a string, and a
  patient reading "Not applicable" understands it where a dash tells them nothing.
- Two dashboard tiles that showed `—` while loading now show `0`, which is what a count of nothing
  is. A tile cannot be "not applicable".
- `notAvailable` is deliberately rare: a value that exists but did not arrive is usually a bug to
  chase, not a label to print.
- **CSV exports keep an empty cell**, and that is not an oversight. A spreadsheet sorts, filters and
  sums an empty cell correctly; "Not assigned" in an amount column turns a number into text and
  breaks the thing the export exists for. The label is for a human reading a screen or a printed
  page; a machine-readable file gets nothing.

## ADR-124 - One screen for every code a patient scans

**Status:** Accepted · **Date:** 02/09/2026 · **Supersedes the navigation of:** ADR-056 (self-registration), ADR-069 (online booking), ADR-118 (self check-in)

### Context

Three tabs in Hospital configuration — *Patient registration*, *Online booking*, *Self check-in* —
rendered the same component, `PublicAccessPanel`, with different words. Same toggle, same QR card,
same copy/download/print/preview/regenerate row, same disabled alert. An administrator looking at
one of them could not tell from the screen which one they were on, and "where do I turn the QR code
off?" had three answers.

They are not, however, one setting. Each has its own database column, its own token, its own public
endpoint, its own review queue and its own audit trail; turning one off must leave the other two
working. Deleting either of the two named in the request would have removed a working feature.

### Decision

**One screen, three sections: `/hospital-setup/public-access` — "Patient self-service".** The three
`PublicAccessPanel` configurations move onto it unchanged, under a short explainer stating the thing
everyone gets wrong once: **none of the three writes to the hospital's records.** Each produces a
request; a member of staff turns it into a patient, an appointment or a visit.

**Self check-in joined them** even though the request named only registration and booking. It is the
same pattern, the same component and the same promise; consolidating two of three and leaving the
third as its own tab would have replaced one inconsistency with a stranger one.

**Nothing behind the screen changed.** Not a setting, a token, a column, an endpoint, a permission
or a queue. This is a navigation decision, and it is reversible by splitting the sections back into
pages if a hospital ever needs three.

**The old paths redirect permanently** rather than 404 — they are in bookmarks, in the manual
testing guide, and printed on the back of QR posters. The three poster documents point their "back"
link at the new route.

### Consequences

- One tab where there were three. The sidebar's *Registration requests*, *Booking requests* and
  *Arrivals* items are untouched, because those are **queues of work**, not settings, and belong
  where the work is done.
- `PublicAccessPanel` keeps earning its existence: it is now used three times on one screen, which
  is the clearest possible statement of what it is for.
- The page is longer than any of the three it replaces. That is the trade — one scroll against three
  places to look — and the section headings are what make the scroll navigable.

## ADR-125 - The Organization Admin may do anything inside their own hospital

**Status:** Accepted · **Date:** 02/09/2026 · **Changes:** the seeded `org_admin` role from ADR-009's MVP set · **Constrained by:** ADR-037 (the operator boundary), ADR-092/ADR-120 (who may ask for an external history)

### Context

`org_admin` was configuration-plus-read-only. It could create staff, roles, branches, departments
and providers, set the branding, the workflow, the services catalogue and the fee schedule, read
every report and the whole audit log — and could not correct a patient's phone number, book an
appointment, check anybody in, raise an invoice or take a payment.

The result on screen is what surfaced it: an administrator opens Patients and the Actions column
holds one eye icon; opens Appointments and there is no *New appointment* button. Not a bug — the
role has `patient.record.view` and `appointment.booking.view` and nothing else — but the person a
hospital holds accountable could not fix what they were accountable for. In a clinic of six people
the administrator *is* the person who covers the desk when the receptionist is on leave, and the
answer "grant yourself a permission exception first" is a poor one when the same person also holds
`platform.rbac.manage` and can simply do that. A boundary that the person on the wrong side of it
can lift in two clicks is not protecting anything; it is only making them slower.

### Decision

**One sentence: anything that happens inside this hospital, this role may do.**

The role gains the operational and clinical keys — patient create/update, appointment
create/cancel, OPD check-in and update, cases, referrals, immunisations, vitals recording, the
encounter (read and write), invoice creation and payment collection, pharmacy stock and dispensing,
lab test management and result entry and verification.

Two things it deliberately still cannot do, and each is a boundary rather than an oversight:

- **Anything outside this hospital.** `platform.tenants.manage`, the support surface, cross-tenant
  analytics, the vendor's own platform branding, and the **global** master-data catalogue every
  hospital shares. Those belong to the vendor's operators (ADR-037), and the separation is
  structural — a different organisation, RLS, and the wildcard role — not a matter of which keys
  are in a list.
- **`abdm.history.request`.** Requesting a patient's records from another hospital puts a named
  clinician's medical registration number in front of that patient, and it is what they read when
  deciding whether to consent. An administrator has no registration number to put there. This is an
  external requirement, so "full administrator" does not reach it. Reading a history a doctor has
  already pulled stays permitted, for support and audit.

**The clinical grant is the one worth arguing about, and the argument is the lever, not the
default.** Until today the product's own marketing repeated that "an Organization Admin cannot read
the clinical record". That sentence is retired. What replaces it is truer and more useful: a
hospital that wants its administrator kept out of the chart **denies `emr.encounter.view` /
`.write` on that account** — an explicit DENY beats the role that grants it (invariant #3), applies
on the next request, can be time-bound, and is audited. The separation is now *available* rather
than assumed, which is the honest description of a configurable system.

### Consequences

- **Existing hospitals get the wider role on the next deploy**, through
  `reconcileSystemRoles()` → `provisionTenantRbac()`, which runs inside `db:migrate`. That path is
  **additive only** — it inserts missing role→permission rows and removes none — so a tenant that
  customised its own roles keeps its customisation, and no hospital loses a permission.
- **The role's stored `description` does not change on an existing tenant.** `provisionTenantRbac`
  never updates a row it did not create, deliberately (ADR-122's rule, applied here): a tenant that
  renamed the role would have the rename reverted by a deploy. New tenants get the new wording;
  existing ones keep the old sentence next to the new powers.
- **The frontend needed no change at all.** Every button and row action was already gated on a
  permission key rather than on a role, so widening the role revealed them. That is the evidence
  the gating was built the right way round.
- **Nothing about enforcement moved.** Every route still runs `requireModule` → `requireCapability`
  → `requirePermission`; the server re-checks each call; RLS is untouched. This changes *what one
  role holds*, not how anything is enforced.
- Documentation that asserted the old split is corrected in the same change: the marketing
  capability reference's role matrix, its Organization Admin detail and the demo line (v2.25), plus
  `testcases.md` PAT-03 and QR-19/QR-20, which used `org_admin` precisely *because* it lacked these
  keys and now name a role that still does.

## ADR-126 - A refusal says which of the two things went wrong, and what to ask for

**Status:** Accepted · **Date:** 02/09/2026 · **Extends:** ADR-125 (the administrator's scope), ADR-085 (module ∩ capability ∩ permission), ADR-054 (the shared guards)

### Context

Three problems, and they turned out to be one.

**The administrator kept losing permissions by omission.** ADR-125 widened `org_admin` by writing
a longer list — and a list is exactly the thing that goes stale. Every permission key added by a
future release would default to *not* being in it, and the failure mode is silent: no error, no
test, just a button that never appears for the person accountable for the hospital. That is
precisely how the role came to be missing `patient.record.create` and `opd.visit.checkin`.

**A refusal told the user nothing they could act on.** "You don't have access to this. Contact your
organization administrator." Which permission? Who has it? Is it even a permission problem? A
person forwarding that screenshot to their administrator has given them nothing to work with.

**And the widening made a new kind of wrong answer possible.** An administrator now holds
`pharmacy.stock.view` whether or not their hospital has the Pharmacy module. The old panel would
have told them their *role* was missing something — sending them to ask their administrator (i.e.
themselves) for a change that would have done nothing, because the real answer is that the hospital
does not have the module.

### Decision

**1. `org_admin` is derived, not listed.**

```ts
permissions: ALL_PERMISSIONS.filter(
  (k) => !OPERATOR_ONLY_PERMISSIONS.includes(k) && !CLINICIAN_ONLY_PERMISSIONS.includes(k),
)
```

A key added tomorrow reaches the administrator by default, and *withholding* one becomes the
deliberate act that has to be written down — which is the right way round. It is still not a
wildcard: `super_admin` holds `*`, this holds a computed list, so the six operator keys and
`abdm.history.request` stay out by construction. Today: 68 of 75.

**A permission is not access.** Every route runs `requireModule()` before `requirePermission()`, so
the administrator's real reach is the *intersection* of that list with the modules their hospital
owns. Widening the role did not widen any hospital's surface by one screen.

**2. The page guard checks the module first, like the server does.** `RequirePermission` in
`@hms/client` now resolves the permission's module through `permissionModuleKey()` — derived from
`MODULE_REGISTRY`, never a second list — and refuses when the hospital does not have it. A
permission the registry does not claim is Platform Core and is never module-gated. While the
entitlement set is still loading it is empty, and an empty set is *not* read as "this hospital has
nothing", or every page of a healthy session would flash a refusal.

**3. `GET /api/v1/rbac/access?permission=…` explains the refusal.** It returns the permission's
human label and key, the module and whether the hospital has it, and **the roles in this hospital
that grant it** — read from that tenant's own `role_permissions`, so a cloned or renamed role
appears without anyone hard-coding a role name, and a role holding the wildcard counts.

`reason` is module-first (`module_not_enabled` → `granted` → `permission_missing`), because the two
failures have different owners: a module is the hospital's subscription and no administrator can
grant their way past it; a permission is a role question their administrator can answer today.

Authenticated, and nothing more. Which roles exist and what each may do is what an employee is told
on their first day; withholding it only makes the refusal useless. The response is closed — a test
asserts its exact key set — and names no patient, no account and no other tenant.

**4. The panel says all of it.** Required permission in words *and* as a key (the sentence for the
person, the key for whoever they forward it to), the module, the roles that hold it, and the note
that a grant can be per-account and time-limited. A hospital without the module gets a different
headline, a different tone and no mention of roles at all.

### Consequences

- `PERMISSION_LABELS` in `@hms/permissions` names all 75 keys, with `permissionLabel()` falling
  back to a derived sentence for a key this build has never seen — a tenant's custom role can carry
  one from a later release, and a blank line is worse than a decent guess.
- `@hms/client` now depends on `@hms/permissions`. It already depended on the *idea*; the guard is
  the first thing that needed the registry itself.
- Every frontend gets the module-first guard, not just the Portal. The panel stays per app, because
  each one sends a refused user somewhere different (ADR-054).
- The 27 page-level guards in the Portal were audited against the derived role: all 27 name a
  permission the administrator holds, so no page refuses them any more. The only component-level
  action still hidden from an administrator is `abdm.history.request`, which is deliberate.
- **Custom roles are handled by not handling them.** Nothing reads `SYSTEM_ROLES` at refusal time;
  it is all `role_permissions` rows, so a hospital that invents "Reception Manager" sees it named
  on the refusal screen the moment it grants the key.
- 6 new API tests. The one worth keeping honest is the module case: an administrator who holds the
  permission and still has no access, which a permission-only message would describe wrongly.

## ADR-127 - Three input defects, and a patient chart ordered by what staff reach for

**Status:** Accepted · **Date:** 02/09/2026 · **Touches:** ADR-029 (the shared kit), ADR-119 (the patient chart), ADR-060 (row actions and correction)

### Context

Three reports, one theme: the screen was fighting the person using it.

**1. Typing a fee moved the caret to the Doctor dropdown.** On the fee schedule, entering `5` in
the Fee field put focus on the first control in the dialog. The cause was not the field. `Dialog`'s
focus-trap effect declared `[open, onClose, busy]` as its dependencies, and every caller passes an
inline `onClose={() => setOpen(false)}` — a new function identity on every render. So each keystroke
changed a dependency, tore the effect down (which restores focus to whatever opened the dialog) and
set it up again (which focuses the first control in the body). The field was fine; the trap was
re-arming under it. `NavDrawer` had the same shape.

**2. Scrolling over a focused number input changed its value.** A cashier types `500`, scrolls to
reach Save, and the amount becomes `501` because the pointer was over the field. Nothing announces
it, and the number that was checked is not the number that is saved. This is browser default
behaviour and a genuine hazard in a hospital.

**3. The patient chart made staff hunt.** Name and UHID were in the header, then a two-column grid
of *Identity / Contact / Emergency contact / Portal access* — with age nowhere at all, blood group
as the third row of a card called "Identity", and *Patient portal access* (a desk task) sharing the
top tier with a phone number. Visits and consultations, the reason most people open a chart, were
at the very bottom, below immunisations.

### Decision

**1. A focus trap depends on `open`, and nothing else.** `Dialog` and `NavDrawer` keep the current
`onClose`/`busy` in a ref that is reassigned each render, and the effect reads from it. The handler
always calls the current callback; the effect never notices the identity changed. Fixed once in the
kit rather than by memoising `onClose` at each of the ~20 call sites — a rule that says "always wrap
your handler in `useCallback` or the dialog misbehaves" is a rule that will be broken.

**2. One wheel listener for the whole application.** `NumberInputGuard` in `@hms/ui`, mounted beside
the other providers in each app. When the pointer is over a **focused** `input[type=number]` it
cancels the wheel and **forwards the scroll** to the nearest scrollable ancestor — cancelling alone
would have fixed the value and frozen the page. Deliberately not a prop on an input component: it
has to hold for a raw `<input type="number">` on a page nobody has migrated, and copying an
`onWheel` into every form is how half of them end up without it. It is a document listener because
React registers `onWheel` passively, and a passive listener may not call `preventDefault`. Typing,
arrow keys, `step`, decimals, validation and touch devices are all untouched.

**3. The chart is ordered by what someone reaches for, in five tiers.**

| | | |
|---|---|---|
| 1 | **Identity strip** | Initials, name, UHID, **age**, gender, date of birth, **blood group**, status — one line, above everything |
| 2 | **Contact**, then **Emergency contact** | "How do we reach them" is the second question at a desk |
| 3 | **National health ID (ABDM)** | An identifier, not a demographic — its own card, below the details people open the chart for |
| 4 | **Treatment cases**, then **Immunisations** | Ongoing care before past care |
| 5 | **History** → **History from other hospitals** → **Portal access** | Visits, consultations, invoices, lab orders, documents; then borrowed records; then the administrative task |

Blood group moves out of a table row and becomes a badge: it is a clinical fact, and **its absence
is stated** rather than left blank, because "we do not know this patient's blood group" is the thing
worth knowing. Age is computed by `ageInYears` in `@hms/utils`, now shared with the patients list —
a chart that disagreed with the list it was opened from is a bug people report.

**Nothing was removed.** Every field, card and permission gate that existed still renders; only the
order changed, and `Patient portal access` moved from the grid to the bottom.

### Consequences

- **A real permission bug surfaced while reordering.** `CasesCard` was gated on
  `clinical.immunization.view` because it sat inside the same `<Can>` as the immunisations card. A
  role permitted to manage treatment cases but not immunisations saw neither. It now carries
  `opd.case.view` — the key the API actually enforces.
- **The chart scrolled sideways on a phone**, and had before this change: `PatientHistory`'s grid
  items kept their default `min-width: auto`, so one long visit line pushed the cards to 817px
  inside a 375px viewport. `[&>*]:min-w-0` — the same remedy the dashboard grid already used — and
  `break-words` on the detail rows, so a long email stays inside its card. Measured after: zero
  elements wider than the viewport.
- **No allergies section, deliberately.** The request asked for one and the product has no allergies
  field on a patient — inventing an empty card would promise a place to record something the system
  cannot store. Recorded in `BACKLOG.md` instead.
- The dialog fix is invisible where it works, which is most places: every dialog in every app that
  passes an inline `onClose` was re-arming its focus trap on each render, and only a field the user
  types into for more than one character made it visible.

## ADR-128 - A page's primary action is in one place, and there is nowhere else to put it

**Status:** Accepted · **Date:** 02/09/2026 · **Extends:** ADR-029 (the Standard DataTable), ADR-039 (the Action column)

### Context

*Book appointment* on Appointments and *Check in* on the OPD queue sit top-right, in the page
header, level with the page title. *Register patient* on Patients sat one row lower, inside the
table's filter toolbar next to **Columns**.

One screen out of twenty-one, but it is the screen a receptionist opens most, and the cost is paid
every time: the button is not where the last page put it, so it has to be found rather than
reached for. Consistency of position is worth more here than on almost any other control, because
this is the one a user goes to without looking.

The mechanism was `toolbarActions`, a slot on the Standard DataTable. Exactly one page in the
whole monorepo used it — which is the tell. A slot that only one caller uses, doing something no
other caller does, is not a feature being used; it is a way to be inconsistent that happened to be
available.

### Decision

**The primary action lives in `PageHeader`, top-right. There is no other slot.**

`toolbarActions` is removed from `DataTable`, and the `actions` prop it fed is removed from
`DataTableToolbar`. The toolbar is Search → Filters → Sort → Column visibility → Pagination
(ADR-029) and holds nothing else. This is deliberately mechanical rather than a note in a style
guide: a written rule saying "prefer the header" would be broken by the next person who finds a
convenient prop, and a rule you cannot break is worth more than one you have to remember.

**Ordering when a page has several actions:** supporting first, primary **last** (right-most).
`ghost` for navigating away (*All patients*), `secondary` for a side task (*Print / PDF*, *Add
item*), the default variant for the action the page exists for. This is what every multi-action
header already did; it is written down now.

**Permission-gated in place.** `<Can perm={…}>` around the button — an action the user may not
perform is not rendered and the header simply has no actions. Never disabled instead, and never
moved somewhere less prominent.

**An empty state may repeat it** (`emptyAction`), and that is a repeat rather than a second home:
an empty table is exactly when somebody needs the button, and the header may be scrolled out of
view.

### Consequences

- One page changed. Twenty other list and detail screens already did this and are untouched, which
  is the evidence the convention was real and Patients was the exception.
- Two props deleted from the kit. Nothing else referenced them in any of the five frontends —
  verified by grep before removing, and 107 `@hms/ui` component tests pass unchanged.
- `Register patient` grows from `size="sm"` to the default size, matching every other primary
  action. The `emptyAction` copy of it stays small, because it sits inside an empty-state block.
- The next screen that wants a create button has exactly one place to put it, and finding that out
  costs a look at any existing page rather than a review comment.

## ADR-129 - Reading how the hospital runs is not an administrative act

**Status:** Accepted · **Date:** 02/09/2026 · **Corrects:** ADR-113 (workflow configuration) · **Relates to:** ADR-057 (one notification per failure)

### Context

A receptionist opening **Book appointment** was met with a *Not permitted — you do not have
permission to perform this action* toast, beside a form that then worked perfectly.

`GET /workflow-config` requires `platform.workflow.view`, and the receptionist did not hold it.
But the workflow configuration is what the desk's own form is built from (ADR-113): where vitals
are taken decides whether the vitals fields render at all, when the fee is settled decides whether
payment gates the consultation, and the consultation-type and case-type vocabularies are the
hospital's own words in two of the form's dropdowns. The screen cannot be drawn without reading it.

The key was scoped as though the configuration were an administrator's private setting. It is not:
it is *how this hospital runs*, and every staff-facing screen that follows the workflow has to know
it. Four screens read it — the check-in and booking form, the vitals queue, the patient chart's
cases block, and the fee schedule — and only the last is an administrator's.

Two defects, not one. The permission gap was the cause; the toast was a second, separable problem.
Every caller already handled failure correctly (`Promise.allSettled`, fall back to the platform
defaults), so the *page* was never broken — but the shared API-feedback layer reported the failure
anyway, which is right for a call nobody is handling and wrong for one the page deliberately
tolerates.

### Decision

**1. The read key goes to the roles whose screens read it** — receptionist, doctor, branch_admin
and cashier, alongside the administrator who already had it. Not to the pharmacist or the lab
technician, who reach none of those four screens.

The split that matters is preserved exactly: **`platform.workflow.view` is reading how the hospital
runs; `platform.workflow.manage` is deciding it**, and only the administrator holds the second. The
configuration screen itself is still gated on the manage key.

Widening the *route* to any authenticated session was the alternative, and was rejected: it would
have left `platform.workflow.view` enforced by nothing, and a page guard on a key no endpoint
checks is a boundary in name only.

**2. A failure the caller already handles does not raise a toast.** `getWorkflowConfig` is fetched
with `feedback: false` (ADR-057's own opt-out). Every call site treats "no config" as "use the
platform defaults" — which is the behaviour a hospital that has configured nothing gets anyway, so
the fallback is correct rather than merely quiet. A hospital that DENIES this key on one account
now sees that account's form fall back to defaults, not an error next to a working form.

### Consequences

- Nothing about enforcement moved: the route still runs `requirePermission`, and the server still
  decides. Four roles hold one more read key.
- The fix reaches existing hospitals through `reconcileSystemRoles()` in `db:migrate`, additively —
  no tenant loses anything, and a customised role keeps its customisation.
- Verified as a receptionist: **Book appointment**, **Check in** and the **Vitals queue** all load
  with no toast, and `GET /workflow-config` returns 200 where it previously returned 403.
- The general lesson is worth stating because it will recur: **a permission named for the screen
  that *edits* something is the wrong key for the screens that merely *read* it.** When a
  configuration governs a form, everyone who uses the form needs the read key — or the form 403s
  against the settings that describe it.

## ADR-130 - A verification is several answers, and the last one is not the whole of it

**Status:** Accepted · **Date:** 02/09/2026 · **Fixes:** ADR-084 (ABDM Milestone 1)

### Context

Two reports from the sandbox, one cause.

**An existing ABHA produced an empty form.** `verification/verify` returned the account list with
real demographics —

```json
"accounts": [{ "abhaNumber": "91-…-5832", "abhaAddress": "…@sbx", "gender": "M", "dateOfBirth": "2001-09-01" }]
```

— and the `select-account` that followed returned `"prefill": { "gender": null }`. Everything the
list had said was gone.

**Creating an ABHA produced the same empty form.** `enrolment/aadhaar/verify` returned the whole
record — name, gender, date of birth, phone, address, city, state, pincode, ABHA number — and the
`enrolment/mobile/verify` that followed returned `"prefill": { "gender": null }`. The desk watched a
filled card become *Unnamed · Not specified · DOB unknown · no phone*, above a blank registration
form.

The cause is one line of reasoning that is wrong: **`completeWithProfile` treated the newest
response as *the* profile.** A verification is several calls and each answers a different amount —
Aadhaar returns everything, the mobile OTP after it returns a token, resolving a chosen ABHA
returns a token. Overwriting with the newest answer therefore discarded everything the earlier
steps had established. `abhaNumber: profile.abhaNumber ?? null` blanked the identifier for the same
reason.

And the multi-account branch never stored the account list at all. Since the call that resolves the
chosen ABHA returns almost nothing, that list was the only description of those patients we would
ever have, and it was handed to the browser and forgotten.

**None of this was visible in 306 passing ABDM tests, because the mock was kinder than the
sandbox** — it answered the second call with the full profile again. A mock more generous than the
thing it stands for is not a test double; it is a second implementation, and it hides exactly the
class of bug where a later step returns less.

### Decision

**An absent field means "this call did not say", never "this person has no name".**

- **`completeWithProfile` merges** the incoming profile over what the transaction already holds,
  per field, skipping null, undefined and blank. It stores the merged profile and builds the
  prefill from it. Identifiers fall back to the transaction's own (`profile.abhaNumber ?? txn.abhaNumber ?? null`).
- **The account list is persisted** on the transaction when the operator has to choose, and the
  chosen account's fields — ABHA number, ABHA address, name, gender, date of birth — are merged in
  when they pick. The list's `name` goes in as the first name and is **not split on a space**:
  guessing a surname is how "Patel Jaivik Kamleshkumar" becomes the wrong two fields, and the
  operator correcting one field beats the system inventing two.
- **The panel merges too.** The screen keeps its own copy of the result across steps, and the same
  rule applies there, so a step that says nothing about a field cannot unsay it mid-flow.
- **The mock now answers sparsely, as the sandbox does.** `loginVerifyUser` returns the ABHA number
  and a token; `enrolMobileVerifyOtp` returns the mobile it just proved and a token. Every existing
  ABDM test still passes — which is the evidence the merge does the work the mock used to do for it.

### Consequences

- All four verification identifiers behave the same, because the fix is in the shared completion
  path: **ABHA number, ABHA address, mobile and Aadhaar**. So do both enrolment paths, with or
  without the secondary mobile step.
- **There is no driving-licence flow, and this change did not add one.** `AbhaIdentifierType` is
  `abha_number | abha_address | mobile | aadhaar`, and no provider method accepts a licence. It is
  in `BACKLOG.md` as a gap rather than described as working.
- The existing multi-account test asserted only that the ABHA number survived — the one field that
  did. It now asserts the demographics as well, and a second test asserts that a later step never
  blanks an earlier one. That pair is what would have caught this.
- The wider lesson, worth more than the fix: **a test double must be no kinder than the system it
  stands in for.** Where the sandbox returns less on a later call, the mock returns less too, or
  the suite is testing a system nobody runs.

## ADR-131 - A profile in hand fills the form, and a second OTP needs a reason

**Status:** Accepted · **Date:** 02/09/2026 · **Extends:** ADR-130 (merging a multi-step flow), ADR-084 (ABDM Milestone 1)

### Context

A receptionist created an ABHA on the sandbox and reported three things from one attempt. They
turned out to be three separate defects sitting on top of each other.

`enrolment/aadhaar/verify` returned **200 with a complete profile** — name, gender, date of birth,
phone, full address, ABHA number — and:

1. **The form stayed empty.** The panel read `requiresMobileVerification: true` and `return`ed
   straight into the mobile-OTP step without ever handing the profile up. Every field the desk
   needed was on the screen above an empty form, held back behind another OTP.
2. **The screen said "user not found"** under the Verify button, on a step that had just
   succeeded. The mobile-OTP request ran inside the same `try` as the verification, so ABDM's
   failure on the *second* call was reported with the *first* call's error message.
3. **A second OTP arrived for the number that had just received the first one.** The trace shows
   it plainly: the hint said `******4890` and the returned profile said `9664774890` — the same
   phone, verified twice.

The third is the one worth dwelling on. The gateway adapter read the flag like this:

```ts
mobileMatchesAadhaar: Boolean(pick(profileRaw, 'mobileMatchesAadhaar') ?? undefined)
```

`Boolean(x ?? undefined)` cannot produce `undefined`. ABDM mostly does not send that field, so
"ABDM did not say" became `false` — *the mobile does not match* — and the service's
`Boolean(input.mobile) && result.mobileMatchesAadhaar === false` then demanded a second OTP
whenever a mobile was typed at all. Which is always: the field is on the form.

And the mock hid it, again. `enrolByAadhaar` echoed the requested mobile back as the profile's
mobile, so the two could never differ and the decision was never really exercised.

### Decision

**1. A verified profile fills the form the moment it arrives.** The Aadhaar step calls
`onVerified(res)` before moving to the mobile step. What remains is confirmation of *a phone
number*; it is not permission to know the rest, and holding a complete profile back behind it made
the desk retype what ABDM had already said.

**2. Each request owns its own error.** The mobile-OTP request has its own `try`, and its failure
says what is true — *"The details below are verified and filled in. Confirming the mobile number
failed: …"* — instead of claiming the verification failed. Two calls sharing one catch is how a
success gets reported as a failure.

**3. A second OTP is due only when the numbers actually differ.**

```ts
const requiresMobileVerification =
  Boolean(requestedMobile) && requestedMobile !== mobileOnRecord && result.mobileMatchesAadhaar !== true;
```

The numbers are the decisive test: if the desk asked for the mobile ABDM already holds, there is
nothing left to prove, whatever any flag says. Where they differ, ABDM's explicit `true` still
short-circuits it, and **not knowing means asking** — the safe direction.

**4. `mobileMatchesAadhaar` is tri-state.** `asOptionalBoolean` in the gateway adapter keeps true,
false and *absent* distinct. An adapter that flattens "not stated" into `false` is not parsing a
response, it is inventing one.

**5. The mock returns the Aadhaar-linked mobile**, as the sandbox does, rather than echoing the
request. This is the third mock-fidelity fix in two days (ADR-130 was the other two), and the
pattern is consistent: every one of these defects was invisible because the double was more
convenient than the real thing.

### Consequences

- The common path is now **one OTP**: type the Aadhaar-linked mobile, verify once, form filled.
  A genuinely different mobile still gets its second OTP, which is what that step is for.
- The form fills at the Aadhaar step even when a second OTP follows, so an operator whose second
  OTP never arrives still has a complete, editable form and can register the patient by hand.
- Two new tests: the same-mobile case asserts no second verification is demanded and the profile
  arrives complete on the first step; the existing differs-mobile test now exercises the real
  condition rather than a flag the mock always set.
- **Still not verified against the live sandbox.** These fixes were derived from captured traces
  and proved against the mock; the local backend is `ABDM_PROVIDER=gateway` and a real run needs a
  real Aadhaar and a live OTP. The walkthrough is ABHA-M-02 and ABHA-M-08 in `testcases.md` §44.

## ADR-132 - Staging is shaped like development, at QA scale

**Status:** Accepted · **Date:** 02/09/2026 · **Extends:** ADR-114 (the deterministic staging dataset), ADR-122 (seeding on deploy)

### Context

Staging had **one hospital**. Development has four, and the difference is not decoration:

- **Tenant isolation could not be tested on staging at all.** There was no second hospital whose
  data the first must not be able to reach — the invariant every module is supposed to be tested
  against, on the environment where the manual regression script runs.
- **Neither could module entitlement.** Every module was on, so the screens a hospital *has not
  bought* — the thing ADR-085's whole gating chain exists for — were never absent.
- **Nor a suspended tenant**, which the admin console's status filter needs on the other side.
- And its busiest hospital carried **21 days at 2 visits a day** against development's 42 × 3, so a
  dashboard trend was short, a collections report had little to sum, and the Visits table barely
  reached a second page.

Staging is where the manual regression script is run before a release. A dataset that cannot
exercise isolation, entitlement or a suspended tenant is not a smaller version of production; it is
a different shape from it.

### Decision

**Three hospitals plus the vendor org, mirroring development's coverage under QA names.**

| | Modules | Story | Purpose |
|---|---|---|---|
| `QAHOSP` | all | 42 days × 3 | the busy hospital; 28 charts, second pages, real trends |
| `QACLINIC` | **no pharmacy, no laboratory** | 21 days × 2 | module entitlement, and the tenant isolation is tested against |
| `QACLOSED` | — | none | a suspended hospital that must still render |

**The contract is preserved exactly.** `QA Patient One` and `QA Patient Two` stay first and stay
spelled that way, every `qa.*` account keeps its email and role, and the generator is still seeded
from the tenant code — so the dataset remains deterministic and E2E's assertions still hold. New
patients are inserted *before* the two deliberately activity-free charts, because
`seedClinicalStory` excludes the last two from its rotation and "a patient with no history yet" is
a state every detail page has to render.

**The dataset is now validated by a test.** Three hundred lines of hand-written records acquire the
mistakes hand-written records acquire, and the place they surface is halfway through seeding a
shared environment. `stagingDataset.test.ts` needs no database and checks what actually goes wrong:
a service pointing at a department code that does not exist, a phone number reused so two patients
collide on the key the seeder identifies them by (ADR-122), a specialty outside the catalogue, a
provider linked to a renamed account, and the two E2E fixtures having been reordered.

**Importing a seeder no longer runs it.** All three now guard `main()` behind
`require.main === module`. Reading the dataset from a test used to execute the whole flow as a side
effect of the import — the staging one exited the process with code 2, and the *development* one
would have cheerfully started seeding, because its environment check passes locally.

### Consequences

- **A bigger dataset does not grow an environment that is already seeded.** The clinical story runs
  once per tenant (ADR-122), so on the next staging deploy `QACLINIC` and `QACLOSED` arrive complete
  *with* their histories, and `QAHOSP` gains the twelve new charts and catalogue entries but **not**
  a longer history. Six weeks of traffic for `QAHOSP` needs
  `CONFIRM_SEED_RESET=yes npm run db:seed:staging -w hms_backend -- --reset`, which empties every
  tenant-scoped table — so it is announced first, as ADR-114 requires.
- Staging seeding gets slower: roughly 126 visits for `QAHOSP` plus 42 for `QACLINIC`, against 42
  before. It runs once per deploy and only on a fresh database or after a reset, because everything
  else is create-if-missing.
- Two more sets of credentials to keep out of any quick-login list, for the same reason as the
  existing ones (ADR-080).
- The suspended `QACLOSED` deliberately has no clinical history. A suspended hospital that had
  been running would be a more interesting fixture; it is also a different scenario, and one
  suspended-tenant shape is enough to render the filter.

## ADR-133 - Today's board is seeded every run, because today moves

**Status:** Accepted · **Date:** 02/09/2026 · **Extends:** ADR-114 (the QA dataset), ADR-122 (seeding on deploy), ADR-132 (staging shaped like development)

### Context

The report was "staging has no data" and the obvious reading was volume. It was not. Three screens
were empty, and each for its own reason.

**The OPD queue, "in the queue now" and "seen today" were empty because they are relative to the
day the seeder ran.** `seedTodayQueue` builds its ten live visits at `dayOffset(0, …)` — literally
the seed day — and the clinical story runs once per tenant (ADR-122), so it never rebuilds. Staging
is seeded on deployment and then left alone; from the following morning the board was blank, and
stayed blank until somebody remembered to reset the environment. The same is true of a developer's
machine seeded last week — which is exactly what the reporter's own dashboard showed: *In the queue
now 0 · Seen today 0*, above six weeks of history.

**The Vitals queue was empty in every environment, always.** It only has rows under
`vitalsMode: 'after_checkin'`, and no dataset ever set a workflow configuration, so every hospital
sat on the default `consultation_only` where the screen is correctly, permanently blank.

**The Arrivals board was empty in every environment, always,** and could not be otherwise: an
arrival is created by a patient scanning a QR code, which no seeder performs and no history leaves
behind.

Blank-because-nothing-happened is indistinguishable from blank-because-broken, and three screens
that are always blank teach a tester to stop looking at them.

### Decision

**1. Today's queue is rebuilt on every seed, guarded on today rather than on a marker.**
`seedTodayQueue` is extracted from the story and called on every run. Its only question is *does
this hospital already have a visit dated today?* — if it does, nothing happens; if it does not,
today gets a queue. Re-running is therefore free, a queue somebody is working through is never
disturbed, and a QA environment has a live board **every morning** rather than on the morning it
was deployed.

This is the honest division: the story writes a **past**, and a past is written once. The board is
the **present**, and the present moves.

**2. A dataset can declare how the hospital runs.** `workflow` on the tenant spec, applied once
like the other configuration, typed as the service's own `UpdateWorkflowConfigInput` minus the
version rather than a hand-copied union. Both busy hospitals now run `vitalsMode: 'after_checkin'`,
so the Vitals queue has rows, and both carry consultation and case vocabularies so the fee
schedule's newest dimensions and the check-in form's type fields have something to offer.

**3. Arrivals are seeded with the queue, and refreshed the same way.** Two people who have
announced themselves and not yet been checked in, written directly for the same reason the public
registration queue is: `announceArrival` deliberately requires the hospital's public token and an
HTTP request, and confirming one is a desk action with its own screen — which is the point of
seeding a board that has something on it.

**4. A collision degrades, it does not fail.** A slot already taken by a scattered future
appointment makes that patient a **walk-in**, which the queue is meant to contain anyway; a patient
already in the OPD is skipped; an arrival whose booking fails is announced **without** an
appointment, which is a real state the board must show. Every one of these is counted in the seed
report. The first version of this raised `The provider already has an appointment in this time
slot` and aborted the entire run — a seeder that refuses to seed because a doctor is busy at 09:20
is the wrong trade.

### Consequences

- **This is the part that changes staging on the next deploy**, and it needs no reset: the daily
  refresh is not the clinical story and carries no marker, so the deploy after this one gives
  `QAHOSP` a live queue, a vitals queue and an arrivals board for that day — and so does every
  deploy after it.
- A hospital's history still cannot be lengthened without `--reset` (ADR-132). That remains true
  and is a different problem; what is fixed here is that the *present* no longer rots.
- Verified on a database seeded days earlier: the OPD queue went from 0 to **10 rows across every
  workflow state**, the Vitals queue to **3 waiting**, Arrivals to **2 ready to check in** — and a
  second run the same day reported `todayQueueAlreadyPresent` for all three hospitals and created
  nothing.
- Two stale references fixed while here: the Arrivals empty state and the check-in poster both
  pointed at *Hospital configuration → Self check-in*, a tab that stopped existing when the three
  QR surfaces were consolidated (ADR-124).
- Setting `vitalsMode: 'after_checkin'` changes what the seeded hospitals *do*, not what the
  product does: it is configuration, a hospital can change it on its own screen, and the default
  for everyone else is untouched.

## ADR-134 - A signed consultation is corrected by amendment, never by overwrite

**Status:** Accepted · **Date:** 03/09/2026 · **Extends:** ADR-029 (reusable UI), ADR-039 (row actions), ADR-060 (a record displayed wrongly must be correctable), ADR-128 (page actions)

### Context

The consultation screen refused every edit after signing, and the refusal was the whole answer:
`A signed encounter cannot be edited`. That is right about the record and wrong about the work.
Real corrections arrive after the signature — a weight entered as 7.2 kg instead of 72, a drug the
doctor meant to add, a laterality recorded on the wrong side, a diagnosis that reads as the
opposite of what was said. A doctor who cannot fix any of them either leaves a wrong record
standing or asks somebody to edit the database.

The alternative nobody should build is the one that looks easiest: let the edit through. That
silently destroys what was actually signed, which is the one thing a clinical record exists to
hold. ADR-060 already says a record that can be displayed incorrectly must have a permitted, safe
way to be corrected — "safe" is the part that had no implementation here.

Three smaller problems sat in the same screen and are fixed in the same change, because they are
all the consultation being treated as a form rather than as a record:

- **The vitals configuration was never fetched.** `workflow` was declared, read in three places,
  and never assigned — so every hospital saw *This hospital has not configured any vitals to
  record*, whatever it had configured. The doctor holds `platform.workflow.view` precisely so this
  screen can read it (ADR-129); nothing was reading it.
- **Save scrolled out of reach.** The primary action is in the `PageHeader` (ADR-128), which is
  correct, but this page's work runs well below the fold: a doctor filling the fourth prescription
  is several screens away from the button, with no statement anywhere of whether what they are
  looking at has been saved.
- **Signing went through `window.confirm`.** The browser's own dialog cannot be themed, ignores
  the design tokens, announces `localhost:3001 says`, and was the last one left in the product.

### Decision

**1. Reopening a signed note is its own act, with its own record.** `POST /encounters/:id/amend`
takes a **required reason** and, *before anything becomes editable*, copies the whole signed note
into `encounter_amendments.snapshot`. The encounter then moves to a third status, `amending`,
which edits exactly like a draft. `POST /encounters/:id/sign` re-signs it, closes the amendment,
and stores the **fields that actually differ** between the snapshot and the note as re-signed.

The record afterwards names who, when, why, and what: an append-only row per amendment, never
deleted (invariant #6), and the note as signed still in it.

**2. It is a separate permission.** `emr.encounter.amend`, not `emr.encounter.write`. Writing a
note and reopening a closed one are different acts, so a hospital can let every clinician write
freely and still choose who may reopen. Granted to `doctor` (the service still holds them to an
encounter that is theirs) and reaching `org_admin` by derivation (ADR-125). Re-signing stays on
`emr.encounter.write`, because the signature itself has not changed.

**3. An open amendment belongs to whoever opened it.** Not to whoever holds the permission: the
reason on the record is one person's, and letting a second person edit through it would attribute
their change to somebody else's stated reason. Editing is refused for anyone but the opener —
including an administrator, who can open their own amendment instead.

**4. Discarding is allowed only while nothing has changed.** Reopening by mistake must be cheap to
undo, so cancelling is possible while the encounter's version is still the one the amendment
recorded. Once a save has landed, the way out is to re-sign — quietly "cancelling" would either
throw away a real correction or leave the record disagreeing with the trail. The cancelled row is
kept, because that somebody reopened a signed record is itself worth knowing.

**5. `amending` means "has been signed", everywhere downstream.** The patient's history and the
pharmacy's pending queue both filtered on `status = 'signed'`, which would have dropped a note
from the chart and its prescriptions from the counter for the length of a correction. Both now ask
whether it *has been* signed. `encounter.signed` is published once, by the first signature —
billing, lab and ABDM consume a consultation being finished, and an amendment is not a second one.
It has its own audited action instead (`encounter.amend_open` / `amend_sign` / `amend_cancel`).

**6. The screen states what it is.** A reopened note carries a banner naming the reason and its
author; a signed one carries the amendment trail; a user without the permission is told the
permission's name and key rather than being shown a dead button (ADR-126). The `PageHeader` gains
`sticky`, so Save and the saved/unsaved state stay in view for the whole length of the page.

**7. `Combobox` joins the kit, beside `Select`.** `Select` answers *choose one of these*;
`Combobox` answers *choose one of these, or write your own*, which is the shape every clinical
master picker actually has — an unstocked medicine and a test the master has never heard of both
still have to be orderable, and the `drugId` / `testId` link is what the pharmacy and the lab use
when it exists. It replaces `<input list>` + `<datalist>`, which could not show a price or a stock
level, could not be styled, and gave no way to tell a picked option from a coincidentally
identical string. Both share one panel implementation (`useAnchoredPanel`) and one set of styles.

### Consequences

- A signed consultation can be corrected by someone permitted to, and the original survives every
  correction. What the chart shows afterwards is both: the current note, and the trail of who
  changed what and why.
- **A key-order bug was caught by the test that asserts "changed nothing".** One side of the
  comparison had been through `jsonb`, which stores object keys sorted, so a raw
  `JSON.stringify` comparison reported every collection as changed on every amendment. The
  comparison is now canonical on both sides. Array order is still significant — a reordered
  prescription list is a real difference.
- Four master-data pickers that were native `<select>` — service on an invoice, drug at the
  pharmacy counter, supplier on a stock receipt, test on a lab result — are now the shared
  searchable `Select`. They are bind-to-a-record answers, so they are `Select` and not
  `Combobox`; free text there would be a worse answer, not a kinder one.
- `Card` gains a `footer`. A repeatable form's *Add another* belongs at the end of the list it
  extends, not in the header above a row the user has not finished — this does not contradict
  ADR-128, which governs the **page's** primary action, and the page's is still top-right.
- `Alert` gains the `warning` tone `Badge` already had. An alert that could not say "keep this in
  mind while you work" was a gap in the kit, not a decision.
- Removing an unsaved row still removes it. Confirmation is for rows the server already holds —
  a dialog on the way to fixing a line typed ten seconds ago is noise, not safety.
- Not done here: an in-app navigation guard. `beforeunload` covers reload and tab close; leaving
  by a link with unsaved changes is caught by the sticky header saying so, not by a prompt.

## ADR-135 - The last native dropdown, and the vocabularies three screens were each keeping

**Status:** Accepted · **Date:** 03/09/2026 · **Extends:** ADR-029 (build once), ADR-112 (`Select` is the one dropdown), ADR-134 (`Combobox`)

### Context

ADR-112 made `Select` the one dropdown, and its own docstring says *reach for it before writing
another `<select className="hms-input">`*. Thirty-seven of those were still in the tree. ADR-134
converted the four that were master-data pickers; this finishes the job, because a rule that holds
on four screens and not on the other twenty is not a rule, it is a preference somebody applied
once.

The count matters less than what the leftovers were doing. A native `<select>` renders in the
browser's chrome rather than the design tokens, so it ignores Light/Dark and the tenant's accent;
on a phone it hands the user an OS wheel; and it cannot show a second line, so a doctor's
registration number, a permission's plain-English meaning and a user's email were all being
crammed into one truncated line with a `·` between them. Two were worse than cosmetic:

- **The permission-override picker** listed around two hundred raw dot-hierarchy keys with no
  search. An administrator looking for "who can take money" does not know it is
  `billing.payment.collect`.
- **The ABHA suggested-address field's own hint said "Pick one, or type your own"** — above a
  native `<select>`, which cannot be typed into. The copy had been describing a control nobody
  had built.

Three vocabularies were also being kept per screen. Gender was written out four times, in four
orders, with four different words for the empty answer; blood group twice; record status once in
raw lower-case column values (*active* / *archived*) shown to a person.

### Decision

**1. Every remaining native `<select>` in the Portal, admin console and patient portal becomes
`Select`** — thirty-six of the thirty-seven. Small enumerations included: the point of having one
control is that a three-option status filter and a two-hundred-option permission picker look and
behave the same, and `Select`'s own `searchable="auto"` already decides where a search box earns
its place.

**2. Two are deliberately not `Select`.**

- The **ABHA suggested-address** field becomes a `Combobox` (ADR-134), which is what its hint had
  been promising all along: ABDM's suggestions, with the patient's own address still typeable.
- The **marketing contact form** keeps its native `<select>`. That form is uncontrolled, submits
  natively, and leans on the browser's own `required` to refuse an empty role; `Select` is
  controlled and its hidden input carries no `required`, so the swap would quietly remove a
  validation. Marketing is also its own token scope (`--mk-*`, ADR-040) with its own input
  styling. The reasoning is written above the element so it is not "tidied up" later.
  **Consistency is a reason to adopt the shared control, never a reason to lose form validation.**

**3. Shared vocabularies move to `@hms/utils`** — `GENDER_OPTIONS`, `BLOOD_GROUP_OPTIONS`,
`RECORD_STATUS_OPTIONS`. In `utils` rather than `ui` because `ui` depends on `utils` and the
reverse would invert the graph, and because a blood group is not a UI concern in any case. The
shape is `{ value, label }` — structurally a `SelectOption` without `utils` having to know that
type exists. A hospital's **own** words — consultation types, case types, departments — stay out:
those come from that tenant's configuration, not from a constant.

**4. `DataTablePagination` converts too, and it is the one that mattered most.** The design system
was the last place still writing `<select className="hms-input hms-input--sm">`, on every table in
the product. A new `.hms-select__trigger--sm` lands it on the same 30px as the page buttons beside
it.

### Consequences

- Every dropdown in every application now shows a second line where there is one, searches past
  seven options, follows Light/Dark and the tenant's accent, and opens the same panel. The
  permission picker is grouped by module and searchable on the key *and* on what the key means.
- **A flourish was reverted during verification.** `BLOOD_GROUP_OPTIONS` briefly rendered a
  typographic minus (`AB−`) against the stored `AB-`. It reads better in isolation and was wrong:
  every other surface renders the stored value, so the picker would have spelled it differently
  from the chart beside it. Label and value are now the same string.
- Verified by watching the request rather than by reading the code: registering a patient sent
  `{"bloodGroup":"AB-","gender":"female"}` — stored codes, not display labels — and reopening the
  record mapped them back to *AB-* and *Female*.
- `hms-visually-hidden` markup for required fields disappears from its call sites: `Select`'s
  `required` prop does it once.
- **The sweep found a latent bug in `Select` itself, and it took a real caller to expose it.**
  Group runs were keyed by name. A caller whose options are not sorted by group repeats a name in
  two non-adjacent runs — the permission catalog's own order visits `platform` and `opd` twice —
  and React then had two siblings with one key. The failure was not a console warning anyone would
  notice: the open list rendered stale, duplicated options and **stopped responding to the search
  box**. Observed in the running app as 47 options for the query "payment", including
  `platform.tenants.manage`.

  Fixed by keying on position in both `Select` and `Combobox`, with a regression test in each that
  was confirmed to fail against the old key. The permission picker also sorts by module at the call
  site, because two "platform" headings in one list is still the wrong answer even once it renders
  correctly. `Select`'s docstring said the caller controls grouping by ordering the options; that
  was a documented assumption doing the work of a guarantee, and a duplicate React key is a
  correctness bug whatever the caller does.
- Not changed: the `<select>` inside `marketing/components/site/ContactForm.tsx`, per **2** above.
