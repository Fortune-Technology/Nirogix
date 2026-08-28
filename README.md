# Nirogix — Monorepo

**Nirogix** is a multi-tenant Hospital Management System (SaaS) by **Takoriya Technology LLP**, at [nirogix.com](https://nirogix.com). This is an **npm workspaces + Turborepo** monorepo — everything is driven from the repository root.

> Product, architecture, rules, phases, and the engineering roadmap live in [`resources/`](resources/). Start with [`CLAUDE.md`](CLAUDE.md) (monorepo index) and [`resources/development-plan.md`](resources/development-plan.md) (execution roadmap). Environment host names come from [`resources/domains.md`](resources/domains.md). Architectural decisions are in [`DECISIONS.md`](DECISIONS.md).

> **Naming.** The product is Nirogix everywhere a person can see it. Internal identifiers — the `hms_backend/` and `hms_frontend/` directories, the `@hms/*` package scope, the `--hms-*` design tokens and `.hms-*` class names — deliberately keep their prefix (ADR-041): they are invisible outside the repository, and renaming them would touch nearly every file for no user-visible gain. "HMS" also survives in marketing copy where it is the industry search term for *hospital management system*, never as our product's name.

## Requirements

| Tool | Version |
|---|---|
| Node.js | **≥ 20** (developed on 22.x) |
| npm | **≥ 10** (developed on 10.9.2) |

No global package manager beyond npm is required (ADR-014 — npm workspaces, not pnpm). Turborepo is installed as a dev dependency.

## Quick start

```bash
# 1. Install every workspace's dependencies (one command, from the root)
npm run install:all

# 2. Configure environment (see "Environment" below) — copy each app's example to .env
for a in hms_backend hms_frontend marketing patient admin aiportal; do cp $a/.env.example $a/.env; done

# 3. Start the whole platform (backend + portal + marketing) together
npm run dev
```

That's it — one install, one dev command. No need to `cd` into each app.

## Applications & ports

| Workspace | What it is | Dev URL | Port |
|---|---|---|---|
| `hms_backend` | Node.js + Express + TypeScript API (Drizzle/PostgreSQL) | http://localhost:4000/api/v1 | **4000** |
| `marketing` | Next.js public marketing/SEO site | http://localhost:3000 | **3000** |
| `hms_frontend` | Next.js **Nirogix Portal** — hospital staff | http://localhost:3001 | **3001** |
| `patient` | Next.js patient portal — verified patients | http://localhost:3002 | **3002** |
| `admin` | Next.js platform administration — vendor operators | http://localhost:3003 | **3003** |
| `aiportal` | Next.js AI Portal — staff + operators, never patients | http://localhost:3004 | **3004** |

Shared libraries (not servers): `packages/types` (`@hms/types`), `packages/client` (`@hms/client`), `packages/ui` (`@hms/ui`), `packages/config` (`@hms/config`), `packages/utils` (`@hms/utils`), `packages/permissions` (`@hms/permissions`).

A port belongs to the application, not to the environment: it is pinned in that workspace's `dev` **and** `start` scripts, mirrored in `.claude/launch.json`, and matched by the Nginx upstreams in `deploy/`. The full host map, per environment, is `resources/domains.md`.

Health check: `GET http://localhost:4000/api/v1/health` → `{"status":"ok",...}`. Readiness (DB): `GET /api/v1/health/ready`.

## Root commands

| Command | Does |
|---|---|
| `npm run install:all` | Install all workspace dependencies (= `npm install`) |
| `npm run dev` | Start backend + portal + marketing concurrently (Turborepo, labelled logs) |
| `npm run build` | Build every app/package (`turbo run build`) |
| `npm run lint` | Lint every workspace |
| `npm run test` | Run every workspace's tests |
| `npm run typecheck` | Type-check every workspace (`tsc --noEmit`) |
| `npm run openapi:generate` | Write the backend OpenAPI spec to `hms_backend/generated/openapi.json` |
| `npm run openapi:validate` | Validate the OpenAPI spec and fail on any undocumented `/api/v1` route |
| `npm run format` | Prettier-format the repo |
| `npm run format:check` | Verify formatting without writing |

Logs from `npm run dev` are prefixed per service (`hms_backend:dev:`, `hms_frontend:dev:`, `marketing:dev:`, `patient:dev:`, `admin:dev:`, `aiportal:dev:`) so failures are attributable at a glance. Stop everything with **Ctrl+C**.

## Running a single application

```bash
npm run dev -w hms_backend      # backend only    (:4000)
npm run dev -w marketing        # marketing only  (:3000)
npm run dev -w hms_frontend     # portal only     (:3001)
npm run dev -w patient          # patient portal  (:3002)
npm run dev -w admin            # admin console   (:3003)
npm run dev -w aiportal         # AI Portal       (:3004)
```

`-w <workspace>` works with any script (`build`, `lint`, `typecheck`, …). Turbo filters also work: `npx turbo run dev --filter=hms_frontend`.

## API documentation (Swagger / OpenAPI)

The backend serves environment-aware OpenAPI docs. Documentation is **mandatory** — every `/api/v1` route must be documented, and `npm run openapi:validate` (run in CI) fails on any undocumented or invalid API. See [`resources/rules.md`](resources/rules.md) → *API Documentation Rules*.

| Environment | Swagger UI | Raw spec |
|---|---|---|
| Local | http://localhost:4000/api/v1/docs | http://localhost:4000/api/v1/openapi.json |
| Testing / Staging | `{staging-api}/api/v1/docs` | `{staging-api}/api/v1/openapi.json` |
| Production | `{prod-api}/api/v1/docs` (when `OPENAPI_UI_ENABLED`) | `{prod-api}/api/v1/openapi.json` |

- The spec is **generated from route definitions** (Zod + `zod-to-openapi` in `hms_backend/src/openapi/`) — never hand-written. To add a route: document it in the module's `*.openapi.ts` and import that file in `src/openapi/register.ts`.
- Server URLs come from config (`API_PUBLIC_URL`, `API_STAGING_URL`, `API_PRODUCTION_URL`) — never hard-coded. Disable the UI per environment with `OPENAPI_UI_ENABLED=false` (the JSON spec is always served).
- `npm run openapi:generate` writes the spec to `hms_backend/generated/openapi.json` (gitignored) for frontend/mobile codegen.

## Environment

Secrets are **never committed**. Each app carries a committed `.env.example` and a gitignored `.env` holding **the same keys in the same order** (CLAUDE.md → *Environment files*). Every key in an example file is live and uncommented — an unconfigured or secret one is present with an empty value — so `cp .env.example .env` gives a complete, boot-ready file where only values need changing. A blank value means “not configured” and behaves exactly like an unset one.

| Workspace | File | Key vars |
|---|---|---|
| `hms_backend` | `.env` | `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `MSG91_*`, `R2_*`, `ABDM_*` |
| `hms_frontend` | `.env` | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_ADMIN_ORIGIN`, `NEXT_PUBLIC_PATIENT_URL`, `NEXT_PUBLIC_ENVIRONMENT` |
| `marketing` | `.env` | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PORTAL_LOGIN_URL`, `NEXT_PUBLIC_ENVIRONMENT`, `HMS_API_URL` |
| `patient` | `.env` | `NEXT_PUBLIC_API_BASE_URL` |
| `admin` | `.env` | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_PORTAL_URL` |
| `aiportal` | `.env` | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_PORTAL_URL`, `NEXT_PUBLIC_SITE_URL` |

The backend validates its environment at boot (Zod) and exits with a clear message if a variable is missing or malformed. A local PostgreSQL is only required to hit DB-backed endpoints — the API boots and serves `/health` without one.

## ABDM / ABHA (Milestone 1)

The Portal can verify a patient's ABHA at the registration desk and fill the form from the verified profile — by Aadhaar OTP, by an existing ABHA identifier, or by the patient scanning the hospital's facility QR (Scan and Share). See **ADR-084** for the design and `resources/development-plan.md` §36 for scope. **Milestone 1 only**: HIP (M2) and HIU (M3) record sharing are deliberately not implemented.

### It works out of the box, with no credentials

`ABDM_PROVIDER=mock` (the default) runs every flow offline against an in-process stand-in with a real RSA keypair and a fixed OTP of `123456`. This is a designed part of the system, not a stub: the ABDM sandbox rate-limits OTPs to a handful per mobile number per day, so local development, CI and demos cannot be run against the real gateway. The mock refuses to start when `NODE_ENV=production`.

The mock's behaviour is selected by the **last digit of the Aadhaar number**, so a tester can reproduce any scenario on demand:

| Aadhaar ends in | Scenario |
|---|---|
| `0` | the Aadhaar already has an ABHA — the returning-patient path |
| `1` | no mobile linked to the Aadhaar — the error the desk must be able to read |
| `5` | the identifier resolves to two ABHA accounts — the shared-family-mobile case |
| `9` | ABDM rejects the OTP — the failure and manual-form fallback |
| anything else | a clean new ABHA creation |

### Connecting to the real ABDM sandbox

1. **Register at [sandbox.abdm.gov.in](https://sandbox.abdm.gov.in).** A manual signup — it cannot be automated. Signing in is not enough: create an **application** in the portal under **Milestone 1** to be issued a `client_id` / `client_secret` pair. Only V3 APIs are used; a V1/V2 implementation is rejected at the sandbox-exit review.
2. **Set the server variables** (see `hms_backend/.env.example`): `ABDM_PROVIDER=gateway`, `ABDM_CLIENT_ID`, `ABDM_CLIENT_SECRET`, and `ENCRYPTION_KEY` (ABDM tokens are stored encrypted; without a key they are discarded rather than written in the clear). The API refuses to boot if a credential is missing, if production points at the sandbox, or if a non-production environment points at production ABDM.
3. **Prove the credentials** before anything else — `npm run abdm:check -w hms_backend` requests a session and fetches the RSA certificate, printing no secret, so the output is safe to paste into an NHA support ticket.
4. **Register the bridge URL and the HIP service.** Both need `Authorization: Bearer <session token>`; NHA's onboarding email omits that header and quotes **outdated V1 paths**. V3 uses `PATCH https://dev.abdm.gov.in/api/hiecm/gateway/v3/bridge/url` with `{"url":"https://<your api host>"}` — register the **base** URL, because the gateway appends `/api/v3/hip/patient/share` itself, and it must be HTTPS with a valid certificate. Service registration is on the **facility-registry** host: `POST https://facilitysbx.abdm.gov.in/v1/bridges/MutipleHRPAddUpdateServices` with `{facilityId, facilityName, HRP:[{bridgeId, hipName, type:"HIP", active:true}]}` — `type: "HIP"`, not the email's `HEALTH_LOCKER`.
5. **Register each hospital's facility** in the Health Facility Registry, then enter its facility id in the Portal under **Hospital configuration → ABDM / ABHA**. NHA issues *one* credential pair to the application (us) and a *separate* facility id to each hospital, so the facility id is tenant data and never server configuration. Scan and Share needs it; the Aadhaar and identifier flows do not.
6. **OTP delivery in sandbox is whatever NHA does** — the Portal pre-fills the OTP field only when the response actually carries one (the mock always does) and otherwise leaves it empty for the operator to type from the patient's phone. Use an Aadhaar whose linked mobile you hold; the allowance is a few OTPs per number per day.

### Verifying the endpoint contract

`hms_backend/src/modules/abdm/abdm.constants.ts` holds **every** ABDM path, header name and scope string, deliberately in one file. It was reconciled on **25/08/2026** against the official *Milestone 1 Postman Collection-18-08-2025*, which corrected five things — the login-verify scope pair, the `T-token` header on `verify/user`, the separate PHR family for ABHA-address verification, the gateway-dictated Scan-and-Share path and payload, and the missing `on-share` acknowledgement (details in `BACKLOG.md`). Re-check that one file whenever NHA publishes a new collection; nothing else in the codebase hard-codes an ABDM path, so verification is a review of one file rather than of the module.

### Going to production

Production credentials are issued by NHA, not configured by us, and only after: functional testing by an NHA-empanelled agency → an internal NHA demo → WASA security certification ("Safe to Host", from a STQC or CERT-In empanelled auditor) → Health Tech Committee approval via the sandbox portal's Exit Form. Budget time and cost for it — it is an organizational process, not a development task. In code, moving to production is a change of `ABDM_GATEWAY_BASE_URL` / `ABDM_ABHA_BASE_URL` / `ABDM_CM_ID` and the credential pair.

## Adding a new application or package

1. Create the folder (an app at the repo root, or a library under `packages/`).
2. Give it a `package.json` with a `name` and the standard scripts (`dev`/`build`/`lint`/`typecheck`).
3. If it's a root-level app, add its folder name to the `workspaces` array in the root `package.json` (libraries under `packages/*` are picked up automatically).
4. Run `npm install` at the root. Turborepo picks up its `dev` task automatically — no change to `npm run dev` needed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `turbo: Could not resolve workspace … Missing packageManager field` | The root `package.json` must keep `"packageManager": "npm@…"`. |
| A port is already in use | Another process holds one of 3000-3004 or 4000. Stop it, or change that app's `dev` **and** `start` scripts together — and `.claude/launch.json`, `deploy/nginx/` and `resources/domains.md` with them. |
| Backend exits immediately at boot | Missing/invalid `hms_backend/.env` — copy `.env.example` and set `DATABASE_URL` + JWT secrets (≥16 chars). |
| `unable to determine transport target for "pino-pretty"` | `pino-pretty` missing — `npm install` at root (it is a backend devDependency). |
| Workspace package not found (`@hms/*`) | Run `npm run install:all` from the root so npm links the workspaces. |
| `npm audit` shows vulnerabilities | Review with `npm audit`; do **not** run `--force` blindly (breaking changes). Address in the security-hardening stage. |
| Stale build cache | `npx turbo run build --force`, or delete `.turbo/`. |

## Project layout

```
HMS/
├── hms_backend/     Express + Drizzle API        (:4000)
├── marketing/       Next.js marketing site       (:3000)
├── hms_frontend/    Next.js Nirogix Portal       (:3001)
├── patient/         Next.js patient portal       (:3002)
├── admin/           Next.js platform admin       (:3003)
├── aiportal/        Next.js AI Portal            (:3004)
├── packages/
│   ├── types/       @hms/types
│   ├── ui/          @hms/ui
│   ├── config/      @hms/config (shared tsconfig)
│   ├── utils/       @hms/utils
│   └── permissions/ @hms/permissions
├── resources/       Product/architecture/rules/plan docs
├── CLAUDE.md        Monorepo index & conventions
├── DECISIONS.md     Architecture Decision Records
├── package.json     npm workspaces + root scripts
├── turbo.json       Turborepo task pipeline
└── package-lock.json
```
