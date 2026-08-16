# @hms/client — KNOWLEDGE.md

The shared frontend foundation for every Nirogix application (ADR-054). Read after root `CLAUDE.md`.

## Purpose

One implementation of the parts that must not drift between five frontends: token handling, the single in-flight refresh, the 401 retry, error classification, the one-notification-per-call rule (ADR-026), and permission resolution.

The half most likely to drift is the security-relevant half — *when* a session is treated as expired, *whether* a failure is announced, *whether* a server message is safe to render. Those now have one home.

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

## The boundary — read before adding anything

- **Domain endpoints do NOT belong here.** Each app builds its own client and exposes only what its audience may call; that is what keeps clinical calls out of the admin console and platform-administration calls out of the Portal (ADR-051). A shared client must never become a shared API surface, or the frontend split is undone from the inside. **The first sign this is going wrong is a domain endpoint appearing in this package.**
- **The 403 panel and navigation stay per app** — each application sends a refused user somewhere different.
- Nothing here decides anything. Every guard is UX; the backend re-checks each action independently (invariant #2).

## Consumers

`hms_frontend`, `admin`, and — wired before they have code of their own — `patient` and `aiportal`. Each keeps thin re-export shims at `lib/auth`, `lib/feedback`, `lib/apiErrors` so pages import from one place.

## Verify

`npm run typecheck -w @hms/client` and `npm run test -w @hms/client` (12 feedback tests, moved here with the code).
