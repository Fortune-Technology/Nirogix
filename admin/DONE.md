# admin — DONE.md

Append-only implementation log for the Nirogix Platform Admin app.

## 2026-08-16 — The platform admin app exists (ADR-051)

**What:** `admin/` went from a bare `create-next-app` scaffold to a working application on its own origin: joined npm workspaces at port **3002**, given the Portal's exact token layer (`globals.css` + `@hms/ui/styles.css`) so the design system renders identically, and wired to the **same backend** as every other frontend.

Built: root layout with the no-flash theme script and the shared `Toaster`, a Light/Dark theme provider with **no tenant branding** (this is the platform's own surface — a console that repaints itself in a customer's colours is one you can misread), the session + effective-permission context, a focused API client, permission-filtered navigation, the app shell with the shared mobile drawer, the operator sign-in screen, and the platform dashboard.

**Deliberately narrow API surface.** `lib/api.ts` carries session, `admin/*`, audit and platform branding — and no clinical call at all. An operator working inside a hospital does so through an audited support session in the *Portal*, not by rendering clinical screens on the platform origin.

**Two gates on every authenticated route.** A session is not enough: a hospital's org_admin has a valid one, because there is a single backend. `(app)/layout.tsx` also requires `platform.tenants.manage`, which only a super_admin in the PLATFORM org resolves. The client gate is UX — the API refuses the same caller independently.

**No credentials in source.** The seeded operator account stays in `seed.ts` and `testcases.md`. The login screen hints at nothing and ships nothing.

**Dashboard is honest.** Hospitals, platform users, doctors, branches, module adoption and a link into the audit trail — all real queries against `GET /admin/stats`, which is aggregate-only by design (ADR-023). Revenue, MRR, subscriptions, storage, uptime and support tickets are absent, and the screen says so in as many words, because no data source for them exists (ADR-020, ADR-043).

**Testing status:** `next build` clean — `/`, `/login` prerendered; typecheck clean. Verified live: the sign-in screen renders with the shared `BrandMark`, `Field`, `PasswordField` (show/hide) and the toast region, and the backend answers a CORS preflight from `http://localhost:3002` with `Access-Control-Allow-Origin: http://localhost:3002` and `Allow-Credentials: true`.

**Next:** tenant management, support sessions, platform branding and the audit viewer — moving out of `hms_frontend`, which still serves them today. Until that move lands, both apps can reach them and the split is not yet complete. Tracked in `BACKLOG.md`.

## 2026-08-16 — The platform surface moved here (ADR-051, BACKLOG F-1)

**What:** The operator screens left `hms_frontend` and now exist only in this app: the platform dashboard, hospital list, hospital detail (with module grant/revoke and support-session start), hospital onboarding, platform branding and the audit viewer. Until this landed the split was cosmetic — operator code was still in every hospital's bundle, which was the whole reason for separating.

**The cross-origin bug this surfaced.** The support-session handoff opened `/support/enter` and posted the token with `postMessage(..., window.location.origin)`, with the receiver checking `event.origin !== window.location.origin`. That was correct while both ends shared an origin and **silently wrong the moment they did not** — the admin console would have posted the token to itself, where nothing listens, and the Portal would have rejected the real sender. Both ends now name the other explicitly from configuration: `admin/lib/portal.ts` (`NEXT_PUBLIC_PORTAL_URL`) and `hms_frontend/lib/adminOrigin.ts` (`NEXT_PUBLIC_ADMIN_ORIGIN`). The token still travels by `postMessage` and never in a URL, where it would land in history, referrers and server logs.

**What deliberately stayed in the Portal:** `/support/enter`, because it *receives* a session rather than minting one, and the **read** of platform branding — `GET /public/branding/:scope` is public and is how the Portal applies the platform default at bootstrap. Only the branding *writes* moved. Removing the read was a mistake caught by the typechecker and reverted.

**Testing status:** `next build` clean — `/`, `/login`, `/tenants`, `/tenants/[id]`, `/tenants/new`, `/branding`, `/audit`. Typecheck clean in both apps. The Portal builds with 31 routes and **no `/platform` or `/admin/*`**, and a grep for `getPlatformStats`, `listTenants`, `startSupportSession` and `updatePlatformBranding` across `hms_frontend` returns nothing. Portal tests still pass (12).

## 2026-08-17 — System Admin dashboard tiles link out; audit Severity visible (ADR-062, ADR-063)

The platform **Hospitals** tile now opens the tenant list and **Failed sign-ins** opens the audit trail (canonical `/tenants`, `/audit`), each keyboard-operable with an accessible name; the aggregate **Staff accounts** and **Branches** tiles stay plain, since the operator surface has no cross-tenant list for them to open. The audit table's **Severity** column is no longer hidden by default (ADR-063).

**Found, not fixed here:** the dashboard's Quick-action and header links still point at non-existent `/admin/*` paths (the canonical routes are `/tenants`, `/branding`, `/audit`, per `admin/lib/nav.ts`) — a pre-existing routing bug, logged to BACKLOG. My new tiles use the canonical hrefs.

**Testing status:** typecheck clean across all workspaces; the stat-card behaviour is covered by `@hms/ui` unit tests.

## 2026-08-17 — Audit severity is a faceted, multi-select filter (ADR-063)

The audit console's bespoke severity `<select>` is replaced by the shared faceted filter (predefined `info/notice/warning/critical`), routed through `server.filters` to `GET /audit` — multi-select and server-side, matching the Portal's audit page and every other table.

**Testing status:** typecheck and build clean.

## 2026-08-17 — Fix admin 404s, full-page scroll, and Portal shell parity

Three regressions, all rooted in the ADR-051 split that carved this app out of the Portal.

**404s — links vs routes never matched.** The route folders are at the subdomain root (`/tenants`, `/tenants/[id]`, `/branding`, …; no `basePath`), but the extracted pages kept the Portal-era `/admin/*` link prefix, and `nav.ts` linked `/support` and `/profile` routes that were never created. Fixed by pointing every internal link at its canonical route (`/admin/tenants*` → `/tenants*`, `/admin/branding` → `/branding`), **building the missing `/support` page** (an honest entry point to the per-hospital support-session flow — it explains the audited model and links to the hospital list, rather than duplicating the tenant table or the session form), and **removing the dead "My profile" nav item** (no admin profile screen exists; `nav.ts`'s own rule forbids an item pointing at an unbuilt route). A `next.config.ts` redirect maps any lingering `/admin/*` link/bookmark to the canonical route so old URLs still resolve.

**Full-page scroll.** The shell was `min-h-dvh` with a non-sticky sidebar and header, so the whole viewport scrolled. It now uses the Portal's exact shell — `min-h-screen`, a **sticky** sidebar (`sticky top-0 h-screen overflow-y-auto overscroll-contain`, `w-60`) that owns its own scroll, a **sticky** topbar (`sticky top-0 z-20 h-14`), and a `bg-bg` main — so the page scrolls at the window with a single scrollbar and the sidebar/topbar stay put, behaving identically to :3001. (An interim fixed-height `overflow` frame was tried and reverted: it produced a second, inner scrollbar. The sticky/window-scroll pattern keeps `main`'s height equal to its content, so there is no trailing gap.) Nav group/label/item styling, icon sizes and the brand header height match the Portal's tokens and classes.

**Theme-toggle square.** The toggle was a `<Button variant="secondary">` — filled background + border, hence the square behind the icon. Replaced with a new `admin/components/ThemeToggle.tsx` that mirrors the Portal's (`Button variant="ghost"`, icon + word), using this app's own theme hook. No CSS override — the fix is reusing the correct shared pattern.

Also fixed `.claude/launch.json`, whose ports were swapped (marketing/portal and admin/patient), so `admin` correctly maps to 3003.

**Testing status:** typecheck clean (11/11 workspaces); admin build clean (routes include `/support` and `/tenants/[id]`). Routing verified live on :3003 — `/support` and `/tenants/[id]` resolve (auth-redirect to login, not 404) and legacy `/admin/tenants/[id]` redirects to canonical. Admin lint still reports the 6 pre-existing `react-hooks/set-state-in-effect` errors (data-loading effects + `theme.tsx`, documented in BACKLOG); this change introduced none. The authenticated shell's theme/scroll match the Portal by construction (same classes/component); a live side-by-side needs an operator login.

## 2026-08-17 — End-of-day report (#2)

The platform **EOD report** in **Overview → EOD report** (`/eod`, gated by `audit.view`). The only thing the platform records at a daily grain is its own audit trail, so this honestly summarises one day of platform activity — tiles for event volume, anything warning-or-worse, and support sessions, over the day's audit entries, with the entries below. No aggregate figures (hospitals, revenue): they have no per-day source (ADR-023, ADR-043). Reuses the audit list with a new server-side `from`/`to` date window. Uses the shared `PageHeader`, `StatCard`, `DataTable`, `DateField`.

**Testing status:** typecheck and build clean (`/eod` prerendered).

## 2026-08-17 — Portal-matching smooth scroll; page-header CTA on shared Button

**Smooth scroll.** The admin console now drives the same `@hms/ui` `SmoothScroll` (document-level Lenis) as the Portal, wired identically in the root layout, plus the shared `BackToTop`. This app already uses the Portal's window-scroll shell (sticky sidebar + topbar, one scrollbar), so it needs Lenis in the same `root` mode — no second implementation, no container-scroll variant (an interim `SmoothScrollArea` was written and reverted once the shell was confirmed window-scroll). The sidebar gained `data-lenis-prevent`, matching the Portal, so a wheel over a long menu scrolls the menu rather than the page.

**Buttons.** The dashboard "Onboard hospital" header CTA was a raw `hms-btn hms-btn--primary hms-btn--sm` link — smaller than the tenants page's "Onboard tenant" `<Button>` (md) for the same kind of action. It now uses the shared `<Button>` (md) via `<Link><Button>`, matching tenants. The Forbidden panel's external "Go to the Nirogix Portal" link likewise moved onto the shared `<Button variant="secondary">`. No raw `hms-btn` class usage remains in admin app code.

**Testing status:** typecheck clean (11/11 workspaces); admin build clean. Lint still reports the pre-existing `react-hooks/set-state-in-effect` errors (data-loading effects + `theme.tsx`, in BACKLOG); this change introduced none. Live scroll parity matches the Portal by construction (same component + shell model); the in-app browser blocks :3003 and the scrollable pages are auth-gated, so a visual side-by-side needs an operator login.
