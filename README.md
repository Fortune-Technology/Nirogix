# Enterprise HMS — Monorepo

Multi-tenant Hospital Management System (SaaS) for **Takoriya Technology LLP**. This is an **npm workspaces + Turborepo** monorepo — everything is driven from the repository root.

> Product, architecture, rules, phases, and the engineering roadmap live in [`resources/`](resources/). Start with [`CLAUDE.md`](CLAUDE.md) (monorepo index) and [`resources/development-plan.md`](resources/development-plan.md) (execution roadmap). Architectural decisions are in [`DECISIONS.md`](DECISIONS.md).

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

# 2. Configure environment (see "Environment" below) — at minimum:
cp hms_backend/.env.example hms_backend/.env
# (optional) cp hms_frontend/.env.example hms_frontend/.env.local
# (optional) cp marketing/.env.example  marketing/.env.local

# 3. Start the whole platform (backend + portal + marketing) together
npm run dev
```

That's it — one install, one dev command. No need to `cd` into each app.

## Applications & ports

| Workspace | What it is | Dev URL | Port |
|---|---|---|---|
| `hms_backend` | Node.js + Express + TypeScript API (Drizzle/PostgreSQL) | http://localhost:4000/api/v1 | **4000** |
| `hms_frontend` | Next.js **HMS Portal** (all role dashboards) | http://localhost:3000 | **3000** |
| `marketing` | Next.js public marketing/SEO site | http://localhost:3001 | **3001** |

Shared libraries (not servers): `packages/types` (`@hms/types`), `packages/ui` (`@hms/ui`), `packages/config` (`@hms/config`), `packages/utils` (`@hms/utils`), `packages/permissions` (`@hms/permissions`).

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

Logs from `npm run dev` are prefixed per service (`hms_backend:dev:`, `hms_frontend:dev:`, `marketing:dev:`) so failures are attributable at a glance. Stop everything with **Ctrl+C**.

## Running a single application

```bash
npm run dev -w hms_backend      # backend only  (:4000)
npm run dev -w hms_frontend     # portal only   (:3000)
npm run dev -w marketing        # marketing only (:3001)
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

Secrets are **never committed**. Each app carries a `.env.example` documenting the variables it needs; copy it to the real (gitignored) file and fill in values.

| Workspace | Copy to | Key vars |
|---|---|---|
| `hms_backend` | `.env` | `PORT`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `LOG_LEVEL` |
| `hms_frontend` | `.env.local` | `NEXT_PUBLIC_API_BASE_URL` |
| `marketing` | `.env.local` | `NEXT_PUBLIC_PORTAL_LOGIN_URL` |

The backend validates its environment at boot (Zod) and exits with a clear message if a variable is missing or malformed. A local PostgreSQL is only required to hit DB-backed endpoints — the API boots and serves `/health` without one.

## Adding a new application or package

1. Create the folder (an app at the repo root, or a library under `packages/`).
2. Give it a `package.json` with a `name` and the standard scripts (`dev`/`build`/`lint`/`typecheck`).
3. If it's a root-level app, add its folder name to the `workspaces` array in the root `package.json` (libraries under `packages/*` are picked up automatically).
4. Run `npm install` at the root. Turborepo picks up its `dev` task automatically — no change to `npm run dev` needed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `turbo: Could not resolve workspace … Missing packageManager field` | The root `package.json` must keep `"packageManager": "npm@…"`. |
| A port is already in use | Another process holds 3000/3001/4000. Stop it, or change the port in that app's `dev` script / `PORT`. |
| Backend exits immediately at boot | Missing/invalid `hms_backend/.env` — copy `.env.example` and set `DATABASE_URL` + JWT secrets (≥16 chars). |
| `unable to determine transport target for "pino-pretty"` | `pino-pretty` missing — `npm install` at root (it is a backend devDependency). |
| Workspace package not found (`@hms/*`) | Run `npm run install:all` from the root so npm links the workspaces. |
| `npm audit` shows vulnerabilities | Review with `npm audit`; do **not** run `--force` blindly (breaking changes). Address in the security-hardening stage. |
| Stale build cache | `npx turbo run build --force`, or delete `.turbo/`. |

## Project layout

```
HMS/
├── hms_backend/     Express + Drizzle API        (:4000)
├── hms_frontend/    Next.js HMS Portal           (:3000)
├── marketing/       Next.js marketing site       (:3001)
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
