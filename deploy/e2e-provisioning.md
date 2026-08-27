# Provisioning Nirogix on E2E Networks — a fresh account

Companion to [`README.md`](./README.md), which stays the general runbook. This document covers the
**first-time build-out of a clean E2E account**, in order, and exists because the previous host
(IONOS, United States) turned out to be unusable for two independent reasons — ABDM's CDN refuses
non-Indian IPs outright, and `ADR-006` requires India-resident infrastructure for PHI regardless.
See `BACKLOG.md` **I-6**.

A clean account is an opportunity, not just a chore: it removes the shared-VM compromises the old
box forced (non-standard ports, missing basic auth, six unrelated projects competing for memory).
Do not carry them over.

---

## Step 0 — Prove the premise before building on it (REQUIRED)

**The entire move assumes an Indian IP can reach ABDM. Verify that first, on a throwaway node.**

Create the **smallest** node E2E offers in **Chennai**, SSH in, and run:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://dev.abdm.gov.in
```

| Result | Meaning |
|---|---|
| `403` | Chennai is blocked too. **Stop.** Destroy the node. The problem is IP allowlisting with NHA, not hosting, and the migration would not have fixed it. |
| `400` / `401` / `200` | The request reached NHA. Premise holds — destroy the node and continue. |

Fifteen minutes and a negligible number of credits to avoid rebuilding an entire environment on a
false assumption. The old host was never tested this way, which is how it took weeks to notice.

---

## Step 1 — Sizing

Two numbers matter, and the second is the one that bites.

**Runtime is small.** Measured from a live deployment: backend ≈ 22 MB, each Next.js app ≈ 57 MB.
Six apps ≈ 400 MB; with Nginx, Redis and the OS, roughly **1 GB**.

**Deploys spike.** The VM builds affected workspaces on every deploy, and the incident on
2026-08-18 logged `next-build` at **780 MB RSS**. At `--concurrency=2` that is ~1.6 GB on top of
runtime, so peak is **2.6–3 GB**.

| Environment | Recommended | Notes |
|---|---|---|
| Staging | 4 vCPU / 8 GB | Comfortable through builds and mirrors production |
| Production | 4 vCPU / 8 GB minimum | Scale up before scaling out; Redis and Nginx are co-located |

4 GB plus swap survives, but is not recommended — there is already one OOM outage on record. Add
**4 GB of swap regardless** (Step 4); swap is a safety net, never a substitute for bounded build
concurrency.

**Spend order: staging first, production later.** ABDM is not yet proven end to end. Provisioning
both now spends credits on an environment that cannot be validated until the first is working.

---

## Step 2 — Create the node

- **Region: Chennai** (or any India region). This is the whole point — `ADR-005`/`ADR-006`.
- **Image: Ubuntu 24.04 LTS.**
- **Reserve a static IP first** (Network → Reserve IP) and attach it at creation. DNS, TLS and the
  ABDM bridge URL all resolve to this host; an address that changes means redoing all three.
- **SSH key at creation** — never a password.

Generate a key dedicated to this account rather than reusing an old one:

```bash
ssh-keygen -t ed25519 -C "nirogix-e2e-staging" -f ~/.ssh/nirogix_e2e
```

Paste `~/.ssh/nirogix_e2e.pub` into E2E's SSH-key field. The **private** key later becomes the
`STAGING_SSH_KEY` GitHub secret.

### Firewall (E2E → Network → Firewall)

Allow **22, 80, 443** and nothing else. PostgreSQL and Redis bind to localhost and must never be
exposed — a managed database is reached over E2E's private network, not the public internet.

Restrict 22 to known addresses if you have static ones.

---

## Step 3 — Decide where PostgreSQL lives

`resources/architecture.md` requires **managed PostgreSQL (E2E DBaaS), provisioned as a dedicated
service from day one** for production — automated backups and point-in-time recovery are a day-one
requirement for medical records, not later hardening.

| Environment | Recommendation |
|---|---|
| **Production** | **DBaaS, always.** Not negotiable under the architecture. |
| **Staging** | DBaaS mirrors production most faithfully. PostgreSQL on the VM is an acceptable credit-saving deviation **provided production does not inherit it** — decide deliberately and write down which you chose. |

Whichever you choose, the application connects as a **non-superuser role**. PostgreSQL superusers
bypass row-level security regardless of `FORCE`, so a superuser connection silently disables tenant
isolation across the entire product (`src/db/rls.ts`).

---

## Step 4 — Baseline the box

SSH in as the default user, then:

```bash
# Swap FIRST — before any build can OOM the box.
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                                    # Swap: total ≈ 4.0Gi

# Harden SSH.
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl reload ssh

# Packages.
sudo apt-get update && sudo apt-get install -y \
  nginx redis-server postgresql-client certbot python3-certbot-nginx \
  default-jre unzip git apache2-utils
sudo systemctl enable --now redis-server && redis-cli ping   # PONG

# Node 20 + PM2.
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs && sudo npm i -g pm2
node -v && npm -v

# Fidelius — ABDM record encryption. A JRE alone is not enough.
curl -L -o /tmp/fidelius.zip \
  https://github.com/mgrmtech/fidelius-cli/releases/download/1.2.0/fidelius-cli-1.2.0.zip
sudo unzip -q /tmp/fidelius.zip -d /opt/
sudo chmod +x /opt/fidelius-cli-1.2.0/bin/fidelius-cli
/opt/fidelius-cli-1.2.0/bin/fidelius-cli gkm   # must print privateKey/publicKey/nonce
```

That last command is worth pausing on: it is the only local proof that ABDM record encryption
works at all. `FIDELIUS_CLI_PATH` points at the **launcher script**, never at a jar — the release
is a script plus a `lib/` directory, so `java -jar` cannot work.

---

## Step 5 — Service user and code

Never deploy as root, and never as the default cloud user.

```bash
sudo adduser --system --group --shell /bin/bash --home /home/hms hms
sudo mkdir -p /var/www/nirogix && sudo chown -R hms:hms /var/www/nirogix
sudo -iu hms
git clone <repo-url> /var/www/nirogix && cd /var/www/nirogix
```

Create one `.env` per app from its `.env.example` — `hms_backend`, `hms_frontend`, `marketing`,
`admin` (plus `patient` and `aiportal` when `BACKLOG.md` F-5 ships). Every key is present and
uncommented; only values change, and a blank value keeps a feature unconfigured.

### Ports: `/etc/nirogix/ports.env` is REQUIRED even though the defaults are right

A dedicated node needs no port overrides — the defaults in `deploy/ecosystem.config.cjs` (API
`4000`, marketing `3000`, portal `3001`, patient `3002`, admin `3003`, aiportal `3004`) are correct
when nothing else competes for them.

**But `.github/workflows/deploy-staging.yml` aborts the deploy if `/etc/nirogix/ports.env` does not
exist**, deliberately: on the old shared box a missing file meant PM2 silently fell back to
defaults and crash-looped on `EADDRINUSE`. The guard cannot tell a dedicated node from a shared
one, so create the file with the defaults written out. It costs nothing and keeps Nginx, PM2 and
the deploy reading the same numbers from one place:

```bash
sudo mkdir -p /etc/nirogix
sudo tee /etc/nirogix/ports.env >/dev/null <<'EOF'
NIROGIX_PORT_API=4000
NIROGIX_PORT_MARKETING=3000
NIROGIX_PORT_PORTAL=3001
NIROGIX_PORT_PATIENT=3002
NIROGIX_PORT_ADMIN=3003
NIROGIX_PORT_AIPORTAL=3004
EOF
sudo chmod 0644 /etc/nirogix/ports.env
```

Values that must not be missed in `hms_backend/.env`:

| Key | Consequence if wrong or blank |
|---|---|
| `ENCRYPTION_KEY` | **Fails silently.** ABDM tokens are discarded with only a log warning; linking never works and looks like a gateway fault. |
| `DATABASE_URL` | Must be a **non-superuser** role, or RLS is silently bypassed. |
| `REDIS_URL` | `redis://localhost:6379` — otherwise the 20-minute ABDM transfer SLA runs inline. |
| `FIDELIUS_CLI_PATH` | `/opt/fidelius-cli-1.2.0/bin/fidelius-cli` — blank disables record transfer. |
| `ABDM_PROVIDER` | `gateway`. In `mock` we receive callbacks but record our replies instead of sending them, so NHA times out on an answer we already computed. |
| `ABDM_HIU_PUSH_BASE_URL` | The public API host. Blank means M3 refuses to request records. |
| `CORS_ORIGINS` | Per `resources/domains.md`. |

---

## Step 6 — Build, migrate, seed

```bash
npm ci
npm run build -- --concurrency=2      # the flag is not optional; see the 2026-08-18 incident
npm run db:migrate -w hms_backend     # migrations + RLS + audit-immutability trigger
npm run db:seed:staging -w hms_backend   # STAGING ONLY (ADR-058)
```

The development and production seeders refuse to run against a staging database by design. The
production seeder writes bootstrap configuration only — never a hospital, patient or demo doctor.

---

## Step 7 — Processes, Nginx, TLS

```bash
set -a; . /etc/nirogix/ports.env; set +a      # PM2 re-reads these; see the ports note in Step 5
pm2 start deploy/ecosystem.config.cjs --env staging && pm2 save
pm2 startup    # run the command it prints, as root
ss -tulpn | grep -E '3000|3001|3003|4000'   # four apps, four listeners
```

**Repoint DNS before touching Nginx.** All six staging `A` records still point at the retired
IONOS box (`74.208.78.255`, `resources/domains.md` §8a). Change every one at GoDaddy to the
reserved E2E address and wait for propagation — certbot validates over HTTP-01, so a stale record
sends the challenge to a host that no longer runs anything and issuance fails:

```bash
for h in staging portal-staging api-staging admin-staging patient-staging ai-staging; do
  printf '%-26s %s\n' "$h" "$(dig +short $h.nirogix.com)"
done
```

Then install `deploy/nginx/nirogix.conf.template`, substituting hosts, ports and certificate paths:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Issue certificates for **the four hosts that actually serve**. `patient-staging` and `ai-staging`
resolve but run no process (`BACKLOG.md` F-5), and certbot fails the entire request if any one
host in it fails validation:

```bash
sudo certbot --nginx \
  -d staging.nirogix.com -d portal-staging.nirogix.com \
  -d api-staging.nirogix.com -d admin-staging.nirogix.com
```

Add the remaining two with `certbot --expand` in the change that deploys those apps.

### Basic auth on staging — do this now, not later

The previous environment never had it, and staging answered `200` to anyone for weeks. Staging
holds a production-shaped dataset; it is not public.

```bash
sudo htpasswd -c /etc/nginx/.htpasswd-staging nirogix
```

Then in each staging server block:

```nginx
auth_basic "Nirogix staging";
auth_basic_user_file /etc/nginx/.htpasswd-staging;
add_header X-Robots-Tag "noindex, nofollow" always;
```

Exempt `/.well-known/acme-challenge/` so certbot renewals keep working.

Finish `resources/domains.md` §9 — `CORS_ORIGINS`, `NEXT_PUBLIC_ENVIRONMENT=staging`, and the
refresh cookie arriving `Secure; HttpOnly; SameSite=Lax` with **no** `Domain` attribute.

---

## Step 8 — CI/CD

Set the repository secrets the workflow expects: `STAGING_HOST` (the reserved IP),
`STAGING_USER` (`hms`), `STAGING_SSH_KEY` (the private key from Step 2), `STAGING_PATH`
(`/var/www/nirogix`).

Merging to `staging` then runs `.github/workflows/deploy-staging.yml`. The runner does the full
`npm ci && npm run build` as the compile gate; the VM deploys affected-only.

---

## Step 9 — Verify ABDM, which is the reason for all of this

```bash
cd /var/www/nirogix/hms_backend
npm run abdm:check     # a session token from an Indian IP is the whole objective
npm run abdm:bridge    # read-only: what NHA currently holds
```

`abdm:check` printing `✓ session issued` is the moment the migration has paid for itself. If it
prints a **network-level block** instead, Step 0 was skipped or the region is not what it appears —
the diagnostic names the difference and gives a one-line proof.

Then re-point the bridge at the new host (the reachability check runs before it writes):

```bash
npx tsx src/scripts/abdm-bridge.ts --set-url https://api-staging.nirogix.com
```

Note `abdm:m2check` and `abdm:m3check` **refuse to run here by design** — they write fictional
patients and will not touch a real sandbox. Run those locally only.

---

## Production, when staging is proven

Same document, four differences:

1. **DBaaS is mandatory**, with automated backups and point-in-time recovery verified by an actual
   restore drill (`deploy/backup/restore-drill.sh`) — not assumed.
2. **No basic auth**, but Cloudflare in front per the architecture.
3. `npm run db:seed:production` — bootstrap configuration only, behind its confirmation variable.
   Never a hospital, patient or demo doctor, and never real patient information.
4. A **separate R2 bucket**; environments never share one.

Do not provision production until `abdm:check` succeeds on staging and the §36 compliance review is
complete. M3 stores other hospitals' patient records under an obligation to destroy them on demand,
and that obligation is not one to accept without the review.
