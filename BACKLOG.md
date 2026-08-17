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
| ~~U-8~~ | ~~**Hospital profile fields for documents**~~ | **Resolved 2026-08-16.** Added at **organization level** (ADR-049): registered/legal name, two address lines, city, state, PIN, country, phone, email, website, registration number and GSTIN, edited by org_admin at `/settings/organization` and printed in the document header. A **per-branch override** was deliberately deferred — see E-1 below. | 2026-08-16 |
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
- **`Select`, `Dialog` and `Combobox` are still missing from `@hms/ui`** — files across the Portal, the patient app and the admin console use a hand-styled native `<select>` (the public registration form's gender picker is the newest). Pull them from shadcn (ADR-028) and restyle onto the tokens. *Resolved since this was written:* date and time entry (`DateField` / `TimeField` / `DateTimeField`, ADR-048) and `Textarea` (ADR-056) are in the kit.
- **shadcn footprint, after ADR-057 removed its Toast:** `@base-ui/react` is still a real runtime dependency — `DateField` uses its Popover — and `tw-animate-css` plus the token remap remain load-bearing for any future `shadcn add`. Still unused: `class-variance-authority`, `clsx`, `tailwind-merge`, and each app's generated `lib/utils.ts` (its `cn` duplicates `@hms/ui`'s). Prune those three packages if the next `shadcn add` does not need them — Select, Dialog and Command are the primitives `@hms/ui` still lacks, and they would.
- **Marketing has no toast, deliberately** (ADR-057): it has no authenticated API surface. Wiring `ContactForm` (U-2) is the change that would give it one — mount `<Toaster />` in its root layout at that point, and the `--hms-* → --mk-*` mapping already in its `globals.css` will theme it.
- **Lottie ships on every route in both apps.** Measured after `next build` (marketing): the largest client chunk is **340 KB on disk** and contains `lottie` + `lenis`, pulled in by the root layout's `LottiePreloader` and `SmoothScroll` — so every route pays for it before first interaction. Proposal needing a product call: keep the preloader eager (it is a deliberate first-paint veil) but load the **hero** animation through `next/dynamic`, or replace the preloader's Lottie with a token-driven CSS/SVG spinner and let `next/dynamic` carry `lottie-react` for the hero only. The same chunk is in the Portal.
- Marketing **resource/blog content** and location landing pages — the keyword map has room the site does not yet fill.
- Dedicated pages for the **18 non-flagship modules** (only the 7 clinic-core modules have `/modules/[slug]` pages).
- **On-demand revalidation** for platform branding on the marketing site (currently a 5-minute ISR window).
- **No Core Web Vitals baseline.** Nothing has been measured against the LCP ≤2.5s / INP ≤200ms / CLS ≤0.1 budgets on a real device profile. (Next 16's Turbopack build no longer prints First Load JS, so chunk sizes above were read off `.next/static/chunks`; a proper measurement needs Lighthouse or the analyzer.)
- Lint debt, pre-existing and repo-wide: `react-hooks/set-state-in-effect` (data-loading effects across Portal pages, `theme.tsx` in both apps) and four `react/no-unescaped-entities` in marketing copy. `npm run lint` fails on these today.
- **Automated tests run in 4 workspaces** (`npm run test` at the root): backend **119**, `@hms/ui` **73** (toast adapter + DataTable behaviour), `@hms/client` **12** (the error classifier, moved there with the shared HTTP core in ADR-054), `@hms/utils` **31** (dates, colour contrast). `hms_frontend` has none of its own and runs with `--passWithNoTests`. **Still missing:** component tests for `ConfirmDialog`/`NavDrawer` focus trapping, tests for the permission guards (`Can` / `RequirePermission`), and **Playwright end-to-end** for the critical workflow (register → book → check in → consult → dispense → bill → collect). Every P1 case in `testcases.md` is a candidate for automation — `QR-01`…`QR-06` most of all, since they guard the only unauthenticated write path.

- **Refresh rotation holds its transaction across the row update** (found while building the role dashboards, ADR-044). The client now sends a single in-flight refresh, which removes the storm, but the server still updates the `sessions` row inside a transaction that stays open across the round trip — a genuine burst (several tabs, or a slow network) can still queue on that row lock and drain the pool. Local reproduction: three `idle in transaction` sessions blocking six more, every request timing out. Belongs with the session-rotation work currently in flight; consider `SELECT … FOR UPDATE SKIP LOCKED` semantics, a shorter transaction, or accepting a rotation race and de-duplicating by token generation.

**Patient self-registration (ADR-056), follow-ups**
- **Nobody is told a request arrived.** The queue is a screen someone must remember to open. A notification to the front desk on submission — through the existing `NotificationService`, batched rather than one per scan — is the obvious next step, and is what stops a patient standing at a desk that never saw their details.
- **No duplicate detection on approval.** The front desk is told to check for an existing record, and nothing helps them: approving creates a new chart even when the phone number already belongs to a patient. Matching on phone/email at review time is a small change with a large effect on data quality, and the PRD lists duplicate detection under Registration.
- **A rejected or abandoned request is kept indefinitely.** It holds a name, a phone number and an email for someone who may never become a patient. This needs a retention rule alongside the wider data-lifecycle work — it is the one place the platform holds personal data for a non-patient.
- **The QR is generated in the browser.** Fine for a poster; a server-rendered PDF (A4, with the hospital's branding and instructions) is what a hospital will actually want to hand to a printer.
- **Only one QR per hospital.** No per-branch token, so a multi-branch hospital cannot tell which entrance a person scanned. The column is there (`branch_id` convention) if that turns out to matter.

**Environment seeders (ADR-058)** — the guard is built and refuses wrong-environment runs; the seeders themselves are not split yet
- **Staging seeder** — a deterministic, production-shaped dataset for QA, E2E and demos. Deterministic matters: E2E assertions depend on exact ids and counts, so it cannot reuse the development seeder's shape.
- **Production seeder** — bootstrap only: permission catalogue, system roles, and a first administrator where genuinely required. Behind `CONFIRM_PRODUCTION_SEED`, idempotent, documented, and reviewed by a second person before it is first run.
- `db:seed:staging` / `db:seed:production` npm scripts, and a `deploy/README.md` note on when each is run.

**Communication service (ADR-059)**
- **`CommunicationService` seam** — today `sendEmail` / `sendSms` are loose exports of `notification.service`; wrap them into the named service with `sendOtp` / `verifyOtp` / `resendOtp` so no module reaches past it.
- **OTP surface** — patient sign-in currently generates, hashes, stores and sends its own six-digit code inline (`patientIdentity.service`). That logic moves behind `sendOtp`/`verifyOtp` so staff MFA, contact verification and password reset reuse one implementation rather than growing a second.
- **Transactional coverage audit** — walk the whole workflow and confirm each of these either sends or has a recorded reason not to: sign-in code, email verification, mobile verification, password reset, hospital onboarding, hospital approval/rejection, eKYC status, user invitation, account activation, appointment confirmation / cancellation / reschedule, administrative notices. Send nothing beyond that list.
- **Email templates** — MSG91 email is template-based; the template ids belong in configuration with the copy reviewed before first send.

**Row actions (ADR-060)** — audit found tables with no correction path
- **`appointments`** — no row actions at all. Needs at least view, and reschedule / cancel per permission and appointment state.
- **`pharmacy/stock`** — no row actions. Needs edit for correcting a stock figure, and whatever adjustment the module's rules allow.
- **`billing`** — View only. An invoice raised against the wrong patient currently has no visible remedy.
- **`opd`** — View only; confirm against the queue's own workflow whether that is genuinely correct.
- **`patients`** — has View + Edit; still needs the deactivate path decided (soft, per ADR-060 and the retention policy) rather than left absent.
- Confirm the read-only tables are read-only *by decision*, and record that decision.

**Full-suite gate before manual QA**
- **No E2E suite exists yet.** The rule is written and binding; Playwright coverage for the critical workflow (sign-in → register patient → book → check in → consult → dispense → bill → collect) is what makes it enforceable rather than aspirational.
- Map `testcases.md` cases to automated coverage so the handover states which cases the suite already proves.

**Security follow-ups (from `SECURITY-AUDIT.md`)**
- **H-3** account-level brute-force lockout with backoff + an audit event at threshold (rate limiting alone does not stop a slow attack on one known email).
- **M-1** Content-Security-Policy for both apps (needs a nonce for the no-flash theme script); start report-only.
- **M-2 (partly fixed)** report date ranges are now validated and capped at 366 days, and `expensiveLimiter` covers the report + upload routes. **Still open:** a `statement_timeout` on the connection pool.
- **M-4** verify upload magic bytes server-side, not just the declared MIME type.
- **M-6** password policy beyond length for admin-created accounts; consider a breached-password check.
- **L-1..L-5** `server_tokens off`, confirm Swagger UI is off in production, request id in the audit row, an `npm audit` gate in CI, and a Portal idle-session timeout.
- **Deploy-time:** `CORS_ORIGINS` must be set to the real origins or cross-origin browser calls will be refused (by design).

**Hospital configuration — areas the console deliberately does not have (ADR-049)**

These are the tabs a hospital administrator expects from other HMS products and that this one does not offer. Each is a **data-model decision first and a screen second**, which is why none is stubbed: an empty tab is a promise the product cannot keep. The Hospital Setup Console derives its step list from what exists, so each of these gains a step the day the model lands.

- **E-1 · Per-branch profile override.** The organization profile is one row per tenant. A multi-branch group that prints each branch's own address and phone needs a nullable `branch_id` plus a resolve-branch-then-organization read in the document layer. Additive; blocked on nothing but demand.
- ~~**E-2 · Departments**~~ — **Done 2026-08-16 (ADR-050).** Real tenant-scoped entity with branch scoping, head of department, specialty link, activate/deactivate, a setup step, a provider link and a check-in picker. **Sub-departments are still not built and are not planned as a separate entity** — once the service catalogue lands (E-3), a "procedure" is a service in a department, and a third level would be taxonomy for its own sake. Reopen only with a customer case.
- **E-3 · Services and packages — the next real gap.** The only priced catalogues are the lab test master and the drug master, so a clinic cannot bill a dressing, an injection, a procedure, or distinguish a new consultation from a follow-up. Needs a `services` catalogue (code, name, department, price, tax, active) that Billing consumes as a line-item source, then packages on top of it. This is the one remaining item that blocks ordinary clinic billing; everything else below is genuinely later.

- **E-4 · Treatment plans.** Not in the PRD or any phase. Do not build without a scope decision first.
- **E-5 · Ward, room and bed setup.** Belongs to IPD (Phase 2). No infrastructure hierarchy exists.
- **E-6 · Billing, tax and payment configuration.** Tax is per invoice line today; there is no rate list, tax profile, payer catalogue or numbering-series configuration.
- **E-7 · Custom-role editor and the permission matrix screen.** Roles are seeded and assignable, and individual overrides work, but a hospital cannot clone or edit a role in the interface (also listed under Portal features).
- **E-8 · Appointment, scheduling and notification configuration.** Provider availability is data with no roster editor; no notification is triggered by a workflow, so there is nothing to configure yet.

**Five-frontend architecture (ADR-051, ADR-052, ADR-053) — ordered**

The decision and the host map are done (`DECISIONS.md`, `resources/domains.md`). `admin/` boots on :3003 against the real backend. What remains, in the order it should be built:

- ~~**F-1 · Move the platform surface out of `hms_frontend`**~~ — **Done 2026-08-16.** Platform dashboard, tenant management, module provisioning, support sessions, platform branding and the audit viewer now live only in `admin/`. The Portal keeps `/support/enter` (it *receives* a session) and the public platform-branding read (it applies the default at bootstrap). The support handoff was made genuinely cross-origin: each side names the other's origin from configuration instead of `window.location.origin`.
- ~~**F-2 · Patient identity backend (ADR-052)**~~ — **Done 2026-08-16.** Tables, principal-type claim on the token, both-direction boundary in `requireAuth` / `requirePatientAuth`, hospital-side grant and revoke, hashed single-use codes, uniform failure, per-request tenant resolution, and the patient read API (`/patient/auth/*`, `/patient/hospitals`, profile, appointments, invoices, lab reports) with OpenAPI. Verified live end to end. **Remaining for a usable portal: F-3 (the frontend) and wiring the grant into the patient-registration screen.**
- ~~**F-3 · `patient/` frontend**~~ — **Done 2026-08-16.** Two-step sign-in (contact → one-time code), hospital picker, and per-hospital records: profile, appointments, bills and resulted lab reports. Read-only. The Portal's patient screen gained a **Portal access** card, which is the only way a link is ever created.
- ~~**F-8 · Durable patient sessions**~~ — **Done 2026-08-16.** `patient_sessions` (its own table — `sessions` is FK'd to `users`), a refresh cookie scoped to `/api/v1/patient/auth` so it is never sent to a staff route, rotation, server-side revocation on sign-out, and a portal that restores the session on reload. **Found while testing it: refresh-token rotation did not actually rotate** — for staff either. Fixed and recorded as `SECURITY-AUDIT.md` H-4.
- ~~**F-4 · `aiportal/` authorization boundary (ADR-053)**~~ — **Done 2026-08-16.** The app runs on `:3004`: staff sign-in, a permission gate, and a landing screen that states plainly that no AI capability is enabled. Backend: `POST /ai/portal/session` behind `ai.portal.access` (held by **no role** — only WILDCARD reaches it), a patient principal refused by type before the permission is read, entry audited at notice, and `capabilities: []` returned deliberately. A test asserts the list stays empty, so adding a capability has to be a conscious change.
- **F-5 · `CORS_ORIGINS` and deploy config for five origins.** Nginx server blocks, PM2 entries, certificates and CI pipelines per app. `deploy/` currently knows about two frontends.
- **F-6 · Purchase `nirogix.ai`** and create its zone — it is not registered yet, so the AI Portal is development-only regardless of what is built (also `resources/domains.md` §10).
- ~~**F-7 · Shared frontend foundation**~~ — **Done 2026-08-16 (ADR-054).** `@hms/client` now owns the typed errors, the feedback layer, the HTTP core (`createApiClient`), the session endpoints, the session/permissions context and the permission guards. Domain endpoints stay per app on purpose. `patient` and `aiportal` are wired to it before they have any code of their own.

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
