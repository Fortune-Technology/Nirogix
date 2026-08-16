# BACKLOG.md — open items, in one place

Everything known-but-not-done: what is waiting on **you**, what is waiting on **infrastructure**, what is waiting on **engineering time**, and what is **deferred on purpose**. Nothing here is forgotten — if it is not in this file, it is not tracked.

**Rules for this file**
- An item is added the moment work is blocked, skipped, or knowingly deferred — in the same change that discovered it.
- An item is removed only when it is genuinely done (and recorded in the relevant `DONE.md`), or explicitly dropped with a reason.
- "Needs you" items name exactly what to supply and which file/decision it unblocks.

Related: `resources/memory.md` (Pending Decisions), `resources/development-plan.md` (Risk Register §30), `DECISIONS.md` (ADRs).

---

## 1. Needs a decision or information from you

| # | Item | What is needed | Unblocks | Added |
|---|---|---|---|---|
| U-1 | **Company location & contact facts** | Confirm the registered city/state (currently assumed **Ahmedabad, Gujarat, India**), plus street address, postal code, phone, and public email. | `COMPANY` in `marketing/lib/seo.ts` — drives the `/contact` title/description and the **LocalBusiness** structured data, which stays unemitted until a real address + phone exist. Also needed for local-intent SEO ("Hospital Software Ahmedabad"). | 2026-08-15 |
| U-2 | **Demo-request destination** | Where should the marketing contact form deliver — an email inbox, a CRM (which one), or a backend endpoint we build? | `marketing/components/site/ContactForm.tsx` is inert (no transmission). Wiring it also switches it onto the shared toast (ADR-026). | 2026-08-15 |
| U-3 | **Designed Nirogix logo** (optional) | A designed logo mark and a brand typeface, *if* the interim monogram is not what you want long term. | An interim mark now exists and is used everywhere — `BrandMark` in `@hms/ui` (N monogram, token-driven) across the Portal shell, login card, marketing header/footer, the OG cards, and both apps' `app/icon.svg`. A supplied logo replaces exactly those; the wordmark still renders as text in the brand font. | 2026-08-15 |
| ~~U-4~~ | ~~**Production domain**~~ | **Resolved 2026-08-16.** `nirogix.com` is registered and the full host map is `resources/domains.md` (ADR-042). The remaining work is DNS/TLS provisioning — see I-5. | 2026-08-15 |
| U-8 | **Hospital profile fields for documents** | The hospital's registered address, phone, email, website, and registration / GST number — and whether they are per-organization, per-branch, or both. | Printed documents (ADR-047) render the hospital's name, logo and accent, and nothing else, because those fields are not in the schema. A tax invoice legally needs the supplier's address and GSTIN; the document deliberately shows no placeholder rather than an invented one. Unblocks a complete invoice header and the branding admin form that would capture them. | 2026-08-16 |
| U-5 | **Compliance owner** | Name someone accountable for the Regulatory Verification & Compliance Source Register. | Every row is "Pending Verification" (`resources/memory.md`), including the India-residency legal basis in ADR-006. Until owned, marketing must keep saying "designed for / aligned with", never "certified". | pre-existing |
| U-6 | **Legal review of the legal pages** | Counsel-approved Privacy and Terms text. | `marketing/app/legal/*` are plain-language summaries marked draft; they must be replaced before GA. | pre-existing |
| U-7 | **Analytics decision** | Do we want product analytics at all, and if so which tool for the **marketing** site? (The Portal ships none by default and must never receive PHI.) | Nothing is installed. Adding any third-party script needs this decision plus a privacy review (rules → Frontend Performance). | 2026-08-15 |

## 2. Blocked on infrastructure / external parties

| # | Item | Blocked by | Notes |
|---|---|---|---|
| I-1 | Real notification send verified in staging | Staging VM + **MSG91 DLT template registration** (24–48h external) | Stage 0 exit criterion; the code and provider abstraction are done. |
| I-2 | Auto-deploy-to-staging half of CI/CD | The staging VM | `deploy-staging.yml` is authored but has never run against real hosts. |
| I-3 | Backup + restore drill executed for real | Managed PostgreSQL + object storage in staging | `deploy/backup.sh` + `restore-drill.sh` exist; RPO/RTO validated at Stage 3. |
| I-4 | **R2 bucket pinned to India** for PHI | Cloudflare account configuration | ADR-017 compliance note: R2 defaults to global auto-placement. If a stricter MeitY-empanelled guarantee is needed, switch to E2E Object Storage (same adapter, different endpoint). Buckets are per environment — `nirogix-documents` and `nirogix-documents-staging`, never shared. |
| I-5 | **DNS, TLS and staging access for `nirogix.com`** | The staging/production VMs | DNS is at **GoDaddy** and stays there (ADR-045); the staging `A` records (`staging`, `portal-staging`, `api-staging` → the VM) are **created**. Outstanding: **remove the apex `@` record** currently pointing at the staging box, issue **Let's Encrypt** certificates per host on the VM, put **Nginx basic auth + `X-Robots-Tag: noindex`** in front of the three staging hosts, set `CORS_ORIGINS` and `NEXT_PUBLIC_ENVIRONMENT=staging` per environment, and publish SPF/DKIM/DMARC for `mail.nirogix.com` before the first real send (also gated by I-1). `cdn` is **blocked** — an R2 custom domain needs the zone on Cloudflare; signed URLs cover PHI delivery meanwhile. |

## 3. Engineering follow-ups (no external blocker)

**Frontend**
- **Every Portal table now runs on the Standard DataTable with a full configuration** (sorting, search, faceted filters, column visibility, configurable paging). Server mode is used where the API paginates — patients, audit, appointments, billing. Remaining table follow-ups: **saved views / shareable filter presets**, **row selection with bulk actions** (the table supports both; no module needs them yet), and **CSV export from the table itself** (only Reports exports today).
- **`Select`, `Dialog`, `Combobox`, `DatePicker` are still missing from `@hms/ui`** — 14 files use hand-styled native `<select>`, and date inputs are bare `<input type="date">`. Pull them from shadcn (ADR-028), restyle onto tokens, and route the date picker through `@hms/utils` so typed input stays `DD/MM/YYYY`.
- **shadcn footprint, after the toast adoption (ADR-032):** `@base-ui/react` is now a real runtime dependency (the Toast uses it) and `tw-animate-css` + the token remap are load-bearing. Still unused: `class-variance-authority`, `clsx`, `tailwind-merge`, and each app's generated `lib/utils.ts` (its `cn` duplicates `@hms/ui`'s). Prune those three packages if the next `shadcn add` does not need them — Select, Dialog, Command and Popover are the primitives `@hms/ui` still lacks, and they would.
- **Lottie ships on every route in both apps.** Measured after `next build` (marketing): the largest client chunk is **340 KB on disk** and contains `lottie` + `lenis`, pulled in by the root layout's `LottiePreloader` and `SmoothScroll` — so every route pays for it before first interaction. Proposal needing a product call: keep the preloader eager (it is a deliberate first-paint veil) but load the **hero** animation through `next/dynamic`, or replace the preloader's Lottie with a token-driven CSS/SVG spinner and let `next/dynamic` carry `lottie-react` for the hero only. The same chunk is in the Portal.
- Marketing **resource/blog content** and location landing pages — the keyword map has room the site does not yet fill.
- Dedicated pages for the **18 non-flagship modules** (only the 7 clinic-core modules have `/modules/[slug]` pages).
- **On-demand revalidation** for platform branding on the marketing site (currently a 5-minute ISR window).
- **No Core Web Vitals baseline.** Nothing has been measured against the LCP ≤2.5s / INP ≤200ms / CLS ≤0.1 budgets on a real device profile. (Next 16's Turbopack build no longer prints First Load JS, so chunk sizes above were read off `.next/static/chunks`; a proper measurement needs Lighthouse or the analyzer.)
- Lint debt, pre-existing and repo-wide: `react-hooks/set-state-in-effect` (data-loading effects across Portal pages, `theme.tsx` in both apps) and four `react/no-unescaped-entities` in marketing copy. `npm run lint` fails on these today.
- **Automated tests now run in 4 workspaces** (`npm run test` at the root): backend 49, `@hms/ui` 27 (toast adapter + DataTable behaviour), `hms_frontend` 12 (the error classifier), `@hms/utils` 18 (dates). **Still missing:** component tests for `ConfirmDialog`/`NavDrawer` focus trapping, tests for the permission guards (`Can` / `RequirePermission`), and **Playwright end-to-end** for the critical workflow (register → book → check in → consult → dispense → bill → collect). Every P1 case in `testcases.md` is a candidate for automation.

- **Refresh rotation holds its transaction across the row update** (found while building the role dashboards, ADR-044). The client now sends a single in-flight refresh, which removes the storm, but the server still updates the `sessions` row inside a transaction that stays open across the round trip — a genuine burst (several tabs, or a slow network) can still queue on that row lock and drain the pool. Local reproduction: three `idle in transaction` sessions blocking six more, every request timing out. Belongs with the session-rotation work currently in flight; consider `SELECT … FOR UPDATE SKIP LOCKED` semantics, a shorter transaction, or accepting a rotation race and de-duplicating by token generation.

**Security follow-ups (from `SECURITY-AUDIT.md`)**
- **H-3** account-level brute-force lockout with backoff + an audit event at threshold (rate limiting alone does not stop a slow attack on one known email).
- **M-1** Content-Security-Policy for both apps (needs a nonce for the no-flash theme script); start report-only.
- **M-2 (partly fixed)** report date ranges are now validated and capped at 366 days, and `expensiveLimiter` covers the report + upload routes. **Still open:** a `statement_timeout` on the connection pool.
- **M-4** verify upload magic bytes server-side, not just the declared MIME type.
- **M-6** password policy beyond length for admin-created accounts; consider a breached-password check.
- **L-1..L-5** `server_tokens off`, confirm Swagger UI is off in production, request id in the audit row, an `npm audit` gate in CI, and a Portal idle-session timeout.
- **Deploy-time:** `CORS_ORIGINS` must be set to the real origins or cross-origin browser calls will be refused (by design).

**Portal features**
- **Profile fields needing an additive migration:** phone, department, designation, avatar (`avatar_file_id`), and notification preferences. `/profile` deliberately omits them rather than showing empty placeholders (ADR-035); each needs a column, admin UI, and `testcases.md` cases.
- Password reset / email-invite flow for new users (today: one-time temporary password reveal).
- MFA challenge screen and branch switching are stubs.
- Per-branch branding overrides (schema supports `branch_id`; no UI).
- Custom-role editor; branch-scoped entitlement management UI.

**Platform (ADR-037 — System Admin context)**
- **Support sessions / impersonation** — the whole flow: `POST /admin/support-sessions` minting a session for a named tenant+user with `impersonatedBy` recorded, audit events on start and end, a persistent "support session" banner with an explicit exit, re-authentication or MFA before starting, and refusal to impersonate another platform operator. Security-critical, so it ships whole or not at all.
- **Platform dashboard needs a data source before it can be honest.** Real today: tenants, active/inactive, new registrations, platform users, doctors, branches, module distribution, failed logins, security events, recent activity. **No data exists** for revenue, MRR, ARR, subscription distribution, storage/infrastructure usage, uptime or support tickets — there is no subscription/plan/tenant-billing table at all. Building those tiles requires the Enterprise-track billing model first (ADR-020).
- **Scoped support roles** — different support staff with different cross-tenant reach, using the new `platform.support.*` keys rather than WILDCARD.
- **Platform sidebar depth** — Subscriptions & Billing, Revenue, Platform Users, Support Sessions, Analytics, System Health, Feature Flags, Integrations, Platform Settings. Each needs its own data source; add them as the data becomes real.

**Platform**
- `platform_metrics` snapshot for cross-tenant analytics at scale (ADR-023 currently aggregates per tenant in a loop).
- Break-glass emergency access — architecture and insertion point reserved (ADR-011), feature not built.

## 4. Deferred on purpose (recorded so it is not re-litigated)

- **Public self-registration and payment-integrated self-serve plans** — Enterprise/Scale track (`resources/development-plan.md` §25, ADR-020). Onboarding stays operator-driven.
- **Microservices / Kubernetes / message broker** — needs a new ADR (ADR-001).
- **Named pricing tiers and published prices** on the marketing site — content guardrail until commercial terms exist.
- **HIPAA / certification claims** — never asserted; see U-5.
