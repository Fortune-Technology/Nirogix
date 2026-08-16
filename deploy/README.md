# Nirogix — Deployment & Ops Runbook

Versioned operations baseline for the Nirogix platform (Phase 0 / Task #14). Even though the real
E2E Networks infrastructure is provisioned outside this repo, the plan requires the VM config,
Nginx, PM2, deploy pipeline, and backup/restore procedure to be **captured as versioned config
from the start** (resources/development-plan.md §16 IaC posture, §18 DevOps). This directory is
that baseline; substitute real hosts/secrets at deploy time.

> These files are templates + scripts. Nothing here contains secrets — connection details come
> from GitHub Environment secrets (CI) and root-only env files on the VM (never committed).

## Environments

Hosts are defined once, in **`resources/domains.md`** (ADR-042). Nothing here or in application
code hard-codes one — every URL comes from that environment's configuration.

| Env | Purpose | Hosts | Deploy trigger |
|---|---|---|---|
| **Local** | Development | `localhost` (api :4000, portal :3000, marketing :3001) | `npm run dev` |
| **Staging** | Milestone demos + tenant-isolation checks | `staging.nirogix.com` · `portal-staging.nirogix.com` · `api-staging.nirogix.com` — E2E VM, Nginx + PM2, managed PostgreSQL, Redis-on-VM, Cloudflare edge | auto on merge to `staging` (`.github/workflows/deploy-staging.yml`) |
| **Production** | Live | `nirogix.com` (+ `www` → 301) · `portal.nirogix.com` · `api.nirogix.com` — same shape as staging, separate VM + DB | controlled, reviewed promotion |

Staging carries its own database, object-storage bucket, secrets, and notification sender, sits
behind access control, and adds `X-Robots-Tag: noindex, nofollow` at Nginx. It never shares
state with production and is never indexable.

## Topology (single VM, per architecture)

- **Nginx** terminates the Cloudflare origin TLS and reverse-proxies to three PM2 apps
  (`deploy/nginx/nirogix.conf.template`): API→:4000, Portal→:3000, Marketing→:3001.
- **PM2** (dedicated non-root service user) runs `nirogix-backend`, `nirogix-portal`, `nirogix-marketing`
  (`deploy/pm2.ecosystem.cjs`).
- **PostgreSQL** = managed E2E DBaaS, provisioned **separately** from the app VM. The app
  connects as a **non-superuser** role (RLS `FORCE` is bypassed by superusers — see
  hms_backend RLS notes). **Redis** runs on the app VM for BullMQ. **Cloudflare** is the edge
  (CDN/WAF/DNS); the object store is Cloudflare R2.

## First-time VM provisioning (baseline checklist)

1. Create a dedicated service user (e.g. `hms`); never deploy as root.
2. Install Node ≥20, npm ≥10, PM2 (`npm i -g pm2`), Nginx, PostgreSQL client tools, `rclone`.
3. Clone the repo to `${STAGING_PATH}`; create per-app env files (`hms_backend/.env`,
   `hms_frontend/.env.local`, `marketing/.env.local`) from each `.env.example`.
4. `npm ci && npm run build`.
5. `npm run db:migrate -w hms_backend` (applies migrations + RLS + audit-immutability trigger).
6. `npm run db:seed -w hms_backend` (staging only — demo tenants; never in production).
7. `pm2 start deploy/pm2.ecosystem.cjs --env staging && pm2 save && pm2 startup`.
8. Install the Nginx site from `deploy/nginx/nirogix.conf.template` (substitute hosts + cert paths),
   `nginx -t && systemctl reload nginx`.
9. Point Cloudflare DNS at the VM; set SSL mode Full (Strict) with an origin cert. Verify
   Universal SSL covers each host — all of them are second-level, so `*.nirogix.com` does.
10. Work `resources/domains.md` §9 (cutover checklist): `CORS_ORIGINS` for the environment, the
    `www` → apex redirect in production, access control + `noindex` on staging, and the refresh
    cookie arriving `Secure; HttpOnly; SameSite=Lax` with **no** `Domain` attribute.

## Deploy flow (staging, automated)

Merge to `staging` runs `.github/workflows/deploy-staging.yml`:
build → SSH to the VM → `git reset --hard origin/staging` → `npm ci` → `npm run build` →
**`db:migrate` (migrations apply before rollout)** → `pm2 reload` (zero-downtime) → `pm2 save`.

Required GitHub **staging environment** secrets: `STAGING_HOST`, `STAGING_USER`,
`STAGING_SSH_KEY`, `STAGING_PATH`.

### Rollback

`git reset --hard <previous-good-sha>` on the VM → `npm ci && npm run build` → `pm2 reload`.
Migrations are additive/reversible; a data-affecting rollback needs an approved down-migration
plan (no destructive change without one — §16).

## Backups & DR

- **Managed PostgreSQL:** enable the provider's automated daily backups + PITR.
- **Application-owned dumps:** `deploy/backup/backup.sh` (cron nightly) takes a compressed
  `pg_dump`, verifies its table-of-contents, copies off-box to R2 (`rclone`), and prunes by
  retention.
- **Restore is drilled, not just configured** (§18, §23): `deploy/backup/restore-drill.sh`
  restores the latest dump into a throwaway scratch DB and sanity-checks row counts. Run it on a
  schedule and **record the measured RTO** below.

| Objective | Target | Validated |
|---|---|---|
| **RPO** (max data loss) | ≤ 24h (daily dump) / minutes (PITR) | _pending Stage 3 drill_ |
| **RTO** (time to restore) | _define + measure via restore-drill.sh_ | _pending Stage 3 drill_ |

> RPO/RTO are formally defined and validated in Stage 3 (Production-Readiness Hardening) before
> the first paying customer. This baseline makes the drill runnable today.

## Observability

- **Structured logging:** pino with PII/secret redaction (`hms_backend/src/config/logger.ts`);
  JSON in staging/production, pretty in dev. Each request carries a correlation id.
- **Error tracking:** `hms_backend/src/observability/errorTracker.ts` — a thin abstraction that
  logs `error.captured` events by default and accepts a Sentry/GlitchTip DSN (`SENTRY_DSN`)
  without call-site changes.
- **Health:** `GET /api/v1/health` (liveness) + `/api/v1/health/ready` (DB readiness) for
  uptime checks and PM2/Nginx.
- **Alerting** (Stage 3): error-rate, latency > 2s, queue backlog, failed jobs, backup failures.
