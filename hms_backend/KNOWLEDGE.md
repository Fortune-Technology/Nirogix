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
    tenantContext.ts  runWithTenant() — the RLS invariant helper
    schema/index.ts   Drizzle schema barrel (tables added per module)
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

## Permissions / RBAC / entitlement

Not yet implemented (Tasks #4–#6). The `/api/v1` router and error codes already reserve their slots: routers will mount as `requireModule(...)` → `requirePermission(...)`. Permission keys will live in `@hms/permissions`.

## Endpoints (current)

- `GET /api/v1/health` — liveness
- `GET /api/v1/health/ready` — DB readiness (503 if PostgreSQL unreachable)
- `GET /api/v1/openapi.json` — OpenAPI 3 spec (always served)
- `GET /api/v1/docs` — Swagger UI (when `OPENAPI_UI_ENABLED=true`)

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
