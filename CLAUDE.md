# CLAUDE.md — HMS Monorepo Index

Root guide for humans and AI agents working in this repository. **Read this first**, then the relevant app/package `KNOWLEDGE.md`, then its `DONE.md`, then the source.

> This is an enterprise Hospital Management System (multi-tenant SaaS) for Takoriya Technology LLP. The authoritative product/architecture/rules live in `resources/`. This file indexes the codebase and the conventions every change must follow.

## Source-of-truth documents (read before changing anything significant)

| Doc | Purpose |
|---|---|
| `resources/projectrequirementdoc.md` | Functional scope — modules, capabilities, acceptance |
| `resources/architecture.md` | Technical architecture — the design every rule derives from |
| `resources/phases.md` | Build sequencing — Phase 0, MVP 0/1, Phases 2–4 |
| `resources/rules.md` | Engineering rules & standards (binding) |
| `resources/memory.md` | Distilled invariants & decisions; open items |
| `resources/development-plan.md` | The primary engineering execution roadmap |
| `DECISIONS.md` | Numbered ADRs (why) — append-only |

On any conflict, the four upstream docs (architecture/PRD/phases/rules) win over the development plan, and the development plan wins over ad-hoc code comments.

## Monorepo layout (ADR-013 — kept folder names)

```
hms_backend/            Node.js + Express + TypeScript API
hms_frontend/           Next.js HMS Portal (all role dashboards, role-based route guards)
marketing/              Next.js public marketing/SEO site
packages/types          @hms/types — shared TS types & API contracts (backend + portal)
packages/ui             @hms/ui — design tokens (Light default + Dark), primitives, Standard DataTable
packages/config         @hms/config — shared tsconfig/lint/build config
packages/utils          @hms/utils — shared framework-agnostic utilities
packages/permissions    @hms/permissions — dot-hierarchy permission keys (shared FE/BE)
resources/              Product/architecture/rules/plan docs (source of truth)
```

Tooling: **npm workspaces + Turborepo** (ADR-014). Root scripts: `npm run install:all | dev | build | lint | test | typecheck | format` (turbo-driven). Node ≥20, npm ≥10.

## Tech stack

- **Backend:** Node.js + Express + TypeScript; versioned REST under `/api/v1`; Zod validation; OpenAPI/Swagger from route definitions.
- **DB:** PostgreSQL (system of record) via **Drizzle ORM** (ADR-012); Redis for cache + BullMQ job queue.
- **Frontend:** Next.js (App Router) + TypeScript for both Portal and Marketing.
- **Infra:** E2E Networks (India-resident), managed PostgreSQL, E2E Object Storage, Cloudflare edge; Nginx + PM2; GitHub Actions CI/CD.

## Non-negotiable invariants (see `resources/memory.md`)

1. **Tenant isolation** via PostgreSQL RLS. Tenant A must never access Tenant B's data — tested on every module. Tenant context comes only from the authenticated session, never client input.
2. **Frontend visibility is never security.** Every protected endpoint independently re-checks, in order: `authenticated → tenant entitled to module → user permitted the action → business logic`.
3. **Explicit DENY always overrides GRANT**, at every level.
4. **Permission cache** never outlives the earliest `valid_until` among its temporary overrides; `revoked_at` triggers immediate targeted invalidation (ADR-010).
5. **Core clinical entities stay strongly typed** — no EAV. Specialty variation uses configurable form templates.
6. **Entitlement, permission-override, and audit records are never physically deleted.**
7. **Modular monolith** — no microservices/K8s/broker without a new ADR. Cross-module calls go through domain events or defined service interfaces.
8. **Financial Transaction Infrastructure** is the only place invoice/payment/tax/receipt/ledger primitives live; billing modules consume it.

## Conventions

- **API:** one consistent error shape `{ error: { code, message, details? } }`; every request Zod-validated; idempotency keys on payments/invoices/bookings/notifications/external calls; `/api/v1` versioned.
- **API docs (mandatory):** every `/api/v1` route is documented in OpenAPI, generated from Zod via `zod-to-openapi` in `hms_backend/src/openapi/` — never hand-written. Swagger UI at `/api/v1/docs`, spec at `/api/v1/openapi.json`; server URLs come from config, never hard-coded. `npm run openapi:validate` gates undocumented/invalid APIs in CI. Docs ship in the same change as the endpoint. See `resources/rules.md` → API Documentation Rules.
- **DB:** every tenant-scoped table has `tenant_id` + an RLS policy; nullable `branch_id` (NULL = org-wide); migrations additive & reversible; optimistic locking on concurrently-edited records.
- **Authorization:** permission keys are dot-hierarchy (`module.submodule.page.action`) declared in `@hms/permissions`; routes gated by `requireModule()` then `requirePermission()`.
- **UI:** no component hardcodes color/spacing/radius/typography — use `@hms/ui` tokens; all tabular data uses the shared DataTable; verified in Light + Dark and under a non-default tenant's branding before "done".
- **Providers:** external SDKs only behind `SmsService`/`EmailService`/`FileStorageService`.
- **Secrets:** never committed; `.env.example` documents required keys per app.

## Documentation rules

- Every app/package keeps `KNOWLEDGE.md` (current state) + `DONE.md` (append-only log). A feature is not done until both are updated.
- Architecturally significant decisions go to `DECISIONS.md` as a numbered ADR (append-only).
- Commits/PRs reference the milestone/module they implement.

## Where things stand

Phase 0 (Platform Foundation) in progress on branch `feat/phase-0-platform-foundation`. See `resources/development-plan.md` §20 for the Stage 0 exit criteria and the task list for live status.
