# Rules & Engineering Standards

**Document:** `rules.md`  
**Version:** 1.0  
**Last Updated:** August 2026  
**Prepared for:** Takoriya Technology LLP  
**Source of Truth:** Enterprise HMS — Architecture and Development Roadmap v2.1, plus two corrections identified in subsequent review (permission-cache expiry bound; break-glass notification/review boundary).

---

This document states rules only. For the architecture each rule is derived from, see **Architecture Document**. For when each rule applies during the build, see **Development Phases & Roadmap**.

---

## Contents

- **Engineering Standards**
  - [Design System & UI Consistency](#design-system--ui-consistency)
  - [Standard DataTable](#standard-datatable)
  - [Light & Dark Theme](#light--dark-theme)
  - [Branding & Multi-Tenant Customization](#branding--multi-tenant-customization)
- **Development Rules**
  - [Architecture Rules](#architecture-rules)
  - [Authorization Rules](#authorization-rules)
  - [Tenancy Rules](#tenancy-rules)
  - [Database Rules](#database-rules)
  - [API Rules](#api-rules)
  - [UI / UX Rules](#ui--ux-rules)
  - [Security Rules](#security-rules)
  - [Audit Rules](#audit-rules)
  - [Testing Rules](#testing-rules)
  - [Documentation Rules](#documentation-rules)
  - [Dependency Rules](#dependency-rules)
  - [Git Rules](#git-rules)
  - [Prohibited Patterns](#prohibited-patterns)
- **Documentation System**
  - [Documentation & AI-Agent Knowledge System](#documentation--ai-agent-knowledge-system)
  - [Architecture Decision Records (DECISIONS.md)](#architecture-decision-records-decisionsmd)

---

## Engineering Standards

### Design System & UI Consistency

### Design System & UI Consistency

- One shared design-token set — font family, sizes, weights, line-height, spacing, radius, colors, shadows — defined once in packages/ui and consumed everywhere; no component hardcodes a raw value
- One canonical implementation per UI pattern — buttons, forms, tables, cards, modals, dropdowns, alerts, empty/loading/error states — built once and reused; a module needing a variant extends or configures the shared component, never forks it
- Before building any new UI pattern: check packages/ui first. If the capability is missing, extend the shared component rather than building a module-local one

### Standard DataTable

### Standard DataTable Component

- One reusable DataTable in packages/ui covering pagination, rows-per-page, single/multi-column sorting, search, filtering, column visibility, row selection, and loading/empty/error states
- Server-side pagination/sorting/filtering as a mode for large datasets (patient lists, MIS reports); client-side for small ones
- Modules supply only data and column configuration — no module implements its own table, pagination, or sorting logic
- Missing DataTable functionality is added to the shared component, never worked around locally

### Light & Dark Theme

### Light & Dark Theme Support

- Centralized theme tokens for background, text, border, primary/secondary, status, card, input, table, modal, hover, focus, and disabled states — no component reads a hardcoded color
- Light is the default theme; switching to Dark is available from the Portal UI
- Every component is verified in both themes before being considered complete — a component that's unreadable in Dark mode is a defect, not a follow-up task

### Branding & Multi-Tenant Customization

### Branding & Multi-Tenant Customization

- Brand colors, logos, and typography are tenant-configurable values consumed from the centralized branding system, never hardcoded into a component
- A new UI component works correctly for any tenant's branding without a module-specific redesign — this is what makes the tenant-level branding requirement in §4 hold at the component level, not just the page level

## Development Rules

### Architecture Rules

- All module code deploys as a single modular-monolith application. Do not introduce microservices, Kubernetes, or a service mesh without an explicit decision recorded in DECISIONS.md.
- Every module's routes are gated by a `requireModule()` check, evaluated before any permission check.
- Business modules do not directly depend on another module's internals. Cross-module interaction goes through Domain Events or a defined service interface, never a direct import of another module's internal code.
- Financial Transaction Infrastructure (Platform Core) is the only place invoice/payment/tax/receipt/ledger primitives are implemented. Billing & Payments and any other billing-capable module consume it; none reimplement it.
- New specialties are added via the configurable specialty form-template mechanism. The core Patient/Provider/Encounter schema is never modified to accommodate a single specialty.

### Authorization Rules

- Every protected backend endpoint independently validates, in order: Authenticated → Tenant entitled to module → User permitted the action → Business logic. Frontend visibility is never treated as security.
- A route or action's required permission key is declared explicitly in code, never inferred from context.
- Explicit DENY always overrides GRANT, at both the role-permission and user-override level.
- Temporary permission overrides include `valid_from`/`valid_until`; permanent overrides have `valid_until = NULL`.
- Permission cache TTL must never exceed the earliest `valid_until` among the temporary overrides it contains. Setting `revoked_at` triggers immediate, targeted cache invalidation — never a wait for natural expiry. (See Architecture Document, RBAC & User-Level Overrides.)
- Break-glass access, when implemented, never modifies a user's permanent role, and post-event review never modifies RBAC as a side effect of the review itself.
- No module implements its own authorization check outside the shared requireAuth → requireModule → requirePermission chain.

### Tenancy Rules

- Every table holding tenant-scoped data has a `tenant_id` column and a PostgreSQL Row-Level Security policy. No new table ships without one.
- The tenant context is set server-side from the authenticated session. Never trust a `tenant_id` supplied by the client.
- Every module's automated test suite includes a tenant-isolation test proving Tenant A cannot read Tenant B's data.
- Branch-scoping uses a nullable `branch_id` (NULL = organization-wide). Do not introduce a second, parallel branch-scoping mechanism.

### Database Rules

- Migrations are additive and reversible. No destructive schema change ships without an explicit data-migration plan.
- Optimistic locking/versioning is required on any record multiple users may edit concurrently — clinical notes, prescriptions, inventory counts, billing line items, admission records.
- Entitlement and permission-override records are never physically deleted. State changes (revoked, expired, cancelled, deactivated) are represented as data, not row removal.
- No EAV (entity-attribute-value) modeling for core clinical entities — Patient, Provider, Encounter, Diagnosis, Prescription, Invoice stay strongly typed. Only genuinely specialty-varying fields use the configurable form-template mechanism.

### API Rules

- All endpoints are versioned under `/api/v1`. Breaking changes require a new version, not an in-place change.
- Every request is validated (Zod or equivalent) before it reaches business logic.
- Payments, invoices, appointment bookings, notifications, and external integration calls are idempotent via an idempotency key.
- API error responses use one consistent shape across every module.
- OpenAPI/Swagger documentation is generated from route definitions, not hand-maintained separately, and is part of the Definition of Done for every endpoint (see API Documentation Rules).

### API Documentation Rules

OpenAPI/Swagger documentation is part of backend implementation — not an optional or final-stage task — and is **mandatory for the entire HMS lifecycle**, from the first endpoint to the final production release.

- **No undocumented production API.** Every backend route under `/api/v1` has a corresponding OpenAPI operation before the change is complete. Automated coverage (`npm run openapi:validate`) fails the build on any undocumented route.
- **Docs change with the code, in the same change.** New route → add its operation; controller/request DTO/response DTO changed → update the corresponding schema; authentication changed → update `security`; permission changed → update the authorization note; endpoint deprecated → mark `deprecated`; endpoint removed → remove its operation; API version changed → document it under the new version.
- **Single source of truth.** The spec is generated from route/schema definitions (Zod + zod-to-openapi), never hand-written in a separate file. The same Zod schema powers both request validation and documentation.
- **Environment-aware, never hard-coded.** Server URL, environment name, and auth configuration come from configuration per environment (Local / Testing-Staging / Production). The running instance advertises its own server from config; additional environment servers are surfaced only when their env vars are set.
- **Every documented operation includes, where applicable:** HTTP method, path, summary/description, module tag, authentication requirement + required roles/permissions, path/query/header parameters, request body + validation rules, success and error response schemas with HTTP status codes, pagination/filter/sort/search parameters, and at least one example.
- **Versioning is explicit.** Versions are distinguishable (`/api/v1`, `/api/v2`); incompatible versions are never merged into a single undocumented contract.
- **Accessible in development.** Swagger UI at `/api/v1/docs` and the raw spec at `/api/v1/openapi.json`. The JSON spec is always served; the interactive UI is toggled per environment via `OPENAPI_UI_ENABLED`.
- **Validated automatically.** `npm run openapi:validate` checks spec validity (schemas, `$ref`s, parameters), duplicate operationIds, missing responses, missing tags, and missing security definitions, plus route coverage. CI runs it on every push/PR; a production deploy never publishes an invalid specification.

### UI / UX Rules

- All tabular data uses the shared DataTable component (packages/ui). No module implements its own pagination, sorting, or filtering.
- No component hardcodes a color, spacing, radius, or typography value outside the shared design tokens.
- Every component renders correctly in both Light and Dark themes, and under a non-default tenant's branding, before being considered complete.
- Unauthorized sidebar items, tabs, buttons, and routes are hidden client-side, and a manually entered unauthorized URL renders a 403/forbidden state — never a blank screen or silent redirect.

### Security Rules

- Encryption in transit and at rest is mandatory for all PHI-bearing data.
- File uploads are validated server-side for type and size before acceptance, regardless of client-side validation.
- PHI-bearing files use default-private storage with short-lived signed URLs. Nothing is served as a permanent public object URL.
- MFA and SSO hooks exist in the authentication layer from Phase 0, even where not enforced for every tenant at MVP.

### Audit Rules

- Every mutating action, permission grant/deny, and entitlement change produces an audit-log entry.
- Audit-log entries are immutable and are never deleted, including when the record they reference is later deleted or anonymized.
- Break-glass access, when implemented, produces an enhanced-severity audit event distinct from routine access logging.

### Testing Rules

- A milestone is not complete until its full automated regression suite passes — not just its own new tests.
- Every milestone's Definition of Done includes explicit entitlement, RBAC, override, and temporary-permission checks in both directions (access works / access denied). See Development Phases & Roadmap.
- Direct URL access to an unauthorized route is tested explicitly, never assumed safe because navigation is hidden.

### Documentation Rules

- Every app and package maintains KNOWLEDGE.md (current state) and DONE.md (append-only implementation log). A feature is not done until both are updated.
- Architecturally significant decisions are recorded in DECISIONS.md as a numbered ADR. DECISIONS.md is appended to, never rewritten.
- A root CLAUDE.md indexes the whole monorepo and links to every app/package's own KNOWLEDGE.md and DONE.md.

### Dependency Rules

- A business module's hard dependencies (Module Capability Matrix, Project Requirements Document) are enforced by the entitlement engine at activation time. The system refuses to activate a module whose hard dependency is not already entitled.
- New third-party dependencies sit behind a provider abstraction (SmsService, EmailService, FileStorageService). Module code never makes a direct SDK call to an external vendor.

### Git Rules

- One feature branch per module/milestone, merged to a staging branch that auto-deploys to the staging environment.
- CI runs lint, tests, and build on every push. A push that fails CI does not merge.
- Commit messages and pull requests reference the milestone/module they implement, so DONE.md entries stay traceable back to source control.

### Prohibited Patterns

- Do not check authorization in the frontend only.
- Do not create a module-specific table/pagination/sorting implementation when the shared DataTable exists.
- Do not hardcode brand colors, logos, or theme values in a component.
- Do not build a new authorization/permission engine for a specific feature (temporary access, break-glass, or otherwise) instead of extending the existing one.
- Do not physically delete entitlement, permission-override, or audit records.
- Do not merge or deploy a backend API route without synchronized, valid OpenAPI/Swagger documentation (enforced by `npm run openapi:validate` in CI).
- Do not silently convert a "Pending verification" regulatory assumption into a stated compliance requirement.
- Do not introduce Kubernetes, Kafka, a service mesh, or multi-region deployment without an explicit, documented Phase 2+ decision.

## Documentation System

### Documentation & AI-Agent Knowledge System

### Documentation & AI-Agent Knowledge System

- Every major app and package maintains two living documents: **KNOWLEDGE.md** — current state (purpose, architecture, key files, components, services, APIs, database models, business rules, permissions, dependencies, integration points, known constraints, troubleshooting notes) — and **DONE.md** — an append-only chronological implementation log (date/time, feature, what was implemented, API/DB/frontend/integration changes, testing status, decisions, known limitations)
- One root CLAUDE.md indexes the whole monorepo — architecture, stack, coding/UI/theming/branding conventions, auth/RBAC/entitlement architecture, API and database conventions, testing and deployment conventions — and links to every app and package's own KNOWLEDGE.md and DONE.md
- Reading order for both human and AI-assisted development: root CLAUDE.md → the relevant module's KNOWLEDGE.md → DONE.md for historical context → source code — so architecture and past decisions are never rediscovered from scratch
- KNOWLEDGE.md is updated whenever a module's architecture or behavior changes; DONE.md is appended, never rewritten, whenever a feature is completed

> **Definition of Done, extended:** Documentation is not a follow-up task. On top of every milestone's own testing criteria (see "How This Roadmap Works"), a feature is not complete until KNOWLEDGE.md reflects it, DONE.md records it, and it has been verified in both themes and under a non-default tenant's branding.

### Architecture Decision Records (DECISIONS.md)

A fourth documentation file, alongside CLAUDE.md, KNOWLEDGE.md, and DONE.md — recording *why*, not *what* or *when*.

- **CLAUDE.md** — what the AI/developer must follow (conventions, standards)
- **KNOWLEDGE.md** — how the system currently works
- **DONE.md** — what was completed and when (append-only log)
- **DECISIONS.md** — why an important architectural decision was made, as a numbered Architecture Decision Record (ADR) per entry

Seed entries for this platform's own foundational decisions:

- ADR-001 — Modular monolith over microservices for MVP
- ADR-002 — PostgreSQL with Row-Level Security for multi-tenancy, over database-per-tenant
- ADR-003 — RBAC with user-level overrides, over pure role-based or full ABAC
- ADR-004 — Module entitlements as a runtime check, not a deployment decision
- ADR-005 — E2E Networks as primary hosting provider
- ADR-006 — India-resident object storage as the default for PHI (pending formal legal verification, see File Storage Architecture, Part VI)
- ADR-007 — Provider abstraction (SmsService/EmailService/FileStorageService) over direct SDK dependencies
- ADR-008 — FHIR-aligned Provider/PractitionerRole model for specialty-agnostic core
- ADR-009 — Vertical-slice, module-by-module MVP delivery order over horizontal layer-by-layer delivery

New architectural decisions of similar weight are appended here as they are made, with the same rigor as DONE.md is append-only for implementation history.

---
*Rules & Engineering Standards — v1.0 — Takoriya Technology LLP — August 2026*