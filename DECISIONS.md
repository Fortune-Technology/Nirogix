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

---
*Append new ADRs below with the next number. Never edit an accepted ADR — supersede it.*
