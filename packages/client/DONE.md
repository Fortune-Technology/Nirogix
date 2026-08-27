# @hms/client — DONE.md

Append-only implementation log.

## 2026-08-16 — Extracted from the Portal and the admin console (ADR-054, BACKLOG F-7)

**What:** The shared frontend foundation, pulled out before `patient` and `aiportal` could copy it — which was the whole point of doing it now rather than later. `errors`, `feedback`, the HTTP core as `createApiClient({ baseUrl })`, the session endpoints, the session/permissions context and the permission guards.

The Portal and the admin console each carried the same ~140 lines of plumbing. Two copies was tolerable; five would have guaranteed drift in exactly the wrong place — when a session expires, whether a failure is announced, whether a 5xx message is safe to show a user.

**What deliberately did not move:** domain endpoints. Each app still builds its own client and exposes only its audience's API, which is what keeps the ADR-051 split real. `AuthProvider` takes the app's client as a prop; `RequirePermission` takes the app's 403 panel.

**Found while extracting:** `listRoles` (`/rbac/roles`) had been removed from the Portal as collateral in the earlier platform-administration cleanup. It is tenant-facing and the user screens need it, so it was restored — caught by the typechecker rather than by a user.

**Testing status:** the 12 feedback tests moved here with the code and pass. Both apps typecheck and build clean; the Portal's build and the admin console's 8-route build are unchanged in output.

## 2026-08-20 — Idle sign-out for every authenticated surface (ADR-082, SECURITY-AUDIT L-5)

**What:** `idle.ts` — `useIdleSignOut`, the activity helpers, and the 15-minute default. Access tokens were already short-lived and memory-only, so the exposure was never a stolen token: it was the screen itself, left signed in on a shared clinical workstation.

A session now ends after 15 minutes without interaction, is revoked **server-side** rather than forgotten in memory, and says so through the shared toast (ADR-057). Activity is stamped in `localStorage` (throttled to one write per 10s), so a user working in one tab is never signed out by another tab’s timer, and storage being unavailable degrades to per-tab behaviour instead of throwing.

One implementation, two principals: `AuthProvider` uses it for staff, and the patient portal’s own `SessionProvider` uses the same hook (ADR-052 keeps the principals separate on purpose — the risk of an unattended screen is identical on both). `AuthProvider` accepts an `idleTimeoutMs` override; 0 disables it.

**Testing status:** 7 new tests (19 in this package) covering the default window, recent vs stale activity, another tab keeping the session alive, a corrupt stamp being ignored rather than trusted, and storage denial. Verified live in all four authenticated apps.
