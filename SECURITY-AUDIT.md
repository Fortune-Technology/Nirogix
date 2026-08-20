# SECURITY-AUDIT.md — production readiness review

Target environment: **`NODE_ENV=production`**. Scope: `hms_backend`, `hms_frontend`, `marketing`, shared packages, configuration and dependencies.

Reviewed 15/08/2026, updated 16/08/2026 (H-4, patient session model, and the public registration endpoints) and **20/08/2026 (every remaining open finding closed — ADR-082)** against the code in this repository. Findings are evidence-based: each one names where it was verified. **Development behaviour was not accepted as production behaviour** — several findings exist precisely because a setting is fine locally and wrong in production.

**Status legend:** `Fixed` in this pass · `Open` needs work · `Accepted` deliberate, with the reason · `Blocked` needs infrastructure.

---

## Summary

| Severity | Count | Fixed | Accepted | Open |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 |
| High | 5 | 5 | 0 | 0 |
| Medium | 6 | 5 | 1 | 0 |
| Low | 5 | 5 | 0 | 0 |

No critical finding, and as of 20/08/2026 **no open finding**. The architecture's security invariants hold: authorization is enforced server-side on every route, tenant isolation is RLS-backed and tested, queries are parameterized, and the error handler never leaks internals. The remaining hardening — account lockout, CSP, upload content validation, one password policy, request correlation and idle sessions — was closed under ADR-082; M-3 (CSRF) stays an explicit accepted position rather than a fix.

**Not a substitute for a VAPT pass.** This is a code review by the people who wrote the code. The first external test against the OWASP Top 10 is still outstanding (`resources/development-plan.md` §23) and is what actually validates the conclusions below.

---

## High

### H-1 · No rate limiting anywhere — **Fixed**
`grep` for `rate-limit` across `hms_backend/src` returned nothing: `POST /auth/login` could be called without limit, making credential stuffing and password brute-forcing free, and every expensive endpoint (reports, uploads) was open to application-layer DoS.

**Fixed** by `src/http/rateLimit.ts` with tiers rather than one global number (ADR-036): a baseline of 300/min across `/api/v1`; **10 per 15 min, IP-keyed, successful logins not counted** on `/auth/login` and `/auth/refresh`; 20 per 15 min on account-takeover-adjacent operations (`/auth/change-password`, `/auth/profile`); an `expensiveLimiter` available for uploads and reports. Authenticated requests key by user id so one user behind a hospital's shared NAT cannot exhaust everyone's allowance. Refusals return the canonical `429 TOO_MANY_REQUESTS`, which the frontend already renders through the shared toast.

**Done in the same pass:** `expensiveLimiter` is applied to the report and file-upload routes.

### H-2 · CORS reflected any origin with credentials — **Fixed**
`app.use(cors({ origin: true, credentials: true }))` reflected the caller's `Origin` and allowed credentials, so **any website** could have made authenticated cross-origin calls with a signed-in user's refresh cookie.

**Fixed** in `src/config/cors.ts`: production requires an explicit allowlist from `CORS_ORIGINS`, logs an error if it is empty rather than silently allowing everything, and refuses unlisted origins. Development keeps the permissive behaviour, where the cookie is not `Secure` and localhost ports move.

**Action required at deploy:** set `CORS_ORIGINS` to the Portal and marketing origins.

### H-4 · Refresh-token rotation did not rotate — **Fixed**
`signRefreshToken` signed `{ sub, tid, sid }` with a second-resolution `iat`/`exp`, so **two refresh tokens minted in the same second were byte-identical**. On refresh the stored hash was replaced with the same value, which meant the previous token stayed valid — a stolen refresh token could not be invalidated by the legitimate user simply continuing their session, which is the one property rotation exists to provide. Present in **staff** sessions since the session model was built; found while testing the new patient session routes.

**Fixed** in `auth/tokens.ts`: `signRefreshToken` now adds a per-issue `gen` nonce, generated inside the signer so no call site can forget it. Verified live for both principals — after a refresh, replaying the previous cookie returns **401** for staff and for patients. Two regression tests assert that back-to-back tokens differ.

### H-3 · No brute-force lockout or credential-stuffing detection beyond rate limiting — **Fixed**
Rate limiting slows an attacker but nothing tracked repeated failures per *account*, so a slow distributed attempt against one known email was still viable, and there was no signal to a defender.

**Fixed** in `auth/lockout.ts` + the login path (ADR-082). `users` carries `failed_login_attempts`, `failed_login_at` and `locked_until`. Five consecutive failures lock the account for 60s, doubling per further failure to a 15-minute ceiling; the streak expires after 15 minutes, so an occasional mistyped password never locks anyone, and no administrator has to unlock anything. The lock is disclosed **only** to a caller who supplied the correct password (a 429 naming the wait) — every other caller gets the same `Invalid credentials`, so the lock is not an enumeration oracle, and the password is verified either way so the two paths cost the same. Attempts made *while* locked never extend it, so someone who knows an email cannot hold it shut. Crossing the threshold audits `auth.login.locked`; attempts against a live lock audit `auth.login.blocked` (recording whether the password matched); a sustained attempt (≥10) escalates to `critical`. Sign-in, change-password and a completed reset all clear the counters. Verified by unit tests over the policy and an HTTP suite (`lockout.api.test.ts`) that locks a real account, proves one account's lock never affects another, and proves the lock lifts on expiry.

### H-5 · Shipped dependency with a known SQL-injection advisory — **Fixed**
Found by the new CI gate (L-4), not by the original review: `drizzle-orm` 0.38.4 was subject to **GHSA-gpj5-g38j-94v9** — SQL injection via improperly escaped SQL identifiers, fixed in 0.45.2. The ORM sits under every query in the product, including the RLS-scoped ones.

**Fixed** by upgrading `drizzle-orm` to 0.45.2 and `drizzle-kit` to 0.31.10. Typecheck, the full 255-test backend suite (including the RLS tenant-isolation test against real PostgreSQL) and all five app builds pass on the new version.

---

## Medium

### M-1 · Security headers are helmet defaults; no CSP — **Fixed**
`helmet()` was applied to the API (good: `X-Content-Type-Options`, `Referrer-Policy`, frame protection, HSTS in production), but there was **no Content-Security-Policy** on any frontend, so an injected script would not have been blocked by policy.

**Fixed** by one builder in `@hms/utils/security.ts` and a `proxy.ts` per app (Next 16's replacement for `middleware.ts`), in two shapes (ADR-082):
- **The four authenticated apps** (`hms_frontend`, `admin`, `patient`, `aiportal`) mint a per-request nonce, send `script-src 'self' 'nonce-…' 'strict-dynamic'`, and stamp the same nonce on the one inline script each app owns (the no-flash theme script). No `unsafe-inline`; `unsafe-eval` only in development, where the bundler needs it.
- **`marketing`** is statically rendered and cached, and a per-request nonce would end that. It keeps every other directive strict and falls back to `'unsafe-inline'` for scripts — stated in code as a deliberate trade, valid only because that site renders no user input, holds no session and reaches no PHI. A form or authenticated surface there moves it to nonce mode.

All five also send `X-Frame-Options: DENY` (alongside `frame-ancestors 'none'`), `nosniff`, `strict-origin-when-cross-origin`, and a `Permissions-Policy` that leaves only `microphone=(self)` — the dictation feature (ADR-070). Verified live on all five running apps: no violations, and `img-src` gained the API origin after the running Portal showed tenant logos (served over http from the API in development) being blocked.

### M-2 · Expensive endpoints had no range cap or query timeout — **Fixed**
`pageSize` was capped at 100 on audit, but reports took a date range with **no validation and no maximum span**, and no statement timeout was configured on the database connection.

**Fixed:** report queries validate the date format server-side and reject a span over 366 days, `expensiveLimiter` is applied to the report and upload routes, and the pool now sets `statement_timeout` (default 30s) and `idle_in_transaction_session_timeout` (default 15s), both configurable per environment. Application caps bound the queries we wrote; the timeouts bound the ones we did not — a pathological plan, a missing index, a lock wait — and the idle-transaction timeout also fences the open-transaction failure mode recorded in `BACKLOG.md`. The migration runner opts its own session out, where slow DDL is expected.


### M-3 · No CSRF defence beyond `SameSite=Lax` — **Accepted, documented**
The refresh cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production and scoped to `/api/v1/auth`; the access token is sent in an `Authorization` header held in memory, never a cookie. `SameSite=Lax` blocks cross-site POSTs, so the practical CSRF surface is small. Once H-2's allowlist is in place, cross-origin abuse is closed off too.

**Revisit if** any state-changing endpoint ever starts accepting cookie-only authentication.

### M-4 · Upload validation trusts client-declared MIME type — **Fixed**
`file.upload.ts` capped size (`FILE_MAX_SIZE_MB`) and count, which is the important half, but type checking relied on the declared MIME type, so a renamed file could be stored under a misleading type.

**Fixed** in `file/fileSniff.ts` (ADR-082): the leading bytes must match a type on the allow-list **and** agree with what the client declared, checked in the single `uploadSingle` choke point every upload route goes through — before anything reaches disk or object storage. `text/plain` has no signature, so it is accepted only when the payload decodes as UTF-8 with no NUL and no control bytes, which is what stops a binary being smuggled in as text. Refusals return `422 FILE_CONTENT_MISMATCH` without echoing the file's contents or name. PHI-bearing files continue to be served only through short-lived signed URLs.

### M-5 · Login timing could enumerate accounts — **Fixed**
Login failures return "Invalid credentials" uniformly (verified in `auth.service.ts`), which is right — but the **timing** differed: an unknown email returned without running bcrypt at all, while a wrong password paid a full bcrypt round. That difference is a classic account-enumeration oracle.

**Fixed** in `auth/password.ts`: `burnPasswordComparison()` runs a bcrypt compare against a precomputed dummy hash whenever the account is not found, so the unknown-email and wrong-password paths cost the same.

### M-6 · Password policy is length-only — **Fixed**
Self-service change enforced ≥10 characters and rejected reuse of the current password, but an administrator could create an account with any 8-character string, and generated temporary passwords were `Hms-` + six random bytes — a fixed, guessable prefix on the one credential that gets emailed, read aloud and written down.

**Fixed** in `auth/passwordPolicy.ts` (ADR-082): 12–200 characters, at least three of the four character classes, a blocklist of the passwords attackers try first (matched after folding the leetspeak substitutions that defeat naive lists), and no password built from what an attacker already knows — the holder's own email, name or organization code. One implementation, applied at the request boundary (Zod, so it is in OpenAPI) and again in the services that hold the user's details: self-service change, the reset flow, administrator-created users, tenant onboarding, and the production bootstrap seeder. Temporary passwords now come from a CSPRNG with one character of each class and no fixed prefix.

**Deliberately not done:** a breach-API lookup (HIBP k-anonymity). It would strengthen the check, but it puts a third-party network call on the credential path of a PHI system; the decision belongs to the compliance owner and is tracked in `BACKLOG.md`.

---

## Low

All five closed under ADR-082 on 20/08/2026.

- **L-1 · `x-powered-by` disabled, but no `Server` header suppression** at the reverse proxy — **Fixed**: `server_tokens off` in every server block of `deploy/nginx/nirogix.conf.template`, including the plain-HTTP redirect.
- **L-2 · API documentation exposure in production** — **Fixed**: `OPENAPI_UI_ENABLED` now governs the raw spec as well as the Swagger UI (the spec used to be served unconditionally), and its default is environment-aware: on outside production, **off** in production. CI and codegen build the document from source, so nothing depends on a deployed host serving it.
- **L-3 · Audit log records `path` and `method` but not the request id** — **Fixed**: one id per request, echoed as `X-Request-Id`, attached to every pino line and to the error-tracker event, and stored in the new `audit_log.request_id`. Carried through an AsyncLocalStorage, so an audit written deep in a service still records it. An inbound `X-Request-Id` is honoured only when it is plainly an id, and replaced otherwise, so a caller cannot poison the log or the table.
- **L-4 · No dependency vulnerability gate in CI** — **Fixed**: `npm audit --omit=dev --audit-level=high` fails the build on anything that ships; dev-tool advisories are reported without failing, since a bundler's dev-server advisory is not reachable from production. The gate found a real one on its first run — see **H-5**.
- **L-5 · No client-side session idle timeout** — **Fixed**: `useIdleSignOut` in `@hms/client` ends a session after 15 minutes without interaction, revoking it server-side and saying so through the shared toast. Activity is shared across tabs through `localStorage`, so a second tab never signs a user out of the one they are working in. Used by the staff `AuthProvider` and by the patient portal's own session provider.

---

## Verified as sound (no action)

| Area | Evidence |
|---|---|
| **Authorization is server-side** | Every route composes `requireAuth → requireModule → requirePermission`; the Portal's guards are UX only (invariant #2). Verified live: a receptionist's direct hit on `/audit` renders 403 and the API refuses the same call. |
| **Tenant isolation** | PostgreSQL RLS on every tenant-scoped table plus defence-in-depth `tenant_id` filters on non-unique lookups (ADR-015); automated isolation tests pass (16 suites, 49 tests). |
| **SQL injection** | Drizzle parameterized queries throughout; a grep for interpolated `sql\`…${}\`` found no untrusted interpolation. Sort columns on the audit query are allow-listed, never taken from the client. |
| **Input validation** | Every route body/query is Zod-parsed before business logic; unknown fields are rejected by schema. |
| **Error leakage** | `errorHandler` returns the canonical shape, sends 5xx detail to the error tracker, and never returns a stack trace. The frontend additionally forces generic copy for 5xx (ADR-026). |
| **Secrets** | No `.env` file is tracked (only `.env.example`); the three `NEXT_PUBLIC_*` variables in use are non-secret URLs; no credential literals found in source or client bundles. |
| **Password storage** | bcrypt, cost 12. |
| **Session model** | Access token in memory only (never `localStorage`), refresh token in an `httpOnly`, `Secure`-in-production, `SameSite=Lax`, path-scoped cookie; server-side session rows support revocation, and a password change revokes all of them. Rotation is now genuine (H-4). **Patients have their own session table and their own cookie path** (`/api/v1/patient/auth`), so a staff cookie is never sent to a patient route or the reverse, and a staff refresh token is refused on the patient refresh endpoint (ADR-052). |
| **PHI in logs/analytics** | No analytics is installed in either app; the audit middleware records method/path/actor, not bodies. |
| **Payload limits** | JSON capped at 1 MB; uploads capped by size and count. |
| **The one unauthenticated write path** | `GET|POST /public/registration/:token` (ADR-056) is the only route that writes without a session. Reviewed against each way it could be abused: the tenant is resolved **server-side from the token in the path**, so a caller cannot name a hospital; unknown / regenerated / disabled all return an identical 404, so it cannot enumerate tenants; both routes carry `authLimiter`; it writes to `registration_requests` and never to `patients`, so it cannot create a chart or portal access; the list response is projected field by field, so `tenant_id`, the submitted IP and the reviewer id never leave the server; and submissions are audited against the tenant with no actor. Verified live across two tenants. |
| **Browser credential saving** | Login uses `autocomplete="username"` / `"current-password"` and the profile uses `"new-password"`; no `autocomplete="off"` anywhere, so password managers work normally. |
| **Browser policy** | Every frontend sends a Content-Security-Policy — nonce + `strict-dynamic` on the four authenticated apps, strict-but-inline-permissive on the statically rendered marketing site — plus `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a `Permissions-Policy` that leaves only the microphone (ADR-082). Verified live on all five apps with no violations. |
| **Upload content** | Magic-byte validation in the one upload choke point; the declared MIME type must agree with the bytes, and `text/plain` must genuinely be UTF-8 text (ADR-082). |
| **Credential policy** | One password policy for self-service, administrator-created accounts, onboarding and the production seeder; CSPRNG temporary passwords with no fixed prefix; per-account lockout with audit escalation (ADR-082). |

---

## Production configuration checklist

Before the first production deploy, confirm each of these. Items marked **Blocked** need the staging/production environment to exist.

- [ ] `NODE_ENV=production` set, and env validation passes at startup (`config/env.ts` parses with Zod and fails fast).
- [ ] `CORS_ORIGINS` set to the real Portal and marketing origins (**H-2**).
- [ ] `OPENAPI_UI_ENABLED` left **unset** in production, so both the Swagger UI and the raw spec stay closed (**L-2**). Setting it to `true` there is a deliberate, temporary exception.
- [ ] `NEXT_PUBLIC_API_BASE_URL` set for each frontend — it is what the CSP allows for API calls and API-served images (**M-1**). A wrong or missing value shows up as blocked requests, not as a silent fallback.
- [ ] `DB_STATEMENT_TIMEOUT_MS` / `DB_IDLE_TX_TIMEOUT_MS` reviewed against the slowest legitimate report on production data volumes (**M-2**).
- [ ] Database connected as a **non-superuser** role, so RLS cannot be bypassed (ADR-015 explicitly depends on this).
- [ ] Real `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, generated per environment, never reused from development.
- [ ] Seed/demo accounts (`admin@citycare.example` and friends) **absent** from the production database.
- [ ] TLS terminated, HSTS active, `server_tokens off` in Nginx (**L-1**).
- [ ] R2 bucket jurisdiction-pinned to India for PHI (ADR-017, `BACKLOG.md` I-4). **Blocked**
- [ ] Backup + restore drill executed against the real database (`BACKLOG.md` I-3). **Blocked**
- [ ] Rate limits observed under real traffic and tuned (`RATE_LIMIT_IN_DEV=true` locally to exercise them).
- [ ] Lockout thresholds reviewed with the pilot hospital (**H-3**): 5 failures → 60s, doubling to 15 minutes. A ward with a shared account will hit it; that is a reason to fix the shared account, not to widen the window.
- [ ] Idle timeout confirmed with the pilot (**L-5**): 15 minutes, and reception staff know a locked screen means signing in again, not a fault.
- [ ] **Patient self-registration reviewed per tenant before go-live** (ADR-056): it is off by default and each hospital opts in deliberately. Confirm the pilot hospital knows that a submission is a *request*, that someone works the queue daily, and that regenerating the token invalidates every poster already printed.

---

## How to keep this current

Security is part of every feature, not this document (`resources/rules.md` → Security Rules). For each new API, form, database operation, upload, permission, integration, admin feature or background job, walk: **authentication → authorization → validation → sanitization → rate limiting → data exposure → logging → abuse cases**. Re-run this audit before each production release and update the findings table.
