# hms_frontend — KNOWLEDGE.md

Current state of the HMS Portal (staff-facing web app). Read after root `CLAUDE.md` and `hms_frontend/AGENTS.md`. See `DONE.md` for the chronological log.

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
- **Tenant branding (server-persisted, ADR-021):** the accent is a single token (`--hms-brand`). `theme.tsx` exposes `applyBranding(b)` (sets `--hms-brand`/`--hms-brand-hover`, swaps the favicon, tracks the logo URL) and `previewBrandColor(hex)` (live preview while editing). `components/BrandingLoader` (mounted in the authenticated shell) fetches `GET /branding/current` at bootstrap and applies it; a cached brand colour in `localStorage` lets the no-flash script paint it before hydration. The **Settings → Branding** editor (org_admin, `platform.branding.manage`) is a real colour picker + logo/favicon upload + reset, persisted via the branding API. `AppShell` shows the uploaded logo. No component hardcodes colour — branding is a token swap.
- Verified in **Light and Dark** and under a **non-default brand**.

## The Standard DataTable

Every tabular view renders through `DataTable` from `@hms/ui` (`columns` + `rows` + `rowKey`, with built-in `loading` / `error` / `empty` states and horizontal overflow). The Providers (client-loaded) and Audit (server-paginated, consuming the backend's `{ data, page }` envelope) pages both use it, so headers, spacing, and states are identical everywhere.

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
