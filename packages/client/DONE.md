# @hms/client — DONE.md

Append-only implementation log.

## 2026-08-16 — Extracted from the Portal and the admin console (ADR-054, BACKLOG F-7)

**What:** The shared frontend foundation, pulled out before `patient` and `aiportal` could copy it — which was the whole point of doing it now rather than later. `errors`, `feedback`, the HTTP core as `createApiClient({ baseUrl })`, the session endpoints, the session/permissions context and the permission guards.

The Portal and the admin console each carried the same ~140 lines of plumbing. Two copies was tolerable; five would have guaranteed drift in exactly the wrong place — when a session expires, whether a failure is announced, whether a 5xx message is safe to show a user.

**What deliberately did not move:** domain endpoints. Each app still builds its own client and exposes only its audience's API, which is what keeps the ADR-051 split real. `AuthProvider` takes the app's client as a prop; `RequirePermission` takes the app's 403 panel.

**Found while extracting:** `listRoles` (`/rbac/roles`) had been removed from the Portal as collateral in the earlier platform-administration cleanup. It is tenant-facing and the user screens need it, so it was restored — caught by the typechecker rather than by a user.

**Testing status:** the 12 feedback tests moved here with the code and pass. Both apps typecheck and build clean; the Portal's build and the admin console's 8-route build are unchanged in output.
