# Domain & Environment Architecture

**Document:** `domains.md`
**Version:** 2.0
**Last Updated:** 16/08/2026
**Prepared for:** Takoriya Technology LLP
**Decision record:** ADR-041 (the platform is named **Nirogix**), ADR-042 (this structure), **ADR-051 (five frontends, one origin per audience — this version)**

The authoritative host map for Nirogix. Every environment URL in code, configuration, or a deploy script comes from here, and nothing hard-codes a host (see `resources/rules.md` → API Documentation Rules, and the environment matrix below).

---

## 1. Principles

1. **Two registrable domains.** `nirogix.com` carries the platform; **`nirogix.ai`** carries the AI Portal and nothing else (ADR-051). A separate registrable domain gives the AI surface a different cookie scope *by construction* rather than by configuration — the correct boundary for a surface with its own access rule. DNS is hosted at **GoDaddy** (ADR-045); there is no CDN or edge proxy in front of the origin. `nirogix.com` is registered and its GoDaddy zone is live (staging records provisioned — §8a); `nirogix.ai` is **not yet purchased** — see §10.
2. **Every host is second-level** (`portal.nirogix.com`, `api-staging.nirogix.com`) and never third-level (`test.portal.nirogix.com`). Most free wildcard certificates cover `*.nirogix.com` only — a third-level host needs its own certificate for no functional gain. With Let's Encrypt on the VM each host gets its own certificate anyway, so the rule keeps issuance and renewal simple rather than being a hard constraint.
3. **Environment is a prefix on the host, not a path.** `portal-staging`, never `portal.nirogix.com/staging`. Paths belong to the application.
4. **One origin per audience** (ADR-051). A different *audience* — public, hospital staff, vendor operator, patient — is a different security boundary, a different release cadence and a different blast radius, so it gets its own host and its own bundle. A new *capability* for an existing audience is still a route on that audience's host. Subdomains are cheap to create and expensive to retire.
5. **Cookies are host-only.** No cookie ever sets `Domain=.nirogix.com`, so a staging session can never be presented to production, and one host's compromise does not hand over another's session.
6. **Production and non-production never share state** — separate database, separate secrets, separate notification sender, and a separate object-storage bucket **across the production boundary**: every non-production environment (development and staging, plus the test runner) shares one bucket, and production has its own (§8). The rule is not "a bucket per environment" but "production is never in the same bucket as anything else". The application has exactly three environments — **development | staging | production** (ADR-071).

---

## 2. Production

| Host | Serves | Process | Notes |
|---|---|---|---|
| `nirogix.com` | Marketing site (apex) | `marketing` (Next.js, :3000) | The canonical public surface. Indexable. |
| `www.nirogix.com` | 301 → `nirogix.com` | Nginx | Redirect only. Never serves content, so there is one canonical URL for SEO. |
| `portal.nirogix.com` | Nirogix Portal — hospital staff only | `hms_frontend` (Next.js, :3001) | `noindex, nofollow` end to end (ADR-027). **No platform-operator screens** — they moved to `admin` (ADR-051). |
| `admin.nirogix.com` | Platform administration | `admin` (Next.js, :3003) | Vendor operators only. `noindex, nofollow`. Its own bundle, so operator code never ships to a hospital. |
| `patient.nirogix.com` | Patient portal | `patient` (Next.js, :3002) | Verified, hospital-provisioned patients only (ADR-052). `noindex, nofollow`. **No public signup.** Also serves `/register/{token}` — the one **unauthenticated** route on this host, a hospital’s own registration form reached from its printed QR (ADR-056). It creates a request for the front desk, never an account. |
| `nirogix.ai` | AI Portal | `aiportal` (Next.js, :3004) | Authorised staff + operators, `ai.portal.access` (ADR-053). Patients refused server-side by principal type. Separate registrable domain = separate cookie scope. |
| `api.nirogix.com` | REST API, `/api/v1` | `hms_backend` (Express, :4000) | Sets the refresh cookie (host-only). Serves `/api/v1/openapi.json`; the Swagger UI is env-gated. |
| `docs.nirogix.com` | Public API reference | *(reserved)* | Swagger UI / redoc built from the same spec, for hospitals' own integrators. Read-only, no credentials. |
| `status.nirogix.com` | Uptime and incident page | *(reserved)* | Deliberately **not** on our infrastructure — a status page hosted where the platform lives is useless during the outage it is meant to report. |
| `cdn.nirogix.com` | File and asset delivery | *(reserved, blocked)* | Intended as a custom domain in front of Cloudflare R2 — **which requires the zone to be on Cloudflare DNS**, and it is not (ADR-045). Until that changes, PHI documents are served the way they already are: short-lived signed URLs minted by the API through `FileStorageService`, never a public bucket URL. |
| `mail.nirogix.com` | Transactional email identity | *(reserved)* | SPF / DKIM / DMARC for MSG91 sending (ADR-016). Kept off the apex so a deliverability incident never damages the main domain's reputation. Serves no HTTP traffic. |

## 3. Staging / testing

Identical topology, `-staging` suffixed, on the same zone and the same wildcard certificate.

| Host | Serves |
|---|---|
| `staging.nirogix.com` | Marketing site |
| `portal-staging.nirogix.com` | Nirogix Portal |
| `admin-staging.nirogix.com` | Platform administration |
| `patient-staging.nirogix.com` | Patient portal |
| `ai-staging.nirogix.com` | AI Portal — staging lives on `nirogix.com`, so the `.ai` zone carries production only |
| `api-staging.nirogix.com` | REST API |

- **Never indexed.** Staging serves `X-Robots-Tag: noindex, nofollow` at Nginx for every host, on top of the app's own `robots.ts`. A duplicate of the marketing site in the index is an SEO defect and a leak of unreleased copy.
- **Access-restricted.** HTTP basic auth at Nginx in front of all three hosts, plus an `X-Robots-Tag: noindex` response header, so a customer or crawler never lands on unreleased work. The marketing app additionally serves `Disallow: /` on staging (`NEXT_PUBLIC_ENVIRONMENT=staging`) — belt and braces, because staging is on public DNS with no edge gate.
- **Its own data.** Separate database, separate R2 bucket, separate secrets, and the notification provider in `log` mode or against a test sender — never the production DLT sender.

## 4. Development

Local only; no public DNS. Ports are already fixed by each app's `dev` script.

| URL | Serves | Workspace |
|---|---|---|
| `http://localhost:3000` | Marketing site | `marketing` |
| `http://localhost:3001` | Nirogix Portal (hospital staff) | `hms_frontend` |
| `http://localhost:3002` | Patient portal | `patient` |
| `http://localhost:3003` | Platform administration | `admin` |
| `http://localhost:3004` | AI Portal | `aiportal` |
| `http://localhost:4000` | REST API (`/api/v1`) | `hms_backend` |

> **Local ports were reassigned on 16/08/2026** — marketing and the Portal swapped, as did
> patient and admin. Earlier records show the old numbers and are left as they were written:
> `DECISIONS.md` is append-only, and so is every `DONE.md`. **This table is the authority.**

Ports are a property of the application, not of the environment: each one is pinned in that
workspace's **`dev` and `start` scripts**, mirrored in `.claude/launch.json`, and matched by the
Nginx upstreams in `deploy/nginx/`. Changing one means changing all four together. **The System Admin application is `http://localhost:3003`, not `http://localhost:3001/platform`** — port 3001 belongs to the staff Portal, and a second Next application cannot serve a path on another's port without a reverse proxy in front of both, which would put the two back on one origin and undo the split (ADR-051).

A shared cloud dev tier is **not** provisioned. Two deployed environments are the minimum that lets a release be verified; a third earns its keep only when several developers need to integrate against a running stack at once. If that day comes the naming already accommodates it — `dev.nirogix.com`, `portal-dev.nirogix.com`, `api-dev.nirogix.com` — with no restructuring.

## 5. What deliberately does *not* get a subdomain

| Candidate | Decision | Why |
|---|---|---|
| ~~Admin / backoffice~~ | **Superseded — now `admin.nirogix.com`** | ADR-042 reasoned that a separate host "would fork the session model and double the auth surface to protect". That was sound and is now outweighed: a platform operator and a receptionist were sharing a JavaScript bundle, so operator code shipped to every hospital, and the two have different release cadences and blast radii (ADR-051). |
| Authentication / SSO | `api.nirogix.com` | Tokens are minted by the API and the refresh cookie is scoped to that host. A dedicated `id.` host is worth it only for federated SSO across several products or a hospital-side IdP integration — neither is in scope. It can be added later without moving anything, because the Portal already reads its API base URL from configuration. |
| Webhooks | `api.nirogix.com/api/v1/webhooks/*` | Inbound webhooks need the same request validation, rate limiting, idempotency, and audit trail as every other endpoint (`resources/rules.md` → API Rules). A separate host would duplicate all four. |
| Per-tenant hosts (`citycare.nirogix.com`) | Not now | Tenant context comes from the authenticated session, never from the URL (a non-negotiable invariant). Per-tenant vanity hosts would need per-host certificates, a tenant-to-host resolution step, and a second way to establish tenancy. Revisit only as an Enterprise-track request, with an ADR. |
| ~~Customer-facing patient portal~~ | **Superseded — now `patient.nirogix.com`** | The reasoning held ("a different audience and a different threat model … so it gets its own origin"); only the hostname changed, from the reserved `my.` to the plainer `patient.` (ADR-051). |
| AI subdomains (`chat.nirogix.ai`, `api.nirogix.ai`) | Not now | The AI Portal is one host on its own registrable domain. If the AI surface later needs its own API origin or a second app, those hosts are documented **under `nirogix.ai`** and never mixed into the `nirogix.com` application hosts. |

## 6. TLS, DNS, and edge

- **One GoDaddy DNS zone** for `nirogix.com` (nameservers `ns27`/`ns28.domaincontrol.com`). Every HTTP host is a plain `A` record to the VM's public IP — no proxy, so the origin IP is public and the VM's firewall is the only network boundary. `mail` is DNS-only records (SPF/DKIM/DMARC), no host.
- **Let's Encrypt per host**, issued and renewed on the VM by certbot (HTTP-01, so port 80 must stay reachable). TLS terminates at Nginx on the origin; there is no edge tier. Issue one certificate covering the hosts that share a VM, e.g. `certbot --nginx -d staging.nirogix.com -d portal-staging.nirogix.com -d api-staging.nirogix.com`.
- **No WAF, no DDoS absorption, no edge caching.** Rate limiting is the application's own (ADR-036) and it is the only such control in the path. Revisit if abuse or traffic makes an edge worthwhile — moving to a proxy later is a nameserver change, not a re-architecture.
- **HSTS** on production hosts once the certificate chain is verified end to end; staging is excluded while access control is in front.
- **Real client IP** is restored from `CF-Connecting-IP` so rate limiting and audit records see the visitor, not the edge (already in the Nginx template).
- **Nothing is served from an IP or a provider-generated hostname.** Every URL a customer or integrator can see is a `nirogix.com` host.

## 7. Cookies, CORS, and origins

- The refresh cookie is set by the API on **its own host only** — `Secure`, `HttpOnly`, `SameSite=Lax`, **no `Domain` attribute**. `portal.nirogix.com` and `api.nirogix.com` are same-site (same registrable domain), so the cookie flows on the refresh call, while a host-only cookie cannot be replayed against staging or any other subdomain.
- The access token stays in memory in the Portal and is never written to storage (`hms_frontend/KNOWLEDGE.md`).
- **`CORS_ORIGINS` is an explicit allowlist per environment** (ADR-036), listing only the Portal and marketing origins for that environment. It never contains a wildcard, and never lists a production origin in staging.

## 8. Environment matrix

Every one of these is read from configuration. No host appears in application code.

The application has exactly three environments — **development | staging | production** (ADR-071). The **Development** column is a developer's local machine (localhost). (`local` is retired as an environment name; `FILE_STORAGE_PROVIDER=local` below is unrelated — it names the on-disk storage backend, not an environment.)

| Variable | Development | Staging | Production |
|---|---|---|---|
| `API_PUBLIC_URL` (backend) | `http://localhost:4000` | `https://api-staging.nirogix.com` | `https://api.nirogix.com` |
| `CORS_ORIGINS` (backend) | *(permissive in dev)* | `https://portal-staging.nirogix.com,https://staging.nirogix.com,https://admin-staging.nirogix.com,https://patient-staging.nirogix.com,https://ai-staging.nirogix.com` | `https://portal.nirogix.com,https://nirogix.com,https://admin.nirogix.com,https://patient.nirogix.com,https://nirogix.ai` |
| `OPENAPI_UI_ENABLED` (backend) | `true` | `true` | `false` — the JSON spec is always served; the interactive UI is not exposed in production |
| `NEXT_PUBLIC_API_BASE_URL` (Portal) | `http://localhost:4000/api/v1` | `https://api-staging.nirogix.com/api/v1` | `https://api.nirogix.com/api/v1` |
| `NEXT_PUBLIC_ADMIN_ORIGIN` (Portal) | `http://localhost:3003` | `https://admin-staging.nirogix.com` | `https://admin.nirogix.com` — the only origin the Portal accepts a support-session token from (ADR-051) |
| `NEXT_PUBLIC_PATIENT_URL` (Portal) | `http://localhost:3002` | `https://patient-staging.nirogix.com` | `https://patient.nirogix.com` — composes the public patient-registration link printed on a hospital's QR poster (ADR-056) |
| `NEXT_PUBLIC_SITE_URL` (marketing) | `http://localhost:3000` | `https://staging.nirogix.com` | `https://nirogix.com` |
| `NEXT_PUBLIC_PORTAL_LOGIN_URL` (marketing) | `http://localhost:3001/login` | `https://portal-staging.nirogix.com/login` | `https://portal.nirogix.com/login` |
| `NEXT_PUBLIC_API_BASE_URL` (admin) | `http://localhost:4000/api/v1` | `https://api-staging.nirogix.com/api/v1` | `https://api.nirogix.com/api/v1` |
| `NEXT_PUBLIC_API_BASE_URL` (patient) | `http://localhost:4000/api/v1` | `https://api-staging.nirogix.com/api/v1` | `https://api.nirogix.com/api/v1` |
| `NEXT_PUBLIC_API_BASE_URL` (aiportal) | `http://localhost:4000/api/v1` | `https://api-staging.nirogix.com/api/v1` | `https://api.nirogix.com/api/v1` |
| `NEXT_PUBLIC_ENVIRONMENT` (all frontends) | `development` | `staging` | `production` **(or unset)** — the canonical environment marker (ADR-071); gates the dev quick-login test-user switcher on the Portal sign-in page (issue #7) and the marketing `noindex` on staging; baked in at build time, so a production build must NOT carry a non-prod value |
| `NIROGIX_PORT_API` (VM) | `4000` | `4000` | `4000` |
| `NIROGIX_PORT_MARKETING` (VM) | `3000` | `3000` | `3000` |
| `NIROGIX_PORT_PORTAL` (VM) | `3001` | `3001` | `3001` |
| `NIROGIX_PORT_PATIENT` (VM) | `3002` | `3002` | `3002` |
| `NIROGIX_PORT_ADMIN` (VM) | `3003` | `3003` | `3003` |
| `NIROGIX_PORT_AIPORTAL` (VM) | `3004` | `3004` | `3004` |
| `FILE_STORAGE_PROVIDER` (backend) | `local` (disk) or `r2` | `r2` | `r2` |
| `R2_BUCKET` (backend) | **`nirogix-documents-staging`** (when using r2; else local disk needs none) | **`nirogix-documents-staging`** | **`nirogix-documents`** |

**The six `NIROGIX_PORT_*` rows are identical in every column on purpose** — a port is a property
of the application, not of the environment (§4), so the localhost a developer runs and the
loopback address Nginx proxies to are the same number. They are listed here anyway because the
deployed environments read them from **one** place, `/etc/nirogix/ports.env` on the VM, which the
deploy workflow **requires**: a non-interactive SSH shell sources no `.bashrc`, and without these
variables PM2 re-parses the ecosystem onto the defaults. `4000` / `3000` / `3001` / `3002` /
`3003` / `3004` are the six ports claimed on the staging node as of 28/08/2026, one per PM2 app,
and they are the same six the Nginx upstreams are substituted with. Changing one means changing
the workspace's `dev` and `start` scripts, `.claude/launch.json`, `ports.env` and
`deploy/nginx/nirogix.conf.template` together.

**Two buckets total: one shared by every non-production environment, one for production alone.** Development and staging (and the test runner) all use **`nirogix-documents-staging`**; production uses a separate **`nirogix-documents`**. The line that must never be crossed is the production boundary — a non-prod test that overwrites or deletes a file must be structurally incapable of touching a production document. So the two buckets have **separate R2 API tokens and separate secrets**, the production bucket name and token appear in **no** `.env` outside the production host, and the backend **refuses to boot** on a mismatch (a production process pointed at a `-staging` bucket, or a non-prod process pointed at the production bucket — `hms_backend/src/config/env.ts`, in the spirit of the ADR-058 seeder guard). Development may still default to disk (`FILE_STORAGE_PROVIDER=local`, no bucket needed); when a developer wants R2 parity they point at the **same shared non-prod bucket**. Files are keyed `<tenantId>/<category>/<uuid>-<filename>` (categories: `branding`, `platform-branding`, `letterhead`, `lab-reports`, `documents`) — invoices and clinical reports are generated print routes, not stored objects (ADR-007, ADR-047).

**Every frontend reads its API base URL from configuration.** No app holds a host in source, and all five point at the same backend — there is one API, one database, one permission catalog and one audit trail behind every one of them (ADR-051).

## 8a. Provisioned state — staging (as of 28/08/2026)

Recorded from the live GoDaddy zone so a deploy reads reality, not the placeholders above.

> **The staging host has moved.** The old VM — `74.208.78.255`, IONOS, **United States** — is retired
> for two independent reasons: ABDM's CDN refuses non-Indian IPs outright, and `ADR-006` requires
> India-resident infrastructure for PHI regardless of that (`BACKLOG.md` **I-6**). Staging now runs on
> a dedicated **E2E Networks node in India**, `e2e-131-182`, service user `deploy`, application root
> `/var/www/projects/nirogix`. Unlike the old box this one is **ours alone**, so the shared-VM port
> compromises do not carry over — but `/etc/nirogix/ports.env` is still written, because the deploy
> workflow refuses to run without it.
>
> **The node's public IP is `151.185.42.182`** (confirmed 28/08/2026 from the box itself). All six
> staging `A` records now point at it — the repointing is finished, and certbot validates.

- **Staging `A` records — all six repointed (verified 28/08/2026):**

  | Host | Resolves to | |
  |---|---|---|
  | `staging` | `151.185.42.182` | ✅ |
  | `portal-staging` | `151.185.42.182` | ✅ |
  | `api-staging` | `151.185.42.182` | ✅ |
  | `admin-staging` | `151.185.42.182` | ✅ |
  | `patient-staging` | `151.185.42.182` | ✅ |
  | `ai-staging` | `151.185.42.182` | ✅ |

  `staging` was the last one, and it had been holding up **every** host: certbot is issued one
  certificate for the whole list, HTTP-01 validates each name against whatever DNS says, and **a
  single failure fails the entire request**. That is no longer a constraint — but it is still the
  rule to check before any `certbot` run that adds a name.

- **Certificate — issued for four hosts, being widened to six.** The live certificate (Let's
  Encrypt, issued 28/08/2026, expires 26/11/2026) carries `staging`, `portal-staging`,
  `api-staging` and `admin-staging`. `patient-staging` and `ai-staging` are **not on it yet**, so
  TLS to either fails the hostname check outright — `SEC_E_WRONG_PRINCIPAL` in curl,
  `ERR_CERT_COMMON_NAME_INVALID` in a browser — rather than degrading gracefully. Widening the
  certificate in place is one command, run **after** the Nginx blocks from `BACKLOG.md` F-5 are
  installed: the port-80 block must already answer for both names before HTTP-01 can reach the
  challenge.

  ```bash
  sudo certbot --nginx --expand -d staging.nirogix.com -d portal-staging.nirogix.com -d api-staging.nirogix.com -d admin-staging.nirogix.com -d patient-staging.nirogix.com -d ai-staging.nirogix.com
  ```

- **Ports claimed on the node (28/08/2026):** `4000` API · `3000` marketing · `3001` Portal ·
  `3002` patient · `3003` admin · `3004` AI Portal — six PM2 apps, six loopback listeners, one
  Nginx upstream each. Written once in `/etc/nirogix/ports.env` and read from nowhere else (§8).
  This node is dedicated to Nirogix, so the numbers match the local defaults exactly.

- **The apex and `www` serve nothing of ours, and never have.** Verified 28/08/2026: with
  `nirogix.com` / `www.nirogix.com` pointed at the old IONOS box, HTTPS to either presents a
  certificate for **`storeveu.com`** (`test.admin.storeveu.com`, `test.api.storeveu.com`,
  `test.shop.storeveu.com`, …) — an unrelated project sharing that box. There is no apex server block
  on that host; the request falls through to its `default_server`, so **a visitor to the company's
  main domain gets a full-page browser security warning naming another company.**

  This is not a regression from the move. The Nginx template never defined an apex server block for
  staging — `MARKETING_HOST` is `staging.nirogix.com`, so the `www.${MARKETING_HOST}` redirect covers
  `www.staging.nirogix.com`, not the apex. `nirogix.com` has therefore never served the Nirogix
  marketing site from either box.

  **Delete the apex and `www` `A` records until the production node exists** (§9 already says so). A
  domain that does not resolve is better than one presenting a stranger's certificate. Moving or
  removing them cannot affect the other projects on the old box: an `A` record governs only the name
  it belongs to, and `storeveu.com` has its own. `portal.nirogix.com` and `api.nirogix.com` correctly
  have no `A` record yet, which is the state the apex should match. (`admin-staging` serves; `patient-staging` and `ai-staging` serve once the F-5 change is deployed — PM2 entries uncommented, an Nginx server block per host, and the certificate widened to cover both.)
- **Transactional email — `mail.nirogix.com` verified at MSG91** (ADR-016). SPF (`TXT mail` → `v=spf1 include:mailer91.com ~all`), DKIM (`TXT spaceship._domainkey.mail`) and the tracking `CNAME mailer91.mail` → `email.mailer91.com` all show **Verified**; the `MX mail` → `mx1.mailer91.com` (priority 10) is the last to propagate and affects only bounce/return-path, not sending. **Outbound email is deliverable.** DMARC stays the zone default (`_dmarc`, `p=quarantine`), which the `mail` subdomain inherits.
- **Production `A` records** (`nirogix.com` apex, `portal`, `api`, `admin`, `patient`) point at the prod VM's IP and are **not created yet** — production is a separate box. The apex `@` currently resolves to the staging IP; delete or repoint it when the prod VM exists so `nirogix.com` never serves staging content.

## 9. Cutover checklist

1. ~~Add the `A` records for the staging hosts~~ **Done (17/08/2026), but they now point at a retired host.** All six resolve to `74.208.78.255`, the decommissioned IONOS box; **repoint every one at the E2E node's IP** (§8a) before issuing certificates. Production `A` records remain to be added against the prod VM's IP.
2. Set the environment matrix above on each host; confirm `CORS_ORIGINS` lists that environment's origins only.
3. Put Nginx basic auth in front of the staging **UI** hosts — `staging`, `portal-staging`,
   `admin-staging`, `ai-staging` — add the `X-Robots-Tag: noindex` header everywhere, and set
   `NEXT_PUBLIC_ENVIRONMENT=staging` so the marketing app also serves `Disallow: /`. **Two hosts
   are deliberately excluded, and each exclusion is a decision, not an omission:**
   `api-staging`, because a browser XHR is cross-origin and carries no `Authorization: Basic`
   header, so auth there breaks the apps it would protect (the API authenticates every route
   itself); and `patient-staging`, because `/register/{token}` is the ADR-056 public
   self-registration form and password-protecting it would mean staging never exercises the one
   flow a stranger is supposed to reach. The consequence is accepted explicitly: patient
   self-registration is publicly reachable on staging, held safe by the endpoint's own posture
   (opaque path token, tenant resolved server-side, uniform failure, no clinical write,
   sign-in-tier rate limit, audited with no actor) and by staging carrying only ADR-058
   synthetic data. See `deploy/nginx/nirogix.conf.template`.
4. Confirm `www` → apex is a 301 and that the marketing canonical URLs resolve to the apex.
5. Confirm the refresh cookie arrives with `Secure; HttpOnly; SameSite=Lax` and **no** `Domain`, on the API host only.
6. ~~Publish DKIM/SPF/DMARC for `mail.nirogix.com`~~ **Done (17/08/2026)** — SPF/DKIM/CNAME verified at MSG91, outbound email deliverable (§8a). SMS still needs DLT template registration before a real SMS send (`BACKLOG.md` I-1).
7. Point `docs`, `status`, and `cdn` when each is actually built; until then they stay documented and unrouted.
8. **Purchase `nirogix.ai`**, create its zone at GoDaddy, and issue its certificate separately — a `*.nirogix.com` certificate does not cover it. Staging AI runs on `ai-staging.nirogix.com` (already resolving); `nirogix.ai` is needed only for the AI Portal's **production** host. Until purchased, production AI is unrouted (`BACKLOG.md`).
9. Confirm each frontend's origin appears in `CORS_ORIGINS` for that environment **and nowhere else** — an admin origin listed in staging's production allowlist is exactly the mistake the per-audience split is meant to prevent.
10. Confirm `portal.nirogix.com` serves **no** platform-operator route after the split, and `admin.nirogix.com` serves no clinical route. Each app's bundle should contain only its own audience's code.
