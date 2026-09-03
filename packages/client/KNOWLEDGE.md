# @hms/client — KNOWLEDGE.md

The shared frontend foundation for every Nirogix application (ADR-054). Read after root `CLAUDE.md`.

## Purpose

One implementation of the parts that must not drift between five frontends: token handling, the single in-flight refresh, the 401 retry, error classification, the one-notification-per-call rule (ADR-026), and permission resolution.

The half most likely to drift is the security-relevant half — _when_ a session is treated as expired, _whether_ a failure is announced, _whether_ a server message is safe to render. Those now have one home.

## What's here

```
src/
  errors.ts     ApiRequestError / NetworkError / TimeoutError
  feedback.ts   describeError, notifyError, notifySuccess, successMessage — the ADR-026 rules
  http.ts       createApiClient({ baseUrl }) → request, send, parseError, tryRefresh, token accessors,
                and the session endpoints (login, logout, me, myPermissions)
  auth.tsx      AuthProvider (parameterised over an ApiClient), useAuth, useCan
  guards.tsx    Can, RequirePermission (the 403 panel is passed in, not assumed)
```

- `idle.ts` — the idle-session policy (ADR-082). `useIdleSignOut({ active, timeoutMs, onIdle })` ends a session after 15 minutes without interaction; activity is shared across tabs through `localStorage`, so one tab never signs a user out of another. `AuthProvider` uses it for staff (override with `idleTimeoutMs`; 0 disables), and the patient portal’s own `SessionProvider` uses the same hook — the principals stay separate (ADR-052), the policy does not.

## The boundary — read before adding anything

- **Domain endpoints do NOT belong here.** Each app builds its own client and exposes only what its audience may call; that is what keeps clinical calls out of the admin console and platform-administration calls out of the Portal (ADR-051). A shared client must never become a shared API surface, or the frontend split is undone from the inside. **The first sign this is going wrong is a domain endpoint appearing in this package.**
- **The 403 panel and navigation stay per app** — each application sends a refused user somewhere different.
- Nothing here decides anything. Every guard is UX; the backend re-checks each action independently (invariant #2).

## Consumers

`hms_frontend`, `admin`, and — wired before they have code of their own — `patient` and `aiportal`. Each keeps thin re-export shims at `lib/auth`, `lib/feedback`, `lib/apiErrors` so pages import from one place.

## Verify

`npm run typecheck -w @hms/client` and `npm run test -w @hms/client` (12 feedback tests, moved here with the code).

## Entitlements in the session (ADR-085)

`AuthProvider` loads `GET /entitlements` in the same round as `/auth/me` and `/rbac/permissions`,
so the session holds the tenant's enabled **modules** and **capabilities** beside the user's
permission set. Exposed as `hasModule(key)` / `hasCapability(key)` on the context and as the
`useModule` / `useCapability` / `useEnabledModules` / `useEnabledCapabilities` hooks.

Two deliberate rules: **WILDCARD does not bypass entitlement** (a module the tenant lacks stays
hidden even for a platform operator — entitlement is the tenant's, permission is the user's), and an
entitlements **fetch failure falls back to empty sets** rather than failing the session, so a
transient error hides module-gated items instead of offering routes the API would refuse. Client
visibility is never the boundary — the backend re-checks with `requireModule` / `requireCapability`.
