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
