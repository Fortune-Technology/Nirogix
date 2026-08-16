# SECURITY-AUDIT.md — production readiness review

Target environment: **`NODE_ENV=production`**. Scope: `hms_backend`, `hms_frontend`, `marketing`, shared packages, configuration and dependencies.

Reviewed 15/08/2026, updated 16/08/2026 (H-4, patient session model) against the code in this repository. Findings are evidence-based: each one names where it was verified. **Development behaviour was not accepted as production behaviour** — several findings exist precisely because a setting is fine locally and wrong in production.

**Status legend:** `Fixed` in this pass · `Open` needs work · `Accepted` deliberate, with the reason · `Blocked` needs infrastructure.

---

## Summary

| Severity | Count | Fixed | Open |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 4 | 3 | 1 |
| Medium | 6 | 3 | 3 |
| Low | 5 | 0 | 5 |

No critical finding. The architecture's security invariants hold: authorization is enforced server-side on every route, tenant isolation is RLS-backed and tested, queries are parameterized, and the error handler never leaks internals. The gaps are operational hardening — rate limiting, CORS, security headers, and the production-config checks that only matter once real traffic arrives.

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

### H-3 · No brute-force lockout or credential-stuffing detection beyond rate limiting — **Open**
Rate limiting slows an attacker but nothing tracks repeated failures per *account*, so a slow distributed attempt against one known email is still viable, and there is no signal to a defender.

**Recommended:** count consecutive failures per user, lock briefly with exponential backoff, and raise an audit event at a threshold. The audit trail and notification service already exist to carry it.

---

## Medium

### M-1 · Security headers are helmet defaults; no CSP — **Open**
`helmet()` is applied (good: `X-Content-Type-Options`, `Referrer-Policy`, frame protection, HSTS in production). There is **no Content-Security-Policy** on either frontend, so an injected script would not be blocked by policy. Next's inline hydration and our no-flash theme script need a nonce or hash, which is why this was not switched on blind.

**Recommended:** add a CSP in `next.config.ts` for both apps, starting in report-only, with a nonce for the theme script.

### M-2 · Expensive endpoints had no range cap or query timeout — **Partly fixed**
`pageSize` was capped at 100 on audit, but reports took a date range with **no validation and no maximum span**, so a multi-year range was a single unbounded scan. No statement timeout is configured on the database connection.

**Fixed:** report queries now validate the date format server-side and reject a span over 366 days, and `expensiveLimiter` is applied to the report and upload routes. **Still open:** a `statement_timeout` on the connection pool.

### M-3 · No CSRF defence beyond `SameSite=Lax` — **Accepted, documented**
The refresh cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production and scoped to `/api/v1/auth`; the access token is sent in an `Authorization` header held in memory, never a cookie. `SameSite=Lax` blocks cross-site POSTs, so the practical CSRF surface is small. Once H-2's allowlist is in place, cross-origin abuse is closed off too.

**Revisit if** any state-changing endpoint ever starts accepting cookie-only authentication.

### M-4 · Upload validation trusts client-declared MIME type — **Open**
`file.upload.ts` caps size (`FILE_MAX_SIZE_MB`) and count, which is the important half. Type checking relies on the declared MIME type; content sniffing (magic bytes) is not performed, so a renamed file can be stored with a misleading type.

**Recommended:** verify magic bytes server-side for the allowed types, and continue serving PHI-bearing files only through short-lived signed URLs (already the case).

### M-5 · Login timing could enumerate accounts — **Fixed**
Login failures return "Invalid credentials" uniformly (verified in `auth.service.ts`), which is right — but the **timing** differed: an unknown email returned without running bcrypt at all, while a wrong password paid a full bcrypt round. That difference is a classic account-enumeration oracle.

**Fixed** in `auth/password.ts`: `burnPasswordComparison()` runs a bcrypt compare against a precomputed dummy hash whenever the account is not found, so the unknown-email and wrong-password paths cost the same.

### M-6 · Password policy is length-only — **Fixed for self-service, Open elsewhere**
The new self-service change enforces ≥10 characters and rejects reuse of the current password. Admin-created passwords and the seed still use a fixed pattern, and there is no check against known-breached passwords.

---

## Low

- **L-1 · `x-powered-by` disabled, but no `Server` header suppression** at the reverse proxy. Nginx config lives in `deploy/`; set `server_tokens off`.
- **L-2 · Swagger UI in production** is toggled by `OPENAPI_UI_ENABLED`; confirm it is off in the production environment (the spec itself is always served — decide whether that is intended publicly).
- **L-3 · Audit log records `path` and `method` but not the request id**, making correlation with error-tracker entries manual.
- **L-4 · No dependency vulnerability gate in CI.** `npm audit` currently reports 0 vulnerabilities, but nothing fails the build if that changes.
- **L-5 · Portal has no client-side session idle timeout.** Access tokens are short-lived and held in memory, so the practical exposure is small, but a shared clinical workstation left open keeps a usable session until the refresh token expires.

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
| **Browser credential saving** | Login uses `autocomplete="username"` / `"current-password"` and the profile uses `"new-password"`; no `autocomplete="off"` anywhere, so password managers work normally. |

---

## Production configuration checklist

Before the first production deploy, confirm each of these. Items marked **Blocked** need the staging/production environment to exist.

- [ ] `NODE_ENV=production` set, and env validation passes at startup (`config/env.ts` parses with Zod and fails fast).
- [ ] `CORS_ORIGINS` set to the real Portal and marketing origins (**H-2**).
- [ ] `OPENAPI_UI_ENABLED=false` (**L-2**).
- [ ] Database connected as a **non-superuser** role, so RLS cannot be bypassed (ADR-015 explicitly depends on this).
- [ ] Real `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, generated per environment, never reused from development.
- [ ] Seed/demo accounts (`admin@citycare.example` and friends) **absent** from the production database.
- [ ] TLS terminated, HSTS active, `server_tokens off` in Nginx (**L-1**).
- [ ] R2 bucket jurisdiction-pinned to India for PHI (ADR-017, `BACKLOG.md` I-4). **Blocked**
- [ ] Backup + restore drill executed against the real database (`BACKLOG.md` I-3). **Blocked**
- [ ] Rate limits observed under real traffic and tuned (`RATE_LIMIT_IN_DEV=true` locally to exercise them).

---

## How to keep this current

Security is part of every feature, not this document (`resources/rules.md` → Security Rules). For each new API, form, database operation, upload, permission, integration, admin feature or background job, walk: **authentication → authorization → validation → sanitization → rate limiting → data exposure → logging → abuse cases**. Re-run this audit before each production release and update the findings table.
