# Development Plan

**Document:** `development-plan.md`
**Version:** 1.0
**Last Updated:** August 2026
**Prepared for:** Takoriya Technology LLP
**Source of Truth:** This plan is the *execution layer* on top of the existing documentation set. It does not redefine product scope, architecture, or sequencing — it makes them buildable. Where it adds detail, that detail is derived from and consistent with:
> **Project Requirements Document** (functional scope) · **Architecture Document** (technical design) · **Development Phases & Roadmap** (build sequencing) · **Rules & Engineering Standards** (engineering rules) · **Project Memory / Knowledge Base** (decisions & invariants) · **Default-DESIGN-intercom.md** (marketing-site visual system reference).

---

## How to Read This Document

This is the **primary engineering execution roadmap** for the Nirogix platform. It exists to answer one question the four upstream documents deliberately leave open: *"Given the architecture, the rules, and the phase sequencing, exactly how does an engineering team execute this, week by week, without re-deriving decisions already made?"*

**Precedence.** If this document ever appears to contradict the Architecture Document, Project Requirements Document, Rules & Engineering Standards, or the Development Phases & Roadmap, **those documents win** and this one is defective and must be corrected. This plan is intentionally *additive* — it never overrides an upstream decision.

**Reading order** (per Rules & Engineering Standards → Documentation System):
`root CLAUDE.md → this Development Plan → the relevant module's KNOWLEDGE.md → DONE.md → source code`.

**Rolling-wave alignment.** The Development Phases & Roadmap is explicit that **Phase 0 and Phase 1 (MVP 0 + MVP 1) are specified in full**, while **Phases 2–4 are directional by design** — full backend/frontend/testing detail for those is authored *just before* each phase begins, once real team velocity and customer priorities are known. This plan honors that: Stages 0–2 below are execution-grade; Stages 4–6 are framework-grade (workstream shape, entry/exit gates, dependencies) and are expanded in place when the phase is picked up. This is a rolling-wave plan, not a gap.

**Regulatory discipline.** Every compliance item in this plan inherits the three-category discipline from the Architecture Document (Confirmed requirement / Design decision / Pending verification). This plan **never** promotes a "Pending verification" row from the Compliance Source Register into a stated legal mandate. India-resident storage, CERT-In timelines, ABDM localization, etc. remain design decisions or pending-verification items exactly as recorded upstream.

---

## Contents

- **Part A — Operating Model**
  - [1. Delivery Philosophy](#1-delivery-philosophy)
  - [2. Team Topology & Roles](#2-team-topology--roles)
  - [3. Cadence, Ceremonies & Estimation](#3-cadence-ceremonies--estimation)
  - [4. The Milestone Loop & Definition of Done](#4-the-milestone-loop--definition-of-done)
  - [5. Branching, Git & Change Management](#5-branching-git--change-management)
- **Part B — Foundations to Build Before Feature Work**
  - [6. Repository & Monorepo Implementation](#6-repository--monorepo-implementation)
  - [7. Environments & Infrastructure](#7-environments--infrastructure)
  - [8. Database & Migration Strategy](#8-database--migration-strategy)
  - [9. Backend Application Skeleton](#9-backend-application-skeleton)
  - [10. API Architecture Implementation](#10-api-architecture-implementation)
  - [11. Authentication Implementation](#11-authentication-implementation)
  - [12. Authorization Implementation (Entitlements + RBAC + Overrides)](#12-authorization-implementation-entitlements--rbac--overrides)
  - [13. Platform Core Services Implementation](#13-platform-core-services-implementation)
  - [14. Frontend Architecture Implementation](#14-frontend-architecture-implementation)
  - [15. Marketing Site Implementation](#15-marketing-site-implementation)
- **Part C — Cross-Cutting Disciplines**
  - [16. Security & Compliance Implementation](#16-security--compliance-implementation)
  - [17. Testing Strategy](#17-testing-strategy)
  - [18. DevOps, CI/CD & Observability](#18-devops-cicd--observability)
  - [19. Documentation & Knowledge System](#19-documentation--knowledge-system)
- **Part D — The Delivery Roadmap**
  - [20. Stage 0 — Platform Foundation](#20-stage-0--platform-foundation)
  - [20A. Platform Administration Surface — operator onboarding, user/permission admin, branding](#20a-platform-administration-surface--operator-onboarding-userpermission-admin-branding)
  - [20B. Platform & Organization Dashboards](#20b-platform--organization-dashboards)
  - [21. Stage 1 — MVP 0: Clinic Pilot](#21-stage-1--mvp-0-clinic-pilot)
  - [22. Stage 2 — MVP 1: Clinic Expansion](#22-stage-2--mvp-1-clinic-expansion)
  - [23. Stage 3 — Production-Readiness Hardening](#23-stage-3--production-readiness-hardening)
  - [24. Stage 4 — Phase 2: Small Hospital / Nursing Home](#24-stage-4--phase-2-small-hospital--nursing-home)
  - [25. Stage 5 — Phase 3: Compliance & Interoperability](#25-stage-5--phase-3-compliance--interoperability)
  - [26. Stage 6 — Phase 4: Hospital-Grade / Enterprise Expansion](#26-stage-6--phase-4-hospital-grade--enterprise-expansion)
  - [27. Enterprise-Hardening Track](#27-enterprise-hardening-track)
- **Part E — Control & Reference**
  - [28. MVP vs Production-Ready vs Enterprise-Hardening](#28-mvp-vs-production-ready-vs-enterprise-hardening)
  - [29. Technical Implementation Priorities & Recommended Order](#29-technical-implementation-priorities--recommended-order)
  - [30. Risk Register & Open Decisions](#30-risk-register--open-decisions)
  - [31. Enterprise Readiness Checklist](#31-enterprise-readiness-checklist)

---

# Part A — Operating Model

## 1. Delivery Philosophy

Five principles govern *how* this platform is built. Each traces back to an upstream decision.

1. **Vertical-slice delivery, module by module** (ADR-009). Every milestone ships backend + frontend + integration + tests + docs + staging demo for one capability — never a horizontal "all backends first, all frontends later" layer. A milestone that is not demoable end-to-end on staging by a non-developer is not done.
2. **Build the platform core once** (Architecture Principle). Phase 0 delivers authentication, tenancy, RBAC/entitlements, notifications, file storage, events/jobs, audit, and the shared UI system. No business module re-implements any of these. This is the single highest-leverage investment in the plan and everything downstream depends on it.
3. **MVP-first, revenue-first sequencing.** The target segment for MVP is single/multi-doctor OPD clinics and small nursing homes without inpatient beds (per Phases → MVP Target Segment). IPD, OT, Blood Bank and other hospital-grade modules are sequenced later, not because they are unimportant, but because the fastest path to a sellable product does not require them.
4. **Modular monolith, extraction-ready** (ADR-001). One deployable application; modules communicate through domain events and defined service interfaces, never direct imports of another module's internals — so Laboratory or the Notification Engine can be extracted into a service later without a rewrite.
5. **Security, tenancy, and authorization are invariants, not features.** They are tested in both directions on *every* milestone, not audited once at the end. Tenant A must never see Tenant B's data; frontend visibility is never treated as security; explicit DENY always beats GRANT.

## 2. Team Topology & Roles

The plan is written to be executable by a **small core team (4–7 engineers)** and scales up by adding module squads in later phases. Roles are responsibilities, not necessarily distinct headcount at MVP.

| Role | Responsibility | Heaviest during |
|---|---|---|
| Tech Lead / Architect | Guards architecture invariants, owns DECISIONS.md, reviews cross-cutting changes | All phases |
| Platform Engineer(s) | Phase 0 core services, auth/authz, tenancy, events/jobs, provider abstractions | Stage 0, Stage 3 |
| Backend Engineer(s) | Module backends — schema, services, APIs | Stages 1–6 |
| Frontend Engineer(s) | Portal shell, design system, module UIs | Stages 0–6 |
| Full-stack / Integration | Wires frontend to real APIs, owns integration + staging demos | Stages 1–6 |
| QA / SDET | Test strategy, tenant-isolation + authz matrices, regression suite, perf tests | All phases |
| DevOps / SRE | CI/CD, E2E Networks infra, observability, backup/DR drills | Stage 0, Stage 3, Stage 27 |
| Compliance Owner *(to assign)* | Owns the Regulatory Verification & Compliance Source Register | Stage 3 onward |

> **Open item carried from memory.md:** no compliance owner is yet assigned, and every row of the Compliance Source Register is Pending Verification. Assigning this owner is a Stage 3 entry gate (see §30).

**Module squad pattern (Phase 2+).** As modules parallelize, a squad = 1 backend + 1 frontend + shared QA, owning a module end-to-end through the six-step loop, against the same Platform Core. Squads never fork Platform Core; they extend it via the documented extension points (new invoice line-item types, new specialty form templates, new event subscribers).

## 3. Cadence, Ceremonies & Estimation

- **Iteration length:** 1-week or 2-week sprints (team's choice; keep it constant). Each milestone in Phases (e.g. 1.1, 1.2) maps to one or more sprints.
- **Estimation:** reuse the existing `S / M / L` sizing already attached to each milestone in the Development Phases & Roadmap — do not invent a parallel points scheme. `S` ≈ a few days; `M` ≈ ~1 sprint; `L` ≈ ~2 sprints. Recalibrate these against real velocity after MVP 0, per the rolling-wave principle.
- **Ceremonies:** sprint planning (pull the next milestone from the Dependency Map), daily async standup, mid-sprint architecture check for anything touching Platform Core, sprint review = the *staging demo* (this is also the milestone's Definition-of-Done gate, not a separate event), retro.
- **Rolling-wave replanning:** at the end of MVP 0 and again at the end of MVP 1, re-expand the next stage's detail with actual velocity before committing dates.

## 4. The Milestone Loop & Definition of Done

Every milestone follows the **six-step loop** defined in the Development Phases & Roadmap, and is complete only when all six are done:

1. **Backend** — schema, migrations, business logic, services, API endpoints
2. **Frontend** — UI/UX for every role that touches the milestone
3. **Integration** — frontend wired to real APIs with loading/error/empty states, validation, and permission-based rendering
4. **Testing** — automated + manual verification before moving on
5. **Documentation** — KNOWLEDGE.md updated, DONE.md appended for every app/package touched
6. **Staging Verification** — deployed to staging, demoable end-to-end by a non-developer

**Global Definition of Done (applies to every milestone, on top of its own test bullets).** Consolidated verbatim in intent from Phases → Definition of Done and Rules & Engineering Standards:

- Deployed to staging and demoable end-to-end by a non-developer.
- Migrations are additive and reversible; no destructive schema change without an explicit data-migration plan.
- Full automated regression suite passes — not only this milestone's new tests.
- **Tenant isolation** proven: Tenant A can never access Tenant B's records (automated test).
- **Module entitlement, both directions:** entitled tenant's access works; non-entitled tenant gets a proper 403/404, not partial access, and the UI entry is hidden.
- **RBAC, both directions:** authorized role works; unauthorized role denied.
- **User override, both directions:** explicit GRANT works; explicit DENY denied even against an otherwise-permitting role.
- **Temporary permission across the full window:** denied before `valid_from`; allowed during; denied after `valid_until`.
- **Direct-URL access** to an unauthorized route is independently rejected server-side, never merely hidden client-side.
- Mutating actions, permission grants/denies, and entitlement changes all produce an audit-log entry.
- Verified in both **Light and Dark** themes and under a **non-default tenant's branding**.
- KNOWLEDGE.md updated and DONE.md appended for every app/package touched.
- Every new/changed backend endpoint has synchronized OpenAPI/Swagger documentation; `npm run openapi:validate` passes (no undocumented `/api/v1` route, valid spec).
- **Frontend work follows the Frontend Delivery Workflow** (Rules → Frontend Delivery Workflow): Requirements → UX → SEO (where applicable) → Accessibility → Next.js optimization → API feedback → Performance → Code cleanup.
- **API feedback:** every state-changing or failing call surfaces through the shared `@hms/ui` toast — React Toastify behind a fixed adapter API (ADR-057) — via the shared API client, showing the backend's message where it provides one; no silent failure, no per-page toast code, no second toast library, no raw technical error or PHI in the UI (ADR-026).
- **SEO boundary:** new public marketing routes ship unique metadata + canonical + sitemap entry; new Portal routes are `noindex, nofollow` and leak no patient/tenant/staff data to any crawler-visible surface (ADR-027).
- **Performance:** images/fonts/scripts/metadata use the Next.js primitives; heavy non-critical UI is lazy-loaded; the route meets the Core Web Vitals budgets (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1).
- **Cleanup pass done:** nothing the change made unnecessary is left behind — orphaned files, unused imports/exports/assets/CSS/tokens, superseded implementations, empty directories, and any dependency nothing imports (removed from `package.json` in the same commit). Verified by grep before deletion and a green typecheck + build after.
- **Automated tests written and passing** at the level the change deserves, and **`testcases.md` updated** with the feature's manual cases (added / changed / removed, plus regression cases where existing behaviour could be affected).
- No open **P0/P1** defects.

**Definition of Ready (entry gate, added by this plan).** A milestone is ready to start only when: its upstream dependencies (per the Dependency Map) are `Done`; the permission keys it introduces are named; its acceptance criteria and test matrix are written; and any external prerequisite (e.g. DLT template, SES production access) is either satisfied or explicitly scheduled ahead of the dependent step.

## 5. Branching, Git & Change Management

Per Rules → Git Rules:

- **One feature branch per module/milestone**, merged into a `staging` branch that auto-deploys to the staging environment.
- **CI runs lint + tests + build on every push;** a push that fails CI does not merge.
- **Commits and PRs reference the milestone/module** they implement, so DONE.md entries stay traceable to source control.
- **Branch protection** on `main` and `staging`: required green CI, required review (≥1, and ≥2 for changes touching Platform Core, auth, tenancy, or migrations), no direct pushes.
- **Migrations** are reviewed as first-class changes: additive/reversible only; a destructive change requires an approved data-migration plan and an ADR.
- **Conventional-commit style** is recommended so DONE.md and changelogs stay mechanical.

---

# Part B — Foundations to Build Before Feature Work

## 6. Repository & Monorepo Implementation

### 6.1 Layout — decided and scaffolded

Per **ADR-013** (kept folder names) and **ADR-014** (npm over pnpm), the repository is an **npm workspaces + Turborepo** monorepo that **keeps the existing app folder names** (`hms_backend`, `hms_frontend`, `marketing`) rather than renaming them to `apps/*`. This leaves the folders already committed to GitHub untouched while still delivering the shared-package benefits the design depends on (`packages/ui`, `packages/permissions` shared front-end/back-end). The Architecture Document's Monorepo Structure section is aligned to these same names. The whole monorepo is driven from the root: `npm run install:all` and `npm run dev`.

```
hms_backend            Node.js/Express API (the backend)
hms_frontend           Next.js Nirogix Portal — all role dashboards, role-based route guards
marketing              Next.js public marketing/SEO site
packages/types         shared TS types & API contracts (backend + portal)
packages/ui            shared design-system components + tokens + Standard DataTable (portal + marketing)
packages/config        shared TypeScript/lint/build config
packages/utils         shared framework-agnostic utilities
packages/permissions   dot-hierarchy permission keys shared front-end/back-end
(room reserved for a future root-level mobile/ app — React Native/Expo, later)
```

**Now in place** (scaffolded alongside this plan):

- Root `package.json` (private npm-workspaces root — `"workspaces": ["hms_backend","hms_frontend","marketing","packages/*"]`, `packageManager: npm@10.9.2`, turbo-driven `install:all/dev/build/lint/test/typecheck/format` scripts) and `turbo.json` (task pipeline with caching). No `pnpm-workspace.yaml` — npm reads the `workspaces` field.
- Root `.gitignore` covering `node_modules/`, build outputs, `.turbo/`, and env files.
- All five `packages/*` scaffolded — `@hms/types`, `@hms/ui`, `@hms/config` (exports `tsconfig.base.json`), `@hms/utils`, `@hms/permissions` — each with `package.json`, a `tsconfig.json` extending the shared base, and a stub `src/index.ts` documenting what lives there.
- `hms_backend/package.json` normalized as a workspace member (private; placeholder `dev/build/lint/typecheck/test` scripts that no longer fail the turbo pipeline).

### 6.2 Task 0.0 — remaining consolidation steps (first thing done in Stage 0)

The structure exists; the following execution steps remain and run **before** any feature code:

1. **Done & verified.** `npm run install:all` (= `npm install`) at the root materialized the workspace — one root `package-lock.json`, hoisted `node_modules`, 516 packages. Stale per-app npm lockfiles removed; `next@16.3.0` / `react@19.2.8` pins kept. `npm run dev` starts backend (4000) + portal (3001) + marketing (3000) together (verified 200/200/200).
2. Wire the first real cross-package import — a `@hms/types` type consumed by both `hms_backend` and `hms_frontend` — to prove workspace resolution end-to-end.
3. Enable Turborepo **affected-package detection** for selective CI/CD deploys (used in §18).
4. Add `husky` + `lint-staged` + `commitlint` for pre-commit hygiene; centralize ESLint/Prettier config in `@hms/config`.
5. Add TypeScript project references across packages for incremental builds.

**Deliverable / acceptance:** `npm run install:all` at root resolves all workspaces; `npm run build|lint|test|typecheck` (turbo) runs green across every app/package; a shared type exported from `packages/types` is consumed by both `hms_backend` and `hms_frontend`; a shared component from `packages/ui` renders in both `hms_frontend` and `marketing`.

## 7. Environments & Infrastructure

Per Architecture → Infrastructure & Hosting and Phases → Deployment/Ops.

| Environment | Purpose | Topology |
|---|---|---|
| **Local** | Dev | Dockerized Postgres + Redis; all app processes via `npm run dev` (turbo); seeded demo tenants |
| **CI** | Verify every push | GitHub Actions (self-hosted runner, per StoreVeu pattern); ephemeral Postgres/Redis services |
| **Staging** | Milestone demos + tenant-isolation tests | E2E VM, Nginx + PM2 (dedicated service user), auto-deploy on merge to `staging` |
| **Production** | Paying customers | E2E VM, managed PostgreSQL (E2E DBaaS) as a **separate service from day one**, Redis on app VM (MVP), Cloudflare in front |

**Infrastructure standards (day-one, not later hardening):**

- **Hosting:** E2E Networks (MeitY-empanelled, India data-sovereignty) — ADR-005.
- **Database:** managed PostgreSQL (E2E DBaaS), provisioned separately from the app server; **automated daily backups + point-in-time recovery**, with **restore drilled — not just configured — before the first paying customer**.
- **Redis:** co-located on the app VM for MVP (permission-set cache + BullMQ queue); migrate to managed instance when cache size or queue volume justifies it.
- **Object storage:** E2E Object Storage (India-resident, S3-compatible) for PHI-bearing files; if Cloudflare R2 is used for any bucket, pin jurisdiction to India and keep the metadata/log pipeline in-region.
- **Edge:** Cloudflare in front of all public traffic — CDN, WAF, DDoS, DNS — never the store of record.
- **Subdomain-per-app:** marketing on root domain, Portal on a `portal` subdomain, API on an `api` subdomain.
- **Secrets:** never in the repo; environment-injected on the VM and in CI secrets; `.env.example` documents required keys per app.
- **Not coupled to PM2/single-VM:** process management and deploy target are operational choices; migrating to Docker + load balancer + horizontal scaling later is an infra change, not an app rewrite (see Enterprise-Hardening Track).

**IaC posture:** capture VM provisioning, Nginx config, PM2 ecosystem, and the deploy pipeline as versioned config from the start (even if lightweight), so environments are reproducible and the later container migration has a documented baseline.

## 8. Database & Migration Strategy

Per Rules → Database/Tenancy Rules and Architecture → Multi-Tenancy.

- **System of record:** PostgreSQL. **Tenant isolation:** shared database, shared schema, a `tenant_id` column on **every** tenant-scoped table, enforced by **PostgreSQL Row-Level Security (RLS)** policies at the DB layer. No new table ships without both.
- **Tenant context** is set server-side per request from the authenticated session (a request-scoped DB client sets the RLS context); `tenant_id` is **never** trusted from client input.
- **Branch scoping** uses a single nullable `branch_id` (`NULL` = organization-wide). No parallel branch-scoping mechanism.
- **Migrations** are additive and reversible; no destructive change without an explicit, approved data-migration plan. Migrations are versioned, run in CI against an ephemeral DB, and applied to staging automatically before production.
- **Optimistic locking / row versioning** on any record multiple users may edit concurrently — clinical notes, prescriptions, patient info, inventory counts, billing line items, admission records. A stale write returns a clear conflict, never a silent overwrite.
- **No physical deletion** of entitlement, permission-override, or audit records — state changes are data, not row removal. Healthcare records follow the lifecycle state machine (`Active → Archived → Deactivated → Retention-Locked → Anonymized → Deleted`); hard deletion is only reachable after retention obligations clear, and is itself audited.
- **No EAV** for core clinical entities (Patient, Provider, Encounter, Diagnosis, Prescription, Invoice) — they stay strongly typed. Only genuinely specialty-varying fields use the configurable `specialty_form_templates` mechanism.

> **ADR-012 — ORM/query-builder choice (Prisma vs. Drizzle) — DECISION REQUIRED, currently open in memory.md.**
> This is the one genuinely unsettled foundational decision and it gates §8/§9. It matters specifically because **RLS policies must be authored and maintained alongside the schema.**
> - *Drizzle:* SQL-first, thin, makes hand-written RLS policies and raw SQL natural; less magic around the request-scoped client.
> - *Prisma:* richer DX and migrations, but RLS + per-request tenant context needs deliberate patterns (e.g. a middleware/extension setting the session GUC).
> **Recommendation:** prototype the tenant-context + RLS pattern in both during Task 0.0's tail, pick one, and record ADR-012 **before** the first migration is written. Whichever is chosen, the RLS-context-per-request pattern is written once in Platform Core and reused everywhere.

## 9. Backend Application Skeleton

Per Architecture → API Architecture & Reliability.

- **Modular monolith.** Each business module owns its own **routes → controller → service → repository** layers inside `hms_backend`. Module boundaries are drawn for clean later extraction (Laboratory and the Notification Engine are the most likely first services).
- **Module anatomy (canonical, reused by every module):**
  ```
  hms_backend/src/modules/<module>/
    <module>.routes.ts        # gated by requireModule() then requirePermission()
    <module>.controller.ts    # HTTP shape only, no business logic
    <module>.service.ts       # business logic, publishes domain events
    <module>.repository.ts     # data access, RLS-scoped client
    <module>.schema.ts         # Zod request/response validation
    <module>.events.ts         # domain events published/subscribed
    <module>.permissions.ts    # permission keys this module declares
  ```
- **Cross-module interaction** goes through **Domain Events** or a defined service interface — never a direct import of another module's internal code.
- **Async workflows** (notifications, ABDM sync, report generation, insurance claim batches) run on the Redis-backed **BullMQ** queue, never inline in request handlers.
- **Idempotency** is mandatory on payments, invoices, appointment bookings, notifications, and external integration calls — via an idempotency key checked before the operation executes.

## 10. API Architecture Implementation

Per Rules → API Rules.

- All endpoints under **`/api/v1`**; breaking changes require a new version, never an in-place change.
- **Zod (or equivalent) validation** on every request before business logic.
- **One consistent error-response shape** across every module (documented once, reused).
- **Idempotency keys** on all duplication-sensitive operations (see §9).
- **OpenAPI/Swagger generated from route definitions** (Zod + zod-to-openapi), never hand-maintained; served at `/api/v1/openapi.json` with Swagger UI at `/api/v1/docs`, and environment-aware servers from config (Local / Staging / Production). **Mandatory & enforced** — documentation ships in the same change as the endpoint, and `npm run openapi:validate` fails CI on any undocumented `/api/v1` route or invalid spec (see Rules → API Documentation Rules, and §17/§18).
- **Pagination helper** shared across modules; server-side pagination/sorting/filtering is the default for large datasets and pairs with the shared DataTable's server-side mode.
- **Concurrency:** optimistic-locking conflicts surface as a documented `409`-style conflict response.

## 11. Authentication Implementation

Per Architecture → Authentication and Rules → Security Rules.

- **Session model:** short-lived JWT access token (in-memory on the client) + `httpOnly`, `secure` refresh-token cookie scoped to the Portal's own domain. No shared session state with the Marketing Site.
- **Endpoints:** login, logout/session revocation, refresh, forgot/reset password. Password hashing with a modern algorithm (argon2/bcrypt).
- **MFA and SSO (SAML / OAuth2 / OIDC) hooks exist in the auth layer from Phase 0**, even if not enforced for every tenant at MVP. The MFA prompt screen exists; enforcement can be off for MVP.
- **Marketing → Portal flow:** the marketing site carries no auth logic — a single Login action links to the Portal's `/login`, with an optional redirect parameter for deep-linking.
- **Post-login routing** is driven by the authenticated user's role, served from the single Portal app (not separate apps per role).
- **Session controls:** password policy, account lockout, device/session management — scaffolded in Phase 0, enforced/hardened in Stage 3.

## 12. Authorization Implementation (Entitlements + RBAC + Overrides)

This is the platform's spine. Three **independent** concepts, each enforced separately (Architecture → Entitlements/RBAC; Memory → Invariants):

1. **Module Entitlement** — does the *organization* have this module?
2. **Role Permissions** — what can a *role* do by default?
3. **User Overrides** — grants/denies for one *individual* beyond their role.

**The fixed request order (non-negotiable, every protected endpoint re-checks all of it):**

```
requireAuth  →  requireModule(entitlement)  →  requirePermission(action)  →  business logic
                                     (RLS tenant isolation sits beneath all of this)
```

Frontend enforcement (hidden menus/tabs/buttons, route guards, a real 403 page for manually entered URLs) is a **usability layer only**; backend re-validates independently. Frontend visibility is never security.

**Entitlement engine:**

- Module catalog with an explicit, deliberately sparse **dependency graph** (only genuine hard dependencies encoded — e.g. `OT → IPD`, `CSSD → OT`), resolved at entitlement-grant time; the system refuses to activate a module whose hard dependency is not already entitled.
- `tenant_entitlements` materialized per **(tenant, module, optional branch)** — nullable `branch_id` from day one. A later plan/bundle change never silently alters an already-provisioned customer.
- Every entitlement record moves through the **state machine** (`TRIAL / ACTIVE / SUSPENDED / EXPIRED / CANCELLED / DEACTIVATED`) with `effective_from/until`, transition timestamps, `reason`, `created_by/updated_by`. Evaluation always considers **Tenant + Module + optional Branch + Status + Effective Date + Expiration Date together**, never status alone. Records are never physically deleted. Deactivation is soft (data retained per retention rules; reactivation is painless).
- A single `requireModule()` check gates every module's routes, before any permission check.
- **Provisioning is operator-driven at MVP** (self-serve plan management + payment-integrated billing are explicitly out of MVP scope), but **enforcement is fully automatic from day one.**

**RBAC + overrides:**

- **Permission keys use a dot-hierarchy** (`module.submodule.page.action`) — one mechanism gates modules, sub-modules, pages, tabs, and individual CRUD/sensitive actions. Keys live in **`packages/permissions`**, shared between frontend and backend.
- **Effective permission = union of all assigned roles' permissions + explicit grants − explicit denies. Explicit DENY always wins**, permanent or temporary.
- **Custom roles** are created by cloning a system-default role and editing its permission set (keeps total role count bounded).
- **Resolved permission sets are cached**, not recomputed per request, and **invalidated on any role/override/entitlement change.**
- **MVP role seed** (reduced set): Super Admin, Org Admin, Branch Admin, Doctor, Receptionist, Pharmacist, Lab Technician, Cashier. The full role list (Nurse, Radiologist, Insurance Executive, HR, Store Manager, Housekeeping, Security, Ambulance Staff, OT Staff, Patients, External/Visiting Doctors, etc.) is seeded as later modules arrive.
- **Every permission grant/revoke is itself an audited action**, restricted to holders of an explicit `rbac-management` permission.

**Temporary / time-bound permissions** (extends `user_permission_overrides`, not a separate engine):

- Fields include `effect (GRANT|DENY)`, `valid_from`, `valid_until`, `reason`, `created_by`, `revoked_at`. Permanent = `valid_until NULL`.
- The permission-check engine evaluates validity dates on every check; **no scheduled cleanup job is required for correctness.** Expired/revoked records are never deleted (audit).
- **Cache expiry bound (ADR-010, a v2.2 correction — must be built exactly):** a cached permission set containing temporary overrides **must carry a cache expiry no later than the earliest `valid_until` among them** — the cache never outlives the shortest-lived grant it holds. Setting `revoked_at` triggers **immediate, targeted** invalidation of that user's cache, never a wait for natural expiry.

**Policy/ABAC readiness (reserved, not built for MVP):**

- Authorization answers WHO / WHAT / WHERE / WHICH-DATA / WHEN. WHO + WHAT are fully built for MVP; WHERE is partial (branch-scoped entitlements/roles); WHICH-DATA + WHEN are **architecturally reserved** — the permission-check interface accepts a **context object today** even though most fields go unused until a later phase. A full ABAC engine is explicitly not built for MVP.

**Break-glass emergency access (reserved insertion point, not built for MVP):**

- The authorization flow has a defined insertion point between Permission and Business Logic. When implemented later, break-glass **must** require explicit user confirmation, a mandatory captured reason, an authenticated user, a dedicated emergency-access permission, time-limited access, and enhanced audit logging; and **must not** silently bypass authz, create permanent permissions, modify the user's role, delete audit records, or remain active indefinitely.
- **ADR-011 corrections (build exactly):** break-glass notification is **tenant-configurable** (recipients + sync/digest), and **post-event review is review-only** — it never alters RBAC as a side effect; any permanent change goes through the standard RBAC/override path.

## 13. Platform Core Services Implementation

All built once in Stage 0; every module consumes them.

- **Audit Logging** — a generic `audit_log` table + a `writeAudit()` helper wired into shared middleware. Entries are immutable, never deleted (even when the referenced record is later deleted/anonymized). Break-glass produces an enhanced-severity event distinct from routine access.
- **Notification Service** — `notification_log` + a `send()` abstraction + template storage. SMS/WhatsApp via **MSG91** (DLT entity + sender ID + template registration is a **Phase 0 build prerequisite**, 24–48h operator approval — start early). Transactional email via **AWS SES in ap-south-1/ap-south-2** (request SES **production access early**; it starts sandboxed). No module calls a provider directly — everything goes through `NotificationService → SmsService / EmailService`.
- **File Storage Service** — `FileStorageService` over E2E Object Storage; default-private buckets, short-lived signed URLs, **server-side** type/size validation, DB stores metadata/references only (path, size, MIME, checksum, uploader, access tags) — never file content. File access enforced by the same entitlement + RBAC checks; access and deletion audited; versioning for correctable clinical documents (e.g. amended reports).
- **Domain Events** — an internal in-process event bus (not Kafka, not a broker). Representative events: `PatientRegistered`, `AppointmentBooked/Cancelled`, `EncounterCreated`, `PrescriptionCreated`, `LabResultReady`, `InvoiceCreated`, `PaymentReceived`, `AdmissionCreated`, `DischargeCompleted`. Notifications, Audit, Activity Timeline, Reporting, and Analytics subscribe — modules publish once.
- **Background Jobs** — Redis + BullMQ; every async workflow is categorized (Synchronous / Async / Scheduled / Long-running / Retryable). No module creates its own cron or ad-hoc scheduler.
- **Global Search & Activity Timeline** — one platform-level search across Patient/Appointment/Prescription/Invoice/Lab/Admission, filtered through the same entitlement+permission checks (never surfaces a record the user couldn't otherwise see). The Activity Timeline (clinical/business narrative) is built from the same event stream and is distinct from the Audit Log (security/compliance record).
- **Reporting** — query-based reports for MVP; the full dashboards/BI/predictive suite is Phase 3. Role-based report access; scheduled exports (Excel/PDF, email) come later.
- **Feature Configuration** — flags stored per `(tenant, module, feature_key)`, read by the same module code regardless of which flags are set. Distinct from entitlement (whether vs. how). Changing a flag needs no entitlement change, deployment, or engineering ticket.
- **Financial Transaction Infrastructure** — invoice/payment/tax/receipt/ledger primitives with **no clinical/workflow logic**. This is the **only** place those primitives are implemented; the Billing & Payments business module and every billing-capable module consume it and never reimplement it. This boundary is what lets future modules add new billing line-item types without rebuilding the engine.
- **Provider Abstractions** — MSG91, AWS SES, E2E Object Storage/R2, E2E DBaaS all sit behind internal services; no module holds a direct SDK dependency on an external vendor.

## 14. Frontend Architecture Implementation

Per Phases → Frontend (Portal) and Rules → Engineering Standards.

- **Stack:** Next.js (App Router) + TypeScript for both Portal and Marketing.
- **App shell:** sidebar/topbar navigation whose menu items are **driven by RBAC permissions**, not hardcoded per role. Empty-state dashboards per role at first; real widgets arrive with their modules.
- **Design tokens (once, in `packages/ui`):** font family/size/weight/line-height, spacing scale, radius, palette, shadows — with **Light and Dark** variants; **Light is default**. No component hardcodes a raw color/spacing/radius/typography value.
- **Shared component library (`packages/ui`):** buttons, inputs, tables, modals, toasts, cards, dropdowns, alerts, empty/loading/error states — one canonical implementation per pattern; modules extend/configure, never fork. Check `packages/ui` before building any new pattern.
- **Standard DataTable (`packages/ui`):** pagination, rows-per-page, single/multi-column sort, search, filter, column visibility, row selection, server-side mode for large datasets, and loading/empty/error states. Modules supply only data + column config. Missing functionality is added to the shared component, never worked around locally.
- **Branding token layer:** tenant logo, colors, typography consumed from the centralized branding system; a new component works for any tenant's branding without a redesign.
- **Capabilities context + `Can` guard:** entitled modules + effective permissions are fetched once at login into a client-side capabilities context; a reusable `Can` guard/hook drives menus, tabs, buttons, and route access. A real **403/forbidden page** renders for manually entered unauthorized URLs — never a blank screen or silent redirect.
- **Portal auth wiring:** token storage (httpOnly refresh cookie + in-memory access token), `401 → refresh → retry`, unauthenticated redirect to `/login`.
- **Accessibility:** WCAG 2.1 AA where feasible; responsive tablet UI; latest Chrome/Edge/Firefox.
- **API feedback (ADR-026, ADR-057):** one shared `@hms/ui` Toast — React Toastify behind a fixed adapter API — raised from the shared API client. Every mutating call gives feedback, the backend's own message is displayed when provided, and network/timeout/validation/401/403/409/5xx/unstructured responses are all normalized in that one layer. Toasts are top-right, theme- and tenant-branded from the design tokens, and never signal status by colour alone. No page writes its own toast logic and no module configures the library itself; no stack trace, backend internal, or PHI reaches the user.
- **Optimization:** `next/image`, `next/font`, `next/script`, the Next Metadata API, and `next/dynamic` for heavy non-critical UI (charts, editors, complex dialogs, admin-only panels), against the Core Web Vitals budgets. The Portal is `noindex, nofollow` end to end and ships no third-party analytics by default (ADR-027).

## 15. Marketing Site Implementation

- Minimal Next.js scaffold whose **single Login action** points to the Portal's `/login`. No auth logic on the marketing site.
- The visual system is **`resources/DESIGN.md` — the canonical Nirogix Design System** (deep-teal signature on cool-neutral surfaces, Lucide icons, Geist), expressed through the marketing token scope (`--mk-*`), independent from the Portal's `--hms-*`. It supersedes the earlier `Default-DESIGN-intercom.md` exploration; where they differ, `DESIGN.md` wins.
- Marketing content, landing pages, and SEO live here; the site deploys independently on the root domain.
- **SEO/AEO/GEO is this site's job (ADR-027, Rules → SEO / AEO / GEO Rules).** Unique per-page title/description, canonical from `NEXT_PUBLIC_SITE_URL`, one `<h1>` + semantic structure, OG/Twitter metadata, JSON-LD only for what the page shows (`Organization`, `SoftwareApplication`, `LocalBusiness`, `BreadcrumbList`, real `FAQPage`), sitemap/robots in sync with the route table, descriptive URLs, deliberate internal linking, alt text on every non-decorative image, mobile-first + Core Web Vitals. Keywords are mapped per page to matching intent (mapping recorded in `marketing/KNOWLEDGE.md`) — never stuffed, never hidden, never fabricated trust signals, and always inside the PRD content guardrails (no prices, no certification claims, no invented customers).

---

# Part C — Cross-Cutting Disciplines

## 16. Security & Compliance Implementation

**Security by Design / Privacy by Design** — core architectural requirements, applied on every milestone, not bolted on at the end.

- Encryption **at rest (AES-256)** and **in transit (TLS 1.2+)** for all PHI-bearing data.
- Fine-grained RBAC + MFA; SSO (SAML/OAuth2/OIDC) hooks present from Phase 0.
- Immutable, tamper-evident audit trails; consent management for all health-information sharing; digital signatures on clinical/consent documents.
- Secure API architecture: rate limiting, input validation, one error shape.
- Secure file storage (default-private, signed URLs, server-side validation).
- **PII masking in logs and all non-production environments**; least-privilege throughout.
- OWASP Top 10 protections; **periodic VAPT**; backups + DR with defined RPO/RTO.

**Compliance handling — discipline preserved.** The Regulatory Verification & Compliance Source Register is inherited wholesale. Every row (DPDP localization, CERT-In timelines, ABDM/HDM storage, Telemedicine Guidelines, PC-PNDT, Biomedical Waste Rules, Drugs & Cosmetics Rules, Blood Bank, GST, PCI DSS, CDSCO/SaMD) is **Pending Verification** and must be verified against an **authoritative primary source** by the assigned Compliance Owner before it is treated as a mandatory requirement or stated to any customer/auditor/regulator. This plan **never** silently converts a Pending-Verification assumption into a stated mandate (Rules → Prohibited Patterns).

- **India-resident storage / hosting** is retained as a **conservative design decision** (ADR-005/006), with legal justification Pending Verification.
- **PCI DSS-aligned:** no card data is stored on the platform; payment gateway integration uses shareable links / tokenized flows.
- **CDSCO gate:** no diagnostic-support / clinical-decision AI feature is built until a CDSCO classification check is completed (Postponed / Build-as-Sold).
- **Formal DPDP/security hardening + VAPT** is formalized in Phase 3 ahead of any customer-driven audit — the architecture already assumes it from Phase 0, so this is formalization, not first-time construction.

## 17. Testing Strategy

Per Rules → Testing Rules and Phases → DoD.

- **Test pyramid:** many **unit** tests (services, permission resolution, billing math, lifecycle state transitions); a solid band of **integration** tests (API + DB + RLS, event handlers, job processors); a focused set of **end-to-end** tests (the critical patient-journey flows on staging).
- **Mandatory per-module suites (both directions):**
  - **Tenant isolation** — Tenant A cannot read Tenant B's data (required on *every* module).
  - **Entitlement** — entitled works; non-entitled gets 403/404, UI hidden.
  - **RBAC** — authorized works; unauthorized denied.
  - **User override** — GRANT works; DENY denied even against a permitting role.
  - **Temporary permission** — denied before `valid_from`, allowed during, denied after `valid_until`; plus the cache-expiry-bound behavior and `revoked_at` immediate invalidation.
  - **Direct-URL access** to unauthorized routes is rejected server-side (tested explicitly, never assumed safe because navigation is hidden).
- **Regression gate:** a milestone is not complete until the **full** automated regression suite passes, not just its own new tests.
- **Theme/branding verification:** every UI is verified in Light + Dark and under a non-default tenant's branding before it's considered complete (a Dark-mode-unreadable component is a defect, not a follow-up).
- **Test data:** the Phase 0 seed script creates 2+ demo tenants with users per role, used for manual QA and automated tenant-isolation tests. **All seed/demo data reflects a genuinely Indian healthcare context** (names, hospitals, clinics, addresses, cities, states, PINs from across India; small clinics + multi-specialty hospitals + diagnostic centers + standalone pharmacies) — no generic placeholder data in any environment a stakeholder might see.
- **Performance testing** (introduced in Stage 3): validate the <2s standard-operation target and search performance at realistic seed volumes (thousands→millions of patient records).

## 18. DevOps, CI/CD & Observability

**CI (every push):** lint → typecheck → unit + integration tests → build, using **Turborepo affected-package detection** to keep runs fast. A failing push does not merge. Migrations run against an ephemeral Postgres in CI.

**CD:**
- Merge to `staging` → self-hosted GitHub Actions runner builds and deploys **only the affected apps** (Turborepo affected) to the staging VM (Nginx + PM2, dedicated service user).
- Promotion to production is a controlled, reviewed step; DB migrations apply before app rollout; PM2 reload for zero-downtime restart.

**Observability (day-one, per Phases → Ops):**
- **Structured logging** (e.g. pino) with PII masking, wired from day one.
- **Error tracking** integrated in Stage 0.
- **Metrics + traces** (the "full observability: logs, metrics, traces" expectation) added progressively; request tracing across the modular monolith and job queue; dashboards for revenue/OPD-IPD/bed/queue KPIs come with their modules.
- **Alerting** on error-rate, latency (>2s), queue backlog, failed jobs, and backup failures.

**Backups & DR:** automated daily DB backups + PITR; **restore is drilled before the first paying customer**; RPO/RTO objectives defined and validated in Stage 3.

## 19. Documentation & Knowledge System

Per Rules → Documentation System. Documentation is part of Definition of Done, not a follow-up.

- **`CLAUDE.md` (root):** indexes the whole monorepo — architecture, stack, coding/UI/theming/branding conventions, auth/RBAC/entitlement architecture, API + DB conventions, testing + deployment conventions — and links to every app/package's own docs. Created in Stage 0.
- **`KNOWLEDGE.md` (per app/package):** current state — purpose, architecture, key files, components, services, APIs, DB models, business rules, permissions, dependencies, integration points, constraints, troubleshooting. Updated whenever behavior changes.
- **`DONE.md` (per app/package):** append-only implementation log (date/time, feature, what shipped across API/DB/frontend/integration, testing status, decisions, known limits). Never rewritten.
- **`DECISIONS.md`:** numbered ADRs recording *why*. Append-only. **Seed ADRs** (from Rules/Memory): ADR-001…ADR-011 already defined upstream. **New ADRs this plan introduces:** ADR-012 (ORM choice — required), ADR-013 (monorepo keeps the existing `hms_backend`/`hms_frontend`/`marketing` folder names + root-level `packages/*`, rather than renaming to `apps/*`). Future weighty decisions appended with the same rigor.

---

# Part D — The Delivery Roadmap

Stages map 1:1 onto the upstream phase structure — they add execution detail, they do not re-sequence. The **Dependency Map** (Architecture / Phases) is authoritative for ordering:

```
Foundation → Patient → Appointment → OPD+Billing Core → EMR → {Pharmacy ∥ Lab} → Reports   (Phase 1 critical path)
Patient + Billing Core → IPD → Nursing                                                        (Phase 2 branch)
IPD → OT → CSSD                                                                                (Phase 4 branch)
Patient → Blood Bank                                                                           (mostly independent)
Notification Service (Phase 0) → reminders, lab alerts, CRM campaigns                          (built once, reused)
Billing Core (1.3) → Pharmacy, Lab, IPD, Insurance/TPA, Financial Management                    (one engine, new line-item types)
```

## 20. Stage 0 — Platform Foundation

*Maps to Phase 0. Full execution detail. Nothing in Stage 1 starts until Stage 0's Definition of Done is met.*

**Objective:** a real login, a real (empty) role-based dashboard, deployed to staging, provably tenant-isolated — plus every Platform Core capability every later module depends on. This is the one-time core investment.

**Entry gate:** Task 0.0 (monorepo consolidation, §6.2) complete; ADR-012 (ORM) recorded; MSG91 DLT registration and AWS SES production access **requested** (both have external lead times).

**Workstreams & deliverables:**

- **Backend foundation:** tenant model + provisioning; `tenant_id` + RLS policy template applied to every table; users & auth (password hashing, login, JWT access+refresh, logout/revocation); RBAC engine (roles, permissions, `role_permissions`, permission-check middleware) with the reduced MVP role seed; `user_permission_overrides` (grant/deny, temporary window) on top of role defaults; dot-hierarchy permission keys shared via `packages/permissions`; audit log service (`audit_log` + `writeAudit()`); module entitlement system (catalog + dependency graph + `tenant_entitlements` + `requireModule()` before permission checks); provider/specialty core tables aligned to FHIR Practitioner/PractitionerRole + `specialty_form_templates`; minimal hospital/clinic + branch setup tables.
- **Platform Core services:** NotificationService skeleton (MSG91 SMS/WhatsApp + SES email behind the abstraction); FileStorageService (EOS, private buckets, signed URLs, server-side validation, metadata-only DB); domain-event bus; BullMQ job infrastructure; API conventions (Express scaffold, one error shape, Zod validation, pagination helper, `/api/v1`, OpenAPI auto-doc).
- **Frontend (Portal):** auth screens (login, forgot/reset, MFA prompt scaffold); RBAC-driven app shell; empty-state dashboard per role; `packages/ui` bootstrap (buttons, inputs, tables, modals, toasts); design tokens (Light default + Dark); Standard DataTable; branding token layer; capabilities context + `Can` guard + 403 page.
- **Marketing:** minimal scaffold with the single Login action wired to the Portal `/login`.
- **Integration:** full Portal auth flow (httpOnly refresh cookie + in-memory access token, `401 → refresh → retry`, unauth redirect).
- **Ops:** E2E hosting; managed PostgreSQL as a separate service; daily backups + PITR configured **and restore-tested**; Redis on the app VM; Cloudflare in front; staging environment (subdomain, Nginx, PM2, GitHub Actions auto-deploy of `staging`); structured logging (pino) + error tracking; seed script (2+ Indian-context demo tenants, users per role).
- **Docs scaffolding:** root `CLAUDE.md`; `KNOWLEDGE.md` + `DONE.md` for every app (`hms_backend`, `hms_frontend`, `marketing`) and package (`ui`, `types`, `config`, `utils`, `permissions`); `DECISIONS.md` seeded with ADR-001…ADR-013.

**Exit criteria (Stage 0 Definition of Done — all must hold):**
- Log in as each seeded role → role-appropriate dashboard.
- Unauthenticated → 401; authenticated-but-forbidden → 403.
- Automated test proves Tenant A's API never returns Tenant B's data.
- A login attempt writes an `audit_log` row.
- A test notification sends through the **real** provider in staging.
- CI runs lint + tests + build on every push and auto-deploys staging on merge.
- Swagger/OpenAPI renders and reflects the auth endpoints.
- A tenant lacking a module's entitlement gets a proper 403/404 on that module's routes, with the UI entry hidden.
- A user-specific override (grant **and** deny) is provably enforced and itself audited.
- Root `CLAUDE.md` and per-app/package `KNOWLEDGE.md`/`DONE.md` exist and cross-reference.
- A sample shared component renders in both themes and under a second tenant's branding.

**Live status (2026-08-14) — code-complete; exit criteria met except where infra-blocked:**

| # | Exit criterion | Status |
|---|---|---|
| 1 | Log in as each seeded role → role-appropriate dashboard | ✅ verified (Portal, capability-driven shell) |
| 2 | Unauth → 401; forbidden → 403 | ✅ verified (API + Portal 403 page) |
| 3 | Automated test: Tenant A never returns Tenant B's data | ✅ RLS isolation test (runs in CI on real Postgres) + live disjoint-provider check |
| 4 | A login writes an `audit_log` row | ✅ verified |
| 5 | Test notification through the **real** provider in **staging** | ⏳ **infra-blocked** — skeleton + log provider done; real send needs staging VM + MSG91 DLT (24–48h external) |
| 6 | CI runs lint+tests+build every push; auto-deploys staging on merge | 🟡 CI ✅ (every push); auto-deploy workflow authored, **needs the staging VM** to exercise |
| 7 | Swagger/OpenAPI renders + reflects auth endpoints | ✅ verified (`/api/v1/docs`) |
| 8 | Un-entitled module → 403/404 + UI entry hidden | ✅ verified (`requireModule` + `<Can>`/nav filtering) |
| 9 | User override (grant **and** deny) enforced + audited | ✅ RBAC tests + audit |
| 10 | Root `CLAUDE.md` + per-app/package `KNOWLEDGE`/`DONE` exist + cross-reference | ✅ all apps + packages |
| 11 | Shared component in both themes + second tenant's branding | ✅ verified (Light/Dark + brand override) |

Only #5 and the auto-deploy half of #6 remain, both **blocked on real infrastructure** (staging VM + managed DB + MSG91 DLT), not on code. They are validated at staging bring-up (the deploy/backup baseline is versioned under `deploy/`), with RPO/RTO formally validated in Stage 3.

## 20A. Platform Administration Surface — operator onboarding, user/permission admin, branding

*Bridges Stage 0 and Stage 1. Stage 0 built the tenancy/RBAC/entitlement/branding-token **mechanisms** as services; this milestone exposes them through **operator- and admin-facing APIs + Portal screens**, so a real operator can onboard the first pilot customer from the UI instead of editing `seed.ts`. Should land at the front of Stage 1 (a clinic can't run until its org exists and its staff have accounts). Decisions: **ADR-020** (onboarding model), **ADR-021** (branding persistence). Public self-serve signup + payment-integrated plans remain out of scope — Enterprise/Scale track (§25).*

> **Frontend topology changed after this section was written (ADR-051, 16/08/2026).** The operator screens described below are no longer "Portal screens": they live in the **`admin` application on its own origin** (`:3003` locally, `admin.nirogix.com` in production), and the Portal serves hospital staff only. The APIs, permissions and audit behaviour are unchanged — what moved is which bundle renders them, so operator code no longer ships to every hospital. Read "Portal screens" below as "admin-console screens" wherever this milestone describes a platform-operator surface. The tenant-facing half (Org-Admin user, role, branch and branding management) stayed in the Portal and is now reached through the Hospital Configuration console (ADR-049).

**Already built (reused, not rebuilt):** tenant + branches tables and RLS isolation; `provisionTenantRbac`, `grantModule` (hard-dep graph), `assignRoleByKey`, `setOverride`/`revokeOverride`, `resolvePermissions`; the `@hms/permissions` catalog; `NotificationService` (invites), `FileStorageService` (logos/favicons); the `--hms-*` branding token layer + the Portal's session-bootstrap seam; audit log; mandatory OpenAPI. This milestone is **wiring + screens**, not new core.

### Milestone A — Platform Admin & Onboarding (operator / Super Admin + Org Admin)

**Model (ADR-020):** operator-driven. A platform Super Admin creates the tenant; the tenant's Org Admin then self-manages inside it. The Super Admin is the **vendor** and lives in a dedicated **`PLATFORM` org** (Takoriya Technology LLP), *not* inside any customer hospital — Tier 0 (platform owner) vs Tier 1+ (hospitals, `org_admin`→…). See **ADR-022**.

- **Backend — Super-Admin surface (cross-tenant, runs *outside* `runWithTenant`; new `platform.tenants.manage` permission, super_admin/wildcard):**
  - `POST /api/v1/admin/tenants` — onboarding transaction: create tenant → `provisionTenantRbac` → grant initial module entitlements → create the first `org_admin` user (temporary password now; email invite via `NotificationService` later — ADR-020) → create initial branch(es). Audited; idempotent on tenant code.
  - `GET /admin/tenants`, `GET /admin/tenants/:id`, `PATCH /admin/tenants/:id` (account status / plan state).
  - `POST /admin/tenants/:id/modules` + `DELETE …/modules/:key` — entitlement grant/revoke (wraps `grantModule`/`setModuleStatus`; never physical-deletes — ADR/invariant #6).
- **Backend — Org-Admin surface (tenant-scoped, existing permission keys):**
  - Users: `GET/POST /users`, `PATCH /users/:id` (status/profile) — `platform.users.view|manage`.
  - Roles/permissions: `GET /rbac/roles` (exists), role→permission read, and user override grant/deny endpoints exposing `setOverride`/`revokeOverride` — `platform.rbac.manage`.
  - Branches: `GET/POST /branches`, `PATCH /branches/:id` — `platform.branches.view|manage`.
  - All routes Zod-validated + **documented in OpenAPI** (mandatory gate).
- **Frontend (Portal):**
  - **Super-Admin area** (visible only with `platform.tenants.manage`): Tenants list (Standard DataTable); **Create-Tenant wizard** (org details → modules → first admin → branches); tenant detail (status, entitlements, branches).
  - **Org-Admin area:** Users list + create/invite + role assignment; Roles & Permissions view (effective set, grant/deny overrides); Branches management. All gated by `<Can>` + the existing capabilities context.
- **Invitation flow:** phased — temp-password on create first; email invite with a set-password token (via `NotificationService`) as a fast follow.
- **Exit criteria:** an operator creates a brand-new tenant end-to-end **from the UI** (no seed edit); the new tenant is provably isolated (its data never overlaps another's); its `org_admin` logs in and creates a user, assigns a role, and adds a branch — all audited; every new route appears in Swagger.

### Milestone B — Tenant Branding administration (Org Admin)

**Model (ADR-021):** persist branding server-side; apply it through the existing token seam — additive, no component changes.

- **Backend:** `tenant_branding` table (tenant-scoped + RLS; nullable `branch_id` = org default + optional branch override): `brand_color`, `secondary_color`, `logo_file_id`, `favicon_file_id`, `typography` (jsonb), `updated_at` + optimistic lock. `GET /branding/current` (any authenticated user — feeds session bootstrap) and `GET/PUT /branding` (`platform.branding.manage`). Logo/favicon upload via the existing `FileStorageService`. Documented in OpenAPI.
- **Frontend:** Settings → **Branding**: colour picker (primary/secondary), logo upload + preview, favicon upload, reset-to-default, live preview. Replaces the current **localStorage** demo with server-persisted branding applied at bootstrap (set `--hms-*` from `GET /branding/current`).
- **Exit criteria:** an Org Admin sets a custom brand colour + uploads a logo/favicon; it **persists across sessions and devices** and renders for **all** of that tenant's users in **Light + Dark**; a second tenant sees its own; reset restores the default token palette.

**Scope guard:** this milestone deliberately excludes public self-registration, plan/subscription self-service, usage metering, and payment-integrated billing (Enterprise/Scale track, §25). It also excludes letterheads, numbering series, and the custom-field/form/workflow config engine (Configuration Engine, later) — only tenant/user/permission/branch admin + colour/logo branding are in scope here.

> **Two items moved out of this guard on 16/08/2026 (ADR-056).** Both are now built, and the guard is updated rather than quietly contradicted:
> - **Letterheads are in.** Scoped narrowly to what a hospital writes for itself — a header line, footer text and a default signatory — held on the same `organization_profile` record as the address they print above, and consumed by the existing `PrintDocument` kit (ADR-047). Numbering series and the wider Configuration Engine remain out.
> - **"Public self-registration" here always meant *tenant* self-signup**, and still does: a hospital cannot create its own account, and plans/payments remain Enterprise/Scale track. **Patient** self-registration by QR is a different thing and is now built (ADR-056) — it creates a *registration request* the front desk converts, never an account and never portal access, so ADR-020's operator-driven onboarding and ADR-052's "the hospital decides who becomes a patient" both stand unchanged.

## 20B. Platform & Organization Dashboards

*Follows §20A. Gives each actor the "landing overview" their journey needs (`user-journeys.md` §1.3, §2.5). Decision: **ADR-023** (cross-tenant analytics are aggregate-only, super-admin-gated).*

- **System Admin (platform) dashboard** — aggregated statistics **across every tenant**, super-admin only: total organizations/tenants (active vs inactive), hospitals + branches, doctors, patients, staff/users, appointments, per-module entitlement usage, recent onboarding + error/queue health. **Aggregate-only** — counts/metrics, never another tenant's row-level PHI (ADR-023). Read path starts as a per-tenant aggregation loop (`runWithTenant` COUNT) + the non-RLS platform tables; evolves to a materialized `platform_metrics` snapshot (BullMQ-refreshed) at scale.
- **Org Admin dashboard** — the same shape **scoped to one hospital** (its patients, doctors, appointments, revenue, pending lab results, active branches/users), via the normal RLS-enforced path — never leaks another tenant.
- **Frontend:** replace the current placeholder dashboard cards with real metric tiles (Standard components), role-aware — the System Admin sees the platform roll-up; an Org Admin sees their tenant roll-up.
- **Depends on:** the counted entities exist — tenants/branches/users/providers today; patients/appointments/revenue arrive with the Stage 1 clinical modules, so those tiles light up as their modules land (build the dashboard to degrade gracefully for not-yet-present modules).
- **Exit:** the System Admin lands on a platform roll-up across all tenants (aggregate-only, verified it never returns cross-tenant rows); an Org Admin lands on their own hospital's roll-up; both are permission-gated and audited.

### 20B.1 — Built (ADR-043)

The System Admin dashboard is live at `/platform`: KPI tiles, a 6/12/24-month growth chart, monthly onboarding, module adoption, security activity per day by severity, live API/database health, quick actions, and the recent warning-level audit table. Growth comes from `GET /admin/trends`, which derives monthly series from each record's own `created_at` — no estimation, no interpolation. Navigation is grouped (`PLATFORM_NAV_GROUPS`), so new platform capability joins a section instead of lengthening a flat list.

### 20B.2 — Platform areas not yet built

Each of these is a **future group member**, not a placeholder: nothing appears in the sidebar until the screen exists, and no dashboard tile is drawn until the metric has a data source. In rough order of when the platform will need them:

| Area | Waiting on | Where it lands |
|---|---|---|
| **Plans & subscriptions**, **billing & payments (tenant-facing)**, revenue metrics (MRR/ARR, plan mix, churn) | A subscription/plan/tenant-invoice model — none exists; paid plans are Enterprise/Scale track (§25, ADR-020) | New "Revenue" group |
| **Support tickets & inbox** | A ticketing model, or an integration with whatever support tool is chosen | "Customers" group, beside Hospitals |
| **Platform reporting & analytics workspace** | Enough history for cohort/retention questions the dashboard cannot answer inline | "Platform" group |
| **Integrations & API keys** (per-tenant credentials, webhooks, delivery logs) | The integration surface itself (ABDM, gateways, ERP export — all planned modules) | New "Developer" group |
| **System configuration** (feature flags, module catalogue editing, default entitlements) | Configuration Engine (§20A scope guard) | "Platform" group |
| **Usage metering & storage** | Metering the file/object store and per-tenant request volume | Dashboard tiles + "Platform" group |
| **Uptime & incident history** | An external monitor (`status.nirogix.com`, `resources/domains.md`) | Dashboard tile, replacing the live-probe-only health card |
| **Notifications console** (platform-wide announcements, delivery failures) | Notification history worth browsing — the send abstraction exists, the console does not | "Platform" group |

**Deliberately never a platform screen:** per-hospital clinical work. An operator reaches a hospital's data only through an audited support session (ADR-037), which switches them to that tenant's own navigation.

## 21. Stage 1 — MVP 0: Clinic Pilot

*Maps to MVP 0. Goal: a real clinic runs registration → appointment → consultation → payment entirely on the platform.*

Each milestone runs the six-step loop and must satisfy the Global Definition of Done (§4). Only milestone-specific highlights are listed here; the authz/tenant/theme matrix from §4 applies to all.

### 1.1 — Patient Management `(§9 · M)` — *depends on Stage 0*
- **Backend:** tenant-scoped `patients`, UHID generation (unique within tenant), demographics, family/dependent linking, photo-capture endpoint, search API (name/phone/UHID).
- **Frontend:** registration form, patient search/list (Standard DataTable, server-side), patient profile view.
- **Integration:** photo upload via FileStorageService; duplicate-patient warning on search-before-create.
- **Acceptance:** UHID uniqueness within tenant; search performance at realistic seed volume (thousands); Receptionist can create/edit, Doctor view-only (RBAC both directions).

### 1.2 — Appointment Management `(§10 · M)` — *depends on 1.1*
- **Backend:** `appointments`, doctor availability/slot model, booking/cancel/reschedule with conflict prevention.
- **Frontend:** calendar/slot-picker, doctor day view, receptionist booking.
- **Integration:** booking triggers a reminder via the Stage 0 NotificationService.
- **Acceptance:** double-booking prevented; cancellation frees the slot; reminder actually sends in staging.

### 1.3 — OPD & Check-in + Billing Core `(§11, §24 core · L)` — *depends on 1.2*
- **Backend:** `visit/encounter` (the record everything hangs off), token/queue logic; invoice + `invoice_line_item` + payment tables on the **Financial Transaction Infrastructure**; payment collection endpoint (cash + UPI for MVP; full gateway later); idempotent invoice/payment operations.
- **Frontend:** front-desk queue/token board, check-in action, billing/receipt screen for the consultation fee.
- **Integration:** check-in auto-creates a visit + a draft consultation-fee invoice line.
- **Acceptance:** queue ordering correct; invoice totals correct; receipt printable/downloadable.

### 1.4 — Clinical Workflow / EMR `(§12 · L)` — *depends on 1.3 (needs an active visit)*
- **Backend:** consultation notes, vitals, diagnosis (ICD-10 lookup), prescription table, doctor's orders referencing pharmacy/lab; optimistic locking on notes/prescriptions.
- **Frontend:** doctor consultation screen — vitals, notes, diagnosis picker, prescription writer.
- **Integration:** prescriptions + lab orders here are the **input queue** for 1.5 and 1.6 (which then parallelize).
- **Acceptance:** orders correctly reference visit + patient; a doctor cannot edit another doctor's notes unless explicitly permitted.

**Stage 1 exit:** the full clinic pilot journey is demoable end-to-end on staging by a non-developer, tenant-isolated, with the complete authz matrix green.

## 22. Stage 2 — MVP 1: Clinic Expansion

*Maps to MVP 1. Goal: the same clinic dispenses medicine, orders/reports labs, and sees basic operational numbers — without leaving the platform. This stage completes the first sellable product.*

### 1.5 — Pharmacy Management (MVP subset) `(§22 · M)` — *depends on 1.4, 1.3*
- **Backend:** drug master, batch/stock table, dispense-against-prescription with stock deduction, low-stock flag; simple manual stock-adjustment (full procurement deferred to Phase 2).
- **Frontend:** pharmacist dispensing screen (pulls pending prescriptions), stock list, manual adjustment.
- **Integration:** dispensing adds a Pharmacy line item to the visit's invoice (extends Billing Core).
- **Acceptance:** stock decremented correctly; cannot dispense beyond stock; dispensed items appear on the patient's bill.

### 1.6 — Laboratory Management (MVP subset) `(§14 · M)` — *depends on 1.4, 1.3; parallelizable with 1.5*
- **Backend:** test master, order table, sample status (ordered → collected → resulted), result entry, PDF report generation (async job).
- **Frontend:** lab technician worklist, result entry, report view/download for doctor + patient.
- **Integration:** report-ready triggers a notification; lab charges added as invoice line items.
- **Acceptance:** results attached to the right order/patient; report PDF generates correctly; abnormal-value flag visible to the ordering doctor.

### 1.7 — Basic Reports `(§53 MVP subset · S)` — *depends on 1.1–1.6*
- **Backend:** query-based OPD register, daily collection/revenue, patient list, pending-lab-results list.
- **Frontend:** report screens with date-range filters + CSV/PDF export.
- **Acceptance:** report totals reconcile against underlying transaction data.

**Stage 2 exit = MVP complete:** a clinic can run its full day on the platform. This is the first candidate for a pilot customer.

## 23. Stage 3 — Production-Readiness Hardening

*Not a new upstream phase — the explicit engineering bridge between "MVP works" and "a paying customer can safely run on it." Pulls forward the parts of Phase 3's DPDP/security hardening and the Ops targets that a first live customer actually requires. Some items may run in parallel with Stage 2.*

**Entry gate:** MVP (Stages 0–2) demoable; **Compliance Owner assigned** (closes a memory.md open item).

**Scope:**
- **Security hardening:** enforce MFA where required; finalize password policy, lockout, session/device controls; rate limiting tuned; dependency and secret scanning in CI; PII masking verified across logs and non-prod.
- **First VAPT pass** against OWASP Top 10; remediate P0/P1 findings before go-live.
- **Compliance verification round:** the Compliance Owner verifies the highest-impact Source Register rows relevant to the live segment (DPDP posture, GST invoicing for Billing, PCI-aligned payment handling, Drugs & Cosmetics for Pharmacy dispensing/registers) against **primary sources**, updating the register's status/owner/last-verified fields. Nothing is marketed as a confirmed mandate until verified.
- **Performance validation:** confirm <2s standard-operation target; search + report performance at realistic (and stress) seed volumes; index review; N+1 audit.
- **Observability completion:** metrics + traces + dashboards + alerting live; on-call/runbook basics.
- **Backup/DR drill:** execute a full restore from backup on a clean environment; define and validate RPO/RTO; document the runbook.
- **Data-lifecycle enforcement check:** retention-lock and audit-immutability behaviors verified end-to-end.
- **Go-live checklist** (see §31) signed off.

**Exit:** the platform is safe to onboard the first paying pilot customer, with backups drilled, security baseline verified, and the relevant compliance rows moved off "Pending Verification" (or explicitly flagged as blocking).

## 24. Stage 4 — Phase 2: Small Hospital / Nursing Home

*Directional (rolling-wave). Expanded to execution-grade at stage entry, once MVP velocity is known. Order within the stage is demand-driven; dependencies are fixed.*

| Module | Depends on | Execution note |
|---|---|---|
| **Admission (IPD)** §16 | Patient, Billing Core | Adds bed/ward as a **new invoice line-item type** — same Billing-Core extension pattern as Pharmacy/Lab. Bed-board, transfers, discharge workflow. |
| **Nursing** §13 | IPD | Bedside charting (vitals, MAR, I/O, handover, escalation) needs an admission to chart against. New role: Nurse. |
| **Inventory, Stores & Procurement** §23 | Pharmacy (MVP) | Deepens MVP's manual stock-adjustment into full indent → approval → PO → GRN → issue. New role: Store Manager. |
| **Radiology, Imaging & PACS/RIS** §15 | EMR, Billing Core | Same data-model pattern as Lab — reuses most of its UI; PACS/DICOM is an add-on. New role: Radiologist. PC-PNDT support where ultrasound is offered (compliance Pending Verification). |
| **Insurance, TPA & Govt. Schemes** §25 | Billing Core | Pre-auth, cashless, claims; PM-JAY/state schemes. New role: Insurance Executive. |
| **Financial Management** §26 | Billing Core, Inventory | P&L needs both revenue and cost data flowing; Tally/ERP export. |
| **Emergency Department (ER)** §17 | Patient, Billing Core | Optional — only if target customers run a casualty department. |

**Stage entry expansion produces, per module:** full six-step-loop task breakdown, permission keys, feature flags, acceptance + authz/tenant test matrices, and DONE/KNOWLEDGE updates — authored just-in-time.

## 25. Stage 5 — Phase 3: Compliance & Interoperability

*Directional (rolling-wave).*

| Workstream | Depends on | Execution note |
|---|---|---|
| **ABDM Integration** §36 | Patient | M1 (ABHA create/verify/link) first — a light lift. **M2/M3 (HIP/HIU) require legal/compliance review before build starts** and the ABDM WASA audit path (CERT-In empanelled auditor) — all Pending Verification. FHIR R4 bundles (OPConsult, DischargeSummary, Prescription, DiagnosticReport). |
| **Formal DPDP/Security hardening + VAPT** §55 | All prior | Formalized ahead of any customer audit; architecture already assumes it from Phase 0 — this is formalization, extending Stage 3's first pass, not first-time build. |
| **Full Reports & BI suite** §53 | All transactional modules | The large report catalog only makes sense once underlying modules exist; custom dashboard builder, predictive analytics (AI features gated by CDSCO check). |
| **CRM & Patient Engagement** §33 | Patient, Notifications | Recall/preventive-care campaigns reuse the Stage 0 notification engine. |
| **Notification Engine — depth** §49 | Stage 0 skeleton | WhatsApp Business API + broadcast campaigns on top of the Email/SMS skeleton. |
| **Portals & Mobile apps — depth** §6 | Portal (web) | Dedicated React Native/Expo app (a root-level `mobile/` workspace member, room already reserved) only if the web Portal proves insufficient for a role (nursing tablet, field staff). |

## 26. Stage 6 — Phase 4: Hospital-Grade / Enterprise Expansion

*Directional (rolling-wave). Build opportunistically — ideally pre-sold to a specific customer before committing engineering time, since sequencing here is demand-driven more than technical.*

| Module | Depends on | Note |
|---|---|---|
| Operation Theatre §18 | IPD | Scheduling, checklists, consent, notes, implant/consumable billing linkage. New role: OT Staff. |
| CSSD §19 | OT | Instrument/tray lifecycle, sterilization cycles, cycle-to-case traceability, NABH docs. |
| Blood Bank §20 | Patient, Billing Core | Largely independent — can be pulled forward if a customer needs it early. Statutory registers (Drugs & Cosmetics — Pending Verification). |
| Specialty Clinical Modules §21 | EMR | Build only the specific specialty a paying customer needs, via `specialty_form_templates` — not all ten at once, and not by modifying core schema. |
| Ambulance & Fleet §29 | Patient | Demand-driven. |
| Biomedical Equipment & Asset Mgmt §30 | — | Demand-driven. |
| Biomedical Waste Management §31 | — | Demand-driven; BMW Rules 2016 (Pending Verification). |
| Housekeeping & Laundry §28 | IPD (ward context) | Demand-driven. |
| Dietary & Kitchen §27 | IPD | Demand-driven. |
| HR, Payroll & Doctor Scheduling §32 | — | Significant statutory lift (PF/ESIC/PT/TDS); confirm hospitals want this from Nirogix rather than existing HR software before committing. |

## 27. Enterprise-Hardening Track

*Cross-cutting, triggered by scale/contract — not a fixed phase. Do not build ahead of need (Rules → Prohibited Patterns forbid premature Kubernetes/Kafka/multi-region without a documented decision).*

Triggered when the single-VPS topology can no longer meet the §57 targets (millions of records, thousands of concurrent users, 99.5%+ uptime, multi-region):

- Migrate app compute to **Docker containers behind a load balancer**, horizontally scaled (the app is already decoupled from PM2/single-VM by design).
- Managed PostgreSQL with **read replicas**; move Redis to a managed instance.
- **Premium isolation tier:** schema-per-tenant or database-per-tenant for large chains with contractual isolation requirements (the RLS default remains for everyone else).
- **Subdomain-per-tenant routing** (wildcard DNS/SSL + Next.js middleware) once the tenant base grows.
- Candidate **service extraction** (Laboratory, Notification Engine first) — realistic precisely because modules already communicate by domain event, not direct call. Each extraction requires an ADR.
- Multi-region deployment + CDN strategy; DR failover region.
- **Self-serve plan management + payment-integrated billing** (explicitly deferred from MVP) built here.
- **Branch-scoped entitlement management UI** (schema already supports nullable `branch_id`; the admin UI is the remaining build).
- **Break-glass full implementation** at the reserved insertion point (per §12 / ADR-011).
- GeM registration readiness (only when pursuing government hospital contracts).

Each item is an explicit, documented decision (ADR) — none is a day-one assumption.

---

# Part E — Control & Reference

## 28. MVP vs Production-Ready vs Enterprise-Hardening

| Concern | MVP (Stages 0–2) | Production-Ready (Stage 3) | Enterprise-Hardening (Stage 27 / later) |
|---|---|---|---|
| **Tenancy** | Shared-DB + RLS; tenant isolation tested | Same, load-tested | Premium schema/DB-per-tenant tier; subdomain routing |
| **AuthZ** | Entitlements + RBAC + overrides + temporary perms; policy/break-glass *reserved* | MFA enforced where required; session/device controls | Break-glass built; ABAC fields activated as needed |
| **Billing** | Financial Core + cash/UPI; consultation/pharmacy/lab line items | GST verification; PCI-aligned gateway links | Usage-based pricing; self-serve billing |
| **Modules** | Patient→Appt→OPD/Billing→EMR→Pharmacy/Lab→Reports | (stabilized) | IPD/OT/CSSD/Blood Bank/specialties per demand |
| **Infra** | Single E2E VM + managed PG + Redis-on-VM + Cloudflare | Backups drilled; DR/RPO/RTO defined | Containers + LB + read replicas + multi-region |
| **Observability** | Structured logs + error tracking | Metrics + traces + dashboards + alerting | Full SRE tooling, SLOs |
| **Compliance** | Design decisions in place; register = Pending Verification | Owner assigned; high-impact rows verified vs. primary sources | ABDM WASA audit; scheme-specific certifications |
| **Security** | Encryption, RBAC, audit, private files | First VAPT; OWASP remediation | Periodic VAPT cadence; formal DPDP program |

## 29. Technical Implementation Priorities & Recommended Order

**Priority 1 — unblock everything (Stage 0):** monorepo consolidation (Task 0.0) → ORM decision (ADR-012) → tenancy+RLS pattern → auth → entitlement+RBAC+overrides → audit → the shared UI/design-token/DataTable/`Can` system → notification + file-storage + events + jobs skeletons → staging + CI/CD + backups. **Rationale:** every business module is written against these; building any module first would mean rebuilding it against the core later.

**Priority 2 — the revenue path (Stages 1–2), strictly along the critical path:**
`Patient → Appointment → OPD + Billing Core → EMR → {Pharmacy ∥ Lab} → Reports`.
- Billing Core (1.3) is the pivot: **every** later revenue module (Pharmacy, Lab, IPD, Insurance, Financial Management) extends this one engine with a new line-item type — so it must be correct and idempotent before anything hangs off it.
- **Parallelization window:** once EMR (1.4) lands, Pharmacy (1.5) and Lab (1.6) can be built concurrently by two engineers/squads — the single biggest schedule compression in the MVP.

**Priority 3 — make it sellable (Stage 3):** hardening, first VAPT, compliance verification round, backup/DR drill, performance validation. Do this **before** the first paying customer, not after.

**Priority 4 — expand by demand (Stages 4–6):** IPD unlocks the Phase 2 branch (Nursing, then OT→CSSD in Phase 4); pull individual modules forward when a specific customer is signed. Blood Bank is mostly independent and can jump the queue if needed.

**Sequencing guardrails:**
- Never build a module ahead of its hard dependency (the entitlement engine will refuse to activate it anyway).
- Never fork Platform Core for a module — extend the documented extension points.
- Re-plan at each stage boundary with real velocity (rolling-wave).

## 30. Risk Register & Open Decisions

| # | Item | Type | Status / Action |
|---|---|---|---|
| R1 | **Monorepo structure** | Resolved & verified | npm workspaces + Turborepo (ADR-013 names, ADR-014 npm). `npm run install:all` + `npm run dev` verified — backend/portal/marketing start together (200/200/200). |
| R2 | **ORM choice (Prisma vs Drizzle)** | Open decision | ADR-012 required before the first migration; matters for RLS authoring (§8). |
| R3 | **No compliance owner; entire Source Register Pending Verification** | Open (from memory.md) | Assign owner as the Stage 3 entry gate; verify high-impact rows vs. primary sources (§16, §23). |
| R4 | **MSG91 DLT + AWS SES production access lead times (24–48h / sandbox exit)** | External dependency | Request in Stage 0 entry gate, not near launch; gates SMS/OTP/email features in staging. |
| R5 | **Self-serve billing / payment-integrated plans deferred** | Scope (intentional) | Operator-driven provisioning at MVP; enforcement automatic. Build in Enterprise track. |
| R6 | **Branch-scoped entitlement management UI absent** | Known gap | Schema supports nullable `branch_id` now; UI is an Enterprise-track build. |
| R7 | **Break-glass not implemented** | Known gap (intentional) | Insertion point reserved; build per §12/ADR-011 when needed. |
| R8 | **Temporary-permission cache correctness (ADR-010)** | Correctness risk | Cache-expiry bound + `revoked_at` immediate invalidation are explicit test cases on every authz-touching milestone (§17). |
| R9 | **AI/clinical-decision features** | Regulatory gate | No diagnostic-support AI until a CDSCO classification check (Postponed / Build-as-Sold). |
| R10 | **Single-VPS scaling ceiling** | Scale risk | Monitor against §57 targets; trigger Enterprise-Hardening Track before saturation, not after. |
| R11 | **India-residency legal justification** | Pending verification | Kept as a design decision (ADR-005/006); never stated as a confirmed mandate until verified. |

## 31. Enterprise Readiness Checklist

A consolidated gate — the platform is enterprise-ready for a given customer segment only when all hold (each traces to an upstream requirement):

- [ ] Tenant isolation proven by automated test on **every** module (RLS, both directions).
- [ ] Full authorization matrix (entitlement / RBAC / override / temporary-permission / direct-URL) green on every module, both directions.
- [ ] Explicit DENY-over-GRANT and temporary-permission cache-expiry behavior tested.
- [ ] Every mutating action, permission change, and entitlement change is audited; audit log immutable and retained.
- [ ] Encryption at rest (AES-256) + in transit (TLS 1.2+) for all PHI; PII masked in logs/non-prod.
- [ ] MFA + SSO hooks present; MFA enforced where required.
- [ ] PHI files default-private with signed URLs; server-side validation; access audited.
- [ ] Backups automated **and restore drilled**; RPO/RTO defined and validated.
- [ ] Observability: structured logs + error tracking + metrics/traces + alerting live.
- [ ] First VAPT complete; no open P0/P1 security findings.
- [ ] <2s standard-operation performance validated at realistic volume.
- [ ] Every UI verified in Light + Dark and under a non-default tenant's branding.
- [ ] Compliance Source Register: rows relevant to the target segment verified against primary sources (or explicitly flagged as blocking); nothing marketed as a mandate while Pending Verification.
- [ ] Data-lifecycle state machine (incl. retention-lock) enforced, not just documented.
- [ ] Every app/package has current KNOWLEDGE.md + append-only DONE.md; DECISIONS.md up to date; root CLAUDE.md indexes all.
- [ ] Staging demo of the full journey by a non-developer.

---
*Development Plan — v1.0 — Takoriya Technology LLP — August 2026. Execution layer over the Nirogix documentation set (PRD, Architecture, Phases, Rules, Memory). Subordinate to those documents on any conflict.*
