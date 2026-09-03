# Staging on E2E Networks — a complete build from a fresh account

Companion to [`README.md`](./README.md), which stays the general runbook. This document is the
**literal, ordered build of a clean E2E node into a working staging environment**: SSH in, install,
clone, configure, build, point DNS, terminate TLS, wire CI/CD, verify.

It exists because the previous host (IONOS, United States) was unusable for two independent
reasons — ABDM's CDN refuses non-Indian IPs outright, and `ADR-006` requires India-resident
infrastructure for PHI regardless of that. See `BACKLOG.md` **I-6**.

A clean account is an opportunity, not just a chore: it removes the compromises the old shared box
forced — non-standard ports, no access control, six unrelated projects competing for memory. Do not
carry them over.

**Follow the steps in order.** Several depend on an earlier one having happened — notably Step 6
(environment files) before Step 8 (build), because Next.js bakes `NEXT_PUBLIC_*` into the client
bundle at build time and cannot pick it up afterwards.

---

## Where this stands (28/08/2026)

The node exists: **`e2e-131-182`**, India region, with the service user **`deploy`** and
**`/var/www/projects`** already created and owned by it. So Step 1 is done, and the names throughout
this document are the real ones — `deploy`, not `hms`; `/var/www/projects/nirogix`, not
`/var/www/nirogix`.

`projects` is plural on purpose. Treat the box as capable of hosting more than Nirogix and keep
everything of ours in one subdirectory beneath it, which is also why `/etc/nirogix/ports.env` in
Step 3 is not optional.

**Step 0 has not been answered yet, and everything else is downstream of it.** Run it first.

Record the node's public address once and reuse it — DNS, TLS, the GitHub secret and the ABDM bridge
URL all point at it:

```bash
curl -sS https://api.ipify.org; echo
```

Substitute that value wherever this document writes `<E2E_IP>`.

---

## Step 0 — Prove the premise before building on it (REQUIRED)

**The entire move assumes an Indian IP can reach ABDM. Verify that from the node itself.**

A success from a developer's machine does not count and never has: every ABDM call that has ever
worked in this project ran from a home connection in India, which is exactly why the US host's
failure went unnoticed for weeks. The question is what _this box_ can reach.

Create the node (Step 1), SSH in, and before installing anything:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://dev.abdm.gov.in
```

**Read the status code AND the `x-amz-cf-pop` header**, because they answer two different
questions. The PoP says whether CloudFront treats this host as Indian; the status says whether NHA
answered. Only one combination is the failure this whole migration exists to fix.

```bash
curl -sSI https://dev.abdm.gov.in | grep -Ei 'HTTP/|x-amz-cf-pop|x-cache'
```

| Result                                                                           | Meaning                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400` / `401` / `200`                                                            | The request reached NHA. Premise holds — continue to Step 2.                                                                                                                                                                                                                                                                                                     |
| **`403`** with body `Request blocked`                                            | **The failure this migration is about.** A WAF refused the request before any ABDM logic ran. If the PoP is Indian this is per-ASN rather than geographic: raise it with NHA integration support quoting the client id and this IP, and develop against a tunnel meanwhile. **Keep the node** — `ADR-006` requires India-resident hosting independently of ABDM. |
| **`503`** with `x-cache: Error from cloudfront`                                  | **Not a block.** CloudFront accepted the request and the origin did not answer — almost always NHA's sandbox being down, which it periodically is. Confirm before concluding anything: run the same request from a machine known to reach ABDM at the same moment. Both `503` means NHA; only this host `503` means look here.                                   |
| Any status from an Indian PoP (`MAA`, `BOM`, `DEL`, `HYD`, `CCU`, `MAA50-P2`, …) | The edge is treating this host as Indian, which is the thing the IONOS box could never do. Whatever else is wrong, it is not the geographic block.                                                                                                                                                                                                               |

A bare `GET /` is a coarse probe — it exercises no API. Once the edge looks healthy, the real test
is a session call with credentials (Step 12, `npm run abdm:check`), because that is the only thing
that proves the whole path works.

Five minutes to avoid rebuilding an entire environment on a false assumption.

---

## Step 1 — Create the node _(done — kept as the record of what was chosen)_

| Setting            | Value                                | Why                                                                            |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------ |
| **Region**         | **Chennai** (any India region)       | The whole point — `ADR-005`, `ADR-006`                                         |
| **Plan**           | C3 — 4 vCPU / 8 GB / 100 GB          | Sizing below                                                                   |
| **Image**          | Ubuntu 24.04 LTS                     |                                                                                |
| **Billing**        | On-Demand                            | No commitment before the premise is proven                                     |
| **VPC**            | ON                                   | Cannot be added later without a rebuild; the DBaaS and any second node join it |
| **Reserved IPv4**  | ON                                   | DNS, TLS and the ABDM bridge URL all resolve here                              |
| **Backup**         | OFF for staging                      | Synthetic data, reproducible from the seeder                                   |
| **Security Group** | New — **22, 80, 443 only**           | Postgres and Redis stay on localhost                                           |
| **SSH key**        | At creation; password login disabled |                                                                                |

### Sizing, and why 8 GB rather than 4

Two numbers matter, and the second is the one that bites.

**Runtime is small.** Measured from a live deployment: backend ≈ 22 MB, each Next.js app ≈ 57 MB.
Four apps ≈ 250 MB; with Nginx, Redis, PostgreSQL and the OS, roughly **1 GB**.

**Deploys spike.** The VM builds affected workspaces on every deploy, and the 2026-08-18 incident
logged `next-build` at **780 MB RSS**. At `--concurrency=2` that is ~1.6 GB on top of runtime, so
peak is **2.6–3 GB**. 4 GB plus swap survives; there is already one OOM outage on record, and the
credit difference does not justify repeating it.

### The SSH key

Generate one dedicated to this account rather than reusing an old one:

```bash
ssh-keygen -t ed25519 -C "nirogix-e2e-staging" -f ~/.ssh/nirogix_e2e
```

Paste `~/.ssh/nirogix_e2e.pub` into E2E's SSH-key field at creation. The **private** key
(`~/.ssh/nirogix_e2e`) later becomes the `STAGING_SSH_KEY` GitHub secret — its whole contents,
`BEGIN`/`END` lines included.

First login, from your own machine:

```bash
ssh -i ~/.ssh/nirogix_e2e ubuntu@<E2E_IP>
```

---

## Step 2 — Baseline the box

Everything here runs as the default `ubuntu` user, with `sudo`.

**Swap first — before any build can OOM the box.**

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab && free -h
```

Harden SSH — the key is already installed, so this only closes the password path:

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/;s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && sudo systemctl reload ssh
```

Packages. Note **`postgresql`** — the server, not just the client — because staging runs its own
database (Step 4):

```bash
sudo apt-get update && sudo apt-get install -y nginx postgresql redis-server certbot python3-certbot-nginx default-jre unzip git apache2-utils
```

```bash
sudo systemctl enable --now redis-server postgresql && redis-cli ping
```

Node 20 and PM2, installed **system-wide via NodeSource, never NVM**. A non-interactive SSH shell
sources no `.bashrc`, so an NVM install leaves `pm2` outside the deploy's `PATH` — that is what
killed the 2026-08-19 run with `pm2: command not found`, after the build had already succeeded.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs && sudo npm i -g pm2 && node -v && npm -v && pm2 -v
```

**Fidelius** — ABDM record encryption. A JRE alone is not enough:

```bash
curl -L -o /tmp/fidelius.zip https://github.com/mgrmtech/fidelius-cli/releases/download/1.2.0/fidelius-cli-1.2.0.zip && sudo unzip -q /tmp/fidelius.zip -d /opt/ && sudo chmod +x /opt/fidelius-cli-1.2.0/bin/fidelius-cli
```

```bash
/opt/fidelius-cli-1.2.0/bin/fidelius-cli gkm
```

That last command is worth pausing on: it is the only local proof that ABDM record encryption works
at all. It must print `privateKey` / `publicKey` / `nonce`. If it does not, M2 and M3 cannot
function on this host.

`FIDELIUS_CLI_PATH` points at the **launcher script**, never at a jar — the release is a script plus
a `lib/` directory, so `java -jar` cannot work.

---

## Step 3 — Ports file

A dedicated node needs no port overrides: the defaults in `deploy/ecosystem.config.cjs` — API
`4000`, marketing `3000`, portal `3001`, patient `3002`, admin `3003`, aiportal `3004` — are correct
when nothing competes for them.

**But `.github/workflows/deploy-staging.yml` aborts the deploy if `/etc/nirogix/ports.env` is
missing**, deliberately: on the old shared box a missing file meant PM2 fell back to defaults and
crash-looped on `EADDRINUSE`. The guard cannot tell a dedicated node from a shared one, so write the
defaults out. It costs nothing and keeps Nginx, PM2 and the deploy reading one source.

```bash
sudo mkdir -p /etc/nirogix && printf 'NIROGIX_PORT_API=4000\nNIROGIX_PORT_MARKETING=3000\nNIROGIX_PORT_PORTAL=3001\nNIROGIX_PORT_PATIENT=3002\nNIROGIX_PORT_ADMIN=3003\nNIROGIX_PORT_AIPORTAL=3004\n' | sudo tee /etc/nirogix/ports.env && sudo chmod 0644 /etc/nirogix/ports.env
```

---

## Step 4 — PostgreSQL

`resources/architecture.md` requires **managed PostgreSQL (E2E DBaaS) for production** — automated
backups and point-in-time recovery are a day-one requirement for medical records, not later
hardening.

| Environment    | Decision                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Production** | **DBaaS, always.** Not negotiable under the architecture.                                                                    |
| **Staging**    | PostgreSQL on the VM. A deliberate credit-saving deviation, written down here so production does not inherit it by accident. |

> **`hms` here is a PostgreSQL role, not the Linux user.** The OS user is `deploy`; the database
> role is `hms`. They are deliberately different things and neither is renamed to match the other —
> the database role name appears in `DATABASE_URL` and in every RLS discussion, and changing it to
> avoid a moment's confusion would invalidate that.

**The application role must not be a superuser.** PostgreSQL superusers bypass row-level security
regardless of `FORCE`, so a superuser connection silently disables tenant isolation across the whole
product (`hms_backend/src/db/rls.ts`). Owning the tables is fine — `applyRls()` sets
`FORCE ROW LEVEL SECURITY`, which constrains the owner too.

```bash
sudo -u postgres psql -c "CREATE ROLE hms LOGIN PASSWORD 'REPLACE_WITH_A_STRONG_PASSWORD';" -c "CREATE DATABASE nirogix_staging OWNER hms;"
```

Confirm it is not a superuser — this is the check that matters:

```bash
sudo -u postgres psql -tAc "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='hms';"
```

Must print `hms|f|f`. Anything else and tenant isolation is not enforced.

---

## Step 5 — Service user and code

Never deploy as root, and never as the default cloud user. **The box already has `deploy`, and
`/var/www/projects` already exists and is owned by it** — this step only adds our directory inside
it. `projects` is plural on purpose: treat the box as capable of hosting more than Nirogix, and keep
everything of ours under one subdirectory.

```bash
sudo -u deploy mkdir -p /var/www/projects/nirogix && ls -la /var/www/projects
```

The repository is private, so give the box a **read-only deploy key** rather than a personal token:

```bash
sudo -iu deploy ssh-keygen -t ed25519 -C "nirogix-staging-deploy" -f /home/deploy/.ssh/id_ed25519 -N ""
```

```bash
sudo cat /home/deploy/.ssh/id_ed25519.pub
```

Add that public key at **GitHub → the repository → Settings → Deploy keys → Add deploy key**, read
access only. Then clone as `deploy` (the directory made above is empty, which `git clone` accepts):

```bash
sudo -iu deploy git clone git@github.com:Fortune-Technology/Nirogix.git /var/www/projects/nirogix
```

```bash
sudo -iu deploy bash -c 'cd /var/www/projects/nirogix && git checkout staging'
```

Everything from here runs **as `deploy`, inside `/var/www/projects/nirogix`**:

```bash
sudo -iu deploy bash -c 'cd /var/www/projects/nirogix && exec bash'
```

---

## Step 6 — Environment files (before the build, not after)

**This step must precede Step 8.** Next.js inlines every `NEXT_PUBLIC_*` value into the client
bundle **at build time**. A frontend built before its `.env` exists ships hard-coded `localhost`
URLs, and no amount of restarting fixes it — only a rebuild does.

Create one `.env` per app from its `.env.example`. Every key stays present and uncommented; only
values change, and a blank value means "not configured" and falls back safely.

```bash
for a in hms_backend hms_frontend marketing admin; do cp -n "$a/.env.example" "$a/.env"; done && ls -l */.env
```

Generate the three secrets first — fresh, never copied from the old box:

```bash
node -p "['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','ENCRYPTION_KEY'].map(k=>k+'='+require('node:crypto').randomBytes(32).toString('base64')).join('\n')"
```

### `hms_backend/.env`

Hosts come from `resources/domains.md` §8. The values that differ from the example:

```ini
NODE_ENV=staging
PORT=4000
CORS_ORIGINS=https://portal-staging.nirogix.com,https://staging.nirogix.com,https://admin-staging.nirogix.com,https://patient-staging.nirogix.com,https://ai-staging.nirogix.com

DATABASE_URL=postgresql://hms:REPLACE_WITH_A_STRONG_PASSWORD@localhost:5432/nirogix_staging

JWT_ACCESS_SECRET=<generated above>
JWT_REFRESH_SECRET=<generated above>
ENCRYPTION_KEY=<generated above>

API_PUBLIC_URL=https://api-staging.nirogix.com
API_STAGING_URL=https://api-staging.nirogix.com
PORTAL_URL=https://portal-staging.nirogix.com
ADMIN_URL=https://admin-staging.nirogix.com
PATIENT_URL=https://patient-staging.nirogix.com

REDIS_URL=redis://localhost:6379

ABDM_PROVIDER=gateway
ABDM_CLIENT_ID=<the NHA sandbox client id>
ABDM_CLIENT_SECRET=<the NHA sandbox client secret>
FIDELIUS_CLI_PATH=/opt/fidelius-cli-1.2.0/bin/fidelius-cli
ABDM_HIU_PUSH_BASE_URL=https://api-staging.nirogix.com
```

Leave the ABDM **host** URLs at their sandbox defaults. `env.ts` refuses to boot a non-production
instance pointed at production ABDM, and refuses to boot production pointed at the sandbox — the
first would make staging quietly non-functional, the second would leak real Aadhaar traffic into a
test system.

The values that fail _quietly_ when wrong, which is why they are worth checking twice:

| Key                      | Consequence                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`         | **Silent.** ABDM tokens are discarded with only a log warning; linking never works and reads as a gateway fault.                        |
| `DATABASE_URL`           | A superuser role silently disables RLS — tenant isolation gone, no error.                                                               |
| `ABDM_PROVIDER`          | In `mock` the API receives callbacks and _records_ its replies instead of sending them, so NHA times out on an answer already computed. |
| `FIDELIUS_CLI_PATH`      | Blank disables record transfer entirely — nothing is ever sent unencrypted, so M2/M3 refuse rather than degrade.                        |
| `REDIS_URL`              | Blank runs jobs inline, so the 20-minute ABDM transfer SLA competes with request handling.                                              |
| `ABDM_HIU_PUSH_BASE_URL` | Blank means M3 refuses to request external records.                                                                                     |

**File storage.** `FILE_STORAGE_PROVIDER=local` is fine to start and needs no credentials — uploads
live on the VM disk. For production parity set `r2` with the shared non-production bucket
`nirogix-documents-staging`; the boot guard rejects a production bucket name in a non-production
environment and vice versa.

**MSG91.** A blank `MSG91_API_KEY` logs messages instead of sending them, which is a safe default.
Email is ready (`mail.nirogix.com` verified — SPF/DKIM/CNAME); SMS still needs DLT template
registration (`BACKLOG.md` I-1).

### `hms_frontend/.env` — Portal

```ini
NEXT_PUBLIC_API_BASE_URL=https://api-staging.nirogix.com/api/v1
NEXT_PUBLIC_ADMIN_ORIGIN=https://admin-staging.nirogix.com
NEXT_PUBLIC_PATIENT_URL=https://patient-staging.nirogix.com
NEXT_PUBLIC_ENVIRONMENT=staging
```

### `marketing/.env`

```ini
NEXT_PUBLIC_ENVIRONMENT=staging
NEXT_PUBLIC_SITE_URL=https://staging.nirogix.com
NEXT_PUBLIC_PORTAL_LOGIN_URL=https://portal-staging.nirogix.com/login
NEXT_PUBLIC_API_BASE_URL=https://api-staging.nirogix.com/api/v1
HMS_API_URL=https://api-staging.nirogix.com/api/v1
```

`NEXT_PUBLIC_ENVIRONMENT=staging` is what makes the marketing app serve `Disallow: /` — belt and
braces alongside the Nginx `X-Robots-Tag` in Step 10.

### `admin/.env`

```ini
NEXT_PUBLIC_API_BASE_URL=https://api-staging.nirogix.com/api/v1
NEXT_PUBLIC_PORTAL_URL=https://portal-staging.nirogix.com
```

---

## Step 7 — Point DNS at the new box

Do this now: certbot validates over HTTP-01 in Step 10, and propagation is the slowest thing in this
document.

**Done for the current node (verified 03/09/2026): all six resolve to `151.185.42.182`, and no record
in the zone still names the retired IONOS box `74.208.78.255`.** The steps below stay as the runbook
for the next node — the production one. At **GoDaddy → nirogix.com → DNS**, change each record's
value to the reserved E2E address:

| Type | Name              | Value      |
| ---- | ----------------- | ---------- |
| A    | `staging`         | `<E2E_IP>` |
| A    | `portal-staging`  | `<E2E_IP>` |
| A    | `api-staging`     | `<E2E_IP>` |
| A    | `admin-staging`   | `<E2E_IP>` |
| A    | `patient-staging` | `<E2E_IP>` |
| A    | `ai-staging`      | `<E2E_IP>` |

Also check the apex `@`: it still resolves to the staging IP, so `nirogix.com` would serve staging
content. Repoint or delete it when the production node exists (`resources/domains.md` §9).

Verify from your own machine, not the server:

```bash
for h in staging portal-staging api-staging admin-staging patient-staging ai-staging; do printf '%-18s %s\n' "$h" "$(dig +short $h.nirogix.com)"; done
```

Every line must show the new IP before you run certbot.

---

## Step 8 — Install, build, migrate, seed

As `deploy`, in `/var/www/projects/nirogix`. The `.env` files from Step 6 must already exist.

```bash
npm ci
```

`--concurrency=2` is load-bearing, not cosmetic — see the 2026-08-18 incident in
[`README.md`](./README.md):

```bash
npm run build -- --concurrency=2
```

Migrations, which also apply RLS policies and the audit-immutability trigger:

```bash
npm run db:migrate -w hms_backend
```

Seed — **staging only**. The development and production seeders refuse to run against this database
by design (ADR-058), and no seeder writes real patient information in any environment:

```bash
npm run db:seed:staging -w hms_backend
```

The staging dataset is deterministic because E2E and regression tests assert against it: one
hospital (`QAHOSP`), two branches, one account per role.

---

## Step 9 — Start the processes

```bash
set -a; . /etc/nirogix/ports.env; set +a; pm2 start deploy/ecosystem.config.cjs --env staging && pm2 save
```

```bash
pm2 startup
```

Run the command `pm2 startup` prints, as root — that is what survives a reboot.

Confirm six listeners, one per app:

```bash
ss -tulpn | grep -E ':(3000|3001|3002|3003|3004|4000)\b'
```

All six apps are ecosystem-managed since `BACKLOG.md` F-5 (28/08/2026) — `4000` API, `3000`
marketing, `3001` Portal, `3002` patient, `3003` admin, `3004` AI Portal. Fewer than six means
a process failed to start, not that something is deliberately held back; read `pm2 logs` for the
missing name before continuing.

> **Each Next.js app needs its `.env` on the VM before it is built**, not after —
> `NEXT_PUBLIC_*` values are inlined at build time, so a file written later leaves a bundle
> still pointing at `localhost`. See each app's `.env.example`; nothing there is committed.

---

## Step 10 — Nginx, TLS, access control

```bash
sudo cp deploy/nginx/nirogix.conf.template /etc/nginx/sites-available/nirogix.conf
```

Edit `/etc/nginx/sites-available/nirogix.conf` and replace every `${...}` placeholder:

| Placeholder                            | Staging value                                       |
| -------------------------------------- | --------------------------------------------------- |
| `${MARKETING_HOST}`                    | `staging.nirogix.com`                               |
| `${PORTAL_HOST}`                       | `portal-staging.nirogix.com`                        |
| `${API_HOST}`                          | `api-staging.nirogix.com`                           |
| `${ADMIN_HOST}`                        | `admin-staging.nirogix.com`                         |
| `${PATIENT_HOST}`                      | `patient-staging.nirogix.com`                       |
| `${AIPORTAL_HOST}`                     | `ai-staging.nirogix.com`                            |
| `${NIROGIX_PORT_API}` …                | `4000` / `3000` / `3001` / `3002` / `3003` / `3004` |
| `${SSL_CERT_PATH}` / `${SSL_KEY_PATH}` | Filled in by certbot below                          |

Delete the `www.${MARKETING_HOST}` redirect block — it is production-only, and staging has no
`www-staging` record for certbot to validate.

```bash
sudo ln -sf /etc/nginx/sites-available/nirogix.conf /etc/nginx/sites-enabled/nirogix.conf && sudo nginx -t
```

Issue certificates for **all six hosts** — every one of them now serves (`BACKLOG.md` F-5,
28/08/2026). On a box whose certificate predates F-5 and covers only four, add `--expand` to the
same command and it is widened in place rather than replaced.

> **Check every name in the command resolves to THIS box first.** Certbot validates each one over
> HTTP-01 against whatever DNS says, and **one failure fails the whole request** — no certificate
> for any host, not merely the broken one. On 28/08/2026 five of six staging records had been
> repointed and `staging` had not, which would have taken all four down with it.
>
> ```bash
> for h in staging portal-staging api-staging admin-staging patient-staging ai-staging; do printf "%-18s %s\n" "$h" "$(dig +short $h.nirogix.com)"; done
> ```
>
> Every line must show this node's address before you run certbot.

```bash
sudo certbot --nginx --expand -d staging.nirogix.com -d portal-staging.nirogix.com -d api-staging.nirogix.com -d admin-staging.nirogix.com -d patient-staging.nirogix.com -d ai-staging.nirogix.com
```

Certbot fills in the certificate paths and reloads Nginx. `--expand` is a no-op on a fresh box
and widens an existing four-host certificate on one that already ran this step.

**This must come after the Nginx config above is installed and reloaded.** HTTP-01 reaches the
challenge through the port-80 block, which answers for a hostname only once that hostname is in
its `server_name` — the F-5 template lists all six.

### Basic auth — now, not later

The previous environment never had it, and staging answered `200` to anyone for weeks. Staging holds
a production-shaped dataset; it is not public.

```bash
sudo htpasswd -c /etc/nginx/.htpasswd-staging nirogix
```

Add the `X-Robots-Tag` line to every 443 block that does not already carry it (the patient and
AI Portal blocks set it in the template, because neither is indexable in any environment):

```nginx
add_header X-Robots-Tag "noindex, nofollow" always;
```

Add the two `auth_basic` lines to **four** of the six 443 blocks — `${MARKETING_HOST}`,
`${PORTAL_HOST}`, `${ADMIN_HOST}`, `${AIPORTAL_HOST}`:

```nginx
auth_basic "Nirogix staging";
auth_basic_user_file /etc/nginx/.htpasswd-staging;
```

**Two hosts are excluded on purpose. Each exclusion is a decision, and re-adding auth to either
one breaks something real:**

- **`${API_HOST}`** — browser XHR from the other apps is cross-origin and sends no
  `Authorization: Basic` header, so auth here breaks the apps it would be protecting. The API
  authenticates every route itself.
- **`${PATIENT_HOST}`** — `/register/{token}` is the ADR-056 public self-registration form
  reached from a hospital's printed QR. Password-protecting it means staging never exercises the
  one flow a stranger is supposed to reach. The accepted consequence is that patient
  self-registration is publicly reachable on staging; what holds it safe is the endpoint's own
  posture — opaque path token, tenant resolved server-side, identical answer for unknown /
  retired / disabled, no clinical write, sign-in-tier rate limit, audited with no actor — plus
  staging carrying only the ADR-058 synthetic dataset. Reasoning also recorded on the server
  block itself and in `resources/domains.md` §9.

The ACME challenge is already exempt: the port-80 block carries a
`location ^~ /.well-known/acme-challenge/` with `auth_basic off`. Without it, basic auth breaks
certificate **renewal** while issuance still works — a failure that surfaces ~60 days later as an
expired certificate.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 11 — CI/CD

Set these on the GitHub **staging environment** (Settings → Environments → staging → secrets):

| Secret            | Value                                                                            |
| ----------------- | -------------------------------------------------------------------------------- |
| `STAGING_HOST`    | The reserved E2E IP                                                              |
| `STAGING_USER`    | `deploy`                                                                         |
| `STAGING_SSH_KEY` | Contents of `~/.ssh/nirogix_e2e` (the private key, `BEGIN`/`END` lines included) |
| `STAGING_PATH`    | `/var/www/projects/nirogix`                                                      |

The `deploy` user must accept that key. Append the matching **public** key to its authorized keys:

```bash
sudo -iu deploy bash -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
```

Paste `~/.ssh/nirogix_e2e.pub`, then Ctrl-D. Verify from your machine before relying on it:

```bash
ssh -i ~/.ssh/nirogix_e2e deploy@<E2E_IP> 'command -v pm2 && cd /var/www/projects/nirogix && git rev-parse --short HEAD'
```

**Only once that succeeds**, merge into `staging` and push. The first deploy finds no
`.last-deploy-sha` and correctly does a full build.

---

## Step 12 — Verify

```bash
curl -sS https://api-staging.nirogix.com/api/v1/health
```

Then the reason for all of this — **run it on the server, not on a developer machine**:

```bash
cd /var/www/projects/nirogix/hms_backend && npm run abdm:check
```

`✓ session issued` here is the moment the migration has paid for itself. The same output from a
laptop proves only that the credentials are valid, which was never in doubt. If the server prints a
**network-level block** instead, Step 0 was skipped or the region is not what it appears — the
diagnostic names the difference and gives a one-line proof needing no credentials.

Re-point the ABDM bridge at the new host (the reachability check runs before it writes):

```bash
npx tsx src/scripts/abdm-bridge.ts --set-url https://api-staging.nirogix.com
```

`abdm:m2check` and `abdm:m3check` **refuse to run here by design** — they create fictional patients
and will not touch a real sandbox from a deployed environment. Run those locally only.

Finally, walk `docs/manual-testing-guide.md` far enough to prove a role can sign in and reach a
dashboard. A green health check is not a working environment.

---

## Decommissioning the old box

**Do not destroy it.** `74.208.78.255` is a shared machine running six unrelated projects, and it is
somebody else's box as much as ours; the task is removing Nirogix _from_ it, not removing it. This
is the one step in this document that can break software belonging to other people, so it is also
the one to do last and slowly.

Do this only after the new host serves all four domains, DNS has propagated past its TTL, and a
sign-in has been verified end to end. A rollback target you already deleted is not one.

Copy the four `.env` files off first — they were never committed and exist nowhere else. Keep them
as a record of which keys were set, and generate fresh `JWT_*` and `ENCRYPTION_KEY` values on the
new box rather than copying them across. Only account-bound values (the `MSG91_*` keys, the ABDM
client pair) carry over.

| Remove                                                | Leave alone                                          |
| ----------------------------------------------------- | ---------------------------------------------------- |
| PM2 apps matching `nirogix-*`, then `pm2 save`        | Every other PM2 process                              |
| Nginx server blocks for `*.nirogix.com`               | Other projects' blocks; never touch `default_server` |
| Certbot certificates for the six staging hosts        | Every other certificate on the box                   |
| The Nirogix database and role (dump it first)         | The PostgreSQL server itself                         |
| `/var/www/projects/nirogix`, `/etc/nirogix/ports.env` | Anything outside those paths                         |

`nginx -t` before every reload. A mistake in a shared `sites-enabled` breaks six other sites.

**Do not delete the R2 bucket.** `nirogix-documents-staging` is shared by development, staging and
the test runner (`resources/domains.md` §8). Only the production bucket is exclusive.

The staging database holds synthetic data only, so there is no destruction obligation — but take a
dump before dropping it, because it is the only copy.

---

## Production, when staging is proven

Same document, five differences:

1. **DBaaS is mandatory**, with automated backups and point-in-time recovery verified by an actual
   restore drill (`deploy/backup/restore-drill.sh`) — not assumed.
2. **No basic auth**, but Cloudflare in front per the architecture.
3. `npm run db:seed:production` — bootstrap configuration only, behind its confirmation variable.
   Never a hospital, patient or demo doctor, and never real patient information.
4. A **separate R2 bucket** (`nirogix-documents`); environments never share across that boundary.
5. **Production ABDM hosts**, issued by NHA after HTC approval. The boot guard refuses a production
   instance pointed at the sandbox.

Do not provision production until `abdm:check` succeeds **on staging** and the §36 compliance review
is complete. M3 stores other hospitals' patient records under an obligation to destroy them on
demand, and that is not an obligation to accept without the review.
