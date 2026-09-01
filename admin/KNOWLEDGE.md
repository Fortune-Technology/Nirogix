# admin — KNOWLEDGE.md

Current state of the **Nirogix Platform Admin** app. Read after root `CLAUDE.md` and `admin/AGENTS.md`. See `DONE.md` for the chronological log.

> ⚠ **This is Next.js 16 (App Router, Turbopack, React 19).** `AGENTS.md` points at the version-matched docs in `node_modules/next/dist/docs/`.

## Purpose

The vendor's own operators, on their own origin (ADR-051). `:3003` in development, `admin.nirogix.com` in production.

This app is **not** a copy of the staff Portal. It shares the design system through `@hms/ui` and nothing else, so operator code never ships inside a hospital's bundle and a change here cannot regress a clinic. It contains **no clinical navigation and no clinical API calls** — an operator who needs to work inside a hospital opens an audited support session, which hands them the *Portal* on the tenant's own origin, with the support banner visible (ADR-037).

## What is built

```
app/
  layout.tsx              Fonts, @hms/ui styles, no-flash theme script, <Providers>, <Toaster>
  providers.tsx           ThemeProvider + AuthProvider
  globals.css             Identical token layer to the Portal — one design system, rendered the same way
  (auth)/login/page.tsx   Platform operator sign-in — NO quick-login in any environment (ADR-077)
  (auth)/forgot-password/ + (auth)/reset-password/   Self-service password recovery (ADR-081)
  (app)/layout.tsx        Session gate + platform-operator gate
  (app)/page.tsx          Platform dashboard — real cross-tenant aggregates + trends
  (app)/profile/          My profile — account facts + change password (any authenticated operator)
  (app)/tenants/          Hospital list, detail (modules, users, support session), onboarding
  (app)/branding/         Platform branding — marketing + Portal default scopes (ADR-024)
  (app)/email-templates/  Read-only preview of the central email catalogue (ADR-086)
  (app)/audit/            Audit trail viewer
lib/
  api.ts                  Focused client: session, admin/*, audit, platform branding. No clinical calls.
  portal.ts               Where the Portal lives, from configuration — the support-session handoff
  auth.tsx                Session + effective-permission context (same contract as the Portal's)
  theme.tsx               Light/Dark only — no tenant branding here, deliberately
  nav.ts                  Platform navigation, permission-filtered
components/
  AppShell.tsx            Sidebar + topbar + shared mobile drawer
  Can.tsx / Forbidden.tsx / PageHeader.tsx   Shared with the Portal by copy, not by import
  profile/                Profile pieces (header/facts/security card) — Portal copy, same rule
```

## Conventions specific to this app

- **Two gates, not one.** `(app)/layout.tsx` checks a session *and* `platform.tenants.manage`. A hospital's org_admin has a valid session — there is one backend — so being signed in is not enough; they get the Forbidden panel. That is UX only: every endpoint is independently gated, so the same person typing the URL gets nothing from the API either.
- **No tenant branding.** The app always wears the Nirogix accent. A console that changes colour depending on whose data is on screen is one you can misread under pressure.
- **No metric without a source (ADR-043).** The dashboard shows hospitals, users, doctors, branches, module adoption and a link to the audit trail, because those are real queries. Revenue, MRR, subscription mix, storage, uptime and support tickets are **absent and stated as absent** — there is no subscription or tenant-billing model to draw them from (ADR-020).
- **No development credentials in source.** The seeded operator account lives in `hms_backend/src/scripts/seed.development.ts` and `testcases.md`. The login screen hints at nothing.
- **Its own origin, its own session.** The refresh cookie is host-only on the API, so this app's session cannot be replayed against the Portal or any other surface. `http://localhost:3003` is in `CORS_ORIGINS` for development; every environment lists its own (see `resources/domains.md` §8).

## Support sessions — the sending end (ADR-037, ADR-051)

`/tenants/[id]` starts a session and hands the token to a **Portal** tab. Both ends name the other's origin from configuration — `lib/portal.ts` here (`NEXT_PUBLIC_PORTAL_URL`), `lib/adminOrigin.ts` there — because `window.location.origin` stopped being the right answer the moment the apps split. The token travels by `postMessage`, never in a URL.

The operator continues in the *Portal*, on the hospital's origin, with the support banner visible. Nothing clinical is ever rendered here.

## Not built yet

Subscriptions, revenue, platform users, system health, feature flags, integrations and platform settings each need a data source before they can be honest (ADR-043), and **a navigation item is never a placeholder for an unbuilt screen**. See `BACKLOG.md`.


## Module & capability manager (ADR-085)

`tenants/[id]/modules` is the three-level manager (reached from the tenant detail Modules card). **Level 1** is the domain rail — all eleven domains (Core, Clinic/OPD, Hospital, Billing & Finance, Add-ons, Specialty, Clinical Support, Patient Engagement, Reporting & Analytics, AI, Platform Services), each with an enabled/total count. **Level 2** lists that domain's modules (42 in the catalog) with Enable/Disable (grant/revoke), status badges and a capability count. **Level 3** opens one module (click the row or the chevron) and shows its capabilities (246 in the catalog) with On/Off toggles and a breadcrumb back. Drill-down, not one flat tree — the catalog is far too large to expand at once. It also carries a top **Enabled configuration** card — the at-a-glance verification of everything switched on, grouped by domain with per-module feature counts — plus search across modules+capabilities and All/Enabled/Disabled/Coming-soon filters.

It consumes one model — `GET /admin/tenants/:id/module-config` (`api.getTenantModuleConfig`) — the whole registry grouped by domain with each module's `entitled` and each capability's `enabled` state (the backend is the source of truth, §19). Actions reuse `grantTenantModule` / `revokeTenantModule` (module tier) and `setTenantCapability` → `PUT /admin/tenants/:id/capabilities` (capability tier). Deny-by-exception: capabilities are on by default. A `BUILT` module toggles for real; an `AVAILABLE` one shows **"Coming soon"** (still entitleable, but honest that nothing runs behind it). A module marked `alwaysOn` (Platform Services — Platform Core, never sold per tenant) reports as entitled, renders a **Required 🔒** badge and has no toggle. Disabling a module that others hard-depend on prompts a dependency confirmation; a capability dependency conflict comes back as 409 with the backend message on the shared toast. Frontend hiding is never the boundary — the backend re-checks via `requireModule` / `requireCapability`.

## Onboarding capability choices (ADR-085)

`tenants/new` groups the catalog by domain and makes every module row expandable: the chevron
reveals that module's capabilities, each an On/Off pill. Deny-by-exception — selecting a module
implies all its capabilities, and only the ones switched **off** travel to the API as
`disabledCapabilities`, which `onboardTenant` writes with `setCapabilityStatus` after granting the
modules. Capability controls are inert until the module is selected; `Coming soon` marks anything
not `BUILT`. The catalog feed is `GET /admin/module-catalog` (now carrying `category`, `status`,
`alwaysOn` and `capabilities`).

## Browser security headers (ADR-082)

`proxy.ts` (Next 16’s replacement for `middleware.ts`) mints a per-request nonce and sends the Content-Security-Policy built by `@hms/utils` — `strict-dynamic`, no `unsafe-inline` — plus `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a `Permissions-Policy` that leaves only the microphone (dictation, ADR-070). The root layout is async so it can read that nonce from the `x-nonce` header and stamp it on the one inline script this app owns (the no-flash theme script); **any new inline script needs the same nonce, or it will not run**. Sessions also end after 15 minutes without interaction (`useIdleSignOut`, `@hms/client`) — an operator console is the one surface where an unattended screen reaches every tenant.

## Verify

```bash
npm run dev --workspace=admin
```

Then `http://localhost:3003`. `npm run typecheck --workspace=admin` and `npm run build --workspace=admin` must both pass.
