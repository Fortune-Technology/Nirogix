# Domain & Environment Architecture

**Document:** `domains.md`
**Version:** 1.0
**Last Updated:** August 2026
**Prepared for:** Takoriya Technology LLP
**Decision record:** ADR-041 (the platform is named **Nirogix**), ADR-042 (this structure)

The authoritative host map for Nirogix. Every environment URL in code, configuration, or a deploy script comes from here, and nothing hard-codes a host (see `resources/rules.md` → API Documentation Rules, and the environment matrix below).

---

## 1. Principles

1. **One registrable domain: `nirogix.com`.** Everything is a subdomain of it, so one DNS zone and one certificate strategy cover the platform. DNS is hosted at **GoDaddy** (ADR-045); there is no CDN or edge proxy in front of the origin.
2. **Every host is second-level** (`portal.nirogix.com`, `api-staging.nirogix.com`) and never third-level (`test.portal.nirogix.com`). Most free wildcard certificates cover `*.nirogix.com` only — a third-level host needs its own certificate for no functional gain. With Let's Encrypt on the VM each host gets its own certificate anyway, so the rule keeps issuance and renewal simple rather than being a hard constraint.
3. **Environment is a prefix on the host, not a path.** `portal-staging`, never `portal.nirogix.com/staging`. Paths belong to the application.
4. **A new capability gets a subdomain only when it needs its own origin** — a different security boundary, a different server, or third-party delivery. Otherwise it is a route on an existing host. Subdomains are cheap to create and expensive to retire.
5. **Cookies are host-only.** No cookie ever sets `Domain=.nirogix.com`, so a staging session can never be presented to production, and one host's compromise does not hand over another's session.
6. **Production and non-production never share state** — separate database, separate object storage bucket, separate secrets, separate notification sender.

---

## 2. Production

| Host | Serves | Process | Notes |
|---|---|---|---|
| `nirogix.com` | Marketing site (apex) | `marketing` (Next.js, :3001) | The canonical public surface. Indexable. |
| `www.nirogix.com` | 301 → `nirogix.com` | Nginx | Redirect only. Never serves content, so there is one canonical URL for SEO. |
| `portal.nirogix.com` | Nirogix Portal — every staff and operator screen | `hms_frontend` (Next.js, :3000) | `noindex, nofollow` end to end (ADR-027). Includes the System Admin context (ADR-037). |
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
| `api-staging.nirogix.com` | REST API |

- **Never indexed.** Staging serves `X-Robots-Tag: noindex, nofollow` at Nginx for every host, on top of the app's own `robots.ts`. A duplicate of the marketing site in the index is an SEO defect and a leak of unreleased copy.
- **Access-restricted.** HTTP basic auth at Nginx in front of all three hosts, plus an `X-Robots-Tag: noindex` response header, so a customer or crawler never lands on unreleased work. The marketing app additionally serves `Disallow: /` on staging (`NEXT_PUBLIC_ENVIRONMENT=staging`) — belt and braces, because staging is on public DNS with no edge gate.
- **Its own data.** Separate database, separate R2 bucket, separate secrets, and the notification provider in `log` mode or against a test sender — never the production DLT sender.

## 4. Development

Local only; no public DNS. Ports are already fixed by each app's `dev` script.

| URL | Serves |
|---|---|
| `http://localhost:3000` | Nirogix Portal |
| `http://localhost:3001` | Marketing site |
| `http://localhost:4000` | REST API (`/api/v1`) |

A shared cloud dev tier is **not** provisioned. Two deployed environments are the minimum that lets a release be verified; a third earns its keep only when several developers need to integrate against a running stack at once. If that day comes the naming already accommodates it — `dev.nirogix.com`, `portal-dev.nirogix.com`, `api-dev.nirogix.com` — with no restructuring.

## 5. What deliberately does *not* get a subdomain

| Candidate | Decision | Why |
|---|---|---|
| Admin / backoffice | Route inside the Portal | The System Admin surface is already a separate application *context* with its own navigation, permissions, and audit expectations (ADR-037). A separate host would fork the session model and double the auth surface to protect, for a boundary the permission system already enforces server-side. |
| Authentication / SSO | `api.nirogix.com` | Tokens are minted by the API and the refresh cookie is scoped to that host. A dedicated `id.` host is worth it only for federated SSO across several products or a hospital-side IdP integration — neither is in scope. It can be added later without moving anything, because the Portal already reads its API base URL from configuration. |
| Webhooks | `api.nirogix.com/api/v1/webhooks/*` | Inbound webhooks need the same request validation, rate limiting, idempotency, and audit trail as every other endpoint (`resources/rules.md` → API Rules). A separate host would duplicate all four. |
| Per-tenant hosts (`citycare.nirogix.com`) | Not now | Tenant context comes from the authenticated session, never from the URL (a non-negotiable invariant). Per-tenant vanity hosts would need per-host certificates, a tenant-to-host resolution step, and a second way to establish tenancy. Revisit only as an Enterprise-track request, with an ADR. |
| Customer-facing patient portal | Not yet | Out of current scope. When it arrives it is `my.nirogix.com` — a different audience and a different threat model from the staff Portal, so it gets its own origin. |

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

| Variable | Local | Staging | Production |
|---|---|---|---|
| `API_PUBLIC_URL` (backend) | `http://localhost:4000` | `https://api-staging.nirogix.com` | `https://api.nirogix.com` |
| `CORS_ORIGINS` (backend) | *(permissive in dev)* | `https://portal-staging.nirogix.com,https://staging.nirogix.com` | `https://portal.nirogix.com,https://nirogix.com` |
| `OPENAPI_UI_ENABLED` (backend) | `true` | `true` | `false` — the JSON spec is always served; the interactive UI is not exposed in production |
| `NEXT_PUBLIC_API_BASE_URL` (Portal) | `http://localhost:4000/api/v1` | `https://api-staging.nirogix.com/api/v1` | `https://api.nirogix.com/api/v1` |
| `NEXT_PUBLIC_SITE_URL` (marketing) | `http://localhost:3001` | `https://staging.nirogix.com` | `https://nirogix.com` |
| `NEXT_PUBLIC_PORTAL_LOGIN_URL` (marketing) | `http://localhost:3000/login` | `https://portal-staging.nirogix.com/login` | `https://portal.nirogix.com/login` |

## 9. Cutover checklist

1. Add the `A` records for the production and staging hosts in the GoDaddy zone, pointing at the VM's public IP; confirm each resolves before requesting certificates.
2. Set the environment matrix above on each host; confirm `CORS_ORIGINS` lists that environment's origins only.
3. Put Nginx basic auth in front of the three staging hosts, add the `X-Robots-Tag: noindex` header, and set `NEXT_PUBLIC_ENVIRONMENT=staging` so the marketing app also serves `Disallow: /`.
4. Confirm `www` → apex is a 301 and that the marketing canonical URLs resolve to the apex.
5. Confirm the refresh cookie arrives with `Secure; HttpOnly; SameSite=Lax` and **no** `Domain`, on the API host only.
6. Publish DKIM/SPF/DMARC for `mail.nirogix.com` before the first real notification send (this is also blocked on MSG91 DLT registration — `BACKLOG.md` I-1).
7. Point `docs`, `status`, and `cdn` when each is actually built; until then they stay documented and unrouted.
