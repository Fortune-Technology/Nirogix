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
