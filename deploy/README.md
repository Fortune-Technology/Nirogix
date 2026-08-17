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
| **Local** | Development | `localhost` (marketing :3000, portal :3001, patient :3002, admin :3003, aiportal :3004, api :4000) | `npm run dev` |
| **Staging** | Milestone demos + tenant-isolation checks | `staging.nirogix.com` · `portal-staging.nirogix.com` · `api-staging.nirogix.com` — E2E VM, Nginx + PM2, managed PostgreSQL, Redis-on-VM, GoDaddy DNS, Let's Encrypt TLS, basic auth (ADR-045) | auto on merge to `staging` (`.github/workflows/deploy-staging.yml`) |
| **Production** | Live | `nirogix.com` (+ `www` → 301) · `portal.nirogix.com` · `api.nirogix.com` — same shape as staging, separate VM + DB | controlled, reviewed promotion |

Staging carries its own database, object-storage bucket, secrets, and notification sender, sits
behind access control, and adds `X-Robots-Tag: noindex, nofollow` at Nginx. It never shares
state with production and is never indexable.

## Topology (single VM, per architecture)

- **Nginx** terminates TLS on the origin (Let's Encrypt via certbot) and reverse-proxies to three PM2 apps
  (`deploy/nginx/nirogix.conf.template`): Marketing→:3000, Portal→:3001, API→:4000. The
  `patient`, `admin` and `aiportal` apps are not deployed yet (`BACKLOG.md` F-5); their ports
  are reserved and their upstreams land in the same file when they are.
- **PM2** (dedicated non-root service user) runs `nirogix-backend`, `nirogix-portal`, `nirogix-marketing`
  (`deploy/pm2.ecosystem.cjs`).
- **PostgreSQL** = managed E2E DBaaS, provisioned **separately** from the app VM. The app
  connects as a **non-superuser** role (RLS `FORCE` is bypassed by superusers — see
  hms_backend RLS notes). **Redis** runs on the app VM for BullMQ. **DNS is GoDaddy** with no
  edge proxy, so the origin IP is public and the VM firewall is the only network boundary
  (ADR-045); the object store is still Cloudflare R2, reached over the API with signed URLs.

## Shared VM: audit ports first (MANDATORY pre-flight)

The staging VM is **not ours alone** — `/var/www` already hosts other deployments
(`CSV_Filter_Project`, `Storv_POS_All`, `The-Fortune-Tech`, `rapidrunner`, plus the default
`html` site), each with its own Node processes, PM2 lists and Nginx server blocks. **Never bind
a Nirogix port, PM2 name or Nginx server block without auditing what is already taken.** A
collision does not fail loudly — PM2 happily starts a Next app that then crash-loops on
`EADDRINUSE`, and a duplicate Nginx `server_name` silently steals another project's traffic.

**1 · What is listening right now (the authoritative check):**

```bash
ss -tulpn | grep LISTEN            # every bound port + owning process
```

**2 · What PM2 already manages** — PM2 lists are **per user**, so check every deploy user, not
just your own:

```bash
pm2 ls                             # the current user's apps
sudo -u github-runner pm2 ls       # the user owning the other /var/www projects
ls /home/*/.pm2 /root/.pm2 2>/dev/null   # any other users with a PM2 daemon
```

**3 · What Nginx already routes** (ports 80/443 are shared — our conflict surface there is
`server_name`, not the port):

```bash
grep -rE "listen|server_name|proxy_pass" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null
```

**4 · Anything under systemd outside PM2:**

```bash
systemctl list-units --type=service --state=running | grep -iE "node|next|pm2"
```

**Then, and only then, assign ports:**

- Record the taken ports, pick six free ones for Nirogix (defaults `4000` API +
  `3000–3004` frontends — **`3000` is the single most commonly squatted Node port, expect to
  move**). Prefer claiming one clean contiguous block (e.g. `4100–4105`) over scattering.
- Set them in **one place**: export `NIROGIX_PORT_API`, `NIROGIX_PORT_MARKETING`,
  `NIROGIX_PORT_PORTAL`, `NIROGIX_PORT_PATIENT`, `NIROGIX_PORT_ADMIN`, `NIROGIX_PORT_AIPORTAL`
  in the service user's environment (e.g. a root-only `/etc/nirogix/ports.env` sourced from the
  user's profile) before `pm2 start`. `deploy/pm2.ecosystem.cjs` reads them and passes `PORT` to
  each app; no `start` script and no source file carries a port any more.
- The Nginx `proxy_pass` upstream ports in the site file **must be the same values** — substitute
  them when installing `deploy/nginx/nirogix.conf.template`, and re-run `ss -tulpn` after
  `pm2 start` to confirm each app landed where the site file points.
- Nginx rules on a shared box: our server blocks add **new `server_name`s only**
  (`*.nirogix.com` hosts) — never edit another project's block, never claim
  `default_server`, and always finish with `nginx -t` before `systemctl reload nginx`.
- PM2 rules on a shared box: all our processes are prefixed `nirogix-` (already in the
  ecosystem file); never `pm2 delete all`, `pm2 kill`, `pm2 save` from a user owning other
  projects' processes without listing first — `pm2 save` snapshots **everything** that user runs.
- Update the port matrix in `resources/domains.md` (§ per-environment variables) with the ports
  actually claimed, so the next deploy reads them instead of re-deriving them.

## First-time VM provisioning (baseline checklist)

> Step 0 is the port audit above. Nothing binds before it.

1. **Run the shared-VM port audit above**; export the six `NIROGIX_PORT_*` variables with the
   free ports it found.
2. Create a dedicated service user (e.g. `hms`); never deploy as root. On this VM the other
   projects deploy as `github-runner` — a separate user keeps our PM2 list, env and `pm2 save`
   snapshot isolated from theirs.
3. Install (or reuse — check versions first, the box already runs Node projects) Node ≥20,
   npm ≥10, PM2 (`npm i -g pm2`), Nginx, PostgreSQL client tools, `rclone`.
4. Clone the repo to `${STAGING_PATH}` (e.g. `/var/www/nirogix` — sibling of the existing
   projects, never inside one); create per-app env files (`hms_backend/.env`,
   `hms_frontend/.env.local`, `marketing/.env.local`) from each `.env.example`. The frontends'
   `NEXT_PUBLIC_*` origins use the staging hosts from `resources/domains.md`, never ports.
5. `npm ci && npm run build`.
6. `npm run db:migrate -w hms_backend` (applies migrations + RLS + audit-immutability trigger).
7. `npm run db:seed:staging -w hms_backend` (staging only — deterministic QA dataset; the
   development and production seeders refuse to run here by design, ADR-058).
8. `pm2 start deploy/pm2.ecosystem.cjs --env staging && pm2 save && pm2 startup` **as the
   Nirogix service user** (so `pm2 save` snapshots only our apps), then
   `ss -tulpn | grep -E "<the six ports>"` to confirm each app bound where expected.
8. Install the Nginx site from `deploy/nginx/nirogix.conf.template` (substitute hosts + cert paths),
   `nginx -t && systemctl reload nginx`.
9. Point the GoDaddy `A` records at the VM, then issue certificates on the box:
   `certbot --nginx -d staging.nirogix.com -d portal-staging.nirogix.com -d api-staging.nirogix.com`
   (HTTP-01 needs port 80 open). Add basic auth + `X-Robots-Tag: noindex` on the staging
   hosts, and set `NEXT_PUBLIC_ENVIRONMENT=staging` so the marketing app serves
   `Disallow: /`. Verify
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
