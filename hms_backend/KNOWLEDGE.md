# hms_backend — KNOWLEDGE.md

Current state of the Nirogix backend API. Read after root `CLAUDE.md`. See `DONE.md` for the chronological log.

## Purpose

Node.js + Express + TypeScript REST API for the Nirogix platform. Modular monolith: each business module owns `routes → controller → service → repository`. Versioned under `/api/v1`.

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
- **Demo:** `npm run db:seed` → the **`PLATFORM` org** (Nirogix — the platform operator; holds the two System Super Admins `jaivik@thefortunetech.com` and `nishant@thefortunetech.com`, no clinical data; ADR-022) + **2 Indian-context hospitals** (`CITYCARE` — Pune; `SUNRISE` — Ahmedabad), each with a branch layout and **one user per role** (top role `org_admin` — no super-admin inside a hospital). Login with org code + email + `ChangeMe#123` (platform: `PLATFORM`/`jaivik@thefortunetech.com`; hospital: `CITYCARE`/`admin@citycare.example`). Idempotent; staging only (never production).

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
- **`GET /audit` query surface:** `page`/`pageSize` plus `search` (ILIKE over action / path / resourceType), `severity`, and `sortBy`/`sortDir`. Sort columns are **allow-listed** (`createdAt`, `action`, `severity`, `statusCode`) so a client can never sort by an arbitrary column; everything stays inside `runWithTenant`. The Portal's audit table drives these directly (server-mode DataTable, ADR-029).
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

## Appointment Management (MVP 0 — second clinical module)

- **`appointments`** (tenant-scoped, RLS; migration `drizzle/0010_*`) — FK to `patients` + `providers`; `scheduled_at` + `duration_minutes`, `status` (booked/cancelled/completed/no_show), reason, cancel fields. Module-gated (`requireModule('appointment')`, which hard-depends on `patient`).
- **Double-booking prevention** (phases.md MVP 0 acceptance): `bookAppointment` rejects a slot that **overlaps another `booked` appointment for the same provider** → 409 CONFLICT. **Cancelling frees the slot** (status → cancelled), so the time can be re-booked. Verified live both ways.
- **`appointment.service`:** `bookAppointment` (validate patient+provider exist, overlap check, publish `appointment.booked`, audit), `listAppointments` (paginated + filter by date range / provider / patient / status; **enriched** with patient + provider names via join), `cancelAppointment` (publishes `appointment.cancelled`), `countAppointments` (dashboard).
- **Events:** publishes `appointment.booked` / `appointment.cancelled` on the in-process bus; `patient.registered` is now published by the patient module too. A booking-reminder subscriber (via `NotificationService`) is a **staging** item (real MSG91 send — phases.md).
- **Permissions:** `appointment.booking.view|create|cancel` — receptionist has all three; doctor view+create; org_admin view.
- Verified live: book → 201; overlapping slot → **409**; cancel → 200; re-book freed slot → **201**; the wildcard super-admin is blocked by **MODULE_NOT_ENTITLED** (PLATFORM not entitled); the dashboard appointment count updates.

## Clinical workflow stack (MVP 0/1 — OPD, EMR, Billing, Pharmacy, Laboratory, Reports)

Shipped as slices 1.3–1.7 (see DONE 14–15/08/2026) and hardened end-to-end by **ADR-066** (17/08/2026). One module per concern, every cross-module money movement through Billing Core (ADR-025), everything tenant-scoped + RLS + audited. The two-patient journey suite (`src/modules/opd/__tests__/clinical-journey.test.ts`) is the executable description of the rules below.

- **OPD (`visits`)** — check-in creates the visit (`V-`-numbered, daily token) and opens a draft consultation-fee invoice via `billing.createInvoice`; the fee defaults from `providers.consultation_fee_paise` when the caller sends none. One live visit per patient per day (walk-in double check-in → 409); token/visit numbers serialize on a per-tenant advisory lock; a billing failure compensates by deleting the just-created visit. Status machine `checked_in → in_consultation → completed|cancelled`, compare-and-swap on `version`; **`in_consultation` requires the invoice settled**. `GET /visits` filters by branch/provider/date/status + `patientId` (all-dates history) + `mine=true` (provider linked to the login → a doctor's own queue). Completing a visit (either path) marks its `booked` appointment `completed`.
- **EMR (`encounters`, `diagnoses`, `prescriptions`, `lab_orders`)** — one encounter per visit; open creates the draft **only if the visit is live and its invoice settled**; saves are CAS on `version`, author-only, draft-only. A save syncs collections **by row id**: still-`ordered` rows update/insert/delete; anything progressed downstream is immutable and survives (lab results can no longer be cascade-deleted by an edit). Prescriptions carry optional `drug_id`, lab orders `test_id` (validated against the masters, names snapshotted). Sign = CAS to `signed` + visit completed through the state machine. Reads: `GET /encounters/:id`, `GET /patients/:id/encounters` (signed history) under `emr.encounter.view`.
- **Billing (`invoices`, `invoice_line_items`, `payments`)** — integer paise, tax in bps, totals recomputed from the ledger. `recordPayment` locks the invoice row, answers an idempotency-key retry with the original result, refuses overpayment and settled invoices; method `cash|upi|card|netbanking|other`. `addInvoiceLine` locks the invoice and enforces **one line per source record** (`hasSourceLine` + unique `(tenant_id, source_module, source_ref)`).
- **Pharmacy (`drugs`, `drug_batches`, `dispenses`)** — FEFO batch deduction under `FOR UPDATE` (prescription row + batches), **signed encounters only** (worklist filters drafts and `dispense` re-checks), all-or-nothing per prescription, pharmacy line billed to the visit's invoice, substitution recorded in audit metadata.
- **Laboratory (`lab_tests`, `lab_results`)** — `ordered → collected → resulted`; result entry requires collection (re-entry on `resulted` is the ADR-060 correction path); a master-linked order is **billed at collection** (cash before testing) with the result path as fallback; abnormal flag derived from the reference range; worklist filters by status + `patientId`.
- **Patients dedupe (ADR-066)** — registration 409s `DUPLICATE_PATIENT` (candidates in `error.details`) on same phone + same name-or-DOB unless `allowDuplicate`; QR approval accepts `existingPatientId` to link the chart instead. UHID allocation takes the per-tenant advisory lock.
- **Providers** — `PATCH /providers/:id` edits details / default fee / `is_active`; `user_id` links a login for the personal queue. The doctor role reads the drug master (`pharmacy.stock.view`).
- **Reports** — OPD register, collections, pending labs, EOD; read-only over the same tables.
- **Extensions (ADR-067…070, 17/08/2026):** `services` catalogue + server-priced `POST /invoices/:id/lines`; `referrals` (pointer between visits, consumed by check-in via `referralId`); `provider_schedules` + `GET /providers/:id/slots` (roster-gated booking, opt-in); public **appointment requests** (`/public/booking/:token` + `/booking-requests` queue — second and last ADR-056 surface); lab `resulted → verified` (portal shows verified only) + result `file_id` attachments; pharmacy `suppliers` + ledgered `stock_adjustments`; env-gated `POST /ai/prescription-draft` (+ `GET /ai/capabilities`); `GET /visits/:id/encounter` read-only. Suites: `clinical-journey.test.ts` (17) + `workflow-extensions.test.ts` (5).
- **Known leftovers** are in `BACKLOG.md → Clinical-workflow hardening (ADR-066)` and `→ ADR-067…070 follow-ups`: PHI read auditing, billing outbox, post-sign cancel, appointment `no_show`, packages, roster exceptions, request/referral notifications, AI deployment decision.

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
- `GET /api/v1/organization/profile` (any authed — document headers) · `PUT /api/v1/organization/profile` (`platform.organization.manage`) — the hospital's own identity (ADR-049)
- `GET /api/v1/setup/status` — Hospital Setup progress, derived from real rows (`platform.organization.manage`, ADR-049)
- `GET|POST /api/v1/departments` · `GET|PATCH /api/v1/departments/{id}` — the hospital's clinical departments (`platform.departments.view|manage`, ADR-050)
- `POST /api/v1/patient/auth/request-code` · `POST /api/v1/patient/auth/verify` — patient sign-in, unauthenticated, sign-in rate tier (ADR-052)
- `GET /api/v1/patient/hospitals` · `GET /api/v1/patient/hospitals/{tenantId}/profile|appointments|invoices|lab-reports` — the patient portal's reads (`requirePatientAuth`)
- `POST|DELETE /api/v1/patients/{id}/portal-access` — the hospital grants and withdraws portal access (`patient.record.create`)
- `GET /api/v1/admin/stats` — platform-wide aggregates (super-admin; **aggregate-only**, ADR-023) · `GET /api/v1/dashboard/summary` — the caller's own-tenant roll-up (RLS-scoped)
- `GET /api/v1/rbac/permissions` (my effective permissions) · `GET /api/v1/rbac/roles` (requires `platform.roles.view`)
- `GET /api/v1/entitlements` (entitled modules) · `GET /api/v1/ipd/beds` (requireModule demonstrator — IPD is Phase 2)
- `GET /api/v1/patients` (list/search, paginated) · `POST /api/v1/patients` · `GET|PATCH /api/v1/patients/{id}` — Patient Management, module-gated (`requireModule('patient')` → `patient.record.view|create|update`)
- `GET /api/v1/appointments` (filter date/provider/patient/status, paginated) · `POST /api/v1/appointments` (book) · `POST /api/v1/appointments/{id}/cancel` — Appointments, module-gated (`requireModule('appointment')` → `appointment.booking.view|create|cancel`)
- `GET /api/v1/audit` (audit trail, paginated; requires `audit.log.view`)
- `POST /api/v1/notifications/test` (send; `notifications.send`) · `GET /api/v1/notifications` (log; `notifications.log.view`)
- `POST /api/v1/files` (upload) · `GET /api/v1/files/{id}` (download URL) · `GET /api/v1/files/content/{id}` (token stream) · `DELETE /api/v1/files/{id}` — `files.document.*`
- `GET /api/v1/specialties` · `GET|POST /api/v1/providers` · `GET|PATCH /api/v1/providers/{id}` · `POST /api/v1/providers/{id}/specialties` · `GET|POST /api/v1/specialty-templates` — `providers.view|manage`
- `GET /api/v1/visits` (queue/history: branch/provider/date/status/`patientId`/`mine`) · `GET /api/v1/visits/{id}` · `POST /api/v1/visits/check-in` · `PATCH /api/v1/visits/{id}/status` — OPD, module-gated (`opd.visit.view|checkin|update`)
- `GET /api/v1/icd10` · `GET /api/v1/encounters/{id}` · `GET /api/v1/patients/{id}/encounters` (`emr.encounter.view`) · `POST /api/v1/encounters/open` · `PUT /api/v1/encounters/{id}` · `POST /api/v1/encounters/{id}/sign` (`emr.encounter.write`) — EMR, module-gated
- `GET /api/v1/invoices` (patient/status/amount-range, paginated) · `GET|POST /api/v1/invoices/{id}` · `POST /api/v1/invoices/{id}/payments` — Billing Core (`billing.invoice.view|create`, `billing.payment.collect`)
- `GET|POST /api/v1/drugs` · `POST /api/v1/drugs/{id}/stock` · `GET /api/v1/prescriptions/pending` · `POST /api/v1/dispense` — Pharmacy (`pharmacy.stock.view|manage`, `pharmacy.dispense.create`)
- `GET|POST /api/v1/lab-tests` · `GET /api/v1/lab-orders` (status/`patientId`) · `GET /api/v1/lab-orders/{id}` · `POST /api/v1/lab-orders/{id}/collect` · `POST /api/v1/lab-orders/{id}/result` — Laboratory (`laboratory.order.view`, `laboratory.test.manage`, `laboratory.result.enter`)
- `GET /api/v1/reports/opd-register|collections|pending-labs` (+ EOD) — Reports (`reports.view`)

## Tenant branding (ADR-021)

- **Model:** `tenant_branding` (tenant-scoped, RLS; nullable `branch_id` = org-wide default, branch override reserved) — `brand_color`, `secondary_color`, `logo_file_id`, `favicon_file_id`, `typography` (jsonb), `version` (optimistic lock). Migration `drizzle/0008_worried_chimera.sql`.
- **`branding.service`:** `getCurrentBranding` (resolves logo/favicon file ids → short-lived URLs via the existing `FileStorageService`; nulls = "use the default `--hms-*` tokens"), `updateBranding` (colours/typography), `setLogo`/`setFavicon`, `resetBranding`. Logos/favicons are uploaded through the **reused** file-upload plumbing (`uploadSingle('file')` + `uploadFile`) — no new storage path.
- **Endpoints:** `GET /branding/current` (any authenticated user — feeds the Portal's session bootstrap), `PUT /branding` + `DELETE /branding` (reset) + `POST /branding/logo|favicon` — all editing gated by `platform.branding.manage` (org_admin). Colours validated as `#RRGGBB`.
- The Portal applies branding by setting the `--hms-*` CSS vars from `GET /branding/current` at bootstrap — the same seam the old localStorage demo used, so nothing in the design system changed.
- Verified live: colour update persists + reads back; logo upload returns a URL; bad hex → 422; reset clears; a receptionist → **403**.

## Departments (ADR-050)

- **Model:** `departments` — tenant-scoped (so RLS applies mechanically), nullable `branch_id` following the platform convention (**NULL = organization-wide**), `code` unique within the tenant, `name`, `description`, optional `specialty_code` (ties to the FHIR-aligned specialty catalog rather than starting a second taxonomy), optional `head_provider_id` (`set null` — losing a head must not make the department unreadable), `is_active`. Migration `drizzle/0018_sour_ted_forrester.sql`.
- **Not module-gated.** A department is organisational structure every entitled clinical module reads, exactly like a branch — Platform Core, not a purchasable module. `requireModule` would be wrong here.
- **Links:** `practitioner_roles.department_id` (a provider works in a department) and `visits.department_id` (check-in routes by one). Both nullable and `set null`.
- **The legacy column stays.** `visits.department` is the original free-text field; check-in writes the department's *name* into it as well as setting `department_id`, so every existing read keeps working. Deprecated, and goes when no row needs it.
- **Never deleted.** Visits and encounters reference departments and last year's register must still name one, so the only lifecycle action is activate/deactivate — audited at `notice`, with the attached doctor count in the metadata.
- **Referential rules live in the service, not only the request schema:** a department cannot be scoped to another hospital's branch, headed by another hospital's provider, or reuse a code; a visit cannot be checked into another tenant's or a retired department. The uppercase-code normalisation is in the service for the same reason — it was in the Zod schema only, and the seed happily created `ortho` beside `ORTHO` because the unique index is case-sensitive.
- Verified live: four seeded departments for CITYCARE, receptionist **200** on read / **403** on create, pharmacist **403** on read, and a CITYCARE department id returns **404** to SUNRISE while CITYCARE reads it with 200.

## Patient identity & the patient portal (ADR-052)

- **Two principals, not two roles.** The access token carries `pt` (`staff` | `patient`). `requireAuth` refuses a patient **by type**, before any permission is consulted — so a future grant or a mistaken override cannot open a staff route to a patient — and `requirePatientAuth` refuses a staff token on patient routes. The boundary is enforced in both directions.
- **Model:** `patient_identity` + `patient_verification` are **platform-managed** (no `tenant_id`, no RLS, like `tenants`); `patient_identity_link` is **tenant-scoped** and inherits RLS. A patient registered at three hospitals is one person, so the identity sits above the tenancy boundary and reaches into it through links. Migration `drizzle/0019_clammy_ben_parker.sql`.
- **No public signup, structurally.** No route lets a caller attach themselves to a chart. `POST /patients/:id/portal-access` is a staff route and is the only way a link is created. Granting does not verify the contact.
- **The tenant is never trusted from the path.** Every read calls `resolvePatientAccess` first; the patient id it filters on comes from the link, not the request, so another person's chart is unrepresentable rather than merely refused. Per-request, so revocation is immediate.
- **Codes** are hashed, single-use, expiring, attempt-capped. `request-code` always answers 202 with the same message — otherwise it answers "is this person a patient somewhere?".
- **Verification is sent from the PLATFORM tenant**, never a hospital: a hospital's notification log must not record that a patient signed in, least of all a hospital they did not choose.
- **Lab reports are resulted orders only** — an in-progress sample is not a report.
- **Revoke uses the same permission as grant** (`patient.record.create`): withdrawing access must never be harder than granting it.
- Verified live: patient token → **401** on `/patients`; staff token → **401** on `/patient/hospitals`; patient reads their own profile at the linked hospital and gets **403** at an unlinked one; a replayed code gives **401**.

## Organization profile & Hospital Setup (ADR-049)

- **Model:** `organization_profile` — one row per tenant (`organization_profile_tenant_unique`), **tenant-scoped so it inherits the RLS policy automatically**. Registered/legal name, two address lines, city, state, PIN, country, phone, email, website, registration number, GSTIN, `version`. Migration `drizzle/0017_certain_silver_surfer.sql`. It is a separate table from `tenants` on purpose: `tenants` is the tenancy boundary and is platform-managed, this is data the hospital owns and edits.
- **`organization.service`:** `getOrganizationProfile` (joins the tenant's provisioned name/code, composes `contactLines` in document order, and reports `isComplete` when the fields a tax-invoice header needs are present), `updateOrganizationProfile` (partial — an omitted field is untouched, an empty string clears it; writes an `organization.profile.update` audit entry naming the changed fields), `buildContactLines` (pure, unit-tested).
- **Endpoints:** `GET /organization/profile` needs only authentication — printed documents and the Portal header need it, and RLS already means "of this tenant". `PUT` requires `platform.organization.manage`. Validation is Indian-context: 6-digit PIN, 15-character GSTIN, full URL for the website.
- **`setup.service`:** `getSetupStatus` derives every step from real rows on each read — profile, branding, branches, departments, providers, staff, roles, plus the lab test master and drug master **only when the tenant is entitled to those modules**. No stored completion flag exists, so the status stays true when configuration changes later. Counts carry an explicit `tenant_id` predicate on top of RLS (ADR-015) — without it a privileged local connection counted every tenant's rows.
- **Deliberately absent:** no step for sub-departments, procedures, services, packages, treatment plans, wards, rooms or beds. None of those exist in the model (IPD is Phase 2), and a setup step for an unbuilt area is a promise the product cannot keep — `BACKLOG.md` E-1, E-3…E-8. Departments joined the list when they became a real entity (ADR-050).
- **`reconcileSystemRoles()`** (in `rbac.service`, run by `db:migrate`) brings every existing tenant's system roles up to date with `@hms/permissions`. Additive only and idempotent — without it, a permission key added after a tenant was onboarded is enforced by the routes but held by nobody.
- Verified live: org_admin 6/8 → 7/8 after saving the profile; receptionist **403** on `/setup/status` and on `PUT /organization/profile` but **200** on the read; SUNRISE unaffected by CITYCARE's details; invalid GSTIN → 422 with its own message.

## Patient self-registration by QR (ADR-056)

The **only unauthenticated write path in the product**. Read this before adding a second one.

- **Model:** `organization_profile` gained `self_registration_enabled` (default false — a hospital opts in) and a unique, indexed `self_registration_token`, plus the identity/letterhead fields (`display_name`, `secondary_phone`, `support_email`, `letterhead_header`, `letterhead_footer`, `signatory_name`, `signatory_designation`). New tenant-scoped **`registration_requests`** — RLS applies automatically, as it does to every table with a `tenant_id` — holding the submission, `status` (`pending|approved|rejected`), the reviewer, the rejection reason and the `patient_id` once converted. Migration `drizzle/0021_great_photon.sql`.
- **Letterhead image + page size (ADR-065).** `organization_profile` also carries `letterhead_image_file_id` (a `file_metadata` id, resolved to a short-lived URL on read like the branding logo) and `document_page_size` (`A4` default, `A5`, `LETTER`, `LEGAL`). The image is uploaded/removed via `POST`/`DELETE /organization/profile/letterhead-image` (`platform.organization.manage`, image-only, audited); page size rides the normal profile `PUT` (Zod enum). Migration `drizzle/0022_open_masque.sql`. The token-authorized file content route sets `Cross-Origin-Resource-Policy: cross-origin` so these images embed in the frontends and print documents, which run on their own origins.
- **The tenant is resolved from the token, server-side, on every public call.** `resolveRegistrationToken` is the one lookup in the codebase that runs on the base client rather than inside `runWithTenant`, because determining the tenant *is* its purpose. It reads a single row by the unique token and returns only what a public form may display — hospital name, city, on/off. Never trust a tenant identifier from a body, header or query parameter here; there is deliberately no field for one.
- **A submission is a request, not a patient.** Nothing on the public path writes to `patients`. ADR-052's invariant is intact: the hospital decides who becomes a patient record, and `approveRegistrationRequest` — which calls `createPatient` — is where a chart appears.
- **Two permissions.** Listing the queue is `patient.record.view`; approving and rejecting are `patient.record.create`. They cannot share one: approving creates a chart, but `org_admin` (who switches the feature on and prints the QR) does not hold `patient.record.create` and would otherwise never see that anything arrived. `listRequests` **projects field by field** rather than spreading the row, so `tenant_id`, `submitted_ip` and `reviewed_by` stay internal.
- **Failure modes are uniform.** Unknown token, regenerated token and registration-disabled all return the same 404. The endpoint must never reveal which hospitals exist or which are open. Both public routes carry `authLimiter`.
- **Disable ≠ regenerate.** Disabling keeps the token so a hospital can pause without reprinting posters; `regenerateRegistrationToken` mints a new one and every printed poster stops working immediately — hence `sensitiveLimiter` and an audit entry at notice. Enable, disable, approve and reject are audited too; a public submission is audited against the tenant with **no actor**, which is what later answers "where did this chart come from".
- Verified live: CityCare's QR → "Jaivik Patel" pending; `org_admin` list **200** / approve **403**; reception list **200** / approve **200** → `UHID-000005`; Sunrise's reception sees an empty queue and **404** on CityCare's request id; second approval **409**.

## Observability & Ops

- **Structured logging:** pino (`config/logger.ts`) with **PII/secret redaction** (authorization headers, cookies, passwords, tokens) — JSON in staging/production, pretty in dev. `pino-http` adds a per-request correlation id.
- **Error tracking:** `observability/errorTracker.ts` — a thin abstraction (ADR-007 pattern). By default it logs an `error.captured` event (with request id + tenant/user/method/path) for every unexpected 5xx from the error handler; set **`SENTRY_DSN`** to forward to Sentry/GlitchTip later without touching call sites.
- **Health:** `GET /health` (liveness) + `/health/ready` (DB readiness, 503 until PostgreSQL reachable) — for uptime checks and PM2/Nginx.
- **Deploy baseline (versioned, `deploy/`):** PM2 ecosystem (`deploy/ecosystem.config.cjs`), Nginx template (`deploy/nginx/hms.conf.template`), backup + **restore-drill** scripts (`deploy/backup/`), and the ops runbook (`deploy/README.md`). CI/CD: `.github/workflows/ci.yml` (every push) + `deploy-staging.yml` (auto-deploy on merge to `staging` — migrate before rollout, PM2 zero-downtime reload). See ADR-019.

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

- **Master data (ADR-072):** `modules/catalog` serves the **global** system catalogue (`reference_catalog` — no `tenant_id`, seeded from `catalog.data.ts` in all three seeders like the specialty catalogue) merged at read time with a tenant's own custom items (`tenant_reference_items`, RLS-scoped) via `GET /catalog/:category`; `modules/immunization` records patient vaccinations (`patient_immunizations`) off that catalogue. Priced tables (`lab_tests`/`drugs`/`services`) carry a nullable `catalog_code` recording adoption. Reads and custom-writes filter `tenant_id` explicitly **and** run under RLS. **Per-hospital availability (ADR-073):** `branch_item_availability` is an overlay (org default = master `is_active`; a row = per-branch exception) — `listDrugs`/`listTests`/`listServices`/`listCatalog` accept an optional `branchId` and enforce it in the backend; managed via `PUT /branch-availability` (org_admin, `platform.catalog.availability.manage`). Departments are natively branch-scoped, so they're excluded.
- Requires `.env` (copy `.env.example`). Invalid env exits at boot with field errors.
- Installed and verified: `npm run install:all` at the repo root; `npm run dev` starts this API on `:4000` (health at `GET /api/v1/health`). Run just this app with `npm run dev -w hms_backend`.
- `/health/ready` returns 503 until a reachable PostgreSQL is configured in `.env` (the pool connects lazily).
