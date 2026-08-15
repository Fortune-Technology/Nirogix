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
| U-3 | **Public brand assets** | A real logo mark (SVG/PNG) and a brand typeface choice for social cards, *if* the generated Open Graph cards are not what you want. | The OG cards are **built and live** (`marketing/lib/og.tsx`, one per route) but use a plain teal square as the mark and the renderer's default font — a supplied logo/wordmark would replace both. | 2026-08-15 |
| U-4 | **Production domain** | The real public domain for the marketing site and the Portal host. | `NEXT_PUBLIC_SITE_URL` (canonicals, sitemap, robots, OG URLs) and `NEXT_PUBLIC_PORTAL_LOGIN_URL`. Canonical URLs are wrong on a placeholder domain. | 2026-08-15 |
| U-5 | **Compliance owner** | Name someone accountable for the Regulatory Verification & Compliance Source Register. | Every row is "Pending Verification" (`resources/memory.md`), including the India-residency legal basis in ADR-006. Until owned, marketing must keep saying "designed for / aligned with", never "certified". | pre-existing |
| U-6 | **Legal review of the legal pages** | Counsel-approved Privacy and Terms text. | `marketing/app/legal/*` are plain-language summaries marked draft; they must be replaced before GA. | pre-existing |
| U-7 | **Analytics decision** | Do we want product analytics at all, and if so which tool for the **marketing** site? (The Portal ships none by default and must never receive PHI.) | Nothing is installed. Adding any third-party script needs this decision plus a privacy review (rules → Frontend Performance). | 2026-08-15 |

## 2. Blocked on infrastructure / external parties

| # | Item | Blocked by | Notes |
|---|---|---|---|
| I-1 | Real notification send verified in staging | Staging VM + **MSG91 DLT template registration** (24–48h external) | Stage 0 exit criterion; the code and provider abstraction are done. |
| I-2 | Auto-deploy-to-staging half of CI/CD | The staging VM | `deploy-staging.yml` is authored but has never run against real hosts. |
| I-3 | Backup + restore drill executed for real | Managed PostgreSQL + object storage in staging | `deploy/backup.sh` + `restore-drill.sh` exist; RPO/RTO validated at Stage 3. |
| I-4 | **R2 bucket pinned to India** for PHI | Cloudflare account configuration | ADR-017 compliance note: R2 defaults to global auto-placement. If a stricter MeitY-empanelled guarantee is needed, switch to E2E Object Storage (same adapter, different endpoint). |

## 3. Engineering follow-ups (no external blocker)

**Frontend**
- **Every Portal table now runs on the Standard DataTable with a full configuration** (sorting, search, faceted filters, column visibility, configurable paging). Server mode is used where the API paginates — patients, audit, appointments, billing. Remaining table follow-ups: **saved views / shareable filter presets**, **row selection with bulk actions** (the table supports both; no module needs them yet), and **CSV export from the table itself** (only Reports exports today).
- **`Select`, `Dialog`, `Combobox`, `DatePicker` are still missing from `@hms/ui`** — 14 files use hand-styled native `<select>`, and date inputs are bare `<input type="date">`. Pull them from shadcn (ADR-028), restyle onto tokens, and route the date picker through `@hms/utils` so typed input stays `DD/MM/YYYY`.
- **shadcn dependencies are installed but unused so far** (ADR-028): `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` in both apps, plus a `lib/utils.ts` whose `cn` duplicates `@hms/ui`'s. Nothing imports them until the first `shadcn add`, so they do not reach the browser bundle — but if the reference layer goes unused for a while, prune them (`shadcn` CLI can stay as a devDependency). Decide after the first real use: Select, Dialog, Command, and Popover are the primitives `@hms/ui` lacks.
- **Lottie ships on every route in both apps.** Measured after `next build` (marketing): the largest client chunk is **340 KB on disk** and contains `lottie` + `lenis`, pulled in by the root layout's `LottiePreloader` and `SmoothScroll` — so every route pays for it before first interaction. Proposal needing a product call: keep the preloader eager (it is a deliberate first-paint veil) but load the **hero** animation through `next/dynamic`, or replace the preloader's Lottie with a token-driven CSS/SVG spinner and let `next/dynamic` carry `lottie-react` for the hero only. The same chunk is in the Portal.
- Marketing **resource/blog content** and location landing pages — the keyword map has room the site does not yet fill.
- Dedicated pages for the **18 non-flagship modules** (only the 7 clinic-core modules have `/modules/[slug]` pages).
- **On-demand revalidation** for platform branding on the marketing site (currently a 5-minute ISR window).
- **No Core Web Vitals baseline.** Nothing has been measured against the LCP ≤2.5s / INP ≤200ms / CLS ≤0.1 budgets on a real device profile. (Next 16's Turbopack build no longer prints First Load JS, so chunk sizes above were read off `.next/static/chunks`; a proper measurement needs Lighthouse or the analyzer.)
- Lint debt, pre-existing and repo-wide: `react-hooks/set-state-in-effect` (data-loading effects across Portal pages, `theme.tsx` in both apps) and four `react/no-unescaped-entities` in marketing copy. `npm run lint` fails on these today.
- **No frontend tests** anywhere (Playwright / RTL). Verification is `next build` + live walkthrough.

**Portal features**
- Password reset / email-invite flow for new users (today: one-time temporary password reveal).
- MFA challenge screen and branch switching are stubs.
- Per-branch branding overrides (schema supports `branch_id`; no UI).
- Custom-role editor; branch-scoped entitlement management UI.

**Platform**
- `platform_metrics` snapshot for cross-tenant analytics at scale (ADR-023 currently aggregates per tenant in a loop).
- Break-glass emergency access — architecture and insertion point reserved (ADR-011), feature not built.

## 4. Deferred on purpose (recorded so it is not re-litigated)

- **Public self-registration and payment-integrated self-serve plans** — Enterprise/Scale track (`resources/development-plan.md` §25, ADR-020). Onboarding stays operator-driven.
- **Microservices / Kubernetes / message broker** — needs a new ADR (ADR-001).
- **Named pricing tiers and published prices** on the marketing site — content guardrail until commercial terms exist.
- **HIPAA / certification claims** — never asserted; see U-5.
