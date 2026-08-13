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
