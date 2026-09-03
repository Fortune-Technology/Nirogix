# Nirogix — Automated Testing Architecture

**Last Updated:** 19/08/2026
**Related:** `testcases.md` (manual QA checklist) · `docs/manual-testing-guide.md` (manual journey script) · `CLAUDE.md` → Testing (binding) · `BACKLOG.md`

> **Purpose.** What is automated, at which level, how to run it, and what deliberately stays
> manual. The goal is a safety net that catches regressions in the **core hospital workflow,
> authentication, roles, permissions, tenant isolation, payments, pharmacy, lab and the patient
> journey** _before_ a human starts a manual pass — not to replace manual testing.

> **Maintenance rule (binding).** A feature ships as _implement → automated tests → manual cases
> in `testcases.md` → verify → complete_. When you automate a manual case, mark it in the
> mapping below **in the same change**.

---

## 1. The levels, and what belongs at each

One runner per job. No competing frameworks.

| Level           | Tool                             | Location                                                   | What belongs here                                                                                                                            |
| --------------- | -------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**        | vitest                           | `hms_backend/src/**/__tests__`, `packages/*/src/__tests__` | Pure logic with no I/O — token round-trips, date/colour helpers, month-window math, permission resolution                                    |
| **Integration** | vitest + real PostgreSQL         | `hms_backend/src/modules/*/__tests__/*.test.ts`            | Service functions against a real database, so RLS, constraints and transactions are exercised                                                |
| **API (HTTP)**  | vitest + supertest               | `hms_backend/src/**/__tests__/*.api.test.ts`               | The boundary: Bearer/principal checks, `requireModule` → `requirePermission`, Zod validation, error→status mapping, cross-tenant refusals    |
| **Component**   | vitest + jsdom + Testing Library | `packages/ui/src/__tests__`                                | Shared primitives — DataTable, date fields, toasts, table actions                                                                            |
| **E2E / smoke** | Playwright                       | `e2e/`                                                     | What genuinely needs a browser: multi-role journeys, route guards as the user meets them, five-app smoke, viewport/theme, scroll restoration |

**Why the API level exists.** The service tests prove the business rules but call functions
directly with an explicit `tenantId` — they skip every guard a real attacker meets. The
`*.api.test.ts` suites go through Express, so a permission or entitlement regression fails here
even when the service is correct. _A frontend guard is UX; the API is the boundary._

---

## 2. Commands

```bash
npm run test            # everything vitest: unit + integration + API (turbo, all workspaces)
```

| Command                   | Runs                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `npm run test`            | All vitest suites across every workspace                              |
| `npm run test:backend`    | Backend only (unit + integration + API)                               |
| `npm run test:api`        | The HTTP-boundary suites only (`*.api.test.ts`)                       |
| `npm run test:unit`       | The shared packages' suites (`@hms/*`)                                |
| `npm run test:e2e`        | Playwright, all projects (starts the dev servers itself)              |
| `npm run test:e2e:ui`     | Playwright in watch/inspector mode                                    |
| `npm run test:smoke`      | The five-app smoke project only — safe against a deployed environment |
| `npm run test:regression` | `test` then `test:e2e` — the full pre-staging gate                    |

Targeting an environment (E2E):

```bash
E2E_BASE_ENV=staging E2E_PORTAL_URL=https://portal-staging.nirogix.com npm run test:smoke
```

`E2E_BASE_ENV` selects the seeded account set (`development` → CityCare, `staging` → QA General
Hospital). Hosts come from `resources/domains.md` and are overridable per variable; nothing is
hard-coded outside `playwright.config.ts`.

---

## 3. Test data strategy

Automated tests never depend on hand-made staging data.

- **API/integration:** each suite onboards its **own tenant** through `makeTenant()` in
  `hms_backend/src/test-api.ts`, which creates one account per staff role with a known
  non-secret password. Unique tenant codes per suite (`APIAUTH`, `ISOAAA`, `ISOBBB`, `APIRBAC`,
  `CRITPATH`) mean suites never collide, and `cleanupTenant()` runs in **both** `beforeAll` and
  `afterAll` so a crashed run cannot poison the next one. Tests are safe to re-run.
- **E2E:** uses the **seeders** — `db:seed` (development, `seed.development.ts`) and `db:seed:staging` (deterministic,
  written as an E2E contract). Accounts resolve through `e2e/helpers/accounts.ts`; passwords are
  the seeders' non-secret defaults, overridable by `E2E_PASSWORD`. No real credential is committed.
- **Skip-without-database:** every DB suite checks `dbReady()` and skips cleanly, so the suite
  stays green on a machine with no PostgreSQL while CI enforces the real thing.

---

## 4. Mapping — manual case → automated coverage

Status key: **✅ automated** · **◐ partly automated** (the state transitions are covered, the UI
is not) · **☐ manual only**.

### Core workflow and security

| Area                                                                                                                             | Manual source                   | Automated | Level              | File                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------- | ------------------ | --------------------------------------------------------------------- |
| Login (valid / invalid / missing / role + tenant context)                                                                        | AUTH-01…09, guide §1            | ✅        | API + E2E          | `auth.api.test.ts`, `e2e/portal/auth.spec.ts`                         |
| No account enumeration (unknown email == unknown org)                                                                            | AUTH-02/03                      | ✅        | API                | `auth.api.test.ts`                                                    |
| Refresh cookie flags + path scope                                                                                                | AUTH-06, FE-06                  | ✅        | API                | `auth.api.test.ts`                                                    |
| Forgot password (token single-use, expiry, revocation)                                                                           | AUTH-30…37                      | ✅        | Integration        | `passwordReset.test.ts`                                               |
| Quick-login gating (roles offered, no platform operator)                                                                         | guide §0.3, §17                 | ✅        | E2E                | `e2e/portal/auth.spec.ts`                                             |
| Role → permission enforcement per module                                                                                         | RBAC-02…05, guide §13           | ✅        | API                | `permissions.api.test.ts`                                             |
| Direct API call refused for unpermitted role                                                                                     | ACT-03, OPD-05, EMR-08, PHR-07… | ✅        | API                | `permissions.api.test.ts`                                             |
| Module entitlement precedes permission (`MODULE_NOT_ENTITLED`)                                                                   | ADM-04, SETUP-09                | ✅        | API                | `permissions.api.test.ts`                                             |
| Unauthenticated access is 401                                                                                                    | AUTH-08, guide §14              | ✅        | API + E2E          | `permissions.api.test.ts`, `e2e/smoke/apps.spec.ts`                   |
| **Tenant isolation — cross-tenant read by id**                                                                                   | TEN-01/02, guide §12            | ✅        | API                | `tenant-isolation.api.test.ts`                                        |
| **Tenant isolation — cross-tenant write blocked, record unmutated**                                                              | TEN-02, guide §12               | ✅        | API                | `tenant-isolation.api.test.ts`                                        |
| Tenant isolation at the database (RLS)                                                                                           | TEN-03                          | ✅        | Integration        | `db/__tests__/tenant-isolation.test.ts`                               |
| Session tenant cannot be overridden by client headers                                                                            | TEN-01                          | ✅        | API                | `tenant-isolation.api.test.ts`                                        |
| Full clinical journey — state transitions                                                                                        | guide §10, OPD/EMR/PHR/LAB/BIL  | ◐         | Integration + API  | `opd/__tests__/clinical-journey.test.ts`, `critical-path.api.test.ts` |
| Payment: cash, paid status, no overpay, idempotent retry                                                                         | BIL-01…10, guide §6             | ✅        | Integration + API  | `clinical-journey.test.ts`, `critical-path.api.test.ts`               |
| Unpaid-consultation gate                                                                                                         | OPD-08, EMR-08, guide §7.1      | ✅        | Integration + API  | as above                                                              |
| Prescription → pharmacy, no double dispense                                                                                      | PHR-06…08, guide §8             | ✅        | Integration + API  | as above                                                              |
| Lab order → collect → result, billed once                                                                                        | LAB-04…08, guide §9             | ✅        | Integration + API  | as above                                                              |
| Encounter sign locks the record                                                                                                  | EMR-11, guide §7.7              | ✅        | Integration        | `clinical-journey.test.ts`                                            |
| Patient registration, UHID, duplicate handling, search                                                                           | PAT-01…13                       | ✅        | Integration        | `patient/__tests__/patient.test.ts`                                   |
| Master data: seeded catalogue, custom items, cross-org isolation                                                                 | MD-01…08, AVAIL-01…07           | ✅        | Integration        | `catalog.test.ts`, `branchAvailability.test.ts`                       |
| Audit on mutations and sign-in; append-only                                                                                      | AUD-01…07                       | ✅        | Integration        | `audit/__tests__/audit.test.ts`                                       |
| **Account lockout** — threshold, backoff, expiry, per-account scope, audit                                                       | AUTH-40…47                      | ✅        | Unit + API         | `auth/__tests__/lockout.test.ts`, `lockout.api.test.ts`               |
| **Password policy** — length, classes, blocklist, own-details, generated temp passwords                                          | AUTH-48…50                      | ✅        | Unit + Integration | `passwordPolicy.test.ts`, `passwordReset.test.ts`                     |
| **Upload content validation** (magic bytes vs declared type)                                                                     | UPLOAD-01…03                    | ✅        | Unit               | `file/__tests__/fileSniff.test.ts`                                    |
| **Request correlation id** — header, uniqueness, audit row, untrusted input                                                      | REQID-01…03                     | ✅        | API                | `audit/__tests__/requestId.api.test.ts`                               |
| **Access refusals** — module before permission, roles from the tenant's own tables, closed response shape, 401 without a session | DENY-01…09                      | ✅        | API                | `rbac/__tests__/accessExplain.api.test.ts`                            |
| **Seeding twice changes nothing** — a hand edit survives, no duplicates, a newly added record still reaches an old database      | SEED-26…28                      | ✅        | Integration        | `scripts/__tests__/seedIdempotency.test.ts`                           |

### Frontend

| Area                                                                                      | Manual source         | Automated | Level            | File                                                             |
| ----------------------------------------------------------------------------------------- | --------------------- | --------- | ---------------- | ---------------------------------------------------------------- |
| All five apps load, own `<title>`, no runtime errors                                      | FE-01…21, guide §15   | ✅        | E2E              | `e2e/smoke/apps.spec.ts`                                         |
| Four product apps are `noindex`; marketing is indexable                                   | MKT-*, ADR-027        | ✅        | E2E              | `e2e/smoke/apps.spec.ts`                                         |
| Protected route redirects to sign-in (Portal + Admin)                                     | RBAC-06, guide §14    | ✅        | E2E              | `e2e/smoke/apps.spec.ts`                                         |
| Admin console exposes no quick-login                                                      | ADR-080               | ✅        | E2E              | `e2e/smoke/apps.spec.ts`                                         |
| **Route-change scroll starts at top**                                                     | guide §15             | ✅        | E2E              | `e2e/marketing/navigation.spec.ts`                               |
| One `<h1>` + unique meta description per marketing page                                   | MKT-01/02             | ✅        | E2E              | `e2e/marketing/navigation.spec.ts`                               |
| Branded 404 without a stack trace                                                         | 404-01…03             | ✅        | E2E              | `e2e/marketing/navigation.spec.ts`                               |
| DataTable sort/filter/paging/column visibility                                            | TBL-01…18             | ✅        | Component        | `packages/ui/src/__tests__/DataTable.test.tsx`                   |
| Date/time display + entry (`DD/MM/YYYY`, `hh:mm AM/PM`)                                   | FMT-01…11, DATE-01/02 | ✅        | Component + Unit | `datetime.test.tsx`, `datefields.test.tsx`, `utils/date.test.ts` |
| Toast system (variants, a11y roles)                                                       | TOAST-01…16           | ◐         | Component        | `packages/ui/src/__tests__/toast.test.tsx`                       |
| Row actions + confirmation                                                                | ACT-01…10             | ◐         | Component        | `TableActions.test.tsx`                                          |
| **Content-Security-Policy builder** (nonce vs static, dev vs production, allowed origins) | CSP-01…05             | ◐         | Unit             | `packages/utils/src/__tests__/security.test.ts`                  |
| **Idle-session policy** (window, cross-tab activity, corrupt/unavailable storage)         | AUTH-51…53            | ◐         | Unit             | `packages/client/src/__tests__/idle.test.ts`                     |

---

## 5. What stays manual — and why

Automating these would cost more than it returns, or cannot be done honestly:

- **Visual and brand fidelity** — Light/Dark sweeps, tenant accent on hover/pressed/focus,
  chart legibility, "the admin shell reads the same as the Portal". No visual-regression
  baseline exists; introducing one is a separate decision (`BACKLOG.md`).
- **Print and PDF layout** — repeated headers across pages, `@page` size in the print dialog,
  print-vs-PDF parity, letterhead rendering.
- **Assistive technology** — screen-reader announcements, reduced-motion behaviour. Automated
  checks can assert roles and names; they cannot confirm what a screen reader says.
- **Physical devices and external tools** — scanning a printed QR with a phone, OG-card
  rendering in a social validator, Lighthouse on a throttled mid-range mobile.
- **Editorial judgement** — the marketing honesty guardrails ("pick five claims at random and
  try them"), which are irreducibly exploratory.
- **Infrastructure** — TLS per host, `www` → apex, production CORS refusal, backup-restore
  drills, real SMS delivery (blocked on DLT; see `docs/dlt-sms-onboarding.md`).

`testcases.md` and `docs/manual-testing-guide.md` remain the source of truth for all of the above.

---

## 6. CI/CD

**Pull request / push (`ci.yml`)**

```
typecheck → lint → openapi:validate → test (unit + integration + API) → build
```

That is the whole pipeline, on purpose. It is fast, needs one PostgreSQL service container and
no browsers, and it still covers the security-critical layer — authentication, roles and
permissions, module entitlement and tenant isolation all run at the API level in `npm run test`.

**Staging (`deploy-staging.yml`)**

```
deploy → manual QA
```

**E2E runs locally, not in CI — deliberate.** Playwright needs browser downloads and all six
dev servers booted, which costs several minutes of Actions time per run against a limited org
budget, for coverage that is mostly UI smoke. The rule instead:

> Run `npm run test:e2e` on your machine before pushing anything that touches a frontend, and
> `npm run test:regression` before handing staging to a tester.

If E2E is ever wanted in CI, add it as a **manually triggered** (`workflow_dispatch`) or
nightly workflow rather than on every push, so it cannot slow down or block ordinary work.

**Production:** no destructive E2E, ever.

---

## 7. Gotchas learned from real runs

- **A stale `.next` cache produces a convincing false alarm.** A corrupted Turbopack cache in
  `aiportal/.next` made the app return **500** with `SyntaxError: Expected double-quoted property
name in JSON ... package.json`, which reads exactly like a broken `package.json` — the file was
  valid, and every other app compiled against it. `rm -rf <app>/.next` fixed it. Suspect the cache
  before the source when one app fails and its siblings, with identical config, do not.
- **`getByLabel('Password')` matches two elements.** `PasswordField`'s visibility toggle is
  labelled "Show password"/"Hide password", so a substring match hits both. Use
  `getByLabel('Password', { exact: true })`.
- **The login page probes `/auth/me` while unauthenticated**, so a 401 appears in the console
  before sign-in. That is correct behaviour. Console-error assertions therefore start collecting
  **after** sign-in — the alternative (ignoring all 401s) would hide a real authorization bug.
- **The Admin console's dashboard is `/`, not `/dashboard`** (`app/(app)/page.tsx`). Asserting a
  redirect from a route that does not exist tests the 404 page, not the auth guard.
- **Audit writes outlive the HTTP response.** `auditMiddleware` writes on `res.on('finish')`, and
  supertest resolves earlier; `audit_log.tenant_id` is ON DELETE RESTRICT, so teardown could fail
  on a foreign key. `cleanupTenant()` now drains in-flight audit writes before deleting.
- **Tests must never reach a real provider.** `test-setup.ts` blanks `MSG91_API_KEY` in-process,
  because a developer holding a real authkey in `.env` would otherwise have `npm run test` send
  live email and spend credits, and would see failures CI never reproduces.

## 8. Known gaps (tracked)

- **Frontend workspaces other than `packages/ui` have no component tests.** `hms_frontend` has a
  `--passWithNoTests` script that cannot fail; `marketing`, `admin`, `patient` and `aiportal`
  have no test script at all.
- **The clinical journey is not yet automated through the UI.** Its state transitions are
  covered at service and API level; the browser walk-through in `docs/manual-testing-guide.md`
  §10 is still manual. Stated plainly rather than claimed as covered.
- **Current verified state (19/08/2026):** backend **32 files / 217 tests** green, E2E **31 tests**
  green against locally running dev servers, `tsc --noEmit` clean.
- **vitest version skew** — `hms_backend` is on vitest 2.x, `packages/ui` on 4.x. Harmless today
  (separate workspaces) but worth aligning.
- **E2E is not enforced by CI.** It only protects the codebase if someone actually runs it
  locally before pushing frontend work. That is a discipline gap, accepted knowingly to keep the
  deploy pipeline fast and within the org's Actions budget.
