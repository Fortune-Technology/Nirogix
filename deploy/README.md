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

The application has exactly three environments — **development | staging | production** (ADR-071).

| Env             | Purpose                                   | Hosts                                                                                                                                                                                         | Deploy trigger                                                      |
| --------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Development** | A developer's local machine               | `localhost` (marketing :3000, portal :3001, patient :3002, admin :3003, aiportal :3004, api :4000)                                                                                            | `npm run dev`                                                       |
| **Staging**     | Milestone demos + tenant-isolation checks | `staging.nirogix.com` · `portal-staging.nirogix.com` · `api-staging.nirogix.com` — E2E VM, Nginx + PM2, managed PostgreSQL, Redis-on-VM, GoDaddy DNS, Let's Encrypt TLS, basic auth (ADR-045) | auto on merge to `staging` (`.github/workflows/deploy-staging.yml`) |
| **Production**  | Live                                      | `nirogix.com` (+ `www` → 301) · `portal.nirogix.com` · `api.nirogix.com` — same shape as staging, separate VM + DB                                                                            | controlled, reviewed promotion                                      |

Staging carries its own database, object-storage bucket, secrets, and notification sender, sits
behind access control, and adds `X-Robots-Tag: noindex, nofollow` at Nginx. It never shares
state with production and is never indexable.

## Topology (single VM, per architecture)

- **Nginx** terminates TLS on the origin (Let's Encrypt via certbot) and reverse-proxies to all six PM2
  apps (`deploy/nginx/nirogix.conf.template`): Marketing→:3000, Portal→:3001, Patient→:3002,
  Admin→:3003, AI Portal→:3004, API→:4000. One upstream and one 443 server block each.
  `patient` and `aiportal` completed the set on 28/08/2026 (`BACKLOG.md` F-5).
- **PM2** (dedicated non-root service user) runs `nirogix-backend`, `nirogix-portal`,
  `nirogix-marketing`, `nirogix-admin`, `nirogix-patient`, `nirogix-aiportal`
  (`deploy/ecosystem.config.cjs`).
- **PostgreSQL** = managed E2E DBaaS, provisioned **separately** from the app VM. The app
  connects as a **non-superuser** role (RLS `FORCE` is bypassed by superusers — see
  hms_backend RLS notes). **Redis** runs on the app VM for BullMQ. **DNS is GoDaddy** with no
  edge proxy, so the origin IP is public and the VM firewall is the only network boundary
  (ADR-045); the object store is still Cloudflare R2, reached over the API with signed URLs.

### File storage — one R2 bucket per environment (never shared)

Uploaded files (branding logos, letterheads, lab-report attachments) go to Cloudflare R2.
**Two buckets total: one shared by every non-production environment, one for production
alone** — principle 6 in `resources/domains.md`. The production boundary is the line that
matters: a non-prod test that deletes or overwrites a file must be structurally unable to
touch a production document.

The application has exactly three environments — **development | staging | production** (ADR-071).
`FILE_STORAGE_PROVIDER=local` below is the on-disk storage backend, not an environment.

| Environment                                      | `FILE_STORAGE_PROVIDER`             | `R2_BUCKET`                                               |
| ------------------------------------------------ | ----------------------------------- | --------------------------------------------------------- |
| **Development** (localhost; and the test runner) | `local` (disk) — or `r2` for parity | _(none on disk;_ `nirogix-documents-staging` _on r2)_     |
| **Staging**                                      | `r2`                                | **`nirogix-documents-staging`** (shared with development) |
| **Production**                                   | `r2`                                | **`nirogix-documents`** (its own)                         |

- Create **two** buckets in Cloudflare R2, both **private** (no public access — the API serves
  signed URLs), both pinned to an **Asia-Pacific** jurisdiction (India-resident PHI).
- Issue a **separate Object-Read-&-Write API token per bucket**. The shared non-prod token goes
  on the staging VM (and on any dev machine that opts into r2); the production token goes on the
  production host only. **The production bucket name and token appear in no `.env` outside the
  production host.**
- The API **refuses to boot** in two cases (both in `hms_backend/src/config/env.ts`): (a) any of
  `R2_ENDPOINT` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` blank while
  `FILE_STORAGE_PROVIDER=r2`; and (b) an **environment↔bucket mismatch** — a production process
  pointed at a `-staging` bucket, or a non-prod process pointed at the production bucket. A
  mis-pasted `.env` fails at startup, never silently at the first upload.
- Objects are keyed `<tenantId>/<category>/<uuid>-<filename>` (categories: `branding`,
  `platform-branding`, `letterhead`, `lab-reports`, `documents`), so each bucket is browsable per
  hospital and per file type; apply R2 lifecycle rules per `<category>` folder if retention
  policy demands it. Invoices and clinical reports are generated print routes, not stored objects.
- **Images are optimized before storage** (`hms_backend/src/modules/file/imageOptimize.ts`, via
  `sharp`): re-encoded to WebP q90 (near-lossless), capped at 2500px, EXIF/metadata stripped
  (also removes GPS from patient photos), stepped down only as far as needed to stay ≤ ~1 MB.
  PDFs / SVGs / GIFs pass through untouched. `sharp` is a **native module** — `npm ci` on the
  Linux VM fetches the correct prebuilt binary automatically; nothing extra to install. If a
  build ever lands on a libc the prebuilt does not cover, `npm rebuild sharp` resolves it.
- `FILE_MAX_SIZE_MB` is the **raw** upload ceiling (before optimization) — keep it generous
  (~10) so a phone photo is accepted and then shrunk; it is the real limit only for non-image
  files (a multi-page scanned lab report needs more than 1 MB).
- Local files under `./storage` do not migrate themselves — use the `migrate-files-to-r2`
  script at cutover. A fresh box has nothing to migrate.

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
  user's profile) before `pm2 start`. `deploy/ecosystem.config.cjs` reads them and passes `PORT` to
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

## Provisioning a fresh E2E account

> **Building a new environment from nothing? Start at [`e2e-provisioning.md`](./e2e-provisioning.md).**
> It covers the E2E-specific decisions this checklist assumes are already made — region, node size
> (with the build-memory arithmetic behind it), reserved IP, firewall, DBaaS-versus-VM PostgreSQL —
> and its **Step 0 proves ABDM is reachable from the region before anything is built on it**. The
> previous host was never tested that way, which is how an unusable environment survived for weeks
> (`BACKLOG.md` I-6).
>
> The checklist below remains the reference for the steps once a node exists.

## First-time VM provisioning (baseline checklist)

> Step 0 is the port audit above. Nothing binds before it.
>
> **Step 0b — swap space (REQUIRED, once, as root).** The shared VM runs with **zero swap**, so a
> memory spike during `npm run build` has nowhere to go — the kernel OOM-killer takes down
> processes and can hang the entire box, taking the other projects with it (this is exactly what
> happened on 2026-08-18 — see [§ Incidents](#incidents)). A swap file lets a spike degrade to disk
> instead of getting killed. Do this **before** the first build:
>
> ```bash
> fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
> echo '/swapfile none swap sw 0 0' >> /etc/fstab   # survive reboot
> free -h                                            # confirm Swap: total ≈ 4.0Gi
> ```
>
> Swap is a safety net, **not** a substitute for bounded build concurrency — keep both.

1. **Run the shared-VM port audit above**; export the six `NIROGIX_PORT_*` variables with the
   free ports it found.
2. Create a dedicated service user (e.g. `hms`); never deploy as root. On this VM the other
   projects deploy as `github-runner` — a separate user keeps our PM2 list, env and `pm2 save`
   snapshot isolated from theirs.
3. Install (or reuse — check versions first, the box already runs Node projects) Node ≥20,
   npm ≥10, PM2 (`npm i -g pm2`), Nginx, PostgreSQL client tools, `rclone`.
4. Clone the repo to `${STAGING_PATH}` (on the E2E staging node this is
   `/var/www/projects/nirogix` — a sibling of any other project under `/var/www/projects`, never
   inside one); create one `.env` per app by copying that app's `.env.example`
   (`hms_backend`, `hms_frontend`, `marketing`, `admin`, `patient`, `aiportal` — the last three
   deploy with `BACKLOG.md` F-5, but ship an `.env.example` now). Every key is already present and
   uncommented, so only values change; leave a key blank to keep its feature unconfigured. The
   frontends' `NEXT_PUBLIC_*` origins use the staging hosts from `resources/domains.md`, never ports.
5. `npm ci && npm run build`.
6. `npm run db:migrate -w hms_backend` (applies migrations + RLS + audit-immutability trigger).
7. `npm run db:seed:staging -w hms_backend` (staging only — the deterministic QA dataset; the
   development and production seeders refuse to run here by design, ADR-058). **Every later deploy
   runs this for you** (ADR-122), so this step is only the first bring-up. Re-running it is safe:
   it creates what is missing, never replays the clinical history, and never overwrites a record
   somebody edited on the staging site. To rebuild staging from
   empty — which destroys whatever QA is part-way through, so tell them first —
   `CONFIRM_SEED_RESET=yes npm run db:seed:staging -w hms_backend -- --reset` (ADR-114). What the
   dataset covers is in `docs/seed-data.md`.
8. `pm2 start deploy/ecosystem.config.cjs --env staging && pm2 save && pm2 startup` **as the
   Nirogix service user** (so `pm2 save` snapshots only our apps), then
   `ss -tulpn | grep -E "<the six ports>"` to confirm each app bound where expected.
9. Install the Nginx site from `deploy/nginx/nirogix.conf.template` (substitute hosts + cert paths),
   `nginx -t && systemctl reload nginx`.
10. Point the GoDaddy `A` records at the VM, then issue certificates on the box:
    `certbot --nginx -d staging.nirogix.com -d portal-staging.nirogix.com -d api-staging.nirogix.com`
    (HTTP-01 needs port 80 open). Add basic auth + `X-Robots-Tag: noindex` on the staging
    hosts, and set `NEXT_PUBLIC_ENVIRONMENT=staging` so the marketing app serves
    `Disallow: /`. Verify
    Universal SSL covers each host — all of them are second-level, so `*.nirogix.com` does.
11. Work `resources/domains.md` §9 (cutover checklist): `CORS_ORIGINS` for the environment, the
    `www` → apex redirect in production, access control + `noindex` on staging, and the refresh
    cookie arriving `Secure; HttpOnly; SameSite=Lax` with **no** `Domain` attribute.

## Deploy flow (staging, automated) — affected-only (ADR-076)

Merge to `staging` runs `.github/workflows/deploy-staging.yml`. The **runner** still does a full
`npm ci && npm run build` — that is the compile gate keeping a broken commit off the VM, and the
runner has the memory the VM does not. The **VM** then deploys affected-only:

1. **Baseline.** The VM reads `${STAGING_PATH}/.last-deploy-sha` — untracked, written only after
   a fully successful deploy — as "what is live right now"; first run falls back to the
   checked-out HEAD read before `git reset`. An unusable baseline (commit vanished — force-push
   or gc) or a **same-commit redeploy** (`workflow_dispatch` recovery) falls back to a full build
   - full reload.
2. **Build.** `npx turbo run build --filter=...[<baseline>] --concurrency=2` — only workspaces
   changed since the baseline **plus everything that depends on them** (a `packages/types` edit
   rebuilds `hms_backend` and every portal importing it; a docs-only push builds nothing).
   `--concurrency=2` stays load-bearing on the shared VM (§ Incidents) — affected-only shrinks
   the work, it does not replace the cap.
3. **Migrate, then seed.** `db:migrate -w hms_backend` runs only when `hms_backend` is in the
   affected set (or in full mode). Migrations stay additive/idempotent — the skip is honesty about
   what the deploy did, not a safety requirement. `db:seed:staging` runs immediately after, under
   the same condition (ADR-122): seed definitions live in `hms_backend`, so a dataset change always
   puts it in the affected set. The seeder **creates what is missing and updates nothing** — a
   record a tester edited on the staging site keeps the tester's values, a table added this week
   gets its rows, and a record added to the dataset this week reaches a database seeded months ago.
   Before it runs, the script asserts `NODE_ENV=staging` in the VM's `hms_backend/.env` and aborts
   the deploy if it is anything else; `--reset` is never passed from CI.
4. **Reload.** Only the PM2 apps whose workspace was rebuilt:
   `pm2 reload deploy/ecosystem.config.cjs --only <names> --env staging`, then `pm2 save`.
   The candidate names are intersected with the apps actually defined in
   `ecosystem.config.cjs` — all six since BACKLOG F-5 (28/08/2026), and the workflow needed no
   edit to pick the last two up. Before any PM2 command the script sources
   **`/etc/nirogix/ports.env`** (`set -a`) — this file is **required on the VM**:
   a non-interactive SSH shell reads no `.bashrc`, and without `NIROGIX_PORT_*` PM2 would
   re-parse the ecosystem onto default ports on a shared box (EADDRINUSE crash-loop). The deploy
   aborts before touching PM2 if the file is missing.
5. **Marker.** `.last-deploy-sha` advances to the new commit **only after** build + migrate +
   reload all succeeded — a failed deploy keeps the old baseline, so the next run diffs against
   what is genuinely live.

Required GitHub **staging environment** secrets: `STAGING_HOST`, `STAGING_USER`,
`STAGING_SSH_KEY`, `STAGING_PATH`.

### Bringing a NEW workspace online — affected-only will not do it for you

Affected-only (step 2) diffs the _files_ changed since the last deployed commit. A change that
only **enables** a workspace — uncommenting its `ecosystem.config.cjs` entry, adding its Nginx
block — touches none of that workspace's own files, so Turbo reports it as unaffected, builds
nothing, and the deploy prints `No deployed app affected — PM2 untouched`. The new app never
starts. Its `.next` output does not exist on the VM at all, so there is nothing for `next start`
to serve even if PM2 tried.

So the first deploy of a workspace is **always** a manual `workflow_dispatch` run on the branch,
which is a same-commit redeploy and therefore takes the full-build path (`MODE=full`) and reloads
everything. `pm2 reload` on a name PM2 has never seen starts it, so no `pm2 start` is needed —
but check `pm2 ls` rather than assuming, and check the port is genuinely free first: a leftover
hand-started process on the same port turns this into an `EADDRINUSE` crash-loop.

Order matters, because each step depends on the one before it:

1. **Per-app `.env` on the VM first.** `NEXT_PUBLIC_*` is inlined at **build** time, so an env
   file written after the build produces a bundle still pointing at `localhost`. Nothing here is
   committed — see each app's `.env.example`.
2. **Full deploy** (`workflow_dispatch`) — builds the new workspace and starts its PM2 app.
   Confirm the listener exists before touching Nginx, or the proxy has nothing to reach.
3. **Nginx** — install the updated template, `nginx -t`, reload. Proxying to a dead port is a
   502; proxying to a port that was never built is a 502 that looks like an app bug.
4. **Certificate** — `certbot --nginx --expand` with the full host list. This must come _after_
   step 3, because HTTP-01 reaches the challenge through the port-80 block, which only answers
   for a hostname once that hostname is in its `server_name`.
5. **Backend `CORS_ORIGINS`** — add the new origin to the API's `.env` on the VM and restart the
   backend. It is an explicit allowlist with no wildcard (ADR-036), so a new frontend whose
   origin is missing loads fine and then fails every XHR, which reads as an auth bug rather than
   a configuration one. The full per-environment list is in `resources/domains.md` §8.

Until step 4 lands, the new host answers on 443 with a certificate that does not name it, and
every client fails the hostname check outright rather than degrading — `SEC_E_WRONG_PRINCIPAL`
in curl, `ERR_CERT_COMMON_NAME_INVALID` in a browser.

### Rollback

`git reset --hard <previous-good-sha>` on the VM → `npm ci && npm run build` → `pm2 reload` →
**`echo <previous-good-sha> > .last-deploy-sha`** — the marker must follow a manual rollback, or
the next automated deploy diffs against the rolled-back-FROM commit and can skip rebuilding the
very workspaces the rollback reverted. (Deleting the file also works: the next deploy then treats
the checked-out HEAD as the baseline.) Migrations are additive/reversible; a data-affecting
rollback needs an approved down-migration plan (no destructive change without one — §16).

## Incidents

A dated log of staging/production incidents and their fixes, so the next person deploying does not
rediscover them the hard way. Newest first.

### 2026-08-19 — Admin console dead on every route: ChunkLoadError from a hand-started process

**Impact.** `admin-staging` served its dashboard but every other route showed Next's "This page
couldn't load" screen. Console: `ChunkLoadError: Failed to load chunk /_next/static/chunks/….js`
(the chunk requests 404). Login and the API were fine.

**Cause.** The admin app had been started **by hand** on the VM, outside
`deploy/ecosystem.config.cjs` (its entry was still commented out, BACKLOG F-5). The next full
deploy rebuilt `admin/.next` on disk but `pm2 reload --only <ecosystem apps>` could not know
about the hand-run process — so it kept serving the **old** build's prerendered HTML, whose
chunk files the new build had deleted. Stale HTML → 404 chunks → ChunkLoadError everywhere.

**Fix.** `nirogix-admin` is now a real ecosystem entry, so deploys build **and reload** it
together. One-time VM recovery, in this order (the hand-run process holds the port):
`pm2 ls` → `pm2 delete <the hand-run admin process>` → `set -a; . /etc/nirogix/ports.env; set +a`
→ `pm2 start deploy/ecosystem.config.cjs --only nirogix-admin --env staging` → verify with
`ss -tulpn` / `curl` → `pm2 save`.

**Rule.** Never hand-start an app the deploy pipeline does not manage. If a surface goes live,
its ecosystem entry goes live in the same change — a process PM2's ecosystem does not know about
is a process the deploy will silently break on the next build.

### 2026-08-19 — Deploy died at the PM2 step: `pm2: command not found` (exit 127)

**Impact.** The affected-only deploy ran git reset, `npm ci` and the Turbo build successfully, then
failed at the first `pm2` call — apps kept running the previous release (no outage), but the deploy
never completed and `.last-deploy-sha` correctly did not advance.

**Cause.** `appleboy/ssh-action` runs a **non-interactive** shell that sources no
`.bashrc`/`.profile`, so NVM's PATH additions never apply. `pm2` lives only under
`~/.nvm/versions/node/<version>/bin`; `npm` happened to resolve anyway, which is why everything
before the PM2 step worked.

**Fix (in `deploy-staging.yml`).** The SSH script now, immediately after `set -euo pipefail`,
prepends the **newest** installed NVM Node's `bin` to PATH — `find "$HOME/.nvm/versions/node"
-maxdepth 1 -type d | sort -V | tail -1` (`sort -V` is load-bearing: plain sort would rank
`v20.9.0` above `v20.11.1`) — so node/npm/pm2 all come from the same install, and then **fails
loudly up front** (`command -v pm2`) if pm2 is still unresolvable, instead of dying mid-deploy
after the build. Same lesson as `/etc/nirogix/ports.env`: a non-interactive SSH shell inherits
NOTHING from login dotfiles — every environment dependency must be set explicitly in the script.

**Second finding (same day) — a failed run poisons the HEAD fallback.** The original affected-only
logic fell back to the checked-out HEAD as the diff baseline when `.last-deploy-sha` did not exist
yet. But a failed run has **already `git reset` HEAD** to its commit before dying — HEAD moves even
when the deploy does not. Concretely: run #5 (the Portal quick-login change) reset to its commit,
built, then died at `pm2: command not found` — nothing reloaded. Run #6 (workflow fixes only) found
no marker, took HEAD (= run #5's commit) as baseline, saw only workflow-file changes, **skipped the
build and reload entirely**, succeeded, and advanced the marker — leaving run #5's bundle stale on
staging with every subsequent diff now blind to it. Fix: **no marker → full build**, never a HEAD
fallback; HEAD proves what is checked out, not what is live. Recovery from this state is a
`workflow_dispatch` re-run — same-commit redeploys are deliberately full build + full reload.

### 2026-08-18 — Staging VM OOM-killed by an unbounded parallel build

**Impact.** The entire staging VM went offline until a manual restart. The box is **shared** — it
also hosts five unrelated live projects (`/var/www`: `CSV_Filter_Project`, `Storv_POS_All`,
`The-Fortune-Tech`, `rapidrunner`, plus the default `html` site) — so the outage hit those too, not
just Nirogix.

**Cause.** The deploy step ran a bare `npm run build`, which let Turborepo build all six workspaces'
Next.js/Turbopack bundles **plus** the backend `tsc` concurrently. Peak memory exceeded available
RAM — and the VM had **zero swap**, so there was no cushion — and the kernel OOM-killer took the
machine down (kernel log showed a `next-build` process at ~780 MB RSS at the time of the kill).

**Fixes (all landed in this change):**

1. **Bounded build concurrency.** The `deploy-staging.yml` SSH step runs
   `npm run build -- --concurrency=2` — same total work, at most two workspaces building at once.
   Do not revert it to a bare `npm run build` on the VM.
2. **Swap is now a required provisioning step** (§ First-time VM provisioning, Step 0b) — a 4 GB
   swap file lets a spike degrade to disk instead of triggering the OOM-killer.
3. **`tsc` output path fixed at the source** — `hms_backend/tsconfig.json` gained `rootDir: "src"`,
   so the entry emits at `dist/server.js` (what `ecosystem.config.cjs` runs), not `dist/src/server.js`.
4. **PM2 config renamed** `pm2.ecosystem.cjs` → `ecosystem.config.cjs`, so PM2 actually parses the
   `apps` array instead of silently running it as one inert script.

Items 3 and 4 were live on the VM only as **symlinks** during the recovery; this change makes both
real in source so a fresh clone is correct without hand-patching.

**Operating rules that came out of the night** (do these, every deploy — the box is shared):

- **Never** run a bare `npm run build` by hand on the VM. Scope it: `npx turbo run build --filter=<app>`,
  one app at a time, checking `free -h` between each.
- **Verify, don't trust "launched".** A PM2 "launched"/"started" line is not proof a port bound.
  Confirm with `ss -tulpn` (real bound ports) or `curl` (real HTTP response) before moving on.
- **Set critical env vars inline** on the command that uses them (`VAR=value command`), not via a
  separate `export`/`source` in an earlier shell — a stale `source` caused a multi-hour ports mixup.
- **`pm2 save` only after verifying**, never right after `pm2 start` — saving early overwrote a good
  snapshot with a broken one.
- **Switch users cleanly.** Run `su - <user>` on its own line and confirm the prompt changed before
  the next command; do not chain commands across the `su -` in a single paste.

## Backups & DR

- **Managed PostgreSQL:** enable the provider's automated daily backups + PITR.
- **Application-owned dumps:** `deploy/backup/backup.sh` (cron nightly) takes a compressed
  `pg_dump`, verifies its table-of-contents, copies off-box to R2 (`rclone`), and prunes by
  retention.
- **Restore is drilled, not just configured** (§18, §23): `deploy/backup/restore-drill.sh`
  restores the latest dump into a throwaway scratch DB and sanity-checks row counts. Run it on a
  schedule and **record the measured RTO** below.

| Objective                 | Target                                  | Validated               |
| ------------------------- | --------------------------------------- | ----------------------- |
| **RPO** (max data loss)   | ≤ 24h (daily dump) / minutes (PITR)     | _pending Stage 3 drill_ |
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
