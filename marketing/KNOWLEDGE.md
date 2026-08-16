# marketing — KNOWLEDGE.md

Current state of the public marketing / SEO site. Read after root `CLAUDE.md` and `marketing/AGENTS.md`. See `DONE.md` for the chronological log.

> ⚠ **Next.js 16 (App Router, Turbopack, React 19).** Read the version-matched docs in `node_modules/next/dist/docs/` (hoisted to the repo-root `node_modules`) before writing routing/rendering code.

## Purpose

The public-facing product site (unauthenticated). It presents the product across a full marketing surface and routes visitors either to **Book a demo** (`/contact`) or to the **Portal login** (existing customers). It carries no auth and calls no API.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + TypeScript, **Tailwind v4**
- **Design language:** the canonical **HMS Design System** (`resources/DESIGN.md`) — deep-teal signature on cool-neutral surfaces, clinical precision, minimal ornament. Implemented as a **marketing** token layer (`--mk-*` in `app/globals.css`, Light-only), the same language the Portal uses (via `@hms/ui`'s `--hms-*`).
- **`@hms/ui`** is still imported (`@hms/ui/styles.css`) so that real product-UI previews (framed `@hms/ui` components) render as the genuine Portal.
- **Icons:** `lucide-react` only (project-wide icon library).
- Static — all pages prerender; no backend calls, no auth.

## Design system (marketing)

- Tokens in `app/globals.css`, namespaced `--mk-*` and mapped into Tailwind's `@theme` (utilities like `bg-canvas`, `text-ink`, `text-accent`, `rounded-xl`).
  - Canvas `#f4f7f7` (cool off-white, never cream) · surface `#fff` · hairline `#dbe6e7` · ink `#0f1e24` · ink-muted / subtle / faint · **accent = deep teal `#0e7490`** (the primary CTA is the teal accent).
  - Radii: buttons/inputs 8px, cards 12px, product tiles 16px, CTA banners 24px. Minimal, teal-tinted depth — mostly hairline borders + surface-on-canvas lift.
  - Type: **Geist** at 600 for display with negative tracking, 400 body. Helpers `.mk-display` / `.mk-heading` / `.mk-lede`.
- **Light + Dark** (`data-theme` on `<html>`, `--mk-*` dark block in `globals.css`). `lib/theme.tsx` provides the toggle (Sun/Moon in the navbar, desktop + mobile), persisted under `mk-theme`, first visit honours `prefers-color-scheme`; a no-flash script in `layout.tsx` paints it before hydration. Framed `@hms/ui` product previews follow the same `data-theme`.
- Motion: restrained (design-taste dials VARIANCE 6 / MOTION 3 / DENSITY 3). `Reveal` does a soft fade-up via IntersectionObserver, fully static under `prefers-reduced-motion`.

## shadcn/ui — CLI + reference layer (ADR-028)

Installed, but **not** a second kit: the marketing components in `components/ui/*` and `@hms/ui` stay canonical.

- `components.json` (style `base-nova`, base `base` = Base UI, Lucide) with the `ui` alias pointed at **`@/components/shadcn`** — deliberately *not* `components/ui`, because `shadcn init` overwrote the site's own `Button.tsx` on first run (restored from git). Generated components land in their own folder and can never clobber the marketing kit. `lib/utils.ts` holds `cn` for them. Dependencies: `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`; the `shadcn` CLI is a devDependency.
- **`app/globals.css` re-points shadcn's semantic contract at `--mk-*`** (`--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--accent`, `--destructive`, `--border`, `--ring`, `--radius`), keeps `--font-sans` on Geist, drops shadcn's OKLCH palette and `.dark` block, and redefines `@custom-variant dark` to `[data-theme="dark"]`. `--color-accent` / `--color-secondary` stay bound to the marketing scale (`bg-accent` is the teal CTA). Platform-branding overrides (ADR-024) therefore reach shadcn components too.
- Usage rule: `npx shadcn@latest add <component>`, then review and restyle before it ships.

## Layout

```
app/
  layout.tsx            Root: Geist fonts, @hms/ui + globals styles, SiteHeader + SiteFooter,
                        Light theme, SEO metadata (title template, OG/Twitter), Organization JSON-LD
  globals.css           Tailwind + the --mk-* marketing design tokens + reveal/base styles
  page.tsx              Home (hero, trust strip, modular model, module bento, security, roles,
                        platform core, CTA)
  platform/page.tsx     Platform overview (pillars, entitlements, platform core, trust, CTA)
  modules/page.tsx      Full catalogue (25 modules grouped + 2 add-ons)
  modules/[slug]/page.tsx   Dedicated pages for the 7 clinic-core modules (generateStaticParams)
  solutions/page.tsx    By role + by facility
  security/page.tsx     Isolation, India residency (#residency), audit (#audit), practices, aligned-with
  integrations/page.tsx FHIR/ICD/SNOMED/LOINC, DICOM/PACS, ABDM, SMS/WhatsApp, payments, Tally
  pricing/page.tsx      Packaging model (no numbers), FAQ, contact CTA
  about/page.tsx        Mission, principles, company (Takoriya Technology LLP)
  contact/page.tsx      Book-a-demo form (ContactForm client component)
  legal/privacy|terms/  Plain-language summaries (draft, finalised with counsel before GA)
  sitemap.ts, robots.ts SEO routing
components/
  site/     SiteHeader (sticky nav + mobile hamburger), SiteFooter (dense grid),
            PageHeader, CtaSection, ContactForm, LegalPage
  ui/       Button, primitives (Container/Eyebrow/SectionHeading/Pill), Reveal
  product/  ProductFrame + previews (Appointments/Audit/Entitlements built from real @hms/ui)
  home/     Hero + sections
lib/
  site.ts       Nav, clinic modules, platform core, roles, facilities, trust facts, company
  catalogue.ts  Full 25-module grouping, platform pillars, integrations, pricing packages, FAQ
  portal.ts     PORTAL_LOGIN_URL (env-driven)
```

## Content guardrails (PRD Regulatory Register)

- **No prices / named tiers.** Pricing presents the packaging model (single module / clinic bundle / enterprise) with a "Talk to sales" CTA, never numbers.
- **No compliance-certification claims.** Security says "designed for / aligned with" DPDP / ABDM / GST and "hosted in India". HIPAA is never mentioned.
- **No fabricated social proof.** No fake customers, logos, or testimonials (there are no reference customers yet), and no popularity or adoption badge — the emphasised pricing package is labelled with a fact ("What we have built"), never "Most popular". Trust = honest architecture facts.
- **Onboarding is demo / sales led** (operator-driven), not public self-serve signup.

## Claim accuracy — the availability model (binding — ADR-038)

Nothing on this site is described as available unless it is built. Traceability to the PRD is necessary but **not sufficient**: the catalogue is a roadmap, and a roadmap read as an inventory is exactly the complaint this rule exists to prevent.

- **`lib/availability.ts`** is the single source of truth: `built` (implemented in the product, verified ahead of the first release) or `planned` (PRD scope scheduled in `resources/phases.md`, not built), plus `RELEASE_NOTE`, the one sentence that states the product's stage.
- **Every module and integration carries a `status`**, surfaced by `components/site/AvailabilityBadge.tsx` on the home bento, `/modules`, each module page header, and `/integrations`. `ReleaseNote` appears wherever the catalogue is presented (home, `/modules`, `/integrations`, `/pricing`).
- **Each clinic-core module splits `live` from `planned`** in `lib/site.ts`. `/modules/[slug]` renders "What it does today" from `live`, and planned PRD scope in a separate, clearly labelled block. The two lists never mix, and per-module SEO descriptions describe `live` only.
- **`/security` splits the same way** — "Enforced today" (RBAC, server-side validation and tiered rate limiting) vs "Commitment" (encryption standard, backups and the restore drill, PII masking, PCI-aligned payments). Hosting is written as a design commitment, because nothing is deployed yet.
- **Specialty content** (`lib/specialties.ts`) may only claim built capability; where a specialty needs something we do not have (imaging, reminders, family linking, package billing, form templates), the page says so in the same breath.
- **A status changes in the change that ships the feature** — moving a bullet from `planned` to `live`, or a module from `planned` to `built`, is part of that feature's Definition of Done, never a later marketing pass.

## Imagery (binding — ADR-038)

Default: **no image**. The visual language is typography, real product UI (framed `@hms/ui` previews), mockups, diagrams, data visualisation, brand geometry, and restrained motion. An image ships only when it communicates better than the type already there — and it is proposed first, stating the page/section, why it helps, the aspect ratio, the generation prompt, and how it stays on brand. No stock or generic healthcare photography, and no visual that implies a capability the product does not have.

## SEO / AEO / GEO (binding — ADR-027, `resources/rules.md` → SEO / AEO / GEO Rules)

This site owns **all** product SEO; the Portal is never indexed. Reference standard: the Claude SEO Skill (https://www.claudeseoskill.com/), subordinate to the content guardrails above.

**How it is built:** `lib/seo.ts` is the single source — `pageMetadata({ path, title, description })` returns the unique title + description, the **canonical**, and matching Open Graph + Twitter cards, so no route can silently inherit the layout's metadata. It also holds the JSON-LD builders (`organizationJsonLd`, `softwareApplicationJsonLd`, `localBusinessJsonLd`, `breadcrumbJsonLd`, `faqJsonLd`) and the `COMPANY` constant. `components/site/JsonLd.tsx` renders a block (server component, `null` renders nothing). `app/sitemap.ts` + `app/robots.ts` share `SITE_URL` from the same module.

**Live structured data:** `Organization` site-wide (root layout, `@id`-referenced by the rest) · `SoftwareApplication` on `/`, `/platform`, and each `/modules/[slug]` (no `offers` — no prices are published) · `BreadcrumbList` on every nested route · `FAQPage` on `/pricing`, marking up the FAQ that page actually renders · `LocalBusiness` on `/about` and `/contact`, **gated**: `localBusinessJsonLd()` returns `null` until `COMPANY.streetAddress` and `COMPANY.telephone` are filled in, so nothing false is published.

> ⚠ **Verify before launch:** `COMPANY` in `lib/seo.ts` currently states Ahmedabad, Gujarat, India, and `/contact`'s title/description name that city. Street address, postal code, phone, and email are intentionally blank. Confirm all of it with the business, in that one file.

**Required of every new/edited public route:** a unique title + meta description (no duplicates across routes), a canonical URL, exactly one `<h1>` with unskipped heading levels, semantic landmarks, OG/Twitter metadata, `alt` on every non-decorative image, a sitemap entry in the same change, a real internal link in (no orphans), a descriptive kebab-case URL (a rename ships a 301), and JSON-LD only for what the page actually shows — `SoftwareApplication` (product/platform/module), `LocalBusiness` (contact/about — Ahmedabad, Gujarat), `BreadcrumbList` (nested routes), `FAQPage` (only a real, visible FAQ). Never fabricated reviews/ratings.

**Keyword → page intent map** (used naturally in title/H1/body, or not at all — never stuffed):

| Page | Primary intent | Supporting terms |
|---|---|---|
| `/` | Hospital Management System · Hospital Management Software | Hospital Management System in India, Healthcare Management Software, HMS Software for Hospitals |
| `/platform` | Hospital ERP Software | Healthcare Management Software, multi-tenant hospital software |
| `/modules` | HMS Software for Hospitals | module-level terms for the catalogue |
| `/modules/[slug]` | the module's own term | Patient Management System · Hospital Appointment Management · Doctor Management System · Hospital Billing Software · Pharmacy Management · Laboratory Management System · Clinic Management Software |
| `/solutions` | Clinic Management Software | Hospital Management Software India, by-role / by-facility phrasing |
| `/pricing` | Hospital Management Software India | Best Hospital Management System in India (only as honest positioning, never a fabricated claim) |
| `/about`, `/contact` | Hospital Software Ahmedabad | Hospital Management Software Gujarat, Hospital Management System Gujarat |
| `/security`, `/integrations` | topical (India residency, ABDM/FHIR) | no location or commercial stuffing |

Module pages carry their own intent map (`MODULE_SEO` in `app/modules/[slug]/page.tsx`): Patient Management System · Hospital Appointment Management Software · OPD Management & Patient Check-in Software · EMR Software · Pharmacy Management Software for Hospitals · Laboratory Management System (LIS) · Hospital Billing Software.

**Open Graph cards:** generated per route by `lib/og.tsx` (`ogImage()` → `next/og` `ImageResponse`, 1200×630, prerendered at build). Each segment holds a three-line `opengraph-image.tsx`; `/modules/[slug]` generates one card per module via `generateStaticParams`. Next's file convention wires `og:image` + `twitter:image` automatically, so `pageMetadata()` never sets them. **`lib/og.tsx` holds the only hardcoded colours in the app** — Satori has no CSS custom properties, so the four hexes mirror `resources/DESIGN.md` §2 and must be changed with it.

**Not yet built:** location landing pages, resource/blog content, sitemap `lastModified` tracking. See root `BACKLOG.md`.

## API feedback (binding — ADR-026)

The site currently calls no API. When `ContactForm` is wired to a real endpoint, its result **must** go through the shared `@hms/ui` toast raised by the shared API client — displaying the backend's own message, handling network/timeout/validation/5xx, never a raw technical error. Do not build a form-local success/error banner.

## Performance (binding — `resources/rules.md`)

Fonts already use `next/font` (Geist / Geist Mono). **Outstanding:** no `next/image` usage yet — any content image added must use it (explicit dimensions, correct `sizes`, lazy by default, `priority` only for the true LCP image); below-the-fold heavy sections use `next/dynamic`; third-party scripts (none today) go through `next/script`; routes are measured against LCP ≤2.5s / INP ≤200ms / CLS ≤0.1.

## The Portal link (environment-aware)

- "Sign in" / "Go to Portal" actions link to `PORTAL_LOGIN_URL` (`lib/portal.ts`) from **`NEXT_PUBLIC_PORTAL_LOGIN_URL`** (default `http://localhost:3000/login`). Site metadata base URL is `NEXT_PUBLIC_SITE_URL` (default `http://localhost:3001`).

## Running

- Dev: `npm run dev -w marketing` → `http://localhost:3001`. Build: `npm run build -w marketing`. Typecheck: `npm run typecheck -w marketing`.

## Constraints / not-yet-built

- The demo-request form (`ContactForm`) is **inert on the static site** (no backend). Before launch, wire `handleSubmit` to a real endpoint / CRM (see the `TODO` in the component). Field names are stable for drop-in wiring.
- Legal pages are plain-language summaries; the binding documents are authored with counsel before GA.
- Non-flagship modules (18 of 25) are listed on `/modules` without dedicated pages; only the 7 clinic-core modules have `/modules/[slug]` pages.
- Resource/blog content is not yet built.
