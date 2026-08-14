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
- **Onboarding (operator-driven, ADR-020):** the Super-Admin surface (`modules/admin/`) creates tenants via the API — no more editing `seed.ts`. `POST /api/v1/admin/tenants` runs one flow: create tenant → `provisionTenantRbac` → grant modules (with hard-dependency closure) → create the first `org_admin` (one-time temp password, returned once) → create branches; audited. Cross-tenant by nature: the tenant row is created on the no-RLS `tenants` table, everything else runs in the **new tenant's** `runWithTenant` context (so RLS isolates it from birth). Gated by `platform.tenants.manage` — only a `super_admin` (WILDCARD) resolves it; an `org_admin` gets 403. Platform listing reads the no-RLS `tenants` table; per-tenant detail is fetched in that tenant's own context. **Not public self-registration** — self-serve signup stays in the Enterprise track.
- **Org-Admin surface (A2):** tenant-scoped user + branch management. `modules/user/` — list/create (one-time temp password) / detail (roles + effective permissions + active overrides) / update-status; assign & remove roles; add & revoke permission overrides (GRANT/DENY, time-bound — DENY wins). `modules/branch/` — list/create/update. Reads gated by `platform.users.view`/`platform.branches.view`, account mutations by `.manage`, role/override mutations by `platform.rbac.manage` — all held by `org_admin`. Everything runs under the caller's tenant (RLS); every mutation is audited.

## Testing

- `npm run test` → vitest. `db/__tests__/tenant-isolation.test.ts` provisions a throwaway non-superuser role, seeds two tenants, and asserts Tenant A can neither read nor write Tenant B's rows.
- Needs a reachable PostgreSQL via `TEST_DATABASE_URL` (else `DATABASE_URL`) whose role can create a role + tables. **Skips cleanly** (green) if none is reachable; **CI runs it for real** against a Postgres service (`.github/workflows/ci.yml`).

## Authentication

- **Org-scoped login:** `POST /auth/login { orgCode, email, password }` → resolve tenant by code → find user within tenant (RLS) → verify bcrypt hash → issue tokens. Generic error on any failure (no user/org enumeration).
- **Tokens:** short-lived JWT **access** token (`Authorization: Bearer`, claims `{ sub, tid, roles }`); long-lived **refresh** token in an **httpOnly** cookie (`hms_refresh`, path `/api/v1/auth`, `secure` in prod). Refresh is backed by a server-side `sessions` row (SHA-256 hash) → **rotation + revocation** on refresh/logout.
- **`requireAuth`** (`http/requireAuth.ts`) verifies the access token and sets `req.auth = { userId, tenantId, roles }`. Downstream scopes RLS from `req.auth.tenantId` — tenant comes from the token, never the client. `http/asyncHandler.ts` routes async errors to the error middleware.
- **MFA hook:** `users.mfaEnabled` → when true, login returns `{ mfaRequired: true }` instead of tokens (second-factor verification is a later phase). **SSO** (SAML/OAuth2/OIDC) is a reserved provider that plugs into the same `issueSession()`/token layer.
- **Demo:** `npm run db:seed` → the **`PLATFORM` org** (Takoriya Technology LLP — the vendor; holds the System Super Admin `owner@takoriya.example`, no clinical data; ADR-022) + **2 Indian-context hospitals** (`CITYCARE` — Pune; `SUNRISE` — Ahmedabad), each with a branch layout and **one user per role** (top role `org_admin` — no super-admin inside a hospital). Login with org code + email + `ChangeMe#123` (platform: `PLATFORM`/`owner@takoriya.example`; hospital: `CITYCARE`/`admin@citycare.example`). Idempotent; staging only (never production).

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
- Verified live: a login writes an `audit_log` row; `/audit` returns the trail; a user without `audit.log.view` → 403; UPDATE/DELETE blocked (tested).

## Notifications

- **Provider abstraction (ADR-007):** `modules/notification/providers/` defines `EmailProvider`/`SmsProvider`. A dev **log** provider (logs, doesn't send) is used when `MSG91_API_KEY` is unset; **MSG91** adapters (SMS/WhatsApp + email, ADR-016) are selected when it's set. No module calls MSG91 directly.
- **`NotificationService`** (`notification.service.ts`): `sendEmail` / `sendSms` — render a per-tenant `{{template}}`, dispatch via the provider, write `notification_log`. **Idempotent** via `idempotencyKey` (a repeat returns the original entry, no re-send).
- **Tables (tenant-scoped, RLS):** `notification_log` (delivery status) + `notification_templates` (per-tenant, per-channel/locale).
- **Endpoints:** `POST /notifications/test` (`notifications.send`) · `GET /notifications` (`notifications.log.view`).
- Verified live: admin sends → `sent` via the `log` provider; receptionist → 403.
- **Go-live:** set `MSG91_*` env keys + complete DLT/sender registration (24–48h). SES stays a swappable alternative behind the same interface. Async delivery moves onto BullMQ in Task #10.

## File storage

- **Provider abstraction (ADR-007):** `modules/file/providers/` — `local` disk provider (dev) + `R2FileStorageProvider` (Cloudflare R2, S3-compatible object storage, via the **MinIO** client — no AWS; ADR-017) selected by `FILE_STORAGE_PROVIDER` (`local`|`r2`). No module touches the storage client.
- **Metadata only:** `file_metadata` (tenant-scoped, RLS) stores storage key, filename, MIME, size, **sha256 checksum**, uploader, version — never file content.
- **Server-side validation** (`file.upload.ts`, multer): MIME allow-list + size limit (`FILE_MAX_SIZE_MB`, default 25) before the handler runs.
- **Downloads:** short-lived signed URLs — a presigned R2 URL (r2 provider) or an app-served tokenized route `/files/content/:id?token=` (local). Default-private; nothing is a permanent public URL.
- **Endpoints:** `POST /files` (`files.document.upload`) · `GET /files/:id` → URL (`files.document.view`) · `GET /files/content/:id?token=` (token-authorized) · `DELETE /files/:id` (`files.document.delete`).
- **Audit:** upload, download, and delete are audit-logged. Delete removes the object + soft-deletes metadata (retained for audit); `version` supports amended documents.
- Verified live: upload → metadata+checksum; download URL → content; delete → 204 then 404; unsupported type → 422.

## Domain events & background jobs

- **Event bus** (`events/`): typed in-process publish/subscribe (`eventBus.publish/subscribe`), NOT a broker. A module publishes once; subscribers react independently; a failing subscriber never breaks the publisher. Events include `user.logged_in` (published on login), `notification.requested`, `appointment.booked`, `invoice.created`. Subscribers wired in `events/subscribers.ts`.
- **Job runner** (`jobs/`): one abstraction, two backends — **BullMQ** (Redis) when `REDIS_URL` is set, else an **inline** in-process runner (dev/CI). `getJobRunner().enqueue(name, data, { delaySeconds? })`; processors in `jobs/processors.ts`. BullMQ jobs are retryable (3 attempts, exp backoff) and schedulable (delay). **No module creates its own cron.**
- **Bootstrap:** `initBackground()` (called by `server.ts` + tests) registers processors + subscribers.
- **Pipeline:** `notification.requested` event → subscriber enqueues `notification.send` job → runner delivers via NotificationService. `POST /notifications/test {async:true}` → 202 (queued) exercises it end-to-end.
- Verified live: an async send returns 202 and the notification is delivered via the job path (appears in `/notifications`). The `/api/v1` router and error codes already reserve their slots: routers will mount as `requireModule(...)` → `requirePermission(...)`. Permission keys will live in `@hms/permissions`.

## Providers & specialties (FHIR-aligned, ADR-008)

- **Model:** `providers` (FHIR **Practitioner** — the person: name, gender, registration/qualification, optional `user_id` link) and `practitioner_roles` (FHIR **PractitionerRole** — a provider's specialty at an optional branch). Assigning a specialty is a **data change** (insert a role row), never a schema change — no per-specialty tables, no EAV.
- **Global specialty catalog:** `specialties` (reference table, **no RLS** — global) seeded from `modules/provider/specialtyCatalog.ts` (17 specialties). `snomedCode` intentionally left null until verified codes are sourced. `practitionerRoles.specialtyCode` is validated against this catalog (`assignSpecialty` throws a 422 `VALIDATION` on an unknown code).
- **No-EAV specialty variation (invariant #5):** `specialty_form_templates` (tenant-scoped, RLS) holds a versioned JSON Schema per specialty/key — specialty-specific fields are configured as form templates, while core clinical entities stay strongly typed.
- **Tables:** `providers`, `practitioner_roles`, `specialty_form_templates` (tenant-scoped, RLS + explicit `tenant_id` filters per ADR-015); `specialties` (global). Migration `drizzle/0007_clammy_wildside.sql`.
- **Endpoints:** `GET /specialties` · `GET|POST /providers` · `GET /providers/:id` · `POST /providers/:id/specialties` · `GET|POST /specialty-templates` — read gated by `providers.view`, writes by `providers.manage`. Create/assign/template writes are audited.
- Verified live: 17 specialties listed; seeded "Dr. Ananya Sharma" (cardiology); created a provider + assigned orthopedics (PractitionerRole); unknown specialty → **422**; form template created.

## Patient Management (MVP 0 — first clinical module)

- **The first real business module** through the full authz chain: `requireAuth → requireModule('patient') → requirePermission → logic`. A tenant not entitled to `patient` gets **403 MODULE_NOT_ENTITLED** before any permission check — verified live even for a wildcard super-admin whose (PLATFORM) tenant lacks the entitlement.
- **`patients`** (tenant-scoped, RLS; migration `drizzle/0009_*`) — a **strongly-typed** core clinical entity (no EAV, invariant #5): name, gender, DOB, phone/email, blood group, address + **PIN code**, **ABHA number**, emergency contact, lifecycle `status` (active/archived). Per-tenant **UHID** (`UHID-000001`…) auto-allocated on registration (unique `(tenant_id, uhid)`, retry-on-conflict).
- **`patient.service`:** `createPatient` (UHID allocation + audit), `getPatient`, `listPatients` (paginated + search across UHID/name/phone via `ILIKE`), `updatePatient`, `countPatients` (feeds the dashboards). Explicit `tenant_id` filters (ADR-015) + audited.
- **Permissions:** `patient.record.view` (list/get) · `create` (register) · `update` (edit) — receptionist creates + views, doctor also updates. The old `/patients` stub (from the entitlement demonstrator) was replaced by this module.
- Verified live: receptionist registers a patient (UHID assigned) + searches; a receptionist **cannot** update (403 — no `patient.record.update`); a doctor can; the dashboard patient count updates.

## Endpoints (current)

- `GET /api/v1/health` — liveness
- `GET /api/v1/health/ready` — DB readiness (503 if PostgreSQL unreachable)
- `GET /api/v1/openapi.json` — OpenAPI 3 spec (always served)
- `GET /api/v1/docs` — Swagger UI (when `OPENAPI_UI_ENABLED=true`)
- `POST /api/v1/auth/login` · `POST /api/v1/auth/refresh` · `POST /api/v1/auth/logout` · `GET /api/v1/auth/me`
- `GET|POST /api/v1/admin/tenants` · `GET /api/v1/admin/tenants/{id}` · `PATCH /api/v1/admin/tenants/{id}/status` · `POST /api/v1/admin/tenants/{id}/modules` · `DELETE /api/v1/admin/tenants/{id}/modules/{key}` — Super-Admin onboarding + tenant management (`platform.tenants.manage`)
- `GET|POST /api/v1/users` · `GET|PATCH /api/v1/users/{id}` · `POST /api/v1/users/{id}/roles` · `DELETE /api/v1/users/{id}/roles/{roleKey}` · `POST /api/v1/users/{id}/overrides` · `DELETE /api/v1/users/{id}/overrides/{overrideId}` — Org-Admin user/role/override management (`platform.users.*` / `platform.rbac.manage`)
- `GET|POST /api/v1/branches` · `PATCH /api/v1/branches/{id}` — branch management (`platform.branches.*`)
- `GET /api/v1/branding/current` (any authed — bootstrap) · `PUT|DELETE /api/v1/branding` · `POST /api/v1/branding/logo` · `POST /api/v1/branding/favicon` — tenant branding (`platform.branding.manage`)
- `GET /api/v1/admin/stats` — platform-wide aggregates (super-admin; **aggregate-only**, ADR-023) · `GET /api/v1/dashboard/summary` — the caller's own-tenant roll-up (RLS-scoped)
- `GET /api/v1/rbac/permissions` (my effective permissions) · `GET /api/v1/rbac/roles` (requires `platform.roles.view`)
- `GET /api/v1/entitlements` (entitled modules) · `GET /api/v1/ipd/beds` (requireModule demonstrator — IPD is Phase 2)
- `GET /api/v1/patients` (list/search, paginated) · `POST /api/v1/patients` · `GET|PATCH /api/v1/patients/{id}` — Patient Management, module-gated (`requireModule('patient')` → `patient.record.view|create|update`)
- `GET /api/v1/audit` (audit trail, paginated; requires `audit.log.view`)
- `POST /api/v1/notifications/test` (send; `notifications.send`) · `GET /api/v1/notifications` (log; `notifications.log.view`)
- `POST /api/v1/files` (upload) · `GET /api/v1/files/{id}` (download URL) · `GET /api/v1/files/content/{id}` (token stream) · `DELETE /api/v1/files/{id}` — `files.document.*`
- `GET /api/v1/specialties` · `GET|POST /api/v1/providers` · `GET /api/v1/providers/{id}` · `POST /api/v1/providers/{id}/specialties` · `GET|POST /api/v1/specialty-templates` — `providers.view|manage`

## Tenant branding (ADR-021)

- **Model:** `tenant_branding` (tenant-scoped, RLS; nullable `branch_id` = org-wide default, branch override reserved) — `brand_color`, `secondary_color`, `logo_file_id`, `favicon_file_id`, `typography` (jsonb), `version` (optimistic lock). Migration `drizzle/0008_worried_chimera.sql`.
- **`branding.service`:** `getCurrentBranding` (resolves logo/favicon file ids → short-lived URLs via the existing `FileStorageService`; nulls = "use the default `--hms-*` tokens"), `updateBranding` (colours/typography), `setLogo`/`setFavicon`, `resetBranding`. Logos/favicons are uploaded through the **reused** file-upload plumbing (`uploadSingle('file')` + `uploadFile`) — no new storage path.
- **Endpoints:** `GET /branding/current` (any authenticated user — feeds the Portal's session bootstrap), `PUT /branding` + `DELETE /branding` (reset) + `POST /branding/logo|favicon` — all editing gated by `platform.branding.manage` (org_admin). Colours validated as `#RRGGBB`.
- The Portal applies branding by setting the `--hms-*` CSS vars from `GET /branding/current` at bootstrap — the same seam the old localStorage demo used, so nothing in the design system changed.
- Verified live: colour update persists + reads back; logo upload returns a URL; bad hex → 422; reset clears; a receptionist → **403**.

## Observability & Ops

- **Structured logging:** pino (`config/logger.ts`) with **PII/secret redaction** (authorization headers, cookies, passwords, tokens) — JSON in staging/production, pretty in dev. `pino-http` adds a per-request correlation id.
- **Error tracking:** `observability/errorTracker.ts` — a thin abstraction (ADR-007 pattern). By default it logs an `error.captured` event (with request id + tenant/user/method/path) for every unexpected 5xx from the error handler; set **`SENTRY_DSN`** to forward to Sentry/GlitchTip later without touching call sites.
- **Health:** `GET /health` (liveness) + `/health/ready` (DB readiness, 503 until PostgreSQL reachable) — for uptime checks and PM2/Nginx.
- **Deploy baseline (versioned, `deploy/`):** PM2 ecosystem (`deploy/pm2.ecosystem.cjs`), Nginx template (`deploy/nginx/hms.conf.template`), backup + **restore-drill** scripts (`deploy/backup/`), and the ops runbook (`deploy/README.md`). CI/CD: `.github/workflows/ci.yml` (every push) + `deploy-staging.yml` (auto-deploy on merge to `staging` — migrate before rollout, PM2 zero-downtime reload). See ADR-019.

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
