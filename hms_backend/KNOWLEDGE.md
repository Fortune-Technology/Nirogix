# hms_backend — KNOWLEDGE.md

Current state of the HMS backend API. Read after root `CLAUDE.md`. See `DONE.md` for the chronological log.

## Purpose

Node.js + Express + TypeScript REST API for the HMS platform. Modular monolith: each business module owns `routes → controller → service → repository`. Versioned under `/api/v1`.

## Stack

- Express 4 + TypeScript (CommonJS build via `tsc`, dev via `tsx watch`)
- **Drizzle ORM** (ADR-012) over `pg` Pool → PostgreSQL
- Zod validation · pino logging (PII-redacted, pretty in dev via pino-pretty) · helmet · cors
- OpenAPI docs via `zod-to-openapi` + `swagger-ui-express`; spec validated by `@apidevtools/swagger-parser` + a route-coverage check
- (coming) bcryptjs password hashing · jsonwebtoken · BullMQ

## Layout

```
src/
  config/
    env.ts            Zod-validated environment (fails fast at boot)
    logger.ts         pino logger with PII/secret redaction
  http/
    error.ts          AppError + canonical Errors + ErrorShape { error: { code, message, details? } }
    errorHandler.ts   terminal Express error middleware (AppError / ZodError / 500)
    validate.ts       validate({ body, query, params }) Zod middleware
    respond.ts        paginate() — shared pagination envelope
  db/
    client.ts         pg Pool + base Drizzle instance (tenant-agnostic bootstrap only)
    tenantContext.ts  runWithTenant(tenantId, fn, pool?) — the RLS invariant helper
    rls.ts            RLS policy template; applyRls() auto-applies to every tenant_id table
    migrate.ts        runs Drizzle migrations + applyRls (the `db:migrate` script)
    schema/
      tenants.ts      tenants (platform-managed; no RLS) · branches.ts (tenant-scoped; RLS)
      index.ts        barrel
    __tests__/tenant-isolation.test.ts   RLS isolation test (skips if no DB reachable)
  modules/
    health/health.routes.ts   /health (liveness) + /health/ready (DB readiness)
  api/v1/index.ts     the /api/v1 router; module routers mount here
  app.ts              buildApp (middleware + routes + error handler)
  server.ts           boot + graceful shutdown
drizzle.config.ts     Drizzle Kit config (migrations → ./drizzle)
```

## Key conventions (enforced)

- **Tenant isolation:** all tenant-scoped queries run inside `runWithTenant(tenantId, tx => ...)`, which sets `app.tenant_id` (transaction-local) so PostgreSQL RLS restricts every row. `tenantId` comes only from the authenticated session. Never query tenant data through the base `db` instance.
- **One error shape:** throw `AppError` (or a canonical `Errors.*`); `errorHandler` renders `{ error: { code, message, details? } }`. The authz chain maps to `UNAUTHORIZED` → `MODULE_NOT_ENTITLED` → `FORBIDDEN`.
- **Validation:** every request body/query/params validated with Zod via `validate(...)` before business logic.
- **Env:** add new config to `EnvSchema` in `config/env.ts` and to `.env.example`.

## Tenancy & RLS

- **Tables:** `tenants` (the tenant/hospital — platform-managed, provisioned by an operator, **no** `tenant_id`/RLS) and `branches` (tenant-scoped: has `tenant_id` + RLS). Every future tenant-scoped table follows the `branches` shape.
- **Isolation mechanism:** PostgreSQL Row-Level Security. `rls.ts` finds every `public` table with a `tenant_id` column and applies `ENABLE` + **`FORCE`** RLS + a `tenant_isolation` policy reading `current_setting('app.tenant_id')`. `db:migrate` runs Drizzle migrations then `applyRls()` — so RLS coverage is automatic, not remembered per table.
- **Per-request context:** `runWithTenant(tenantId, fn, pool?)` opens a transaction, sets `app.tenant_id` (transaction-local), and runs `fn` against a Drizzle tx. All queries inside are auto-scoped. `tenantId` comes only from the authenticated session.
- **⚠ Superuser caveat:** superusers bypass RLS even with FORCE. The app **must** connect as a NON-superuser role in every environment, or isolation is silently off. `DATABASE_URL` must not be a superuser in staging/production.
- **Defense-in-depth (ADR-015):** queries that match by a non-tenant-unique column (module key, role key, email) ALSO filter by `tenant_id` explicitly, so correctness doesn't depend solely on RLS (which a superuser connection bypasses). RLS stays the primary DB-layer guarantee; id-based queries (user_id, role_id, session_id) rely on it.
- **Migrations:** `npm run db:generate` (drizzle-kit, no DB) → SQL in `drizzle/`; `npm run db:migrate` applies them + RLS. Additive/reversible only.

## Testing

- `npm run test` → vitest. `db/__tests__/tenant-isolation.test.ts` provisions a throwaway non-superuser role, seeds two tenants, and asserts Tenant A can neither read nor write Tenant B's rows.
- Needs a reachable PostgreSQL via `TEST_DATABASE_URL` (else `DATABASE_URL`) whose role can create a role + tables. **Skips cleanly** (green) if none is reachable; **CI runs it for real** against a Postgres service (`.github/workflows/ci.yml`).

## Authentication

- **Org-scoped login:** `POST /auth/login { orgCode, email, password }` → resolve tenant by code → find user within tenant (RLS) → verify bcrypt hash → issue tokens. Generic error on any failure (no user/org enumeration).
- **Tokens:** short-lived JWT **access** token (`Authorization: Bearer`, claims `{ sub, tid, roles }`); long-lived **refresh** token in an **httpOnly** cookie (`hms_refresh`, path `/api/v1/auth`, `secure` in prod). Refresh is backed by a server-side `sessions` row (SHA-256 hash) → **rotation + revocation** on refresh/logout.
- **`requireAuth`** (`http/requireAuth.ts`) verifies the access token and sets `req.auth = { userId, tenantId, roles }`. Downstream scopes RLS from `req.auth.tenantId` — tenant comes from the token, never the client. `http/asyncHandler.ts` routes async errors to the error middleware.
- **MFA hook:** `users.mfaEnabled` → when true, login returns `{ mfaRequired: true }` instead of tokens (second-factor verification is a later phase). **SSO** (SAML/OAuth2/OIDC) is a reserved provider that plugs into the same `issueSession()`/token layer.
- **Demo:** `npm run db:seed` → tenant `CITYCARE` + `admin@citycare.example` / `ChangeMe#123`.

## Authorization — RBAC

- **Catalog:** permission keys live in `@hms/permissions` (dot-hierarchy `module.submodule.action`) + `SYSTEM_ROLES` (the 8 MVP roles). Backend `permissions` table (global, seeded) is the catalog.
- **Tables (tenant-scoped, RLS):** `roles`, `role_permissions`, `user_roles`, `user_permission_overrides`.
- **Resolver** (`modules/rbac/rbac.service.ts` → `resolvePermissions`): effective = union(role perms) + GRANT overrides − DENY overrides; **explicit DENY always wins**; temporary overrides honoured by `valid_from`/`valid_until`; `WILDCARD ('*')` = all (super_admin).
- **Cache** (`modules/rbac/permissionCache.ts`): resolved sets cached; **TTL bounded by the earliest temporary `valid_until` (ADR-010)**; any role/override change → targeted `invalidateUser`.
- **`requirePermission(key)`** (`http/requirePermission.ts`): the 3rd authz link (`requireAuth → requireModule → requirePermission → logic`). Resolves (cached) + enforces; 403 on miss. A route's key is declared explicitly, never inferred.
- **Provisioning:** `provisionTenantRbac(tenantId)` seeds the system roles per tenant (idempotent); `assignRoleByKey` / `setOverride` / `revokeOverride` mutate + invalidate.
- Verified live: org_admin → `GET /rbac/roles` 200; receptionist → 403.

## Module entitlement

- **Catalog:** `modules/entitlement/moduleCatalog.ts` — module keys + hard-dependency graph (e.g. `ot→ipd`, `cssd→ot`, `insurance→billing`), deliberately sparse.
- **Table (tenant-scoped, RLS):** `tenant_entitlements` — per (tenant, module, nullable branch) with a state machine (TRIAL/ACTIVE/SUSPENDED/EXPIRED/CANCELLED/DEACTIVATED) + `effective_from`/`until`. Never physically deleted.
- **Evaluation** always combines status **+** effective dates (never status alone): `isModuleEntitled`, `listEntitledModules`.
- **`grantModule`** enforces hard dependencies at grant time (refuses to activate a module whose hard dep isn't entitled); `setModuleStatus` for soft transitions. Provisioning is operator-driven; enforcement automatic. A fresh grant is permanent unless an expiry is given.
- **`requireModule(key)`** (`http/requireModule.ts`) — the **2nd authz link**: `requireAuth → requireModule → requirePermission → logic`. Returns 403 `MODULE_NOT_ENTITLED` before any permission check.
- Verified live: `/patients` (patient entitled + PATIENT_VIEW) → 200; `/ipd/beds` (ipd not entitled) → 403.

## Audit log

- **Immutable trail:** `audit_log` (tenant-scoped, RLS) is **append-only** — a DB trigger (`db/auditProtection.ts`, applied by `db:migrate`) blocks UPDATE/DELETE, so it's tamper-evident even against the app role. Never deleted. `severity` supports the enhanced break-glass event.
- **`writeAudit(entry)`** (`modules/audit/audit.service.ts`) — best-effort (a failed audit write is logged, never breaks the request). Tenant-scoped.
- **Auto-audit:** `http/auditMiddleware.ts` audits every authenticated mutating request (method/path/status/actor).
- **Explicit events:** login success/failure (`auth.login.*`), permission grant/deny/revoke (`rbac.override.*`), role assignment (`rbac.role.assign`), entitlement changes (`entitlement.grant` / `entitlement.status`).
- **View:** `GET /api/v1/audit` (paginated, newest first) requires `audit.log.view`.
- Verified live: a login writes an `audit_log` row; `/audit` returns the trail; a user without `audit.log.view` → 403; UPDATE/DELETE blocked (tested). The `/api/v1` router and error codes already reserve their slots: routers will mount as `requireModule(...)` → `requirePermission(...)`. Permission keys will live in `@hms/permissions`.

## Endpoints (current)

- `GET /api/v1/health` — liveness
- `GET /api/v1/health/ready` — DB readiness (503 if PostgreSQL unreachable)
- `GET /api/v1/openapi.json` — OpenAPI 3 spec (always served)
- `GET /api/v1/docs` — Swagger UI (when `OPENAPI_UI_ENABLED=true`)
- `POST /api/v1/auth/login` · `POST /api/v1/auth/refresh` · `POST /api/v1/auth/logout` · `GET /api/v1/auth/me`
- `GET /api/v1/rbac/permissions` (my effective permissions) · `GET /api/v1/rbac/roles` (requires `platform.roles.view`)
- `GET /api/v1/entitlements` (entitled modules) · `GET /api/v1/patients` + `GET /api/v1/ipd/beds` (authz-chain demonstrators)
- `GET /api/v1/audit` (audit trail, paginated; requires `audit.log.view`)

## API documentation (OpenAPI) — MANDATORY

Generated from route definitions (Zod + zod-to-openapi), never hand-written (resources/rules.md → API Documentation Rules). Files in `src/openapi/`:

- `registry.ts` — shared `OpenAPIRegistry`, openapi-extended `z`, `bearerAuth` scheme
- `tags.ts` — module tag taxonomy · `schemas.ts` — shared `ErrorResponse` / `PageMeta` / `PaginationQuery`
- `document.ts` — builds the OpenAPI doc; **servers come from config** (`API_PUBLIC_URL` / `API_STAGING_URL` / `API_PRODUCTION_URL`), never hard-coded
- `register.ts` — imports every module's `*.openapi.ts` (side-effect registration)
- `swagger.ts` — mounts `/api/v1/openapi.json` + `/api/v1/docs`
- `validate.ts` — spec validity ($refs/schemas/params) + duplicate operationIds + missing responses/tags/security + **route coverage** (no undocumented `/api/v1` route)

**To document a new route:** create `modules/<module>/<module>.openapi.ts` calling `registry.registerPath(...)` with request/response Zod schemas, then import it in `src/openapi/register.ts`. `modules/health/health.openapi.ts` is the template.

**Enforcement:** `npm run openapi:validate` (CI + pre-merge) fails on any undocumented/invalid API. `npm run openapi:generate` writes `generated/openapi.json` (gitignored) for codegen.

## Constraints / troubleshooting

- Requires `.env` (copy `.env.example`). Invalid env exits at boot with field errors.
- Installed and verified: `npm run install:all` at the repo root; `npm run dev` starts this API on `:4000` (health at `GET /api/v1/health`). Run just this app with `npm run dev -w hms_backend`.
- `/health/ready` returns 503 until a reachable PostgreSQL is configured in `.env` (the pool connects lazily).
