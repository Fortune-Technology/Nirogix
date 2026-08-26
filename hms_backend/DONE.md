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

---

## 2026-08-13 — Audit log service (Task #7)

**What:** Immutable, tamper-evident audit trail.

**Added:**
- Schema `audit_log` (tenant-scoped, RLS) — actor, action, resource, method/path/status, severity, jsonb metadata, ip/ua. Migration `drizzle/0004_motionless_lenny_balinger.sql`.
- `db/auditProtection.ts` — trigger blocking UPDATE/DELETE (append-only); applied by `db:migrate` after RLS.
- `modules/audit/audit.service.ts` (writeAudit best-effort + listAudit) + `audit.{schema,controller,routes,openapi}.ts`.
- `http/auditMiddleware.ts` — auto-audits authenticated mutating requests.
- `@hms/permissions`: AUDIT_VIEW (+ org_admin); `GET /api/v1/audit` gated by it.
- Wired explicit audit into auth (login success/failure), rbac (setOverride/revokeOverride/assignRole — **replaced the TODO**), entitlement (grantModule/setModuleStatus).
- Test `audit.test.ts` (write/read + append-only immutability). rbac/entitlement test cleanups purge audit rows (disable trigger).

**API:** `GET /api/v1/audit` (documented, permission-gated).

**Testing status:** typecheck green · openapi:validate green · full suite **17/17** (5 files). **Live-verified:** admin login writes `auth.login.success`; bad login writes `auth.login.failure`; `GET /audit` → 200 (total=12, incl. logins + role assigns + entitlement grants); receptionist → **403** (no `audit.log.view`). Satisfies Phase 0 DoD "a login attempt produces an audit_log row".

**Decisions:** DB-trigger append-only (tamper-evident vs the app role); `writeAudit` best-effort (never breaks the request path). `audit_log` FK is `onDelete restrict` — deletion requires disabling the trigger (test-only).

**Known limitations:** No cryptographic hash-chaining yet (future hardening). Break-glass enhanced event not built (severity field ready). Auto-audit covers authenticated mutations; unauthenticated ones audited explicitly where the tenant is known.

---

## 2026-08-13 — Notification service skeleton (Task #8)

**What:** Provider-agnostic notification sending (email/SMS/WhatsApp) behind an abstraction.

**Added:**
- `modules/notification/providers/`: `EmailProvider`/`SmsProvider` interfaces, dev `LogProvider` (logs, doesn't send), MSG91 adapters (dormant without a key), config selection (`MSG91_API_KEY`).
- Schema `notification_log` + `notification_templates` (tenant-scoped, RLS). Migration `drizzle/0005_rich_ser_duncan.sql`.
- `notification.service.ts`: `sendEmail`/`sendSms`, `{{placeholder}}` template render, **idempotency**, log write; `listNotifications`.
- `notification.{schema,controller,routes,openapi}.ts`: `POST /notifications/test` + `GET /notifications`.
- Env: `MSG91_API_KEY` / `SMS_SENDER_ID` / `EMAIL_FROM` / `EMAIL_DOMAIN` (all optional). Permissions `NOTIFICATION_SEND`/`NOTIFICATION_VIEW` (+ org_admin).
- Test `notification.test.ts` (render, send-via-log, idempotency).

**Decision:** ADR-016 — MSG91 for email as well as SMS/WhatsApp (consolidate vendor over SES). Architecture doc updated (.md + .html); SES documented as a swappable alternative.

**Testing status:** typecheck green · openapi:validate green · full suite **20/20** (6 files). **Live-verified:** admin `POST /notifications/test` → 201 `sent` via `log` provider; `GET /notifications` → 200 (total=1); receptionist → **403** (no `notifications.send`). The POST was also auto-audited by `auditMiddleware`.

**Known limitations:** MSG91 adapters unverified against live credentials (only run when `MSG91_API_KEY` set — verify HTTP shapes + DLT template mapping at go-live). No WhatsApp adapter yet (channel reserved). Sends are synchronous — async delivery moves onto BullMQ in Task #10. Template CRUD endpoints not exposed (table + render ready).

---

## 2026-08-13 — FileStorageService (Task #9)

**What:** Object storage abstraction (local dev provider + S3/EOS adapter); metadata-only DB; signed URLs; server-side validation.

**Added:**
- `modules/file/providers/`: `FileStorageProvider` interface, `LocalFileStorageProvider` (disk), `S3FileStorageProvider` (`@aws-sdk/client-s3` + presigner, dormant without creds), config selection.
- Schema `file_metadata` (tenant-scoped, RLS) — storage key, filename, MIME, size, sha256, uploader, version, soft-delete. Migration `drizzle/0006_old_the_twelve.sql`.
- `file.service.ts`: upload (checksum + putObject + metadata + audit), getDownloadUrl (presigned S3 or tokenized local), getFileContent (audited read), deleteFile (object removal + soft-delete metadata + audit).
- `file.upload.ts` (multer memory + size/MIME allow-list → canonical errors), `fileToken.ts` (short-lived signed download token), `file.{schema,controller,routes,openapi}.ts`.
- Endpoints: `POST /files`, `GET /files/:id`, `GET /files/content/:id` (token), `DELETE /files/:id`.
- Env: `FILE_STORAGE_PROVIDER`/`LOCAL_DIR`/`MAX_SIZE_MB` + `S3_*` (optional). Permissions `FILE_UPLOAD`/`VIEW`/`DELETE` (+ org_admin, doctor, receptionist). `storage/` gitignored.
- Deps: `multer` + `@types/multer`, `@aws-sdk/client-s3` + `s3-request-presigner`. Test `file.test.ts`.

**Testing status:** typecheck green · openapi:validate green · full suite **23/23** (7 files). **Live-verified:** upload → 201 (report.pdf, 50 bytes, sha256); GET → tokenized download URL; download → actual PDF content; DELETE → 204; re-GET → 404; unsupported `.exe` → **422** (server-side MIME validation).

**Decisions:** metadata-only DB (never content); short-lived signed URLs (presigned S3 / app-tokenized local); upload/download/delete audited; soft-delete metadata + hard-delete object. S3 adapter uses `forcePathStyle` for EOS compatibility.

**Known limitations:** S3 adapter unverified against live EOS credentials (dormant until `FILE_STORAGE_PROVIDER=s3` + keys). No virus scanning / content inspection. No presigned-PUT (client-direct) upload yet — uploads go through the API. multer 1.x has a known advisory (bump to 2.x later). Versioning column present but amend-flow not built.

---

## 2026-08-13 (later) — Object storage switched to Cloudflare R2 (no AWS) — ADR-017

Per an explicit no-AWS directive: replaced the S3 adapter's `@aws-sdk/client-s3` / `s3-request-presigner` with the **MinIO client** (`minio`) — a non-AWS S3-compatible client — and renamed the provider `S3FileStorageProvider` → `R2FileStorageProvider` (`s3Provider.ts` → `r2Provider.ts`). Config `FILE_STORAGE_PROVIDER=local|r2`, `R2_*` env (was `S3_*`). **No AWS packages remain installed** (only an unused *optional* peer `@aws-sdk/client-rds-data` that drizzle-kit advertises — not installed, we use `pg`). Note: `@aws-sdk/client-s3` was only ever the S3-protocol client (R2's own docs recommend it), never an AWS service — removed to honor the directive. typecheck green; local provider + full suite unaffected. **For PHI, pin the R2 bucket jurisdiction to India** (architecture.md → File Storage).

---

## 2026-08-13 — Domain events + BullMQ background jobs (Task #10)

**What:** Internal domain-event bus + a background job runner (Redis/BullMQ with an inline fallback).

**Added:**
- `events/`: `types.ts` (DomainEventPayload map), `eventBus.ts` (typed in-process pub/sub, error-isolated), `subscribers.ts` (`notification.requested` → enqueue job; representative subscribers).
- `jobs/`: `types.ts`, `runner.ts` (JobRunner interface + `getJobRunner`), `inlineRunner.ts` (dev/CI), `bullmqRunner.ts` (Redis+BullMQ, retryable/schedulable, dormant), `processors.ts` (`notification.send`).
- `bootstrap.ts` `initBackground()` (wired into `server.ts`).
- Publish `user.logged_in` on login; `POST /notifications/test {async:true}` → 202, delivers via events→jobs.
- Env `REDIS_URL` (optional). Deps: `bullmq` + `ioredis`. Tests: eventBus + inline job runner.

**Testing status:** typecheck green · openapi:validate green · full suite **27/27** (9 files). **Live-verified:** async send → 202; the notification is delivered through the event→job→NotificationService pipeline (notification count 1→2, recipient `async@example.com` appears in `/notifications`).

**Decisions:** in-process event bus (not a broker) per architecture; one job runner abstraction — BullMQ (Redis) or inline fallback so dev/CI need no Redis; jobs retryable + schedulable; no module creates its own cron.

**Known limitations:** BullMQ path unverified against live Redis (dormant until `REDIS_URL`). Only `notification.send` processor so far (PDF gen, ABDM sync, reminders land with their modules). Inline runner is fire-and-forget (no retry/persistence) — dev only.

---

## 2026-08-14 — Provider/specialty core, FHIR-aligned (Task #11)

**What:** The provider directory + specialty model — FHIR Practitioner / PractitionerRole, a global specialty catalog, and no-EAV specialty form templates. Closes Phase 0's clinical-foundation slice (invariants #5).

**Added:**
- Schema `db/schema/providers.ts`: `providers` (Practitioner — tenant-scoped, RLS; optional `user_id`), `practitioner_roles` (PractitionerRole — tenant-scoped, RLS; unique `(provider_id, specialty_code, branch_id)`), `specialty_form_templates` (tenant-scoped, RLS; versioned JSON Schema), `specialties` (**global** reference, no RLS). Migration `drizzle/0007_clammy_wildside.sql` (4 tables).
- `modules/provider/specialtyCatalog.ts` — 17-specialty seed (SNOMED codes left null until verified).
- `provider.service.ts`: seedSpecialtyCatalog, listSpecialties, createProvider, **assignSpecialty** (catalog-validated → 422 on unknown code; insert PractitionerRole), listProvidersWithRoles, getProviderWithRoles, createFormTemplate, listFormTemplates — all explicit `tenant_id`-scoped (ADR-015) + audited.
- `provider.{schema,controller,routes,openapi}.ts`. `@hms/permissions`: `PROVIDER_VIEW`/`PROVIDER_MANAGE` (`providers.view|manage`, + org_admin). Wired into `api/v1/index.ts` + `openapi/register.ts`.
- Seed: demo provider "Dr. Ananya Sharma" linked to the admin user, cardiology role.
- Test `provider.test.ts` (create Practitioner, assign specialty = data change, reject unknown specialty, configure form template).

**API:** `GET /specialties`, `GET|POST /providers`, `GET /providers/:id`, `POST /providers/:id/specialties`, `GET|POST /specialty-templates` — all documented (OpenAPI gate passes).

**Testing status:** typecheck green · openapi:validate green · full suite **31/31** (10 files). **Live-verified:** 17 specialties listed; seeded "Dr. Ananya Sharma" shows cardiology + registration; created "Dr. Rohit Mehta" then assigned orthopedics (PractitionerRole visible on re-GET); unknown specialty → **422 VALIDATION**; dental form template created.

**Decisions:** FHIR Practitioner/PractitionerRole (ADR-008) — a specialty is a *role assignment* (data), never a new table. `specialties` is a global reference table (no RLS), like `permissions`. Specialty variation via configurable `specialty_form_templates` (JSON Schema), never EAV (invariant #5). Unknown specialty is a client validation error (422), not a 500.

**Known limitations:** Specialty `snomed_code`s unset (need a verified source before terminology binding). No provider↔branch scheduling/availability yet (a later clinical phase). Form-template *rendering/validation* engine (applying a template's JSON Schema to captured data) is not built — templates are stored, not yet enforced. PractitionerRole deactivation flow (`is_active`) exposed in reads but no endpoint to toggle it.

---

## 2026-08-14 — Ops baseline: seed, logging/error-tracking, deploy config (Task #14)

**What:** The Phase 0 operational baseline — a multi-tenant demo seed, error tracking on top of the existing structured logging, and a versioned deploy/CI-CD/backup baseline (IaC posture, even if lightweight, per development-plan §16/§18).

**Added / changed:**
- **Seed** (`scripts/seed.ts`) rewritten data-driven: **2 Indian-context demo tenants** (CITYCARE — Pune; SUNRISE — Ahmedabad), each with a branch layout and **one user per role** (super_admin/org_admin/branch_admin/doctor/receptionist/pharmacist/lab_technician/cashier), plus per-tenant FHIR providers. Idempotent; keeps the existing `admin@`/`reception@citycare.example` stable. All names/hospitals/cities are genuine Indian context (§17 Test Data).
- **Error tracking** (`observability/errorTracker.ts`): a thin abstraction that logs `error.captured` events by default and accepts a `SENTRY_DSN` (Sentry/GlitchTip) without call-site changes. Wired into `http/errorHandler.ts` for every unexpected 5xx, with request-id + tenant/user/method/path correlation. New `SENTRY_DSN` env (optional).
- **Deploy baseline** (`deploy/`): `pm2.ecosystem.cjs` (3 apps), `nginx/hms.conf.template` (api/portal/marketing reverse proxy + Cloudflare real-ip), `backup/backup.sh` (nightly pg_dump + verify + off-box to R2 + retention), `backup/restore-drill.sh` (**restore drilled, not just configured** — restores to a scratch DB and checks row counts), `README.md` (ops runbook: provisioning, deploy flow, rollback, RPO/RTO table).
- **CI/CD:** added `.github/workflows/deploy-staging.yml` — auto-deploy on merge to `staging` (build → SSH → `db:migrate` before rollout → PM2 zero-downtime reload). Existing `ci.yml` (typecheck/lint/openapi/test/build + Postgres) unchanged.

**Testing status:** typecheck green · full suite **31/31** (10 files, unchanged) · seed runs idempotently. **Live-verified tenant isolation:** logged in as CITYCARE admin (sees its 3 providers) and SUNRISE admin (sees only Dr. Sanjay Desai) via the API — **disjoint sets, isolation holds**; a new per-role user (`doctor@citycare.example`) logs in. Deploy/backup scripts are versioned baseline (require real VM/DB to execute — validated at deploy time; RPO/RTO validated in Stage 3).

**Decisions:** ADR-019 (ops/deploy baseline). Error tracking behind an abstraction (swap in Sentry via env, no code change). Restore is drilled via a runnable script, not just assumed. Seed reflects genuine Indian healthcare context and is staging-only.

**Known limitations:** Deploy pipeline/Nginx/PM2/backup are templates — not executed here (no VM/managed DB in this environment); real hosts + secrets are substituted at deploy time. Turborepo affected-only deploys, alerting, and metrics/traces are Stage-3 items. RPO/RTO defined + validated in Stage 3's backup/DR drill.

---

## 2026-08-14 — Super-Admin onboarding + tenant management (Milestone A / Task A1)

**What:** The operator-facing onboarding surface (development-plan §20A, ADR-020) — a platform Super Admin creates tenants through the API instead of editing `seed.ts`.

**Added (`modules/admin/`):**
- `admin.service.ts`: `onboardTenant` (transaction — create tenant → `provisionTenantRbac` → grant modules with **hard-dependency closure + catalog ordering** → create first `org_admin` with a one-time temp password → create branches; audited), `listTenants` (platform-level, no-RLS `tenants` table), `getTenantDetail` (modules + branches + user count, fetched in the tenant's own context), `setTenantStatus`, `grantTenantModule`/`revokeTenantModule` (soft, never deleted), `tenantExists`.
- `admin.{schema,controller,routes,openapi}.ts`. New permission `platform.tenants.manage` in `@hms/permissions` — **not attached to any role**; only `super_admin` (WILDCARD) resolves it.
- Wired into `api/v1/index.ts` + `openapi/register.ts`.

**API:** `GET|POST /admin/tenants`, `GET /admin/tenants/:id`, `PATCH /admin/tenants/:id/status`, `POST /admin/tenants/:id/modules`, `DELETE /admin/tenants/:id/modules/:key` — all documented (OpenAPI gate passes).

**Cross-tenant model (ADR-020):** the tenant row is created on the no-RLS `tenants` table; all per-tenant provisioning runs in the **new tenant's** `runWithTenant` context, so a Super Admin can set up any tenant while RLS keeps the data isolated from birth. Regular users never resolve `platform.tenants.manage`, so `/admin/*` is Super-Admin-only.

**Testing status:** typecheck green · openapi:validate green · full suite **34/34** (11 files; +3 admin tests). **Live-verified:** super-admin lists tenants (CITYCARE, SUNRISE); **org-admin → 403** on `/admin/tenants`; onboarded a new tenant end-to-end (create → 7 default modules → first org_admin + temp password → branch); the **new org_admin logged in with the temp password (200)**; tenant detail shows modules/branches/userCount; duplicate code → **409**; short name → 422 (validation before conflict). Demo tenant removed afterward (DB back to the 2 seeded tenants).

**Decisions:** ADR-020 (operator-driven onboarding, not public self-registration). Temp password returned once for operator handoff (forced-change-on-first-login is a later hardening). Module grant expands hard dependencies so onboarding never fails on a missing dep.

**Known limitations:** No forced password change on first login yet; no email-invite flow (temp-password handoff now — invite via `NotificationService` is a fast follow, ADR-020). Cross-tenant listing shows tenant rows only (per-tenant counts are fetched on the detail view, one tenant at a time — correct under a non-superuser prod role).

---

## 2026-08-14 — Org-Admin management: users, roles/overrides, branches (Milestone A / Task A2)

**What:** The tenant-scoped admin surface an `org_admin` uses to manage their own staff and branches (development-plan §20A).

**Added:**
- `modules/user/` — `listUsers` (with role keys), `createUser` (one-time temp password when none supplied), `getUserDetail` (roles + effective permissions + active overrides), `updateUser` (status/name). Controller also wires role assign/remove and override add/revoke to the RBAC service.
- `rbac.service` additions: `removeRoleByKey`, `listUserRoles`, `listUserOverrides` (active only).
- `modules/branch/` — `listBranches`, `createBranch` (unique code per tenant), `updateBranch`.
- Schemas/controllers/routes/OpenAPI for both; wired into `api/v1` + `openapi/register`.

**API:** `GET|POST /users`, `GET|PATCH /users/:id`, `POST/DELETE /users/:id/roles(/:roleKey)`, `POST/DELETE /users/:id/overrides(/:overrideId)`, `GET|POST /branches`, `PATCH /branches/:id`. Reads → `platform.users.view`/`platform.branches.view`; account mutations → `.manage`; role/override mutations → `platform.rbac.manage`. All tenant-scoped (RLS) + audited.

**Testing status:** typecheck green · openapi:validate green · full suite **38/38** (12 files; +4 user/branch tests). **Live-verified (CITYCARE org_admin):** listed 8 users; created a user with a role (temp password); a **DENY override removed a role-granted permission** live (DENY wins); listed + created a branch; a **receptionist got 403** on both `/users` and `/branches`. Test rows removed afterward (audit trail retained).

**Decisions:** Role/override management lives under `/users/:id/...` (what the admin UI needs), reusing the existing RBAC engine (no new authz logic). Overrides never deleted — revoked (soft), matching ADR-010. Temp password returned once only when the operator doesn't supply one.

**Known limitations:** No self-service password change / reset flow yet. No email invite (temp-password handoff). Branch-scoped user assignment (which staff belong to which branch) is not modeled yet — branches exist as org structure; per-branch user membership is a later slice.

---

## 2026-08-14 — Tenant branding, persisted server-side (Milestone B / Task B1)

**What:** Per-tenant branding persisted in the DB and applied through the Phase-0 token seam (development-plan §20A, ADR-021) — replacing the client-only preset demo.

**Added:**
- Schema `db/schema/branding.ts`: `tenant_branding` (tenant-scoped, RLS; nullable `branch_id`; `brand_color`, `secondary_color`, `logo_file_id`, `favicon_file_id`, `typography` jsonb, `version`). Migration `drizzle/0008_worried_chimera.sql` (RLS auto-applied).
- `modules/branding/`: `branding.service` (getCurrentBranding — resolves logo/favicon ids to short-lived URLs via the existing `FileStorageService`; updateBranding, setLogo/setFavicon, resetBranding, `version` bump), `branding.{schema,controller,routes,openapi}.ts`. Logo/favicon uploads **reuse** `uploadSingle('file')` + `uploadFile` (no new storage path).
- New permission `platform.branding.manage` in `@hms/permissions` (+ org_admin — added to the seeded role set; `db:seed` grants it to existing tenants idempotently). Wired into `api/v1` + `openapi/register`.

**API:** `GET /branding/current` (any authed user — bootstrap), `PUT /branding`, `DELETE /branding` (reset), `POST /branding/logo`, `POST /branding/favicon` — editing gated by `platform.branding.manage`. Colours validated `#RRGGBB`.

**Testing status:** typecheck green · openapi:validate green · full suite **41/41** (13 files; +3 branding). **Live-verified (CITYCARE org_admin):** PUT colours (`#0ea5e9`/`#f97316`) persist + read back via `GET /branding/current`; logo upload (PNG) returns a resolved URL; bad hex (`"blue"`) → **422**; reset clears colours + logo; a **receptionist → 403**. (Discovered + fixed during verification: existing tenants' `org_admin` role predated the new permission — `db:seed` re-grants it idempotently, then the backend cache clears on restart.)

**Decisions:** ADR-021 — persist server-side, apply via the `--hms-*` token seam (no component changes). Logo/favicon go through the existing FileStorageService (private + short-lived URLs, re-fetched at each bootstrap). Colours are `#RRGGBB`-validated; branch-level branding reserved (nullable `branch_id`).

**Known limitations:** `secondary_color` + `typography` are stored but not yet consumed by any component (reserved). Logo URLs are short-lived (600s) — re-fetched on reload; a longer branding-asset TTL / public branding bucket is a later refinement. Branch-level branding override not built.

---

## 2026-08-14 — System Super Admin moved to a dedicated PLATFORM org (ADR-022)

**What:** Separated the platform owner from customer hospitals. The System Super Admin previously lived *inside* the CITYCARE hospital (`superadmin@citycare.example`) as a login shortcut; conceptually the vendor should sit above all hospitals, unattached to any.

**Changed:**
- `scripts/seed.ts`: added a **`PLATFORM`** org (name "Takoriya Technology LLP", `modules: []`, no branches/providers) holding the sole `super_admin` user `owner@takoriya.example`. Removed the `super_admin` user from CITYCARE. `SeedTenant` gained an optional `modules` field (defaults to the MVP set; PLATFORM overrides to none). Existing tenants now top out at `org_admin`.
- Docs: **ADR-022**; `TESTING_CREDENTIALS.md` (new Tier-0 Platform section, `PLATFORM`/`owner@takoriya.example`); `KNOWLEDGE.md` demo line.

**Testing status:** typecheck green · seed idempotent (1 platform org + 2 hospitals). **Live-verified:** `PLATFORM`/`owner@takoriya.example` → 200 and lists all tenants (CITYCARE, SUNRISE, PLATFORM); the old `superadmin@citycare.example` → **401** (removed); CITYCARE `org_admin` still logs in (200) but **cannot** onboard tenants (**403**). The old super-admin row was purged from the DB.

**Decisions:** ADR-022 — Tier 0 (platform owner, `PLATFORM` org) vs Tier 1+ (hospitals, `org_admin`→…). No schema change; the super-admin still resolves WILDCARD within the PLATFORM tenant, so cross-tenant onboarding (ADR-020) is unchanged.

**Known limitations:** The `PLATFORM` org appears in the operator's tenant list (it is a `tenants` row); an `is_platform` flag to hide it from the customer-tenant list is a possible later refinement, not needed for correctness.

---

## 2026-08-14 — Dashboard aggregates: platform + org-scoped (§20B-1 / ADR-023)

**What:** The read side of the System-Admin and Org-Admin dashboards (development-plan §20B, user-journeys.md §1.3/§2.5).

**Added:**
- `admin.service.getPlatformStats()` — platform-wide counts **across all tenants**, **aggregate-only** (ADR-023): organizations (active/inactive), hospitals (excludes the `PLATFORM` org), branches, doctors, users, per-module adoption; `patients`/`appointments` return `null` until Stage 1 (tiles degrade). Read path: the non-RLS `tenants` table + a per-tenant `runWithTenant` COUNT loop (correct under a non-superuser prod role). `GET /admin/stats` (super-admin, `platform.tenants.manage`).
- `modules/dashboard/`: `getOrgSummary(tenantId)` — the caller's **own tenant** roll-up (users, doctors, branches, modules), RLS-scoped. `GET /dashboard/summary` (any authed user). OpenAPI for both.

**Testing status:** typecheck green · openapi:validate green · full suite **43/43** (14 files; +2 dashboard). **Live-verified:** platform owner `/admin/stats` → 3 orgs (2 hospitals, PLATFORM excluded), 4 branches, 4 doctors, 15 users, module adoption, `patients: null`; a CITYCARE org_admin → **403** on `/admin/stats`; `/dashboard/summary` returns each tenant's own numbers (CityCare 7 users/3 doctors/2 branches, Sunrise 7/1/2 — disjoint).

**Decisions:** ADR-023 — cross-tenant analytics are aggregate-only + super-admin-gated; org roll-up uses the normal RLS path (invariant #2 holds). Never returns another tenant's rows. Snapshot-table optimization deferred to scale.

**Known limitations:** Per-tenant COUNT loop is O(tenants) — fine at MVP scale; a materialized `platform_metrics` snapshot (BullMQ-refreshed) is the scale path. Patient/appointment counts light up when those modules land (Stage 1).

---

## 2026-08-14 — Patient Management, the first clinical module (Phase 1 / MVP 0 / Task P1)

**What:** The first MVP-0 clinical vertical slice — patient registration + directory — and the **first real business module** to go through the full authz chain (`requireAuth → requireModule('patient') → requirePermission → logic`). On branch `feat/phase-1-clinic-pilot`.

**Added:**
- Schema `db/schema/patients.ts`: `patients` (tenant-scoped, RLS; migration `drizzle/0009_futuristic_rhodey.sql`) — strongly typed (no EAV, invariant #5): name/gender/DOB/phone/email/blood group/address+PIN/**ABHA**/emergency contact/lifecycle status. Per-tenant **UHID** auto-allocated (`UHID-000001`…), unique `(tenant_id, uhid)`.
- `modules/patient/`: `patient.service` (createPatient w/ UHID retry-on-conflict, getPatient, listPatients paginated + search via `ILIKE` on UHID/name/phone, updatePatient, countPatients), `patient.{schema,controller,routes,openapi}.ts`. Routes module-gated + permission-gated. Wired into `api/v1` + `openapi/register`.
- Removed the `/patients` demonstrator stub from the entitlement module (kept `/ipd/beds` as a requireModule demonstrator for the not-yet-built IPD).
- Wired **patient counts into both dashboards** (platform `/admin/stats` + org `/dashboard/summary`) — the "Patients" tile now shows real numbers.
- Seed: 3 demo patients in CITYCARE, 2 in SUNRISE (Indian names/cities/PINs), idempotent.

**API:** `GET /patients` (list/search, paginated), `POST /patients`, `GET|PATCH /patients/:id` — `patient.record.view|create|update`. All documented.

**Testing status:** typecheck green · openapi:validate green · full suite **46/46** (15 files; +3 patient). **Live-verified (CITYCARE):** receptionist registers a patient (UHID-000004 auto-assigned), lists the 3 seeded, searches by name/UHID/phone; a receptionist **PATCH → 403** (lacks `patient.record.update`) while a **doctor PATCH → 200**; the **module gate** blocks the wildcard super-admin on `/patients` with **MODULE_NOT_ENTITLED** because the PLATFORM org has no `patient` entitlement; the dashboard patient count reflected the new registration. Test walk-in removed afterward.

**Decisions:** UHID is a per-tenant sequential MRN allocated server-side (retry-on-conflict); patients are a strongly-typed core entity (specialty extras ride form templates, not columns). `requireModule` now guards a real module for the first time — proving the entitlement layer end-to-end.

**Known limitations:** No merge/dedup of patients, no ABHA verification/linking (field only), no document attachments on the profile yet, no soft-delete/archive UI flow beyond the `status` field. Appointment/encounter links arrive with those modules.

---

## 2026-08-14 — Appointment Management, the second clinical module (Phase 1 / MVP 0 / Task AP1)

**What:** Booking + scheduling, the second MVP-0 vertical slice, with the two phases.md acceptance criteria: **double-booking prevented** and **cancellation frees the slot**.

**Added:**
- Schema `db/schema/appointments.ts` (tenant-scoped, RLS; migration `drizzle/0010_colorful_deathbird.sql`) — FK to `patients` + `providers`; `scheduled_at` + `duration_minutes`, `status`, reason, cancel fields.
- `modules/appointment/`: `bookAppointment` (validates patient+provider in-tenant, **overlap check** → 409 on a double-booked provider slot, publishes `appointment.booked`), `listAppointments` (paginated + filter date/provider/patient/status, **join-enriched** with patient/provider names), `cancelAppointment` (frees slot, publishes `appointment.cancelled`), `countAppointments`. Schema/controller/routes/openapi; module-gated + permission-gated. Wired into `api/v1` + `openapi/register`.
- Wired **appointment counts into both dashboards**; the patient module now publishes `patient.registered`. Seed books 1 demo appointment per hospital.

**API:** `GET /appointments` (filter + paginate), `POST /appointments` (book), `POST /appointments/:id/cancel` — `appointment.booking.view|create|cancel`. Documented.

**Testing status:** typecheck green · openapi:validate green · full suite **49/49** (16 files; +3 appointment). **Live-verified (CITYCARE receptionist):** the seeded appointment lists with patient+provider names; booking succeeds; an **overlapping slot for the same provider → 409 CONFLICT**; cancel → 200; **re-booking the freed slot → 201**; a doctor/receptionist path works; the wildcard super-admin is blocked by **MODULE_NOT_ENTITLED** (PLATFORM not entitled); dashboard appointment count updates. Test appointments removed afterward.

**Decisions:** Double-booking checked in the service by scanning the provider's `booked` appointments for overlap (simple + correct at MVP scale; a DB exclusion constraint / index is the scale path). Cancellation is a soft status change (never deleted). The booking-reminder notification (event → NotificationService) is deferred to **staging** (needs real MSG91) — the `appointment.booked` event is already published for it to hook onto.

**Known limitations:** No recurring appointments, no provider working-hours/slots model (any time is bookable if free), no reschedule endpoint (cancel + re-book), no reminder send yet (staging). Overlap scan is O(provider's booked appointments) — fine at MVP; add a time-range index / exclusion constraint at scale.

---

## 2026-08-14 — Platform branding module (ADR-024)

**What:** Vendor-owned, platform-global branding for two independent surfaces — `marketing` (public site) and `hms` (Portal default) — distinct from per-tenant branding.

**Added:**
- `db/schema/platformBranding.ts` — `platform_branding` table: **global (no `tenant_id` → no RLS)**, `scope` enum (unique), scalable `tokens` jsonb, logo/favicon file ids, `version`. Migration `drizzle/0011_sticky_korg.sql`.
- `modules/platform-branding/` — service (base `db`, not `runWithTenant`; assets stored under the PLATFORM tenant so tenant-scoped storage works unchanged), controller, routes, openapi, schema. **Public** `GET /public/branding/:scope` (no auth; CORS already open) + super-admin `PUT` / `DELETE` / `POST logo|favicon` on `/platform-branding/:scope`, gated by the new `PLATFORM_BRANDING_MANAGE` (WILDCARD-only; not granted to org_admin).
- `@hms/permissions`: `PLATFORM_BRANDING_MANAGE = 'platform.branding.platform.manage'`. `@hms/types`: `PlatformBranding`, `BrandingTokens`, `PlatformBrandingScope`.
- Wired into `api/v1/index.ts` + `openapi/register.ts`.

**Testing status:** `typecheck` green (7 ws) · `openapi:validate` green (all routes documented) · migration applied (RLS correctly skips the global table). **Live-verified via API:** public GET (marketing/hms → 200, bad scope → 422); super-admin login → PUT (version increments) → public GET reflects it → DELETE resets. A non-super-admin gets 403 on the write routes / admin page.

---

## 2026-08-14 — MVP-0 slice 1.3: OPD & Check-in + Billing Core (ADR-025)

**What:** The visit/encounter backbone + the shared Financial Transaction Infrastructure (invariant #8).

**Added:**
- **`billing` module** (financial infra, no clinical logic) — `invoices` / `invoice_line_items` / `payments` tables (integer paise in `bigint`, tax in bps, migration `0012`, RLS auto-applied). `billing.service`: `createInvoice` (server-computed totals, tenant-monotonic `INV-` number), `getInvoice` (receipt: lines + payments + balance), `listInvoices`, **idempotent `recordPayment`** (`unique(tenant, idempotency_key)` + `onConflictDoNothing`; recomputes paid/status from the ledger). Routes gated `requireModule('billing')` + `BILLING_VIEW/CREATE/PAYMENT`.
- **`opd` module** (clinical) — `visits` table (token/queue, `V-` number, status machine). `checkIn` validates patient/provider/appointment, dedupes an already-checked-in appointment, allocates a daily token, and opens a **draft consultation-fee invoice via `billing.createInvoice`** (never touches money tables). `listQueue` (today's visits, token order), `getVisit`, `updateStatus` (checked_in→in_consultation→completed, optimistic version). Routes gated `requireModule('opd')` + new `OPD_VIEW/CHECKIN/UPDATE`.
- `@hms/permissions`: `OPD_VIEW/CHECKIN/UPDATE` (receptionist checks in, doctor advances, cashier + admins view). `@hms/types`: Visit/Invoice/Payment + request contracts. Event `visit.checked_in` (+ now-published `invoice.created`/`payment.received`). Routers mounted; OpenAPI registered; `db:seed` re-run to grant the new perms.

**Testing status:** `typecheck` green (7 ws) · `openapi:validate` green · migration applied. **Live-verified via API (CITYCARE):** receptionist check-in → visit `V-000001`, token #1, auto invoice `INV-000001` (₹500 draft) → queue lists it → cashier reads the receipt (1 consultation line, totals correct) → collect ₹500 cash → **paid, balance ₹0** → **re-post same idempotencyKey ⇒ still 1 payment, balance ₹0 (no double-charge)**.

---

## 2026-08-14 — MVP-0 slice 1.4: Clinical Workflow / EMR

**What:** The consultation — one encounter per visit (SOAP notes + typed vitals + ICD-10 diagnoses + prescriptions + lab orders), draft → signed.

**Added:**
- `db/schema/emr.ts` — `encounters` (visit-linked, SOAP `text` + **typed integer vitals**, status, `authored_by`, `version`), `diagnoses`, `prescriptions`, `lab_orders` (tenant-scoped, migration `0013`, RLS auto-applied). Vitals use integer units (temp tenths-°C, weight grams) converted at the edge — strongly typed, no EAV (invariant #5).
- `modules/emr/` — service: `getEncounterByVisit` (get-or-create draft), `saveEncounter` (whole-encounter save — **optimistic `version`** + **author-only** + **draft-only**; replaces the diagnoses/rx/lab collections), `signEncounter` (locks the encounter + **completes the visit**), ICD-10 search (curated in-memory `icd10.data.ts`). Routes gated `requireModule('emr')` + `EMR_VIEW/WRITE`. Event `encounter.signed`.
- `@hms/types`: Encounter / Vitals / Diagnosis / Prescription / LabOrder / Icd10Code + SaveEncounterRequest. Router mounted; OpenAPI registered.

**Testing status:** `typecheck` green (7 ws) · `openapi:validate` green · migration applied. **Live-verified via API (doctor):** open (draft v1) → ICD-10 search 'fever' → save (**vitals round-trip** temp 38.5 / wt 72.5, dx/rx/lab reference the visit) v1→v2 → **stale-version save → 409** → sign (signed; **visit auto-completed**) → **save-after-sign → 409**. Prescriptions/lab-orders are now the input queue for Pharmacy (1.5) ∥ Lab (1.6).

---

## 2026-08-15 — MVP-1 slice 1.5: Pharmacy (dispense + Billing-Core extension)

**What:** Drug master + FEFO batch stock + dispense-against-prescription that extends Billing Core.

**Added:**
- `billing.service.addInvoiceLine` — the **Billing-Core extension point** (invariant #8): adds a line to an existing invoice + recomputes totals/status from the ledger. Pharmacy / Lab / IPD reuse it, never reimplement it.
- `db/schema/pharmacy.ts` — `drugs` (master), `drug_batches` (FEFO stock), `dispenses` (migration `0014`, RLS auto-applied). Money integer paise.
- `modules/pharmacy/` — service: `listDrugs` (on-hand + **low-stock flag**), `createDrug`, `receiveStock` (adds a batch), `listPendingPrescriptions` (the worklist — prescriptions `ordered` from EMR), **`dispense`** (FEFO stock deduction, **cannot over-dispense**, marks the prescription dispensed, adds a pharmacy line to the visit's invoice, records the dispense). New `PHARMACY_MANAGE` perm; `requireModule('pharmacy')`.
- `@hms/types` Drug / PendingPrescription + requests. Router mounted; OpenAPI registered; `db:seed` re-run.

**Testing status:** `typecheck` green (7 ws) · `openapi:validate` green · migration applied. **Live-verified via API (pharmacist):** create drug → receive 100 → over-dispense 1000 → **409** → dispense 10 → success (**stock 100→90**, prescription dispensed) → re-dispense → **409** → the visit's paid invoice reopens to **partially_paid** with lines `consultation:50000, pharmacy:2000` (total ₹520, balance ₹20) — the dispensed drug is on the patient's bill.

---

## 2026-08-15 — MVP-1 slice 1.6: Laboratory (result + report + billing)

**What:** Test master + result entry against the EMR lab orders, abnormal-value flag, lab charge on the visit invoice.

**Added:**
- `db/schema/lab.ts` — `lab_tests` (master: LOINC, reference range, price), `lab_results` (one per lab order, abnormal flag) (migration `0015`, RLS auto-applied). `lab_orders` reused from EMR (1.4).
- `modules/laboratory/` — service: `listTests`/`createTest`, `listWorklist` (from the EMR lab orders + results), `collectSample` (ordered→collected), **`enterResult`** (**auto-flags the value against the test's reference range**, marks resulted, **adds a lab line to the visit invoice via `addInvoiceLine` — billed once**, publishes `lab.result_ready`), `getLabOrder` (report). New `LAB_MANAGE` perm; `requireModule('laboratory')`.
- `@hms/types` LabTest / LabOrder / LabResult + requests. Router mounted; OpenAPI registered; `db:seed` re-run.

**Testing status:** `typecheck` green (7 ws) · `openapi:validate` green · migration applied. **Live-verified via API (lab tech):** create test CBC (ref 4000–11000) → worklist shows the CBC order → collect → enter **15000 → flag `high`** (auto vs range) → re-enter **8000 → flag `normal`**. The visit invoice `INV-000001` now carries **consultation ₹500 + pharmacy ₹20 + lab ₹300** on one bill, with **one lab line (no double-bill)** — the "one engine, new line-item types" pattern across all three revenue modules.

---

## 2026-08-15 — MVP-1 slice 1.7: Basic Reports (Phase 1 complete)

**What:** Read-only aggregate reports over the clinic data — no new tables.

**Added:**
- `modules/reports/` — service: `opdRegister` (visits in a date range + patient/provider/invoice), `collections` (payments by day + method + total), `pendingLabs` (unresolved lab orders). New `REPORTS_VIEW` perm (org_admin / branch_admin / cashier). Routes gated by `REPORTS_VIEW` (no module gate — cross-cutting like the dashboard); data tenant-scoped through RLS.
- `@hms/types` OpdRegisterRow / CollectionsReport / PendingLabRow. Router mounted; OpenAPI registered; `db:seed` re-run. **No migration** (read-only).

**Testing status:** `typecheck` green (7 ws) · `openapi:validate` green. **Live-verified via API (org_admin):** OPD register (V-000001 completed) · collections **total ₹500 cash, byDay 2026-08-14** · pending labs 0 (all resulted).

**🎉 Phase 1 complete** — all 7 slices (1.1–1.7). The full clinic journey is built and verified end-to-end: registration → appointment → check-in/queue → consultation (vitals / ICD-10 diagnosis / prescription / lab orders) → pharmacy dispense → lab result → billing (one invoice accumulating consultation + pharmacy + lab) → payment/receipt → reports. Tenant-isolated, permission-gated, OpenAPI-documented.

---

## 2026-08-15 — Audit list gains search, severity filter and allow-listed sorting

**Why:** the Portal's audit table was being rebuilt as a server-mode DataTable (ADR-029), and `GET /audit` accepted only `page`/`pageSize` — so search and sorting had nowhere to go. Filtering a security log in the browser was never an option: it only ever holds one page.

**Changed:**
- `audit.service.ts` — `listAudit` takes `{ page, pageSize, search?, severity?, sortBy?, sortDir? }`. `search` is an ILIKE over `action` / `path` / `resource_type`; `severity` is an equality filter; sorting uses an **allow-list map** (`createdAt`, `action`, `severity`, `statusCode`) so an arbitrary column can never reach the query. Filters apply to both the page query and the count, so totals stay honest. Still entirely inside `runWithTenant` (tenant isolation unchanged).
- `audit.controller.ts` — Zod schema extended with `search` (≤120 chars), `severity` enum, `sortBy`/`sortDir` enums with defaults (`createdAt` / `desc`).
- `audit.openapi.ts` — the query parameters are documented with descriptions; summary updated.

**Testing status:** `typecheck` green · `npm run openapi:validate` green (spec valid, every route documented). **Live-verified** through the Portal against the local database: `?search=branding` returned 33 of 33 matching entries, `?severity=notice` returned 1, `sortBy=action` flipped asc/desc, and `pageSize=100` returned 100 rows of 426.

---

## 2026-08-15 — Phase 1 close-out: role claims, login timing, expensive-endpoint limits

**Bug fixed — access tokens never carried roles.** `signAccessToken({... roles: [] })` was hardcoded at **both** mint sites (login and refresh), so `req.auth.roles` was always empty and the Portal's new profile screen showed "No role assigned" for everyone. Now populated from `listUserRoles()` at both sites; refresh re-reads them, so a role granted or removed mid-session takes effect on the next token instead of persisting until sign-out. Authorization is unaffected — it always resolved roles + overrides server-side (invariant #2); this was an informational claim that was silently wrong.

**Security fixes (SECURITY-AUDIT.md):**
- **M-5** login timing no longer enumerates accounts: `burnPasswordComparison()` spends the same bcrypt work against a precomputed dummy hash when the email is unknown, so "no such user" and "wrong password" cost the same.
- **M-2** report date ranges are validated server-side (format + ordering) and capped at **366 days**, closing an unbounded multi-year scan; `expensiveLimiter` now covers the report and file-upload routes, completing H-1.

**Testing status:** `typecheck` green · 49 backend tests pass · `openapi:validate` green.

---

## 2026-08-16 — Nirogix naming + environment host map (ADR-041, ADR-042)

**Renamed** the API's public identity: `OPENAPI_TITLE` defaults to **Nirogix API** (was "Enterprise HMS API"), the OpenAPI description and the tag-taxonomy comment follow, and the package description reads Nirogix.

**`.env.example` became the environment contract** rather than a list of placeholders: `API_PUBLIC_URL` and the optional Swagger server URLs point at `api.nirogix.com` / `api-staging.nirogix.com`; `CORS_ORIGINS` is documented as the per-environment allowlist it must be in production (ADR-036), with the exact origin lists for staging and production; the R2 bucket and the MSG91 sending identity (`mail.nirogix.com`) are named per environment, never shared. `OPENAPI_UI_ENABLED` carries a note that production serves the JSON spec but not the interactive UI — the public reference belongs on `docs.nirogix.com`.

**Unchanged on purpose:** the local database name and role stay `hms`, an internal identifier nobody outside the repository sees (ADR-041).

**Testing status:** 49 tests pass; typecheck green.

---

## 2026-08-16 — `GET /admin/trends`: platform growth from real rows (ADR-043)

**Added** the System Admin dashboard's time-series endpoint. Monthly hospital / staff / patient / appointment series derived from each record's own `created_at`, each carrying a running cumulative **seeded by everything created before the window** so the line opens at the real total rather than zero, plus audit events per day by severity for the trailing 30 days. `months` is clamped to 3–36 server-side, so one request cannot ask for an unbounded scan.

Same posture as `getPlatformStats`: super-admin gated (`platform.tenants.manage`), aggregate-only (ADR-023) — counts per period, never another tenant's rows. Documented in OpenAPI in the same change; `openapi:validate` green.

**Testing status:** 6 new unit tests over the series maths (month window including a year boundary, UTC bucketing, running totals, pre-window rows seeding the cumulative, and an empty platform producing zeros rather than an empty array). 55 tests pass.

---

## 2026-08-16 — `GET /dashboard/overview`: the hospital's own operational picture (ADR-044)

**Added** the endpoint every role dashboard reads. RLS-scoped to the caller's own tenant: today's check-ins bucketed by hour and split into scheduled vs walk-in, today's queue counts (booked, waiting, in consultation, completed, newly registered), billed vs collected per day over the window, registrations per day, total outstanding across every open invoice, pending lab orders, low-stock drugs by batch quantity against their reorder level, and today's load per provider. `days` is clamped to 7–90.

**The clinical day is bucketed in server-local time, not UTC** — an India-hosted deployment must not push the evening clinic into tomorrow's column. That is the one piece of logic here worth a test, and it has three.

**Testing status:** 5 new unit tests (local-day keying across the UTC boundary, zero padding, the window ending today, a month-boundary crossing, single-day windows). 60 tests pass; `openapi:validate` green.

---

## 2026-08-16 — Branding carries the hospital's identity (ADR-047)

`GET /branding/current` now returns `organization: { name, code }` alongside the colours and logo. Printed documents need the hospital's own name in their header, and this was already the endpoint answering "who am I branded as". Read from the caller's own tenant row by id — a caller can only ever ask for the tenant their session belongs to.

**Not added, deliberately:** address, phone, email, website and registration/GST number. They are not in the schema, and a tax invoice needs the real ones rather than a placeholder — `BACKLOG.md` U-8 names it as the blocker.

**Testing status:** 60 tests pass; `openapi:validate` green.

## 2026-08-16 — The hospital's own identity + Hospital Setup status (ADR-049)

**What:** Two new modules and one new table, so a hospital's administrator can configure their own hospital and the product can say how far that has got.

`organization_profile` is a new **tenant-scoped** table (registered/legal name, two address lines, city, state, PIN, country, phone, email, website, registration number, GSTIN, `version`), not columns on `tenants`: `tenants` is the tenancy boundary itself and is platform-managed, while this is data the hospital owns. Carrying `tenant_id` means it picked up the RLS policy mechanically — the migration's own log line lists it. `GET /organization/profile` needs only authentication (documents and the Portal header need it, and RLS already means "of this tenant"); `PUT` needs the new `platform.organization.manage`. Partial update: an omitted field is left alone, an empty string clears it. Every write is audited as `organization.profile.update` with the field names, because it changes what every future invoice claims about the supplier.

`GET /setup/status` computes each configuration step from real rows on every read — profile, branding, branches, providers, staff, roles, plus the lab and drug catalogues **only when the tenant is entitled to those modules**. There is no stored "setup finished" flag, so a hospital that loses its last branch reports itself incomplete again. There is deliberately **no step for departments, services, packages, treatment plans, wards or beds** — none of those exist in the model, and a step for an unbuilt area is a promise the product cannot keep (`BACKLOG.md` E-1…E-8).

**Found while building it:** the counts were relying on RLS alone, which read as 4 branches for a two-branch tenant on a local superuser connection. Fixed by writing the explicit `tenant_id` predicate as well — ADR-015's defence-in-depth rule, which the count queries had skipped.

**Also fixed:** `provisionTenantRbac` only ever ran at onboarding, so a permission key added later was enforced by the routes while no existing customer's org_admin held it. `reconcileSystemRoles()` now runs inside `db:migrate` — additive only (never removes a role or a grant, so tenant customisation survives a deploy) and idempotent. It reconciled 3 tenants on the first run.

**Testing status:** 12 new tests (empty profile, round-trip, partial update, clearing, contact-line composition, audit entry, cross-tenant isolation, derived progress, dependency ordering, entitlement-gated steps, and an assertion that no step exists for an unbuilt area). 72 backend tests pass; `openapi:validate` green. Verified live against the seeded tenants: org_admin 6/8 complete then profile saved to 7/8, receptionist 403 on `/setup/status` and on `PUT /organization/profile` but 200 on the read, SUNRISE unaffected by CITYCARE's details, and an invalid GSTIN refused with its own message.

## 2026-08-16 — Departments become a real entity (ADR-050)

**What:** A `departments` table (tenant-scoped → RLS applies mechanically), its module, and the links that make it worth having. Nullable `branch_id` follows the platform convention (NULL = organization-wide). Carries a code unique within the hospital, a name, a description, an optional `specialty_code` tying it to the FHIR-aligned specialty catalog, an optional head of department, and an active flag.

**Why now rather than with the rest of the "setup" catalogue:** the only trace of a department in the product was `visits.department`, a free-text `varchar(80)` typed at check-in — unlistable, unreportable ("Ortho", "ortho" and "Orthopaedics" are three departments), with no head, no retirement and nothing a doctor could be attached to. That is a hole under features that already shipped, not deferred scope. Sub-departments, services, packages, treatment plans and ward/bed setup stayed out; the reasoning is in ADR-050 and the items are in `BACKLOG.md` E-3…E-8.

**Not module-gated.** A department is organisational structure every entitled clinical module reads, exactly like a branch — Platform Core, not a purchasable module.

**Wired in:** `practitioner_roles.department_id` (a provider works in a department), `visits.department_id` (check-in routes by one), and a `departments` step in the Hospital Setup Console that doctors now depend on. `visits.department` stays and check-in writes the department's *name* into it as well, so every existing read keeps working and the migration stays additive and reversible. Departments are deactivated, never deleted — visits and encounters reference them — and deactivation is audited at `notice`.

**Found while building the tests:** the uppercase-code normalisation lived **only** in the Zod request schema, so `createDepartment` called from the seed stored `ortho` and the case-sensitive unique index accepted `ORTHO` beside it. Moved into the service, where every caller passes.

**Testing status:** 12 new tests (uppercase normalisation, duplicate refused, the same code free in another hospital, another tenant's branch and provider both refused, branch/head resolved by name, partial update, deactivate keeps the row and leaves `activeOnly`, the notice-level audit entry, cross-tenant 404, and the setup step with its dependency). 84 backend tests pass; `openapi:validate` green. Verified live on the seeded tenants: four departments listed for CITYCARE, setup at 8/9, receptionist 200 on read and 403 on create, pharmacist 403 on read, and SUNRISE gets 404 for a CITYCARE department id that CITYCARE itself reads with 200.

## 2026-08-16 — Patient identity and the patient portal API (ADR-052, BACKLOG F-2)

**What:** A second authentication principal, and the read API a patient portal runs on.

`patient_identity` and `patient_verification` are **platform-managed** (no `tenant_id`, no RLS — like `tenants`); `patient_identity_link` is **tenant-scoped** and picks up RLS automatically. That split is the design: a patient registered at three hospitals is one person, so the identity sits above the tenancy boundary and reaches into it through links. Migration `0019`.

**The boundary, in both directions.** The access token carries a `pt` principal-type claim. `requireAuth` now refuses a patient **by type**, before any permission is read — so a future grant or a mistaken override cannot open a staff route to a patient. `requirePatientAuth` refuses a staff token on the patient routes for the same reason inverted.

**No public signup, structurally.** No route lets a caller attach themselves to a chart. `POST /patients/:id/portal-access` is a staff route and is the only way a link is ever created. Granting does not verify the contact — the patient still has to prove they hold it.

**The tenant is never trusted from the path.** Every patient read calls `resolvePatientAccess` first, which proves an active link and returns **the patient id from that link** — which is what the query filters on. The caller supplies no patient id, so reading someone else's chart is not refused, it is unrepresentable. Because the check is per request, revocation is immediate.

**Decisions worth recording:**
- Codes are **hashed** (a leaked table must not hand over live codes), single-use, expiring, with an attempt cap so brute force is bounded rather than merely slowed.
- `request-code` always answers 202 with the same message. Telling an unauthenticated caller "no account for this number" would make the endpoint a directory of who is a patient somewhere.
- Verification is sent from the **PLATFORM tenant**, never a hospital: logging it against a hospital would tell that hospital's staff, in their own notification log, that this person is signing in — including hospitals they did not choose this time.
- Lab reports return **resulted orders only**. An in-progress sample is not a report, and showing one invites a patient to read a half-entered value as a finding.
- **Revoke sits on the same permission as grant**, not on `patient.record.update`. The front desk provisions access during registration; if only a doctor could withdraw it, the person best placed to spot a mistake would have to find someone else to fix it. Found by testing the live route, which correctly 403'd an org_admin.

**Testing status:** 11 new service tests (95 backend total); `openapi:validate` green. Verified live end to end: receptionist grants access → code requested → the stored value is a hash (recovered only by brute-forcing the 6-digit space locally) → verify mints a patient token → the patient reads their own profile at the linked hospital → **403** at an unlinked hospital → replaying the code gives **401** → the patient token gets **401** on `/patients` → a staff token gets **401** on `/patient/hospitals`.

## 2026-08-16 — The AI Portal's access boundary (ADR-053, BACKLOG F-4)

**What:** One endpoint, `POST /ai/portal/session`, and nothing else — because there is nothing else to build. There is no AI capability in approved scope, so what ships is the door: gated on `ai.portal.access`, audited at notice on entry, returning `capabilities: []`.

**Three refusals stack, and each is deliberate.** `requireAuth` refuses a **patient principal by type** before any permission is read (ADR-052), so a patient who somehow knows the URL gets nothing — and that stays true even if someone later grants a patient a permission by mistake. `ai.portal.access` is held by **no role**: only `super_admin`'s WILDCARD reaches it, which is the documented "authorised staff + System Admin" rule rather than an accident. And entry is audited, because a surface that would one day process clinical information needs "who opened it, and when" answerable from the start — before there is anything to open, not after.

**`capabilities` is empty on purpose, and a test asserts it stays that way.** If that test ever fails, an AI capability has been added, and the failure is the prompt to check it went through scope approval — plus the CDSCO classification review if it touches diagnosis or treatment — rather than arriving quietly.

**Testing status:** 4 new tests (99 backend total); `openapi:validate` green. Verified live: hospital admin **403**, doctor **403**, platform owner **200** with an empty capability list, patient token **401**, no token **401**, two `ai.portal.enter` audit rows at notice severity, and CORS allowed from `http://localhost:3004`.

## 2026-08-16 — Durable patient sessions, and a rotation bug they exposed (ADR-052, BACKLOG F-8, SECURITY-AUDIT H-4)

**What:** A patient session that survives a reload. `patient_sessions` is its **own table** — `sessions` is foreign-keyed to `users` with a NOT NULL `tenant_id`, and a patient identity is neither. Widening that table with a nullable user and a discriminator would have put two principals in one place and weakened the constraint that guarantees every staff session belongs to a real staff user, to save a table.

The refresh cookie is `hms_patient_refresh`, scoped to **`/api/v1/patient/auth`**. The path is the point: a staff cookie is never sent to a patient route and a patient's is never sent to a staff one, so the browser cannot confuse the two session models and the server does not have to re-establish that boundary per request. A staff refresh token presented on the patient refresh endpoint is refused outright.

Rotation on every use, hashed storage, server-side revocation on sign-out. Existing sessions are deliberately **not** revoked when a new one is created — a patient may reasonably use a phone and a laptop, and signing them out of one by using the other would be hostile.

**The bug this found — and it was not in the new code.** `signRefreshToken` signed `{ sub, tid, sid }` with a second-resolution `iat`, so **two refresh tokens minted in the same second were byte-identical**. Rotation replaced the stored hash with the same value, which meant a previously issued refresh token stayed valid for its whole lifetime: a stolen token could not be invalidated by the legitimate user continuing their session, which is the one property rotation exists to give. This had been true of **staff** sessions since the session model was built. Fixed by adding a per-issue `gen` nonce inside the signer, so no call site can forget it. Recorded as `SECURITY-AUDIT.md` H-4.

**Testing status:** 3 new regression tests (102 backend total); `openapi:validate` green. Verified live for both principals: verify sets `hms_patient_refresh` with `HttpOnly; SameSite=Lax; Path=/api/v1/patient/auth`; a reload refreshes and reads succeed; after a refresh the **previous** cookie returns 401 — for staff as well as patients; sign-out revokes server-side so a later refresh returns 401; and a staff refresh token on the patient route returns 401.

## 2026-08-16 — Patient self-registration by QR (ADR-056)

**What:** The product's first unauthenticated write path, built so that the two ways it could have gone wrong are structurally impossible rather than guarded against.

**Schema.** `organization_profile` gained the self-registration toggle and a unique, indexed `self_registration_token`, plus the identity and letterhead fields the Portal now edits (`display_name`, `secondary_phone`, `support_email`, `letterhead_header`, `letterhead_footer`, `signatory_name`, `signatory_designation`). New tenant-scoped `registration_requests` (RLS applied automatically, like every table with a `tenant_id`), holding the submission, its status, the reviewer, and the `patient_id` once converted. Migration `0021_great_photon.sql`.

**The two properties that matter:**
- **The tenant is resolved from the token in the path, server-side, on every public call** — never from a body field, header or query parameter. `resolveRegistrationToken` is the one lookup that runs before a tenant is known, because determining the tenant is its purpose; it uses the base client, reads one row by a unique indexed token, and returns only a hospital name, a city and the on/off flag. A caller has no field in which to name a different hospital, so "scan Hospital A's poster, land in Hospital B" is unrepresentable.
- **A submission writes a request, not a patient.** Nothing on the public path touches `patients`. ADR-052 stands: the front desk verifies the person, checks for a duplicate, and converts — and that conversion is where a chart appears.

**Endpoints.** `GET|POST /public/registration/:token` (unauthenticated, `authLimiter`); `GET /registration-requests` + `/:id/approve` + `/:id/reject`; `GET|PUT /organization/registration` + `POST …/regenerate`. All documented in OpenAPI; `openapi:validate` green.

**The permission split, and why it changed mid-build.** Approving was always `patient.record.create` — it creates a chart. Listing was too, at first, and that was wrong: `org_admin` does not hold `patient.record.create`, so the one person who switches registration on and prints the QR could not see whether anything had arrived. The queue read is now `patient.record.view`. It buys no attacker anything (approval was already gated) and it fixes a screen that was invisible to its most likely visitor. The list response is projected field by field rather than spread from the row, so `tenant_id`, the submitter's IP and the reviewer's id stay ours — and a column added later does not ship by accident.

**Failure modes are uniform.** An unknown token, a regenerated one, and a hospital with registration switched off all return the same 404. The endpoint must never answer "which hospitals exist" or "which are open".

**Disable and regenerate are different acts.** Disabling keeps the token, so pausing over a holiday does not mean reprinting posters. Regenerating invalidates physical objects in the world, so it is separate, confirmed in the UI, and audited at notice — as are enable, disable, approve and reject. A public submission is audited against the tenant with **no actor**, because nobody was authenticated; that entry is what answers "where did this chart come from" after an approval.

**Testing status:** 16 new service tests (119 backend total, all green), covering token uniqueness per hospital, cross-hospital resolution, uniform 404s, submission creating no patient, the disabled path being refused server-side rather than only hidden, double-approval returning 409, one hospital being unable to act on another's request, and the audit trail. Verified live end to end: CityCare's QR submitted "Jaivik Patel" → visible to that hospital's `org_admin` (200) and reception (200) → `org_admin` approve **403**, reception approve **200** → patient `UHID-000005` created in CityCare → Sunrise's reception sees an empty queue and gets **404** on CityCare's request id.

## 2026-08-17 — Seeder environment guard (ADR-058)

**What:** `db:seed` had **no environment check of any kind**. It creates two demo hospitals, fourteen accounts with a known password, doctors, departments and patients. Pointed at a production `DATABASE_URL` — a copied env file, not malice — it would interleave invented patients with real clinical records, carrying real-looking UHIDs. There is no clean undo.

`src/scripts/seedGuard.ts` now gates every seeder:

- A seeder declares its `intended` environment and is refused unless `NODE_ENV` matches. Development is refused in **staging** too — staging's dataset is deterministic and demo rows would break E2E assertions that depend on exact values.
- It **additionally inspects `DATABASE_URL`** and refuses a non-production seeder against a host that doesn't look like development or staging. `NODE_ENV` is set by whoever typed the command; the connection string is what actually decides which database gets written, so it gets its own check.
- The production seeder will require `CONFIRM_PRODUCTION_SEED`, so it cannot run as a side effect of a deploy step.
- Every seeder prints its target with credentials redacted before the first write.
- A refusal exits **2** — distinct from a failure's 1 — with a plain sentence rather than a stack trace, because a stack trace invites someone to "fix" the guard.

Deliberately awkward. A seeder that adapts to its surroundings is one that will eventually adapt into production.

**Testing status:** both refusals verified live — `NODE_ENV=production` is rejected by name, and a `DATABASE_URL` of `db.prod.internal` is rejected even with `NODE_ENV` unset. Typecheck clean; 119 backend tests pass.

The staging and production seeders themselves are specified in ADR-058 and tracked in `BACKLOG.md`. The guard shipped first because the risk existed the moment `db:seed` did.

## 2026-08-17 — Staging + production seeders, and one OTP implementation (ADR-058, ADR-059)

**Seeders.** Three now, each declaring its environment and refusing anywhere else.

- **`seed.staging.ts`** — deterministic by design, because E2E assertions depend on exact values: one QA hospital (`QAHOSP`), two branches, two departments, one account per role, one provider, two obviously-synthetic patients. Patients are created only when the hospital has none, so a re-run never renumbers a UHID a test asserts on.
- **`seed.production.ts`** — bootstrap only: permission catalogue, specialty catalogue, `reconcileSystemRoles`, the PLATFORM org, and a first operator **only** when `BOOTSTRAP_ADMIN_EMAIL` is set. It refuses a password under 12 characters rather than inventing one: a known default on a real, reachable account is worse than no account. It creates no hospital, patient or appointment, and a reviewer should reject any future change that adds one.
- `db:seed:staging` and `db:seed:production` added.

All three refusals verified live: the staging seeder rejected in a development environment, the production seeder rejected both without `CONFIRM_PRODUCTION_SEED` and for the environment mismatch.

**One OTP implementation, not two.** `communication.service.ts` is the seam ADR-059 requires — `sendEmail`, `sendSms`, `sendOtp`, `verifyOtp`, `resendOtp`.

The interesting part was migrating patient sign-in onto it. The existing inline implementation was **stronger** than the generic one I first wrote: it limited wrong guesses to five, which my version lacked. Bolting a weaker `verifyOtp` alongside it would have produced exactly the duplication ADR-059 forbids, so the shared service gained attempt-limiting (`OTP_MAX_ATTEMPTS`) and `patientIdentity` now delegates through an `OtpStore` adapter that only says *where the rows live*. Generation, hashing, expiry, attempt-limiting and single-use consumption have one home.

`sendOtp` deliberately returns nothing. A caller that could read the code back is a caller that could log it, which defeats hashing at rest.

The now-orphaned `createHash`/`randomInt` import went with it.

**Testing status:** 14/14 patient-identity tests pass unchanged — the migration preserved expiry, attempt-limiting and single-use, which is what those tests assert. 119 backend tests, typecheck and build clean.

## 2026-08-17 — Patient list gains server-side facet and date-range filters (ADR-063)

`GET /patients` now accepts `gender`, `status`, `city` (comma-separated multi-select) and `registeredFrom`/`registeredTo` (ISO dates), applied as Drizzle `inArray` and inclusive day-bounds on `created_at`, composed with the existing tenant scope and free-text search. This is what makes the DataTable's faceted filters and its date-range control narrow the *whole* dataset rather than the page in the browser (ADR-063). OpenAPI documents each parameter; `openapi:validate` passes.

**Testing status:** 121 backend tests pass (+2: facet composition — a male in Kochi is only Arjun — and the registration-date window, both against a real DB); typecheck and build clean.

## 2026-08-17 — Appointment / invoice / audit lists accept multi-value filters (ADR-063)

`GET /appointments` (`status`), `GET /invoices` (`status`) and `GET /audit` (`severity`) now take a comma-separated multi-select — a single value still works, so the dashboards' single-status/severity calls are unchanged — parsed to a validated enum array (unknown values dropped, so a malformed query never reaches the DB) and applied with Drizzle `inArray`. This is the backend half of routing the DataTable's faceted filters server-side. OpenAPI documents each as a CSV string; `openapi:validate` passes.

**Testing status:** 121 backend tests pass (+1: appointments multi-status against a real DB); typecheck and build clean.

## 2026-08-17 — Invoice list gains a total amount range (ADR-063)

`GET /invoices` now accepts `amountFrom` / `amountTo` (paise), applied as Drizzle `gte` / `lte` on the invoice total — the backend half of the DataTable's amount-range control. OpenAPI documents both; `openapi:validate` passes.

**Testing status:** typecheck and build clean (no billing service test harness exists; the change mirrors the tested appointment/patient filters).

## 2026-08-17 — Audit trail gains a date window (EOD report, #2)

`GET /audit` now accepts `from` / `to` (YYYY-MM-DD, inclusive), applied as Drizzle `gte` / `lte` on `created_at` — what the platform end-of-day report queries for a single day. Composes with the existing tenant scope, severity and search. OpenAPI documents both; `openapi:validate` passes.

**Testing status:** 122 backend tests pass (+1: the date window includes today's entry and excludes future-only / past-only windows, against a real DB); typecheck and build clean.

## 2026-08-17 — Letterhead image + configurable page size (ADR-065)

`organization_profile` gains `letterhead_image_file_id` and `document_page_size` (migration 0022). The image reuses the branding-logo path — uploaded/removed through `POST`/`DELETE /organization/profile/letterhead-image` (`platform.organization.manage`, multipart, image-only, audited), stored via `FileStorageService`, resolved to a short-lived URL on every profile read. Page size (`A4` default, `A5`, `LETTER`, `LEGAL`) rides the normal `PUT /organization/profile` partial update, validated by a Zod enum. OpenAPI documents both new routes; `openapi:validate` passes (99 paths).

Also fixed: the token-authorized file content route now sets `Cross-Origin-Resource-Policy: cross-origin`. Helmet's default `same-origin` was silently blocking every stored image (branding logo, letterhead) from being embedded in a frontend or a print document, which run on their own origins; the route stays gated by its signed short-lived token.

**Testing status:** 128 backend tests pass (+8: page-size persistence, page-size enum validation, letterhead-image set/clear, its audit, and cross-tenant isolation, against a real DB); typecheck clean; OpenAPI valid.

## 2026-08-17 — The OPD journey enforced server-side (ADR-066)

The end-to-end workflow — register → check in → pay → consult → order → collect/dispense → result → settle — now holds against a hostile client, concurrent staff and duplicate registration, not just the happy path:

- **EMR**: `saveEncounter` no longer deletes-and-reinserts its collections — rows are synced by id and anything a downstream module progressed (dispensed prescriptions, collected/resulted lab orders and their results) is immutable and survives every save (the old path cascade-deleted lab results). Saves and signs are compare-and-swap on `version`; signing respects the visit state machine, bumps the visit version, and completes the originating appointment. New read surface: `GET /encounters/:id` and `GET /patients/:id/encounters` (signed history) under `emr.encounter.view`. Prescriptions may carry `drug_id`, lab orders `test_id` (migration 0023) — validated against the tenant's masters, names snapshotted server-side.
- **Payment before consultation**: opening a NEW encounter and `PATCH /visits/:id/status → in_consultation` both 409 while the visit's invoice has a balance.
- **OPD**: walk-in double check-in blocked while an earlier visit is live; token/visit-number allocation serialized on a per-tenant advisory lock; the consultation fee defaults from `providers.consultation_fee_paise` (client override still accepted); a billing failure during check-in compensates by removing the just-created visit; `GET /visits` gains `patientId` (history) and `mine=true` (the provider linked to the login — a doctor's own queue); the visit DTO exposes `version`.
- **Billing**: payments lock the invoice row, answer an idempotency-key retry with the original result, and refuse overpayment and settled invoices; `addInvoiceLine` dedupes by `(sourceModule, sourceRef)` with a DB unique index (`invoice_line_source_unique`) as backstop; invoice-number allocation takes the advisory lock.
- **Pharmacy**: the worklist and `POST /dispense` accept prescriptions from SIGNED encounters only (draft leak closed); the prescription row and its batches are locked `FOR UPDATE` (double-dispense is now impossible, not just unlikely); substitution (dispensing a different drug than the master-linked one) is recorded in the audit metadata.
- **Laboratory**: result entry requires a collected sample (re-entry on a resulted order stays allowed as the ADR-060 correction path); a master-linked order is billed at COLLECTION (cash before testing), the result path is the fallback for free-text orders, and `hasSourceLine` keeps every path bill-once; the worklist gains a `patientId` filter.
- **Patients**: registration 409s (`DUPLICATE_PATIENT` + candidate charts) on same phone + same name-or-DOB unless `allowDuplicate`; QR approval can instead LINK the existing chart (`existingPatientId`); UHID allocation takes the advisory lock.
- **Providers**: `PATCH /providers/:id` (details, default fee, `isActive`); create accepts `userId` + `consultationFeePaise`. The doctor role gains `pharmacy.stock.view` — prescribing needs the formulary; dispensing stays with the pharmacist.

**Testing status:** 145 backend tests pass (+17: `clinical-journey.test.ts` runs the complete two-patient journey against a real PostgreSQL — dedupe, fee default, payment gate, overpay/idempotent retry, CAS conflicts, draft-leak guards, bill-at-collection exactly once, re-save preservation, sign locks, dispense-once, cross-patient and cross-tenant isolation); typecheck and build clean; OpenAPI valid (all new/changed routes documented).

## 2026-08-17 — Workflow extensions: services, referrals, rosters, online booking requests, lab verification, suppliers, AI drafting (ADR-067…070)

Migration 0024 (`services`, `referrals`, `provider_schedules`, `appointment_requests`, `suppliers`, `stock_adjustments`, `drug_batches.supplier_id`, `lab_results.verified_by/verified_at/file_id`, booking token/toggle on `organization_profile`) plus:

- **Services catalogue (ADR-067, E-3):** `GET|POST /services`, `PATCH /services/:id` (`billing.services.view|manage`); `POST /invoices/:id/lines` adds a **server-priced** catalogue line or a custom one-off (ad-hoc lines carry no source ref on purpose — the same dressing can be billed twice). Dev seeder ships four demo services.
- **Referrals (ADR-068):** `GET|POST /referrals`, `POST /referrals/:id/cancel` (`opd.referral.*` keys; doctor creates, front desk + doctor view); check-in accepts `referralId` — patient comes FROM the referral, department/provider default from it, and the referral completes (CAS on pending) in the same transaction as the visit. A referral is a pointer; the receiving side opens the same chart.
- **Rosters + slots (ADR-069):** `provider_schedules` with `GET|PUT /providers/:id/schedules` (overlap-validated, replace-the-week) and `GET /providers/:id/slots?date=` (windows minus booked, past excluded). `bookAppointment` refuses a start outside an active roster — opt-in, no roster = free-form.
- **Online booking requests (ADR-069):** second ADR-056-pattern public surface — `GET|POST /public/booking/:token` (opaque token, sign-in-tier limit, uniform failure), `appointment_requests` review queue (`GET /booking-requests`, approve = patient via the DUPLICATE_PATIENT flow + `bookAppointment` under the same roster/double-booking rules, reject with reason), settings mirror registration (`/organization/booking` + regenerate).
- **Lab (ADR-070):** `resulted → verified` via `POST /lab-orders/:id/verify` (`laboratory.result.verify`, lab_technician); the patient portal now returns **verified** orders only, with `reportUrl` when a file is attached; result entry accepts `fileId` and re-entry clears the sign-off; `GET /lab-orders/:id/attachment` serves the staff download URL.
- **Pharmacy (ADR-070):** `suppliers` CRUD, `supplier_id` on received batches, `POST /drugs/:id/adjust` (signed delta + mandatory reason, `FOR UPDATE`, never negative, own ledger row) + `GET /stock-adjustments`.
- **AI + reads (ADR-070):** `POST /ai/prescription-draft` exists only when `ANTHROPIC_API_KEY` is set (`GET /ai/capabilities` reports it) — formulary-aware, no patient identifiers sent, audited, one fetch-based call site; `GET /visits/:id/encounter` is the read-only fetch the printed prescription uses.
- Doctor role gains `opd.referral.*`; receptionist `opd.referral.view`; lab_technician `laboratory.result.verify`; org_admin `billing.services.*` + `opd.referral.view`; cashier `billing.services.view`.

**Testing status:** 150 backend tests pass (+5: `workflow-extensions.test.ts` — server-priced/deduped service lines, referral consumed exactly once and cancel blocks use, roster overlap/window/slot-grid rules, public-token uniform failure + request→duplicate→link conversion, verify lifecycle incl. re-entry clearing sign-off, ledgered adjustment refusing negative stock — against a real PostgreSQL); typecheck, build and OpenAPI validation clean across all workspaces.

## 2026-08-17 — Deploy baseline hardened for a SHARED staging VM

The staging VM turns out to host four other projects (`/var/www`: CSV_Filter_Project, Storv_POS_All, The-Fortune-Tech, rapidrunner) deployed as `github-runner`, so port squatting is real. Changes:

- **deploy/README.md** gains a mandatory pre-flight: audit what already listens (`ss -tulpn`), what every user's PM2 manages (`pm2 ls` per user incl. `sudo -u github-runner`), what Nginx already routes (`server_name`/`proxy_pass` grep across sites-enabled + conf.d), and any systemd Node services — BEFORE assigning any Nirogix port. Provisioning steps renumbered around it (step 0), deploy under `/var/www/nirogix` as a separate service user, `pm2 save` isolation, staging seeder corrected to `db:seed:staging`.
- **Ports live in exactly one place now:** the five `next start -p <port>` flags were removed from the frontends' `start` scripts (dev scripts unchanged) — `next start` reads `PORT`, which `deploy/pm2.ecosystem.cjs` supplies from six `NIROGIX_PORT_*` env variables with the domains.md defaults. The ecosystem file also carries ready-commented entries for patient/admin/aiportal (F-5) and keeps every process name `nirogix-`-prefixed.
- **deploy/nginx/nirogix.conf.template** upstream ports became the same `${NIROGIX_PORT_*}` placeholders, with shared-box rules written into the header: add `*.nirogix.com` server_names only, never touch another project's block or `default_server`, `nginx -t` before reload.

**Testing status:** config/docs change; ports env resolution is plain `process.env` fallbacks. To validate on the VM: run the audit, export the six variables, `pm2 start --env staging`, then `ss -tulpn` confirms each app bound where the site file points.

## 2026-08-17 — Staging DNS + transactional email provisioned (ops)

Recorded live-infra state in the docs (`resources/domains.md` §8a — new "Provisioned state — staging" block, §9 cutover items 1 & 6 marked done, §10 principle 1; `CLAUDE.md` "Where things stand"; `BACKLOG.md` I-1):

- **Staging VM** `74.208.78.255` (a SHARED box — other projects live there, hence the port-audit runbook). All six staging `A` records created in the GoDaddy `nirogix.com` zone → the VM: `staging`, `portal-staging`, `api-staging`, `admin-staging`, `patient-staging`, `ai-staging`. The admin/patient/ai hosts resolve but don't serve until those apps deploy (F-5).
- **Email — `mail.nirogix.com` verified at MSG91** (ADR-016): SPF `TXT mail`, DKIM `TXT spaceship._domainkey.mail`, tracking `CNAME mailer91.mail`→`email.mailer91.com` all Verified; `MX mail`→`mx1.mailer91.com` (pri 10) still propagating (bounce/return-path only). Outbound email is deliverable once `MSG91_API_KEY` + `MSG91_EMAIL_DOMAIN=mail.nirogix.com` + `MSG91_EMAIL_FROM=noreply@mail.nirogix.com` are set on the VM. DMARC inherits the zone default (`p=quarantine`).
- **Still open:** SMS send needs MSG91 DLT template registration AND wiring the approved `template_id` into `communication.service.ts` `sendSms` (today it passes none — Indian SMS will reject). Production `A` records + `nirogix.ai` purchase remain for the prod cutover.

No code changed; documentation only. `.env.example` already documents every MSG91 key.

## 2026-08-17 — File storage: category foldering, per-environment buckets + guard, image optimization (ADR-007)

Three changes to how uploaded files (branding logos, letterheads, lab-report attachments) are stored. Not clinical — infra/ops — but touches every upload path.

**1. Category foldering.** Storage keys went from `<tenantId>/<uuid>-<file>` to `<tenantId>/<category>/<uuid>-<file>`. `uploadFile` takes a whitelisted `category` (`branding` | `platform-branding` | `letterhead` | `lab-reports` | `documents`, via `resolveCategory` — unknown/injected values fall back to `documents`, never trusted into the key). The four call sites pass their category; the generic `POST /files` reads an optional `?category=` (frontend lab upload sends `lab-reports`). Existing flat keys still resolve — only new uploads fold. Invoices/reports are print routes, not stored objects, so they get no folder.

**2. One bucket per side of the production boundary + boot guard.** Convention (resources/domains.md §6/§8, deploy/README): local + development + test + staging share `nirogix-documents-staging`; production alone uses `nirogix-documents`, each with its own scoped R2 token. `env.ts` now **refuses to boot** on an env↔bucket mismatch — a production process pointed at a `-staging`/dev/test bucket, or a non-prod process pointed at the production bucket — alongside the existing "any R2_* blank" refusal. Same spirit as the ADR-058 seeder guard. Proven across the env/bucket matrix.

**3. Image optimization before storage** (`imageOptimize.ts`, new `sharp` dependency). Raster images (JPEG/PNG/HEIC/TIFF/AVIF/WebP) are re-encoded to WebP q90 (near-lossless), capped at 2500px longest edge, metadata/EXIF stripped (removes GPS from a patient's phone photo), stepping quality/dimensions down a ladder only as far as needed to stay ≤ ~1 MB — transparency preserved (logos/letterheads). SVG (vector), GIF (animation), PDF and non-images pass through untouched; undecodable bytes fall back to storing the original rather than failing the upload. Stored metadata (size/checksum/contentType/filename) reflects the optimized object; audit records `optimized` + `originalSize`. `FILE_MAX_SIZE_MB` is now the **raw** ceiling (default 10) so phone photos are accepted then shrunk; it is the real limit only for non-image files.

Also: MSG91 email verified and live in staging (mail.nirogix.com — SPF/DKIM/CNAME green); the SMS OTP path is wired to read `MSG91_OTP_TEMPLATE_ID` (dead `MSG91_EMAIL_FROM_NAME`/`_EMAIL_TEMPLATE_ID`/`_DLT_ENTITY_ID` env lines removed); staging R2 bucket + scoped user token provisioned.

**Testing status:** typecheck + file/notification suites green (150 backend total unchanged); `sharp` pipeline verified on a 4000×3000 photo (→WebP), a transparent PNG logo (alpha kept), a PDF (passthrough), and malformed bytes (safe passthrough); the env↔bucket guard verified across the production/staging/development matrix. `npm audit` reports pre-existing tree vulnerabilities unrelated to this change (tracked separately).

## 2026-08-18 — Environment model documented as three canonical values (ADR-071, issue #9)

The backend was already on `development | staging | production` (its `NODE_ENV` Zod enum rejects `local`/`prod`/`stage` at boot). This change makes the model explicit and reconciles the two allowed-sets:

- **`config/env.ts`**: documented that `test` in the `NODE_ENV` enum is the **test-runner** value (Vitest/CI), kept only so importing config during a test run validates instead of exiting — it is not a deployment environment and behaves as non-production (`isProd` false). Reworded the R2-bucket boundary comment to name the three environments and clarified that the deliberately-broad `nonProdMarker` regex is an infrastructure-**name** heuristic, separate from the environment identifier.
- **`scripts/seedGuard.ts`**: noted that the runner's `test` normalises to `development` in `currentEnvironment()`; the DB-name heuristic stays broad by design (guards a mislabelled database, not the env identifier).
- **`.github/workflows/ci.yml`**: comment that `NODE_ENV: test` is the runner mode, not a deployment environment.
- Docs: `resources/domains.md` (env matrix header + `NEXT_PUBLIC_ENVIRONMENT` row + bucket prose), `deploy/README.md` (environment overview + storage tables), and new **ADR-071** all state the three-environment model.

**Testing status:** typecheck clean; env/seedGuard logic unchanged (comment-only), enum and heuristics untouched.

## 2026-08-18 — Em dashes removed from user-facing API messages (issue #11)

Replaced stylistic em dashes with a period or colon in the 20 user-facing `message` strings that surface to users through the app's toast (billing, appointment, emr, opd, pharmacy, patient, aiDraft, the two public booking/registration confirmations, and setup). Example: `Could not allocate an invoice number — please retry` → `. Please retry`. Developer-facing strings (OpenAPI summaries/descriptions, dev logs, the boot-time env-validation error, en-dash range validators) were left unchanged. Typecheck clean. Part of the platform-wide sweep logged in `hms_frontend/DONE.md`.

## 2026-08-18 — System master data + hospital custom data (ADR-072, issue #13)

Hospitals no longer re-type standardised reference data. Two tables, one read model:
- **`reference_catalog`** — global **system** master data (no `tenant_id`, so the RLS auto-policy never targets it, like `specialties`), keyed `(category, code)` with a jsonb `attributes` for pre-fill hints. Seeded from `modules/catalog/catalog.data.ts` (India-context) via `seedReferenceCatalog()` in **all three** seeders, so production has it: **96 items** across lab tests (25, LOINC-coded common + Indian panels), drugs (25, generics + form/strength/unit), services (15), vaccines (17, India IAP/UIP schedule), and suggested departments (14). Idempotent `onConflictDoUpdate`, so a renamed item propagates on the next migrate/seed; `is_active` is never resurrected.
- **`tenant_reference_items`** — hospital **custom** data for simple-list categories (vaccines today); tenant-scoped → RLS. Custom codes are `CUSTOM_…` so they never collide with a system code.
- The richer priced catalogues (`lab_tests`, `drugs`, `services`) keep their existing tenant tables and gain a nullable `catalog_code` recording which item a row was adopted from (NULL = pure custom) — additive, nothing existing breaks.

**API** (`modules/catalog`): `GET /catalog/:category?q=` returns the merged, searchable list (system first, then this tenant's custom), each tagged `system|custom`; `POST /catalog/vaccine/custom` adds a custom vaccine (gated `clinical.immunization.manage`). Reading needs only auth (non-sensitive reference data). A new reserved `platform.catalog.manage` (super_admin via WILDCARD) is for a future System-Admin editor; today the catalogue is code-seeded like specialties.

**Immunisation consumer** (`modules/immunization`): `patient_immunizations` (tenant-scoped) + `GET`/`POST /patients/:id/immunizations`, snapshotting the vaccine given so a later catalogue rename never rewrites history. New permissions `clinical.immunization.view` (org_admin, branch_admin, doctor, receptionist) and `.manage` (doctor, receptionist).

**Defense in depth:** the merged read and the custom-create both filter `tenant_id` explicitly **and** run under RLS — a test proved that relying on RLS alone leaks across tenants when the app connects as a privileged role.

**Testing status:** new `catalog/__tests__/catalog.test.ts` (7 tests: system readable, search, custom merge + `CUSTOM_` code, **tenant isolation**, priced categories reject custom, adoption records `catalog_code`, immunisation recorded/listed). Full backend suite **157/157** green. Typecheck + OpenAPI validate clean (migrations 0025, 0026).

## 2026-08-18 — Platform admins + platform name (issue #15)

The seeded platform identity is now **Nirogix** with **two** Platform Admins instead of the `owner@takoriya.example` placeholder:
- **Dev seeder** (`seed.ts`): the `PLATFORM` org is named **Nirogix** and seeds `jaivik@thefortunetech.com` (Jaivik Patel) and `nishant@thefortunetech.com` (Nishant Patel), both `super_admin`. Idempotent `upsertUser` (by email) means re-seeding never duplicates them; the loop upserts users for existing tenants too.
- **Staging seeder** (`seed.staging.ts`): PLATFORM org → Nirogix; added `nishant@` alongside the existing `jaivik@`, both `super_admin`.
- **Production seeder** (`seed.production.ts`): the default `PLATFORM_NAME` is now `Nirogix` (still overridable via `BOOTSTRAP_PLATFORM_NAME`); the first operator stays env-driven (`BOOTSTRAP_ADMIN_EMAIL`/`_PASSWORD`), never a hardcoded default account.
- Current-state docs updated (`TESTING_CREDENTIALS.md`, `KNOWLEDGE.md`, `testcases.md`, `resources/user-journeys.md`); append-only history (`DONE.md`, `DECISIONS.md`) left as the record it is. The **legal entity "Takoriya Technology LLP" is intentionally kept** on the public marketing site (owner's decision) — only the platform seed/config identity became Nirogix.

**Testing status:** typecheck clean. On the dev DB (re-seeded, PLATFORM renamed to Nirogix, stale `owner@takoriya.example` removed): both admins authenticate (`POST /auth/login` → 200 + token) and hold `super_admin` in `PLATFORM`.

## 2026-08-18 — Per-hospital (branch) availability of master data (ADR-073, issue #14)

Within one organization, hospitals can now carry different items — Hospital 1 offers Drug A, Hospital 2 does not — enforced at the database/API, not just hidden in the UI.
- **`branch_item_availability`** overlay (`tenant_id`→RLS, `branch_id`, `item_type` ∈ drug|lab_test|service|vaccine, `item_ref`, `is_available`, `price_override_paise`). The master `is_active` is the org default; an overlay row is the per-branch exception; no row = inherit. Availability = `master.is_active AND NOT(overlay.is_available=false)`. One item identity (no duplication; ADR-072 links + snapshot history intact); org-isolated by RLS. Departments excluded (natively branch-scoped).
- **API** (`modules/catalog`): `PUT /branch-availability` (upsert, validates the branch belongs to the org), `GET /branch-availability` (a branch's overrides), `GET /branch-availability/items` (the org's items of a type with their per-branch state — the config screen's read model). Gated by new permission `platform.catalog.availability.manage` (org_admin).
- **Backend enforcement**: `listDrugs`, `listTests`, `listServices`, and `listCatalog` (vaccine) accept an optional `branchId`; when given, they drop items disabled for that branch and apply any price override. Every path filters `tenant_id` explicitly AND runs under RLS.
- **Deferred** (issue #14's "full" option): real per-hospital STOCK needs a server-side current-branch (branch in the token/session + a validated switcher + user↔branch membership) — a change to authentication. The overlay ships without it; a per-branch price override is included.

**Testing status:** new `branchAvailability.test.ts` (5 tests: disabling at one hospital doesn't affect the other or org-wide; price override applies only at that branch; vaccines branch-scoped by code; one org can't see another's config; a foreign branch is refused). Full backend suite **162/162** green. Typecheck + OpenAPI validate clean (migration 0027).

## 2026-08-18 — Operator org code → `NIROGIX`; case-insensitive org-code login (ADR-074)

The operator org (ADR-022) is now coded **`NIROGIX`** (was `PLATFORM`) — consistent with `CITYCARE` / `SUNRISE` and with the org's own name, so operators sign in with the product name. Changed the three services that resolve the operator org by literal — `patient-identity` (verification sender), `platform-branding` (default scopes), `admin` onboarding (`PLATFORM_CODE`) — and the three seeders (`seed.ts`, `seed.staging.ts`, `seed.production.ts`). The running dev DB was migrated **in place** (a code rename on the existing row; the two Platform Admins stayed attached — no duplicate org). `PLATFORM` is retired as a code; the word survives only as the *concept* "platform operator".

`resolveTenantByCode` is now **case-insensitive** (`lower(code) = lower(input)`, limit 1), so every sign-in form accepts the org code in any case. Codes stay stored canonical/upper; they are unique and uppercase by convention, so the read stays single-row.

**Testing status:** verified live against the API — `nirogix`, `Nirogix`, `NIROGIX`, `NiRoGiX` each return a `super_admin` token for both `jaivik@` and `nishant@`; the retired `PLATFORM` code now returns `UNAUTHORIZED`. Auth + admin + patient-identity module suites **28/28** green; the three affected workspaces typecheck clean.

## 2026-08-18 — Deploy hardening after the staging-VM OOM outage

The shared staging VM was OOM-killed and taken fully offline when an unbounded `npm run build` ran all six workspaces' Turbopack/`tsc` builds concurrently (zero swap). Real-source fixes for what had been live only as VM symlinks + workarounds:

- **`tsconfig.json` `rootDir: "."` → `"src"`** so `tsc` emits `dist/server.js` (what `deploy/ecosystem.config.cjs` runs), not `dist/src/server.js`. `drizzle.config.ts` was dropped from `include` (it lives outside `src/` and is loaded directly by drizzle-kit, never emitted; keeping it forced the common root back to `.` and re-nested the output). Verified: clean build emits `dist/server.js` with no `dist/src/`, typecheck still green, `drizzle.config.ts` still valid standalone.
- **`deploy/pm2.ecosystem.cjs` → `deploy/ecosystem.config.cjs`** (`git mv`). PM2 only parses the `apps` array from files matching `*.config.{js,cjs,mjs}`/`.json`/`.yml`; the old name silently ran as one inert script instead of six apps. Updated every live reference (the workflow's `pm2 reload` line, `deploy/README.md` ×3, `hms_backend/KNOWLEDGE.md`) and added a "do not rename" note in the file; append-only DONE history keeps the old name in past tense.
- **`deploy-staging.yml` SSH step** already runs `npm run build -- --concurrency=2` (bounded peak memory — the direct OOM fix); its incident comment now points at the new runbook § Incidents.
- **`admin` / `patient` / `aiportal` gained committed `.env.example` files** (they had none — env had to be reverse-derived from source). Each lists exactly the `NEXT_PUBLIC_*` its source reads, with per-environment hosts from `resources/domains.md`. Also fixed a latent bug: those three apps' local `.gitignore` lacked the `!.env.example` negation `hms_frontend`/`marketing` have, so the new templates were being silently ignored.
- **`deploy/README.md`** gained a **required** swap-space provisioning step (Step 0b — 4 GB swapfile) and an **`## Incidents`** section recording the outage, cause, fixes, and the shared-VM operating rules (never bare `npm run build` by hand; verify bound ports with `ss`/`curl` not PM2's "launched"; inline env vars; `pm2 save` only after verifying; clean `su -` switches).

**Testing status:** backend build emits `dist/server.js` (verified, no `dist/src/`); backend typecheck clean; the three `.env.example` files confirmed git-trackable after the `.gitignore` fix. No app-code behaviour changed — this is deploy/build configuration + docs.

## 2026-08-19 — Forgot-password flow (ADR-081) + staging Branch Admin (ADR-080)

**What:** `POST /auth/forgot-password` (uniform 202, sign-in rate tier) and `POST /auth/reset-password`. Token = signed 30-minute JWT (`prt: 'pwreset'` type pin, per-issue nonce) whose SHA-256 hash lives in the new tenant-scoped `password_reset_tokens` table (migration 0028); the consume route enters RLS from the verified claims — the `/auth/refresh` pattern. Success consumes the used row AND every other outstanding row for the user, revokes every session, audits `auth.password.reset.completed`. `changeOwnPassword` gained its missing audit entry; the password policy is extracted to one shared `PasswordSchema`. Email goes through `sendEmail`; the dev log provider now logs the body so the link is exercisable locally. New env: `PORTAL_URL` / `ADMIN_URL` (link origins — configured, never derived from a request header). The staging seeder also gained `qa.branchadmin@qahospital.example` (`branch_admin`, ADR-080).

**Testing status:** new `passwordReset.test.ts` 5/5 (request+audit, uniform unknown paths, full reset with session revocation and single-use refusal, expired row, garbage token); OpenAPI validate green; full suite 166 passed / 1 failed — the one failure is `notification.test.ts`'s dev-provider case, failing only because the local `.env` carries an `MSG91_API_KEY` (provider selection is by env; recorded in BACKLOG.md).

## 2026-08-20 — Every open security finding closed on the API (ADR-082)

**What:** the backend half of `SECURITY-AUDIT.md`'s remaining findings — H-3, M-2 (remainder), M-4, M-6, L-2, L-3, plus H-5, which the new CI gate discovered.

- **Per-account lockout (H-3).** `auth/lockout.ts` + migration 0029 (`users.failed_login_attempts`, `failed_login_at`, `locked_until`). Five consecutive failures lock for 60s, doubling to a 15-minute ceiling; the streak expires after 15 minutes, so an occasional mistyped password never locks anyone. The password is verified even while locked, so the locked and unlocked paths cost the same, and the lock is disclosed **only** to a caller who got the password right (429 naming the wait) — everyone else gets the unchanged `Invalid credentials`. Attempts during a lock never extend it, so nobody can hold an account shut. Audits `auth.login.locked` / `auth.login.blocked`, escalating to `critical` at ten failures. Sign-in, change-password and a completed reset clear the state.
- **One password policy (M-6).** `auth/passwordPolicy.ts`: 12–200 characters, three of four character classes, a blocklist matched after folding leetspeak, and nothing built from the holder's own email / name / organization code. Enforced at the Zod boundary (so it reaches OpenAPI) and again in every service that sets a password — self-service change, the reset flow, `createUser`, tenant onboarding, and the production bootstrap seeder, which previously checked length ≥ 12 and nothing else. `generateTempPassword` is CSPRNG with one character per class and **no fixed prefix**; the two duplicated `Hms-` + six-bytes generators are gone.
- **Upload content validation (M-4).** `file/fileSniff.ts` checks magic bytes for every allowed type, requires them to agree with the declared MIME, and accepts `text/plain` only when the payload is valid UTF-8 with no NUL or control bytes. Enforced in the single `uploadSingle` choke point every upload route already goes through, before anything reaches storage; refusals are `422 FILE_CONTENT_MISMATCH`.
- **Pool timeouts (M-2 remainder).** `statement_timeout` (30s) and `idle_in_transaction_session_timeout` (15s) as connection parameters, both configurable per environment. `db/migrate.ts` opts its own session out — slow DDL is expected there.
- **API docs closed in production (L-2).** `OPENAPI_UI_ENABLED` now governs the raw spec as well as the Swagger UI (the spec was served unconditionally), and its default follows the environment: on outside production, off in production.
- **Request correlation (L-3).** `http/requestContext.ts` mints one id per request, echoes `X-Request-Id`, feeds pino’s `genReqId`, and reaches `writeAudit` through an AsyncLocalStorage — so an audit written five calls deep records it without a new parameter. New `audit_log.request_id` column (migration 0029), surfaced on the audit API and in `@hms/types`. An inbound id is honoured only when it matches `[A-Za-z0-9._-]{8,64}` and replaced otherwise, so a caller cannot poison the log or the table.
- **H-5, found by the new CI gate.** `drizzle-orm` 0.38.4 carried GHSA-gpj5-g38j-94v9 (SQL injection via improperly escaped identifiers). Upgraded to 0.45.2, `drizzle-kit` to 0.31.10; `npm audit --omit=dev` now reports 0 vulnerabilities.

**Testing status:** 255 backend tests pass (38 files), including new suites `lockout.test.ts` (8), `lockout.api.test.ts` (6 — lock, disclosure asymmetry, no extension during a lock, audit rows, expiry, per-account scope), `passwordPolicy.test.ts` (10), `fileSniff.test.ts` (6) and `requestId.api.test.ts` (4). `passwordReset.test.ts` gained a case proving the reset path enforces the policy: its old fixture password contained the account holder's own name, which the new rule correctly refuses. Typecheck, lint and OpenAPI validate green; all five app builds pass on the upgraded ORM.

---

## ABDM / ABHA — Milestone 1 (ADR-084)

**What:** the registration desk can now verify a patient's national health identity instead of
retyping it. Three flows land on the same review step — Scan and Share (the patient scans the
hospital's HFR facility QR in their own ABHA app; no OTP at all), verify an existing ABHA by number /
address / mobile / Aadhaar, and create a new ABHA from Aadhaar with the secondary mobile check, the
ABHA-address claim and the card download. The operator reviews the profile, the ordinary patient
endpoint creates the chart, and `POST /abdm/link` attaches the verified ABHA.

**Its own entitled module (`abdm`), not part of `patient`.** A hospital can only use ABDM after
registering a facility with NHA, so the capability is per tenant and gated
`requireAuth → requireModule('abdm') → requirePermission`. Four new permission keys; the front desk
verifies and links, org_admin configures the facility.

**Credentials split by owner.** NHA issues one client id/secret to the *application* (server config,
never per tenant) and a separate HFR facility id to each *hospital* (`abdm_facility_config`, tenant
data, sent as `X-HIP-ID`, and what the Scan-and-Share callback resolves the tenant from).

**Security decisions, made once and enforced in more than one place.** Consent is a required `true`
checked before the OTP is sent and stored with a version. The raw Aadhaar is RSA-encrypted with NHA's
certificate, sent, and dropped — only `XXXXXXXX1234` persists, enforced by the application, by a
`CHECK` constraint that refuses anything Aadhaar-shaped in `identifier_hint`, and by a new
log-boundary scrub wired into pino and the error tracker (the scrub is at the log boundary and not
the request edge, because the enrolment call legitimately carries one). ABDM tokens are encrypted at
rest with a new shared AES-256-GCM primitive, or discarded if no key is configured — never written in
the clear. `abha_verified_at` may only be set by a completed flow, and editing the number by hand
clears it.

**New vs returning, in NHA's order, with the second pass never automatic.** An exact verified ABHA
number is conclusive; a demographic match (name + gender + birth year) is offered as candidates for a
human to confirm, because merging the wrong charts is a clinical safety incident. Linking an ABHA
that already sits on another chart is refused.

**`mock` is a first-class provider.** The sandbox allows a handful of OTPs per number per day, so a
build that could only talk to the gateway could not be developed, CI-tested or demonstrated. The mock
holds a real RSA keypair (the encryption path is genuinely exercised), keys its scenarios off the
Aadhaar's last digit, and refuses to start in production. Boot guards refuse `gateway` without
credentials, production pointed at the sandbox, and non-production pointed at production ABDM.

**Two defects the API tests caught and fixed:** the patient DTO silently dropped the new ABHA fields,
and `/abdm/link` returned the raw patient row — publishing the encrypted linking token to the
browser. Both now go through one shared allow-list DTO (`patient.dto.ts`).

**Also extracted:** `useQrDataUrl` in the Portal, when the facility QR became the second QR in the
app (ADR-029) — `usePublicQr` now composes it.

**Testing status:** 62 new tests (36 ABDM service, 14 ABDM API/HTTP, 12 security primitives) covering
all three flows, the secondary mobile step, the account picker, new-vs-returning matching, one ABHA
per chart, hand-editing un-verifying, the callback's non-enumerability, cross-tenant isolation, that
no Aadhaar reaches a row/log/audit, and that no token reaches a browser. **Full backend suite: 317
passed, 41 files, 0 failed.** Typecheck, OpenAPI validation and the Portal production build are
green. Not yet exercised against the real ABDM sandbox — that needs credentials and is tracked in
`BACKLOG.md`.

---

## 2026-08-25 — Environment files: complete, uncommented, and mirrored into `.env`

**What:** `.env.example` is now a *complete* configuration rather than a mix of live keys and
commented-out documentation. Every variable `config/env.ts` reads is present and **uncommented**,
carrying either a working local default or an empty value; comments are trimmed to 1–2 lines saying
what the key is and what a blank value falls back to. The gitignored `.env` was regenerated to hold
**the same keys in the same order**, with the existing local values preserved — so a new variable
never has to be hunted down and pasted in by hand.

**Changed:**
- `src/config/env.ts` — blank values are stripped from `process.env` before Zod validation, so
  `SENTRY_DSN=` behaves exactly like an unset `SENTRY_DSN`. Without this, keeping every key
  uncommented would break the boot: an empty `.url()` or `z.coerce.number()` fails validation and
  `env.ts` exits the process. Every consumer already treated `''` and `undefined` alike.
- `.env.example` — added the keys it was missing (`REDIS_URL`, `DB_STATEMENT_TIMEOUT_MS`,
  `DB_IDLE_TX_TIMEOUT_MS`, `PORTAL_URL`, `ADMIN_URL`), uncommented every previously commented one
  (`CORS_ORIGINS`, `SENTRY_DSN`, `API_STAGING_URL`, `API_PRODUCTION_URL`, all `MSG91_*`, all `R2_*`,
  `ENCRYPTION_KEY`, all `ABDM_*`), and cut the long prose blocks down to 1–2 lines each. No real
  secret in the file — every credential slot ships empty.

**Testing status:** `typecheck` green. **Full backend suite: 319 passed, 41 files, 0 failed.**
Runtime check confirms blank `SENTRY_DSN` / `API_STAGING_URL` / `CORS_ORIGINS` / `REDIS_URL` parse
as `undefined` and the numeric defaults still apply.

**Decisions:** A blank value is the canonical way to say "not configured" — it is what makes
"every key always present" workable, and it keeps `.env` diffable against `.env.example`. Rule
recorded in `CLAUDE.md` → *Environment files*.

---

## ABDM: reconciled against the official V3 Postman collection (ADR-084)

**What:** NHA's *Milestone 1 Postman Collection-18-08-2025* (143 requests) arrived, and
`abdm.constants.ts` exists precisely so checking it is a one-file diff. Five real deviations, all
fixed:

- **`profile/login/verify` scope must be the two-element array** the OTP was requested with
  (`['abha-login','aadhaar-verify']`). We sent one element — every verification would have failed.
- **`login/verify/user` authenticates with `T-token`, not `X-token`.** Different credential,
  different header; the wrong one 401s in a way that reads like broken client credentials.
- **ABHA-address verification is a different API family.** It goes through
  `/v3/phr/web/login/abha/*` with the `abha-address-login` scope pair, not `/v3/profile/login/*`.
  The provider contract gained a `family` discriminator rather than a second set of methods.
- **Scan and Share arrives on a path NHA dictates** — `/api/v3/hip/patient/share`, appended to the
  registered bridge URL — with a **nested** payload (`metaData` + `profile.patient`, birth date in
  three possibly-masked parts). Our own `/api/v1/abdm/callbacks/...` route was replaced rather than
  kept alongside it: two paths for one webhook is the drift the clean-code rule exists to prevent.
  It is mounted at the root in `abdm.gatewayRoutes.ts`, the single documented exception to the
  `/api/v1` convention, because the versioning of a counterparty's webhook is not ours to choose.
- **The exchange is two-way, and the second half was missing.** After receiving a share the HIP
  must answer on `patient-share/v3/on-share` with a **token number** — the queue position the
  patient sees on their phone. Implemented as today's share count for that hospital plus one,
  best-effort, so a failed acknowledgement never undoes a profile already at the desk.

Everything else matched: session, certificate, all three enrolment calls, the address suggestion
and claim, the card, and the profile-login request/verify for ABHA number, mobile and Aadhaar.

**Also corrected:** NHA's onboarding email quotes **outdated V1** bridge-administration commands.
The V3 paths (and the fact that service registration is on the facility-registry host, with
`type: "HIP"` rather than the email's `HEALTH_LOCKER`) are recorded in `abdm.constants.ts` →
`BRIDGE_ADMIN` and in `BACKLOG.md`.

**Testing status:** 52 ABDM tests (the callback suite rewritten around the real payload, including
a masked date of birth and header-based facility routing), 319/319 backend tests, OpenAPI valid,
typecheck green. Credentials verified live the same day (`npm run abdm:check`): session issued,
certificate fetched.

---

## ABDM: the RSA padding was wrong — found by experiment, not by reading (ADR-084)

**What:** the first live sandbox attempts failed on every identifier, including a perfectly
well-formed mobile number. The cause was the encryption padding: we sent
`RSA/ECB/PKCS1Padding`; the ABHA APIs require **`RSA/ECB/OAEPWithSHA-1AndMGF1Padding`**.

**Why it took a while.** A padding NHA cannot decrypt does not produce a decryption error. It
produces `400 {"loginId":"Invalid LoginId"}` — the same message a genuinely bad Aadhaar gets. So
the system pointed at the value and away from the cipher, and an early conclusion of mine ("NHA
decrypted it and rejected the value") was wrong for exactly that reason.

**How it was settled.** One checksum-valid, unassigned Aadhaar (Verhoeff digit computed in the
probe) sent under three paddings, comparing the answers:

| padding | NHA |
|---|---|
| PKCS#1 v1.5 | `400 Invalid LoginId` — not decrypted |
| **OAEP-SHA1** | `422 ABDM-1204 "UIDAI Error code : 998 : Aadhaar number is incorrect"` |
| OAEP-SHA256 | `400 Invalid LoginId` — not decrypted |

Only OAEP-SHA1 reached UIDAI, which is the proof: the value was decrypted, forwarded, and answered
by the authority that owns it. `npm run abdm:check -- --probe` still runs that comparison, so the
next question of this kind is one command rather than an afternoon.

**A workaround disappeared with it.** The mock provider had been unwrapping PKCS#1 blocks by hand,
because Node refuses `RSA_PKCS1_PADDING` for private decryption after CVE-2023-46809. OAEP has no
such restriction, so the hand-rolled unwrapping is gone — the correct answer and the simpler one
were the same.

**Also fixed on the way:** NHA's enrolment errors are keyed by **field name**
(`{"loginId":"Invalid LoginId"}`) with no `message` anywhere, so every rejection had been reaching
the receptionist as "ABDM request failed (400)". The parser now reads five shapes, all unit-tested
against verbatim bodies, and the raw body is always logged.

**Testing status:** 326 backend tests (71 across ABDM and the security primitives), typecheck and
OpenAPI green. Live sandbox: session, certificate and a decryptable enrolment request all
confirmed.

---

## ABDM: three defects found by using it against the real sandbox (ADR-084)

The sandbox run surfaced three things no amount of unit testing would have:

- **The Aadhaar scrubber was corrupting ABHA numbers.** `91-1234-5678-9999` was being stored as
  `91-XXXXXXXX9999`, because the last twelve digits of a formatted ABHA are a 4-4-4 group —
  indistinguishable from a formatted Aadhaar to the pattern. The scanner now matches the longer,
  legitimate ABHA shape **first** and returns it untouched; an Aadhaar sitting beside one is still
  masked. Two regression tests pin both halves.
- **The prefill now reads the identifiers from their own columns**, not from the stored profile
  blob. The blob passes through the scrubber on the way in, so it is the wrong place to read an
  identifier from even with the fix — the columns are both authoritative and out of reach of a
  defensive measure aimed at something else.
- **`mobile` was rejected at our own boundary.** The Portal's `PhoneField` produces the canonical
  `+91XXXXXXXXXX`, correct everywhere else in the product, and the ABDM schema demanded exactly ten
  digits — so a valid number was refused with "Invalid" **after the patient had already received an
  OTP**. The boundary now normalises (`+91…`, `91…`, `0…`, bare) instead of insisting on one
  spelling, with `[6-9]` as the real validity rule.

**Testing status:** 328 backend tests, typecheck and OpenAPI green. Live against the ABDM sandbox:
OTP delivered to the Aadhaar-linked mobile and verified `200 OK` — M1 enrolment works end to end.
