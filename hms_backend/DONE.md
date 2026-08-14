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
