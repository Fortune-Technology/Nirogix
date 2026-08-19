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
  (app)/layout.tsx        Session gate + platform-operator gate
  (app)/page.tsx          Platform dashboard — real cross-tenant aggregates + trends
  (app)/tenants/          Hospital list, detail (modules, users, support session), onboarding
  (app)/branding/         Platform branding — marketing + Portal default scopes (ADR-024)
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
```

## Conventions specific to this app

- **Two gates, not one.** `(app)/layout.tsx` checks a session *and* `platform.tenants.manage`. A hospital's org_admin has a valid session — there is one backend — so being signed in is not enough; they get the Forbidden panel. That is UX only: every endpoint is independently gated, so the same person typing the URL gets nothing from the API either.
- **No tenant branding.** The app always wears the Nirogix accent. A console that changes colour depending on whose data is on screen is one you can misread under pressure.
- **No metric without a source (ADR-043).** The dashboard shows hospitals, users, doctors, branches, module adoption and a link to the audit trail, because those are real queries. Revenue, MRR, subscription mix, storage, uptime and support tickets are **absent and stated as absent** — there is no subscription or tenant-billing model to draw them from (ADR-020).
- **No development credentials in source.** The seeded operator account lives in `hms_backend/src/scripts/seed.ts` and `testcases.md`. The login screen hints at nothing.
- **Its own origin, its own session.** The refresh cookie is host-only on the API, so this app's session cannot be replayed against the Portal or any other surface. `http://localhost:3003` is in `CORS_ORIGINS` for development; every environment lists its own (see `resources/domains.md` §8).

## Support sessions — the sending end (ADR-037, ADR-051)

`/tenants/[id]` starts a session and hands the token to a **Portal** tab. Both ends name the other's origin from configuration — `lib/portal.ts` here (`NEXT_PUBLIC_PORTAL_URL`), `lib/adminOrigin.ts` there — because `window.location.origin` stopped being the right answer the moment the apps split. The token travels by `postMessage`, never in a URL.

The operator continues in the *Portal*, on the hospital's origin, with the support banner visible. Nothing clinical is ever rendered here.

## Not built yet

Subscriptions, revenue, platform users, system health, feature flags, integrations and platform settings each need a data source before they can be honest (ADR-043), and **a navigation item is never a placeholder for an unbuilt screen**. See `BACKLOG.md`.

## Verify

```bash
npm run dev --workspace=admin
```

Then `http://localhost:3003`. `npm run typecheck --workspace=admin` and `npm run build --workspace=admin` must both pass.
