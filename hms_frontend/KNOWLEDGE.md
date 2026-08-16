# hms_frontend — KNOWLEDGE.md

Current state of the Nirogix Portal (staff-facing web app). Read after root `CLAUDE.md` and `hms_frontend/AGENTS.md`. See `DONE.md` for the chronological log.

> ⚠ **This is Next.js 16 (App Router, Turbopack, React 19).** APIs differ from older Next. `AGENTS.md` points at the version-matched docs bundled in `node_modules/next/dist/docs/` — read them before writing routing/rendering code.

## Purpose

The single web portal for all hospital staff roles. One RBAC-driven shell renders every role's workspace; the visible menu and pages derive from the signed-in user's **effective permissions**, but visibility is never security — every backend endpoint independently re-checks `auth → module → permission → business logic` (invariant #2).

## Stack

- **Next.js 16** (App Router, Turbopack default) + **React 19** + TypeScript
- **Tailwind v4** (`@import "tailwindcss"` + `@tailwindcss/postcss`) for layout utilities
- **@hms/ui** design system (tokens + primitives + Standard DataTable) — the source of every colour/spacing/radius/type value
- **@hms/permissions** (shared with the backend) for permission keys; **@hms/types** for API contracts
- No data-fetching library yet — a small typed `fetch` client (`lib/api.ts`). Server state lives in React context.

## Layout

```
app/
  layout.tsx            Root: fonts, @hms/ui styles, no-flash theme script, <Providers>
  providers.tsx         Client: <ThemeProvider><AuthProvider> composition
  globals.css           Tailwind + maps --hms-* tokens into Tailwind @theme (bg-surface, text-fg, …)
  page.tsx              "/" → redirect to /dashboard
  forbidden/page.tsx    Standalone 403 route
  (auth)/               Public route group (no shell)
    layout.tsx          Centered card shell
    login/page.tsx      Org-code + email + password sign-in
  (app)/                Authenticated route group
    layout.tsx          CLIENT GUARD: redirects to /login unless authenticated; renders <AppShell>
    dashboard/page.tsx  Role-aware roll-up — platform stats (super-admin) or org summary (others)
    providers/page.tsx  Provider directory — Standard DataTable + live API (guarded by providers.view)
    audit/page.tsx      Audit log — paginated DataTable (guarded by audit.log.view)
    settings/page.tsx   Theme + tenant-branding demonstration
lib/
  api.ts                Typed fetch client: Bearer + silent refresh-on-401 + canonical error unwrap
  auth.tsx              AuthProvider + useAuth + useCan — session & capabilities context
  theme.tsx             ThemeProvider + useTheme — Light/Dark + per-tenant brand override
  nav.ts                Primary nav items, each tagged with its required permission key
components/
  AppShell.tsx          Sidebar (permission-filtered) + topbar (user, theme toggle, sign out)
  Can.tsx               <Can perm> (hide) + <RequirePermission perm> (page-level 403)
  Forbidden.tsx         The standard 403 panel
  PageHeader.tsx        Consistent page title block
  ThemeToggle.tsx       Light/Dark switch
```

## Authentication (client-side session)

- **Cross-origin, token-in-memory.** The Portal (`:3000`) talks to the backend API (`:4000`). `POST /auth/login` returns an **access token** (held in memory only — never localStorage) and sets an **httpOnly refresh cookie** on the API origin. All requests use `credentials: 'include'` so the cookie flows; `Authorization: Bearer` carries the access token.
- **Silent refresh.** On a full reload the access token is gone, so `AuthProvider` calls `POST /auth/refresh` (cookie) to mint a new one, then loads `/auth/me` + `/rbac/permissions`. A 401 on any call triggers one silent refresh + retry; if that fails the session flips to anonymous.
- **CORS/cookie:** backend runs `cors({ origin: true, credentials: true })`; the refresh cookie is `SameSite=Lax` (localhost ports are same-site, so it's sent cross-port). No backend change was needed.
- **MFA:** a `{ mfaRequired: true }` login response is surfaced as "not supported yet" (second factor lands in a later phase). SSO plugs in at the same layer.

## Authorization (RBAC-driven UI)

- **Capabilities context** (`lib/auth.tsx`): after login it loads the caller's **effective permission set** (`{ wildcard, permissions[] }`) from `GET /rbac/permissions`. `useCan(key)` = `wildcard || permissions.has(key)`.
- **Menu** (`AppShell`): `NAV_ITEMS` are filtered by `can(item.perm)`; items the user can't use never render.
- **`<Can perm>`**: hides buttons/fragments (e.g. a "New provider" action).
- **`<RequirePermission perm>`**: wraps a protected page's body; renders the standard **Forbidden** panel when the permission is missing, so a direct URL hit gets a clean 403 instead of a broken screen (and the API would 403 the data calls anyway).
- **Keys come from `@hms/permissions`** — the same module the backend enforces with, so the menu and server never drift.
- Verified live (CITYCARE demo): **org_admin** sees Dashboard/Providers/Audit/Settings; **receptionist** sees only Dashboard/Settings, and a direct hit to `/providers` renders the 403 panel with **no `/providers` API call made**.

## Design system & theming

- **@hms/ui is the only source of visual tokens.** `import '@hms/ui/styles.css'` (once, in the root layout) defines the `--hms-*` custom properties (colour, radius, type, shadow) — **Light under `:root` (default), Dark under `[data-theme="dark"]`**. Primitives (`Button`, `Field`, `Card`, `Badge`, `Alert`, `Spinner`, `DataTable`) are built entirely on those tokens; nothing hardcodes a raw value.
- **Tailwind shares the tokens.** `globals.css` maps `--hms-*` into Tailwind's `@theme` (`bg-surface`, `text-fg-muted`, `border-border`, `bg-brand`, `rounded-token`…), so app-level layout utilities use the exact same values as the primitives.
- **Theme** (`lib/theme.tsx`): `data-theme` on `<html>` toggles Light/Dark; persisted to `localStorage`; a no-flash inline script applies it before first paint. Default is **Light**.
- **Tenant branding (server-persisted, ADR-021):** the accent is a single token (`--hms-brand`). `theme.tsx` exposes `applyBranding(b)` (sets **only** `--hms-brand` — hover, pressed, subtle and the focus ring derive from it in the token layer, ADR-040 — swaps the favicon, tracks the logo URL) and `previewBrandColor(hex)` (live preview while editing). `components/BrandingLoader` (mounted in the authenticated shell) fetches `GET /branding/current` at bootstrap and applies it; a cached brand colour in `localStorage` lets the no-flash script paint it before hydration. The **Settings → Branding** editor (org_admin, `platform.branding.manage`) is a real colour picker + logo/favicon upload + reset, persisted via the branding API. `AppShell` shows the uploaded logo. No component hardcodes colour — branding is a token swap.
- Verified in **Light and Dark** and under a **non-default brand**.

## shadcn/ui — CLI + reference layer (ADR-028)

Installed, but **not** a second component kit: `@hms/ui` remains canonical and nothing shadcn-generated ships without review.

- `components.json` (style `base-nova`, base `base` = Base UI, Lucide icons, `@/` alias), `lib/utils.ts` (`cn` for generated components), and `components/ui/` as the `shadcn add` target. Dependencies: `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`; the `shadcn` CLI is a devDependency.
- **`app/globals.css` re-points shadcn's whole semantic contract at `--hms-*`** — `--background`/`--foreground`/`--card`/`--popover`/`--primary`/`--secondary`/`--muted`/`--accent`/`--destructive`/`--border`/`--input`/`--ring`/`--radius`/`--sidebar-*`/`--chart-*`. shadcn's neutral OKLCH palette and its `.dark` block are deliberately absent, and `@custom-variant dark` is redefined to `[data-theme="dark"]` (the switch this app actually uses). Net effect: a component added by the CLI inherits Light/Dark **and** the tenant accent with no extra work.
- Init's two regressions were reverted by hand: `--font-sans` is back to `var(--hms-font-sans)`, and the generated demo `button.tsx` was deleted (the `@hms/ui` `Button` is the real one).
- Usage rule: run `npx shadcn@latest add <component>` for primitives `@hms/ui` lacks (Select, Dialog, Command, Popover), then review — tokens, both themes, tenant accent, a11y — before it reaches a screen. The `shadcn` agent skill in `.agents/skills/` reads this config.

## The Standard DataTable

Every tabular view renders through `DataTable` from `@hms/ui` (ADR-029) — a **configuration**, never a per-page table. Columns carry `sortable` / `filterable` / `hideable` / `defaultHidden` / `accessor` flags; the toolbar (search → filters → columns → actions) and pagination (10/20/50/100 + "Showing X–Y of Z") come with it, as do the skeleton, empty and error states.

- **Server mode** for large datasets: pass `server={{ total, page, pageSize, search, sort, onChange }}` and the API owns paging/search (search is debounced). **Patients** runs this way, with `urlState` so `?page/size/q/sort` survives a reload and a link.
- **Client mode** for small local sets — **Providers** sorts, searches, and offers faceted filters (Specialties, Status) in the browser.
- **Row actions use the shared Action column** (ADR-039): `actionsColumn()` + `TableActions`, with `ViewAction` / `EditAction` / `ToggleAction` / `TableAction` / `MoreActions` inside it. Permission gating is a prop (`permitted`), not a hand-rolled conditional, and every destructive or state-changing action carries its own confirmation copy. Live today on patients (view / edit), branches and users and tenants (view + suspend/activate switch), appointments (check in / cancel), OPD (open visit / start consult / complete), pharmacy stock (receive), billing (view invoice), the tenant's module list (revoke) and a user's roles and overrides (remove / revoke). Dates in cells come from `@hms/utils` (`DD/MM/YYYY`).
- The remaining screens (audit, appointments, billing, opd, laboratory, pharmacy, users, branches, tenants, reports) still pass the original `{ key, header, cell }` columns — valid, since the API is a superset — and gain sorting/filters by adding flags. Tracked in root `BACKLOG.md`.

## System Admin dashboard (ADR-043)

`/platform` is the operator's home — the whole platform, never one hospital, and **every tile is a real query**: `GET /admin/stats` for the counts, `GET /admin/trends` for month-by-month growth derived from each record's own `created_at`, the audit trail for security activity by day and severity, and the API's own liveness/readiness probes for health. Metrics with no data source (revenue, subscriptions, storage, uptime history, support tickets) are listed as pending on the screen rather than estimated.

- **Charts come from `@hms/ui`** (`AreaChart`, `BarChart`, `StatCard`, `UsageBar`) — token-driven SVG, no charting dependency, and each repeats its data in a visually-hidden table.
- **A range control (6 / 12 / 24 months)** re-queries every series at once; the API clamps `months` to 3–36.
- **`/dashboard` is the hospital's dashboard only.** A platform operator hitting it is redirected to `/platform`, unless they are inside a support session — where the tenant's own view is the whole point (ADR-037).

## Role dashboards (ADR-044)

`/dashboard` picks a dashboard from **what the user is permitted to do**, never from a role name — a hospital can rename its roles, but permissions are the truth:

| Who | Gets | Built from |
|---|---|---|
| Platform operator | redirect to `/platform` | ADR-037 — an operator has no clinical dashboard |
| Can manage users or branches | `HospitalAdminDashboard` | revenue billed vs collected, today's OPD load by hour, doctors on duty, low stock, registrations, capacity, quick actions |
| Clinical permission | `ClinicalDashboard` with `role=doctor \| receptionist \| pharmacist \| lab` | one component, four configurations — the queue, the worklist, prescriptions, arrivals |
| Anyone else | `StaffDashboard` | degrades to exactly what their permissions reach |

All of them are configurations of `components/dashboard/DashboardShell` (`DashboardShell` · `KpiGrid` · `DashboardRow` · `RangeChips` · `PanelRow` · `PanelEmpty`), which is also the shape `/platform` uses — so every dashboard in the product reads the same way. One endpoint feeds them: `GET /dashboard/overview` (RLS-scoped, real rows only, clinical day bucketed in server-local time).

## Navigation (ADR-043)

The shell **scrolls in two panes**: the sidebar is `sticky top-0 h-screen overflow-y-auto` with `data-lenis-prevent`, so a long menu scrolls inside itself instead of with the page, and the topbar is sticky too. `lib/nav.ts` exports **grouped** navigation — `PLATFORM_NAV_GROUPS` (Customers · Platform · Account) and `TENANT_NAV_GROUPS` (Clinical · Revenue · Organization · Account) — with `navGroupsForContext()` filtering by permission and dropping any group left empty. `PLATFORM_NAV` / `NAV_ITEMS` stay as flattened lists for the mobile bar. A new screen joins a group; a new area of the product adds one. Never add an item for a screen that does not exist yet.

## API feedback (ADR-026)

**One** notification path: the shared `@hms/ui` toast, raised inside the API client. Pages never write toast logic.

- `lib/apiErrors.ts` — `ApiRequestError` (canonical `{ error: { code, message, details? } }`), `NetworkError`, `TimeoutError`. Split out so the client and the feedback layer share them without an import cycle.
- `lib/feedback.ts` — the only place an outcome becomes user-facing copy. `describeError()` maps timeout / offline / 401 / 403 / 404 / 409 / 400+422 / 429 / 5xx / unknown to a title + description, preferring the **backend's own message** when it is usable (a bare error code, a stack-shaped string, or anything over 300 chars is rejected). **5xx always uses generic copy** — a server message may carry internals. Full detail goes to the console/error tracker, never the screen; PHI never enters a toast. `successMessage()` prefers the API's `message`, then the call's own copy (a string or a formatter over the response), then `Saved.`/`Removed.`.
- `lib/api.ts` — `request()` owns it: a 30s `AbortController` timeout turns a stalled call into `TimeoutError`, a dead connection into `NetworkError`; **every failure notifies**; **every mutating method also notifies on success**. Per-call `feedback` opts out (`false`), silences just the success toast (`{ success: false }`), or sets the copy (`{ success: "Patient registered." }` / a formatter, e.g. dispensing reports drug × qty and the amount added to the bill). Sign-in is the one opt-out: it renders failure inline from the same `describeError()` copy, so nothing is said twice.
- Pages keep **client-side validation** messages and DataTable load-error states; they no longer keep "Saved."-style banners.

## SEO boundary (ADR-027)

The Portal is private and never indexed: the root layout sets `robots: { index: false, follow: false, nocache: true }` (+ `googleBot.noimageindex`) and `app/robots.ts` disallows the whole origin. No patient/tenant/staff/operational data may appear in metadata, a URL path, an OG image, or a sitemap. All product SEO belongs to `marketing/`.

## Frontend performance

- Fonts: `next/font` (Geist / Geist Mono). Images: `next/image` — the tenant logo (AppShell + Settings) uses `unoptimized` with explicit dimensions, because tenant assets come from per-deployment object storage whose origin cannot be enumerated in `images.remotePatterns`.
- Heavy, non-critical UI uses `next/dynamic`; third-party scripts go through `next/script`; `<head>` comes from the Metadata API. No third-party analytics by default — and never PHI or tenant-identifying data in any telemetry.

## Conventions

- **Client vs server components:** context/providers/interactive pages are `"use client"`. `app/page.tsx` uses a server `redirect()`. Route groups `(auth)` / `(app)` separate the public and authenticated shells without adding URL segments.
- **Every API call goes through `lib/api.ts`** — never a bare `fetch`. It centralises the base URL, auth header, refresh, and error unwrapping.
- **Permission keys are never string literals in components** — import them from `@hms/permissions`.

## Running

- Dev: `npm run dev -w hms_frontend` → `http://localhost:3000` (needs the backend on `:4000`; set `NEXT_PUBLIC_API_BASE_URL` in `.env.local`, default `http://localhost:4000/api/v1`).
- All apps together: `npm run dev` at the repo root (turbo) — backend `:4000`, portal `:3000`, marketing `:3001`.
- Build: `npm run build -w hms_frontend` (Turbopack; all routes prerender static). Typecheck: `npm run typecheck -w hms_frontend`.
- **Demo login:** org `CITYCARE`, `admin@citycare.example` / `ChangeMe#123` (org_admin) or `reception@citycare.example` / `ChangeMe#123` (receptionist, reduced menu).

## Constraints / not-yet-built

- No unit/component tests yet (Playwright/RTL land with the testing increment). Verification so far is live browser walkthrough + `next build`.
- Access token in memory means a hard reload always does one `/auth/refresh` round-trip (by design; avoids storing a JWT in `localStorage`).
- Admin CRUD (create provider, assign specialty, manage roles/users) is not wired to the UI yet — the pages are read-only views proving the shell, auth, RBAC, and DataTable. Forms come with each module's real screens.
- **Super-Admin area (built, A3):** `app/(app)/admin/tenants/` — Tenants list, the **Create-Tenant wizard** (org → module checklist from `GET /admin/module-catalog` → first admin → optional branch, with a **one-time temp-password reveal**), and the tenant detail page (status control, module grant/revoke, branches). Gated by `platform.tenants.manage` (only `super_admin`; the "Tenants" nav item and pages are hidden/403 for everyone else). Onboarding is operator-driven, not public self-registration (ADR-020).
- **Org-Admin area (built, A4):** `app/(app)/users/` — Users list (roles + status) with inline create (one-time temp-password reveal) and a detail page (status, role assign/remove, effective-permission view, GRANT/DENY override add/revoke from the `@hms/permissions` catalog). `app/(app)/branches/` — list + inline create + active toggle. Reads gated by `platform.users.view`/`platform.branches.view`; mutating controls wrapped in `<Can>` for `.manage` / `platform.rbac.manage`. Nav items "Users"/"Branches" appear for `org_admin` (not for roles lacking the view permission).
- Public self-registration + self-serve billing stay in the Enterprise track. Password reset / email invite, per-branch branding, and a custom-role editor are later slices.
- MFA challenge, forgot-password, and branch switching are stubs/not present.
