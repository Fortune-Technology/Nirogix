# CLAUDE.md — Nirogix Monorepo Index

Root guide for humans and AI agents working in this repository. **Read this first**, then the relevant app/package `KNOWLEDGE.md`, then its `DONE.md`, then the source.

> **Nirogix** is an enterprise Hospital Management System (multi-tenant SaaS) by Takoriya Technology LLP, at `nirogix.com`. The authoritative product/architecture/rules live in `resources/`. This file indexes the codebase and the conventions every change must follow.

> **Naming (ADR-041).** The product is **Nirogix** in every user-visible string, document, and configuration. Internal identifiers keep their `hms` prefix on purpose — the `hms_backend/` and `hms_frontend/` directories, the `@hms/*` package scope, the `--hms-*` tokens, and the `.hms-*` class names. Do not rename them opportunistically. The frontends added in ADR-051 are named for their audience (`admin/`, `patient/`, `aiportal/`) and carry no prefix. In marketing copy, "HMS" appears only as the industry search term for *hospital management system*, never as the product's name.

## Source-of-truth documents (read before changing anything significant)

| Doc | Purpose |
|---|---|
| `resources/projectrequirementdoc.md` | Functional scope — modules, capabilities, acceptance |
| `resources/user-journeys.md` | End-to-end user flow & hierarchy — who does what first (Platform Owner → Org → Admin → Staff → Patients); every module serves a journey step |
| `resources/architecture.md` | Technical architecture — the design every rule derives from |
| `resources/phases.md` | Build sequencing — Phase 0, MVP 0/1, Phases 2–4 |
| `resources/rules.md` | Engineering rules & standards (binding) |
| `resources/memory.md` | Distilled invariants & decisions; open items |
| `resources/development-plan.md` | The primary engineering execution roadmap |
| `resources/DESIGN.md` | **Design system** — canonical visual language (colour/type/components/theming/icons) for marketing + Portal |
| `resources/domains.md` | **Host map** — every production / staging / local URL for all five frontends and the API, what deliberately has no subdomain, and the per-environment variable matrix (ADR-042, ADR-051). No host is ever hard-coded elsewhere. |
| `DECISIONS.md` | Numbered ADRs (why) — append-only |
| `testcases.md` | **The manual QA checklist for the whole platform** — every feature's test cases, by module. Updated in the same change as the feature, never at the end. |
| `SECURITY-AUDIT.md` | **Production security review** - findings by severity with status, plus the production configuration checklist. Re-run before each release; update it in the change that fixes a finding. |
| `resources/marketing-product-capability-reference.html` | **The marketing team's single source of truth** — every module, capability, role and permission with a status (BUILT / IN DEVELOPMENT / PLANNED / FUTURE / NOT AVAILABLE), plus per-feature marketing guidance and the never-claim list. Binding: see *Marketing Product Capability Documentation Rule* below. |
| `BACKLOG.md` | **Every open item in one place** — what needs a decision from the owner, what is blocked on infrastructure, engineering follow-ups, and what is deferred on purpose. Add an item the moment work is blocked, skipped, or deferred; remove it only when done or explicitly dropped. |

On any conflict, the four upstream docs (architecture/PRD/phases/rules) win over the development plan, and the development plan wins over ad-hoc code comments.

## Monorepo layout (ADR-013 — kept folder names)

**Five frontends, one backend (ADR-051).** Each frontend serves one audience and owns nothing but rendering; the backend is the single source of truth for authentication, authorization, tenant resolution, permissions, business logic and audit. A frontend guard is UX, never security.

```
hms_backend/            Node.js + Express + TypeScript API — the only place any boundary is enforced
hms_frontend/           Next.js Nirogix Portal — hospital staff only (:3000 → portal.nirogix.com)
marketing/              Next.js public marketing/SEO site (:3001 → nirogix.com)
admin/                  Next.js platform administration — vendor operators (:3002 → admin.nirogix.com)
patient/                Next.js patient portal — verified patients (:3003 → patient.nirogix.com)
aiportal/               Next.js AI Portal — authorised staff + operators (:3004 → nirogix.ai)
packages/types          @hms/types — shared TS types & API contracts (backend + every frontend)
packages/client         @hms/client — shared frontend foundation: HTTP core, session context, guards (ADR-054)
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
- **UI:** follow `resources/DESIGN.md` (the canonical design system — deep-teal signature, cool-neutral surfaces, Lucide icons). No component hardcodes color/spacing/radius/typography — use `@hms/ui` tokens; all tabular data uses the shared DataTable; verified in Light + Dark and under a non-default tenant's branding before "done".
- **shadcn/ui (binding — ADR-028):** installed in both frontends as a **CLI + reference layer only**; `@hms/ui` stays the canonical kit. `shadcn add` output lands in `hms_frontend/components/ui/` and `marketing/components/shadcn/`, and must be restyled onto `--hms-*` / `--mk-*` and checked in both themes before it ships. Both apps map shadcn's semantic variables onto the design tokens and drive `dark:` from `data-theme`, so generated components are on-brand by default. The `shadcn` agent skill lives in `.agents/skills/`.
- **Reusable UI (binding — ADR-029):** build once, configure everywhere. Every tabular view uses the **Standard DataTable** from `@hms/ui` (TanStack core, shadcn pattern) with a per-module column/filter configuration — never a module-specific table, toolbar, pagination, column-visibility, filter, action menu, or state component. Destructive actions use `ConfirmDialog`, and blank/failed/pending views the shared `EmptyState` / `ErrorState` / `Skeleton`. Check `@hms/ui` before building any UI; a pattern that appears twice gets extracted.
- **Action column (binding — ADR-039):** every table with row-level operations builds its Action column from `@hms/ui` — `actionsColumn()` + `TableActions` holding at most three inline actions (`ViewAction` / `EditAction` / `DeleteAction` / `ToggleAction`, or `TableAction` for a context-specific one) with `MoreActions` for the overflow. The components own icons, sizing, states, tooltips, accessible names, confirmation, and permission gating; a page supplies intent only. An action the user is not permitted is not rendered, and nothing destructive happens without the shared confirmation.
- **Branding (binding — ADR-040):** branding comes from the theme, never from a component. Only `--hms-brand` is ever set — hover, pressed, subtle, and the focus ring derive from it — and an app consuming `@hms/ui` maps those tokens onto its own scope once in its global stylesheet (marketing points `--hms-*` at `--mk-*`). No colour literal in a component, and every interactive state is verified branded in Light + Dark under a non-default accent.
- **Marketing claims (binding — ADR-038):** the marketing site never advertises, implies, or depicts a capability that is not in approved scope, and never presents planned work as available. Every claim traces to the PRD / architecture / development plan / a defined phase / shipped code; module and integration status lives in `marketing/lib/availability.ts` and moves to `built` in the same change that ships the feature. Imagery is not decoration — no image without a stated communication benefit, no stock or generic healthcare photography, nothing implying an unsupported capability.
- **Testing (binding):** every feature ships as *implement → automated tests → manual cases in `testcases.md` → verify → complete*. Automated coverage at the level the change deserves (unit / component / API / e2e for critical workflows); a feature is not complete while a known test fails unless the acceptance is written in `BACKLOG.md`. Manual cases and automated tests are both required — neither substitutes for the other.
- **Mobile navigation (binding — ADR-033):** below the breakpoint both apps present an app shell — a fixed bottom bar with ≤5 primary destinations (permission-filtered in the Portal) plus a top-right hamburger opening the shared slide-out drawer (scroll-locked, focus-trapped, Esc/backdrop/navigation closes it). Desktop keeps its own navigation; the bar never renders there. Built from `BottomNav` / `NavDrawer` in `@hms/ui`.
- **Specializations (binding — ADR-034):** the marketing specialty experience is one reusable system (`lib/specialties.ts` + `components/specialties/`), not a page design per specialty. A dedicated `/specialties/[slug]` page exists only where there is genuinely differentiated content; everything else stays on the index. Always framed as "configured differently", never "we have a module for your specialty".
- **Language:** natural, professional English. Never hyphenate words that are not a real compound (*Hospital Management System*, not *Hospital-Management-System*); legitimate compounds (`multi-tenant`, `check-in`, `follow-up`, `India-resident`), URLs, slugs and identifiers keep their hyphens.
- **Dates & times (binding — ADR-030, ADR-046):** every user-facing date is `DD/MM/YYYY`, every time `hh:mm AM/PM`, and together `DD/MM/YYYY, hh:mm AM/PM` — formatted only through `@hms/utils` and rendered through `DateDisplay` / `TimeDisplay` / `DateTimeDisplay` in `@hms/ui`. Transport stays ISO-8601. No `toLocaleDateString()`, no per-component formatting, no date library. Chart axes are the only abbreviated form, and they use `formatMonthLabel` / `formatDayLabel` from the same place.
- **Date & time entry (binding — ADR-048):** every date or time field is `DateField` / `TimeField` / `DateTimeField` from `@hms/ui` — shadcn's Base UI date picker promoted into the kit and restyled onto the tokens. Never a native `<input type="date">`, `type="time"` or `type="datetime-local"`: they render in the browser's locale. Display in `DD/MM/YYYY` and `hh:mm AM/PM`, value in ISO.
- **Printing (binding — ADR-047):** print prints the *document*, never the application. A printable document is its own route under `app/(print)/` with no shell, built from the `@hms/ui` document kit (`PrintDocument` + sections/tables/totals/signatures/notes), carrying the tenant's own branding (platform default when unconfigured), the same permission as the screen, and the same RLS-scoped data. Never `window.print()` on an app page.
- **Public endpoints (binding — ADR-056):** the product has **one** unauthenticated write path (patient self-registration) and must not casually gain a second. Any endpoint reachable without a session resolves the tenant **server-side from an opaque token in the path** — never from a body, header, query parameter or subdomain — never writes to a clinical table, returns the **same** status and message for unknown / retired / disabled so it cannot enumerate tenants, is rate-limited at the sign-in tier, and is audited against the tenant with no actor. A public submission creates a record for a human to review; a patient, order or invoice is created only by an authenticated, permitted user.
- **API feedback (binding — ADR-026, ADR-057):** every state-changing or failing API call raises a notification through the **one** shared `@hms/ui` toast, driven from the shared API client — never per-page toast code, never a silent failure. Show the backend's own `message` when it provides one; generic copy only as a fallback. Never render a stack trace, backend internal, or PHI.
- **Notifications (binding — ADR-057):** the toast system is **React Toastify**, wrapped by `@hms/ui`'s `toast.success | error | warning | info | loading`. `react-toastify` is imported **only inside `@hms/ui`** (the adapter `src/toast.tsx` and the viewport `src/components/Toaster.tsx`); no page-specific toast implementation and no second toast library without an ADR. Toasts appear **top-right**, below the app bar, on every app and breakpoint, and take their colour only from the `--hms-*` tokens — so they follow Light/Dark and the active tenant's branding automatically. Never pass a colour to a toast. Status is never signalled by colour alone: every variant carries an icon *and* a word. A page that already handles a failure inline opts out with `feedback: false` rather than raising a second toast for the same event.
- **SEO/AEO/GEO (binding — ADR-027):** all product SEO lives in `marketing/` — unique per-page title/description, canonical, one `<h1>`, semantic HTML, OG/social metadata, honest JSON-LD, sitemap + robots, descriptive URLs, keywords mapped to matching page intent (never stuffed). `hms_frontend/` is `noindex, nofollow` end to end; no patient/tenant/staff data in metadata, URLs, OG images, or sitemaps.
- **Frontend performance:** `next/image` (correct `sizes`, `priority` only for the real LCP image), `next/font`, `next/script` for third-party, the Next Metadata API, `next/dynamic` for heavy non-critical UI; budgets LCP ≤2.5s / INP ≤200ms / CLS ≤0.1. Audit every new dependency; no second UI library. Never send PHI or tenant-identifying data to analytics.
- **Frontend delivery workflow:** Requirements → UX → SEO (where applicable) → Accessibility → Next.js optimization → API feedback → Performance → Code cleanup. All of it is Definition of Done.
- **Frontend behaviour (binding — `resources/DESIGN.md` §9):** routes open scrolled to top; smooth scrolling via Lenis (shared `SmoothScroll`); overlays lock the background with `useScrollLock` + `data-lenis-prevent`; use the shared `BackToTop`; the marketing navbar includes About + Contact; marketing (`--mk-*`) and Portal (`--hms-*`) branding are **independent** token scopes.
- **Clean code (binding):** **if it is not used, it does not stay** — delete orphaned files, imports, exports, components, CSS, tokens, assets, empty directories, and any dependency nothing imports, in the *same* change that orphans them. Replacing something is *migrate → verify → delete*, never two systems side by side. Regenerable scaffolding goes too; git history is the archive. Grep before deleting, typecheck + build after — that is the proof it was dead. This is a Definition-of-Done gate, not a later chore.
- **Providers:** external SDKs only behind `SmsService`/`EmailService`/`FileStorageService`.
- **Secrets:** never committed; `.env.example` documents required keys per app.

## Marketing Product Capability Documentation Rule (binding)

`resources/marketing-product-capability-reference.html` is the **single source of truth for marketing-facing product capabilities**.

Whenever any code, feature, permission, role, module, workflow, integration, UI capability, security capability, branding capability, or roadmap item changes, review whether the marketing capability reference needs updating. **If the change affects a documented capability, update the HTML document in the same development task** — never as a later chore.

- No feature may be marked `BUILT / AVAILABLE` unless it is actually implemented and usable. A screen that exists but is not wired, an API with no interface, or a capability behind a stub is **not** BUILT — say what is true (e.g. "API only, no Portal screen").
- `IN DEVELOPMENT`, `PLANNED`, and `FUTURE / CONSIDERATION` features must never be represented as currently available product functionality.
- Marketing copy must never claim functionality that cannot be traced to the approved product documentation or to implemented product behaviour.
- The capability reference must stay synchronized with the current implementation and the approved roadmap, and must stay consistent with `marketing/lib/availability.ts` + `marketing/lib/site.ts` (ADR-038), `resources/phases.md`, `BACKLOG.md` and `SECURITY-AUDIT.md`.
- Any material update also bumps the document **version**, the **last updated** date (`DD/MM/YYYY`), and appends a **change history** row.

**Golden rule.** If the product cannot currently do it, marketing must not sell it as if it can. If development changes what the product can do, the capability document changes in the same development task.

## Documentation rules

- Every app/package keeps `KNOWLEDGE.md` (current state) + `DONE.md` (append-only log). A feature is not done until both are updated.
- Architecturally significant decisions go to `DECISIONS.md` as a numbered ADR (append-only).
- Commits/PRs reference the milestone/module they implement.

## Where things stand

**Phase 0 (Platform Foundation) — code-complete** on branch `feat/phase-0-platform-foundation`. All Platform Core built and verified locally: tenancy + RLS, auth (JWT access + refresh), RBAC with overrides, module entitlements, audit log, notifications (MSG91 behind an abstraction), file storage (Cloudflare R2/local), domain events + BullMQ jobs, FHIR provider/specialty core, mandatory OpenAPI, the Next 16 Portal (auth + RBAC-driven shell + `@hms/ui` design system + Standard DataTable), the marketing scaffold, and the ops baseline (seed with 2 Indian-context tenants, structured logging + error tracking, versioned deploy/CI-CD/backup config). Every app and package has `KNOWLEDGE.md` + `DONE.md`; `DECISIONS.md` holds ADR-001…ADR-019.

**Stage 0 exit criteria** (see `resources/development-plan.md` §20): met and locally verified — role login → dashboard, 401/403, tenant-isolation test, audit-on-login, OpenAPI/auth docs, entitlement 403 + hidden UI, grant/deny override enforced + audited, shared component in both themes + second-tenant branding. **Blocked on real infrastructure only** (not code): a real notification send in *staging* (needs the staging VM + MSG91 DLT registration, 24–48h external), and the *auto-deploy-to-staging* half of CI/CD (workflow authored, needs the VM). These are validated at staging bring-up / Stage 3.

**Next planned milestone — Platform Administration Surface** (`resources/development-plan.md` §20A; ADR-020, ADR-021): exposes the existing tenancy/RBAC/entitlement/branding-token *mechanisms* through operator + admin **screens** — Super-Admin **tenant onboarding** (create tenant → modules → first org_admin → branches; operator-driven, *not* public self-registration), Org-Admin **user/role/branch management**, and a real **branding admin** (colour picker + logo/favicon upload, persisted per-tenant, replacing the current localStorage preset demo). Self-serve signup + payment-integrated plans stay deferred to the Enterprise/Scale track (§25).
