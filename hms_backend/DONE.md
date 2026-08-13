# hms_backend — DONE.md

Append-only implementation log. Newest at the bottom.

---

## 2026-08-13 — Backend foundation skeleton (Phase 0 / Task #2)

**What:** Initial Express + TypeScript + Drizzle backend foundation. No business logic yet.

**Added:**
- `package.json` — deps (express, helmet, cors, pino/pino-http, zod, dotenv, drizzle-orm, pg, jsonwebtoken, argon2), dev deps (typescript, tsx, drizzle-kit, @types/*), scripts (`dev`/`build`/`start`/`typecheck`/`db:generate`/`db:migrate`/`db:studio`).
- `tsconfig.json` extending `@hms/config` base (CommonJS/Node build to `dist`).
- `.env.example`, `drizzle.config.ts`.
- `src/config/env.ts` (Zod-validated env, fail-fast), `src/config/logger.ts` (pino + PII redaction).
- `src/http/` — `error.ts` (AppError + canonical Errors + single error shape), `errorHandler.ts`, `validate.ts` (Zod middleware), `respond.ts` (pagination envelope).
- `src/db/` — `client.ts` (pg Pool + base Drizzle), `tenantContext.ts` (`runWithTenant()` RLS helper — the tenant-isolation invariant), `schema/index.ts` (barrel).
- `src/modules/health/health.routes.ts` — `/health` + `/health/ready`.
- `src/api/v1/index.ts`, `src/app.ts`, `src/server.ts` (graceful shutdown).
- `KNOWLEDGE.md`.

**API/DB/frontend/integration:** API — `/api/v1/health`, `/api/v1/health/ready`. DB — Drizzle client + RLS tenant-context helper in place; no tables yet. Frontend/integration — none.

**Testing status:** Not yet runnable — blocked on repo-root `pnpm install` (Task 0.0). No automated tests yet (vitest arrives with the testing increment).

**Decisions:** ADR-012 (Drizzle over Prisma) recorded in `DECISIONS.md`. Tenant context set once, transaction-locally, via `runWithTenant()`.

**Known limitations:** No auth/RBAC/entitlement/tenancy tables yet (Tasks #3–#6). Dependency version ranges are best-effort and may need adjustment on first install.

---

## 2026-08-13 — npm workspace install + live verification (Task #1)

**What:** Wired the backend into the root npm workspace and verified it boots and serves.

**Changes:**
- Swapped native `argon2` → pure-JS `bcryptjs` (+ `@types/bcryptjs`) to avoid native-build failures on Windows.
- Added `pino-pretty` devDependency — `logger.ts` uses it as the dev transport; its absence crashed the process at boot (`unable to determine transport target for "pino-pretty"`). Fixed.
- Package manager is npm workspaces + Turborepo (ADR-014), not pnpm.

**Testing status:** Verified live. `npm run dev` (root, turbo) starts backend on `:4000`; `GET /api/v1/health` → `200 {"status":"ok","service":"hms_backend",...}`. `npm run typecheck` green across all 8 workspace packages. Backend runs concurrently with the portal (3000) and marketing (3001) from a single root command.

**Known limitations:** `/health/ready` needs a reachable PostgreSQL (none provisioned locally yet). Business logic still pending (Tasks #3–#6).

---

## 2026-08-13 — Mandatory OpenAPI/Swagger infrastructure (Task #16)

**What:** Established OpenAPI/Swagger as a generated-from-code, environment-aware, CI-enforced part of backend implementation.

**Added (`src/openapi/`):** `registry.ts` (OpenAPIRegistry + openapi-extended `z` + `bearerAuth`), `tags.ts` (23 module tags), `schemas.ts` (shared ErrorResponse/PageMeta/PaginationQuery), `document.ts` (doc builder; servers from config), `register.ts` (module registration barrel), `swagger.ts` (mounts JSON + UI), `validate.ts` (validity + coverage). `modules/health/health.openapi.ts` documents the health endpoints (the module template). `scripts/openapi-generate.ts` + `scripts/openapi-validate.ts`. Local type shim `src/types/express-list-endpoints.d.ts`.

**Deps:** `@asteasolutions/zod-to-openapi`, `swagger-ui-express` (runtime); `@apidevtools/swagger-parser`, `@types/swagger-ui-express`, `express-list-endpoints` (dev).

**Env (env-aware, no hard-coded URLs):** `OPENAPI_TITLE`, `API_VERSION`, `API_PUBLIC_URL`, `API_STAGING_URL`, `API_PRODUCTION_URL`, `OPENAPI_UI_ENABLED`.

**Endpoints:** `GET /api/v1/openapi.json` (always), `GET /api/v1/docs` (Swagger UI, gated by `OPENAPI_UI_ENABLED`).

**Scripts:** `openapi:generate`, `openapi:validate` (backend + root via turbo). CI workflow `.github/workflows/ci.yml` runs typecheck → lint → openapi:validate → build.

**Testing status:** Verified. `npm run typecheck` green. `npm run openapi:validate` → "✓ valid and every /api/v1 route is documented." **Negative test:** injecting an undocumented route made it fail with `Undocumented API route: GET /api/v1/__probe` (then reverted). Live: `/api/v1/openapi.json` returns valid OpenAPI 3.0.3 (env-driven server, bearerAuth, 23 tags); `/api/v1/docs` → 200 Swagger UI.

**Decisions:** Generated-from-Zod (single source of truth) per the existing "not hand-maintained" rule. Coverage enforced via express route listing vs. documented operations.

**Known limitations:** `openapi:validate` builds the app so it needs valid env (CI provides placeholders). Business modules will each add a `*.openapi.ts` as they are built.

---

## 2026-08-13 — DB tenancy + RLS core (Task #3)

**What:** Multi-tenant data isolation via PostgreSQL Row-Level Security.

**Added:**
- Schema: `db/schema/tenants.ts` (platform-managed, no RLS), `db/schema/branches.ts` (tenant-scoped: `tenant_id` FK + per-tenant unique code), barrel updated.
- `db/rls.ts` — `findTenantScopedTables()` + `applyRls()`: auto-applies `ENABLE` + `FORCE` RLS + `tenant_isolation` policy (`current_setting('app.tenant_id')`, fail-closed) to every table with a `tenant_id` column.
- `db/migrate.ts` — runs Drizzle migrations then `applyRls` (`db:migrate` script). `db:generate` produced `drizzle/0000_silent_ted_forrester.sql`.
- `db/tenantContext.ts` — `runWithTenant` now takes an optional `pool` (tests inject a non-superuser pool so RLS applies).
- `db/__tests__/tenant-isolation.test.ts` (vitest) — provisions a throwaway NON-superuser role, seeds tenants A + B, asserts A can't read or write B's branches. Skips if no DB.
- `vitest.config.ts`; `test`/`test:watch` scripts; vitest devDependency.
- CI: `.github/workflows/ci.yml` gained a `postgres:16` service + a `Test` step so the RLS test runs for real on every push.

**API/DB/frontend/integration:** DB — 2 tables + RLS. No API/frontend yet.

**Testing status:** `npm run typecheck` green. Migration generates. Isolation test **skips gracefully** locally (no reachable DB — the local 5432 server's credentials are unknown). Designed to run + pass in CI against the Postgres service, or locally via `TEST_DATABASE_URL`. **Live green run pending a reachable DB** (CI, or a dev-provided URL).

**Decisions:** `tenants` is exempt from RLS (it IS the boundary; provisioning is platform-level) — matches the rule "every table *holding tenant-scoped data* has a tenant_id + RLS". FORCE RLS + mandatory non-superuser app role. RLS applied dynamically (any `tenant_id` table) so coverage can't be forgotten.

**Known limitations:** No auth yet, so `app.tenant_id` isn't wired from a real session (Task #4).

---

## 2026-08-13 (later) — RLS test verified live ✓

Ran against the developer's local PostgreSQL (`hms` database): tenant-isolation test **2/2 passing** — Tenant A reads only its own branch, and RLS `WITH CHECK` blocks A from inserting a row for Tenant B. Added a `db:create` utility (`npm run db:create`) that creates the DB named in `DATABASE_URL` if missing (idempotent) + a vitest `test-setup.ts` that loads `.env` so `npm run test` picks up `DATABASE_URL` locally. **Task #3 acceptance criterion met.**

---

## 2026-08-13 — Authentication (Task #4)

**What:** JWT auth on top of the tenancy core.

**Added:**
- Schema: `users` + `sessions` (both tenant-scoped → RLS auto-applied). Migration `drizzle/0001_ordinary_power_pack.sql`.
- `modules/auth/`: `password.ts` (bcrypt), `tokens.ts` (access/refresh JWT sign+verify, SHA-256 hash, expiry), `auth.service.ts` (org-code login, session issue, refresh rotation, logout, getUserById), `auth.schema.ts` (Zod = validation + OpenAPI), `auth.controller.ts` (+ httpOnly refresh cookie), `auth.routes.ts`, `auth.openapi.ts`.
- `http/requireAuth.ts` (Bearer middleware → `req.auth`), `http/asyncHandler.ts`, `types/express.d.ts` (Request.auth augmentation).
- Wiring: cookie-parser in `app.ts`; authRouter mounted at `/api/v1`; auth openapi registered.
- `db:seed` (demo tenant CITYCARE + admin user); `db:create` from #3.
- Tests: `modules/auth/__tests__/auth.test.ts` (password/token primitives, 5 tests).

**API:** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` — all documented in OpenAPI (mandatory gate passes).

**Testing status:** `typecheck` green · `openapi:validate` green (all auth routes documented + covered) · full suite **7/7 passing** (2 RLS + 5 auth). **Live-verified** against the running backend + real DB: login → 200 (access JWT + HttpOnly refresh cookie); `/me` with token → 200, without → 401; refresh → 200 (rotated); wrong password → 401; logout → 200.

**Decisions:** Org-code tenant resolution at login (RLS-clean: resolve tenant first, then scope). Server-side sessions for refresh rotation + revocation. Access token carries `tid` so RLS context is always from the authenticated session. MFA hook via `users.mfaEnabled`; SSO reserved at the token layer.

**Known limitations:** `roles` is empty until RBAC (#5). MFA challenge returns a state but no second-factor verification yet. No password-reset/forgot flow yet (Phase 0 scaffolds the screen; endpoints later).

---

## 2026-08-13 — RBAC engine + overrides + temporary permissions (Task #5)

**What:** Role-based access control with per-user overrides and time-bound permissions.

**Added:**
- `@hms/permissions` (shared): dot-hierarchy `PERMISSIONS` catalog, `WILDCARD`, `SYSTEM_ROLES` (8 MVP roles + their defaults). Backend now depends on it.
- Schema: `permissions` (global catalog) + `roles`, `role_permissions`, `user_roles`, `user_permission_overrides` (tenant-scoped, RLS). Migration `drizzle/0002_silly_sumo.sql`.
- `modules/rbac/`: `rbac.service.ts` (seed catalog, provision tenant roles, assign role, **resolvePermissions**, setOverride/revokeOverride), `permissionCache.ts` (ADR-010 bounded cache + targeted invalidation), `rbac.schema.ts`, `rbac.controller.ts`, `rbac.routes.ts`, `rbac.openapi.ts`.
- `http/requirePermission.ts` — the 3rd authz link.
- Seed extended: provision roles per tenant + a demo `org_admin` and `receptionist` user.
- Tests: `modules/rbac/__tests__/rbac.test.ts` (role perms, DENY-over-GRANT, temporary window, cache invalidation).

**API:** `GET /api/v1/rbac/permissions`, `GET /api/v1/rbac/roles` — both documented (OpenAPI gate passes).

**Testing status:** typecheck green · openapi:validate green · full suite **11/11** (2 RLS + 4 RBAC + 5 auth). **Live-verified:** org_admin `GET /rbac/roles` → 200 (8 roles); receptionist → **403** (lacks `platform.roles.view`); effective permissions correct (org_admin 10, receptionist 5).

**Decisions:** DENY always wins; effective = union(roles) + grants − denies. Resolution cached, bounded by earliest temporary `valid_until` (ADR-010), invalidated on any change. requirePermission resolves server-side (cached) rather than trusting the JWT `roles` claim, so a permission change takes effect without re-login. Roles are tenant-scoped (seeded per tenant, cloneable).

**Known limitations:** Admin CRUD endpoints for granting roles/overrides not yet exposed (service functions exist; UI/endpoints later). Permission grant/revoke audit deferred to Task #7 (TODO in `setOverride`). requireModule (entitlement) is Task #6.

---

## 2026-08-13 — Module entitlements + requireModule (Task #6)

**What:** The 2nd authorization link — tenant module entitlements gating business modules before permission checks. Completes the chain `auth → module → permission → logic`.

**Added:**
- `modules/entitlement/moduleCatalog.ts` (module keys + hard-dependency graph).
- Schema `tenant_entitlements` (tenant-scoped, RLS) — state machine + effective dates + soft-transition timestamps. Migration `drizzle/0003_talented_clea.sql`.
- `entitlement.service.ts`: isModuleEntitled, listEntitledModules, **grantModule (hard-dep enforcement)**, setModuleStatus.
- `http/requireModule.ts` (403 MODULE_NOT_ENTITLED); `entitlement.{schema,controller,routes,openapi}.ts`.
- Routes: `GET /entitlements` + demonstrators `GET /patients` (auth→module→permission) and `GET /ipd/beds` (requireModule only). Documented.
- Seed grants the 7 MVP modules to CITYCARE (dependency order). vitest `allowExitOnIdle` on the pool so the suite exits cleanly.
- Test `entitlement.test.ts` (grant/eval, hard-dep refusal, suspend, expired).

**Defense-in-depth fix (ADR-015):** a failing test exposed that services relied purely on RLS, which the dev **superuser** connection bypasses — leaking rows matched by non-tenant-unique columns (module/role key, email). Added explicit `tenant_id` filters to those queries (entitlement; rbac role-by-key + listRoles; auth login-by-email). RLS remains primary; app-layer filter is the backstop.

**Testing status:** typecheck green · openapi:validate green · full suite **15/15** (2 RLS + 4 RBAC + 4 entitlement + 5 auth). **Live-verified:** `/entitlements` lists 7 modules; `/patients` → 200 (full chain); `/ipd/beds` → **403 MODULE_NOT_ENTITLED**.

**Decisions:** ADR-015 (defense-in-depth tenant scoping). A fresh grant is permanent unless an expiry is given. `tenant_entitlements` never deleted (state as data).

**Known limitations:** Branch-scoped entitlement evaluation (nullable `branch_id`) is schema-ready but `requireModule` checks org-wide only. Admin CRUD endpoints for granting entitlements not exposed (service functions exist). Entitlement changes not yet audited (Task #7). Demonstrator `/patients` + `/ipd/beds` are placeholders for the real modules.
