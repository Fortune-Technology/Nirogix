# marketing — DONE.md

Append-only implementation log. Newest at the bottom.

---

## 2026-08-14 — Public marketing scaffold + Portal login link (Phase 0 / Task #13)

**What:** The public product site, brand-consistent with the Portal, whose primary job is to route visitors to the Portal login.

**Added:**
- `app/layout.tsx` — fonts, `@hms/ui/styles.css`, shared `SiteHeader` + `SiteFooter`, Light theme, SEO `metadata` (title/description).
- `app/page.tsx` — landing: hero (headline + subcopy + CTA), a 4-card feature grid (multi-tenant/RLS, RBAC, per-hospital modules, India-resident + audit), and a closing sign-in CTA.
- `components/SiteHeader.tsx` / `SiteFooter.tsx` — logo + Portal sign-in actions.
- `lib/portal.ts` — `PORTAL_LOGIN_URL` from `NEXT_PUBLIC_PORTAL_LOGIN_URL` (env-driven, never hard-coded).
- `globals.css` — Tailwind + maps `--hms-*` tokens into `@theme`. `next.config.ts` `transpilePackages: ['@hms/ui']`. `@hms/ui` dependency added.

**API/DB/frontend/integration:** No backend or DB. Consumes `@hms/ui` for design consistency; hands off to the Portal (`hms_frontend`) for login. No auth on this site.

**Testing status:** `typecheck` green · `next build` green (`/` + `/_not-found` prerender static). **Live-verified in-browser:** landing renders with the shared design tokens (Light theme, brand `#0e7490` applied to primitives); **all five sign-in actions** (header link, header button, hero button, CTA button, footer link) resolve to `http://localhost:3000/login` (the `NEXT_PUBLIC_PORTAL_LOGIN_URL` default); no console errors.

**Decisions:** Marketing shares `@hms/ui` so the public site and app are one brand. The Portal link is environment-aware (env var), so staging/production point at the right Portal without code changes. Site is static (no API/auth) — it only hands off to the Portal.

**Known limitations:** Single landing page; real SEO (JSON-LD, sitemap, robots), content pages, and pricing come in a later marketing phase. Light-only.

---

## 2026-08-14 — Full marketing site: design system + all pages (Phase 1)

**What:** The marketing scaffold became a complete, production-ready SaaS/HMS marketing site, built on the `resources/Default-DESIGN-intercom.md` editorial design language and Lucide icons, grounded in the PRD/user-journeys.

**Design system:** `app/globals.css` now carries a marketing-only token layer (`--mk-*`: cream `#f5f1ec` canvas, charcoal `#111` ink, hairline `#d3cec6`, accent = HMS brand teal `#0e7490`, modest radii, no drop shadows), mapped into Tailwind `@theme`. Geist substitutes Saans (500 display w/ negative tracking, 400 body). Deliberately separate from the Portal's `@hms/ui` clinical system; `@hms/ui` is still imported so real product-UI previews render as the genuine Portal.

**Added:**
- **UI kit:** `components/ui/Button` (charcoal primary / teal accent / white secondary / ghost), `primitives` (Container, Eyebrow, SectionHeading, Pill), `Reveal` (IntersectionObserver fade-up, reduced-motion safe).
- **Chrome:** `SiteHeader` (sticky editorial nav + mobile hamburger), `SiteFooter` (dense link grid). Replaced the old root-level `components/SiteHeader/SiteFooter`.
- **Product previews:** `ProductFrame` + `previews` (Appointments / Audit / Entitlements) built from **real `@hms/ui` components** with illustrative India-context data (no fake div screenshots, no real PHI).
- **Shared page parts:** `PageHeader`, `CtaSection`, `ContactForm`, `LegalPage`.
- **Pages (23 routes):** Home; `/platform`; `/modules` (25 grouped + 2 add-ons) and `/modules/[slug]` (7 clinic-core modules, SSG); `/solutions` (by role + facility); `/security` (isolation / residency / audit / practices / aligned-with, guardrailed); `/integrations`; `/pricing` (packaging model + FAQ, no numbers); `/about`; `/contact` (demo form); `/legal/privacy` + `/legal/terms`; plus `sitemap.ts` + `robots.ts`.
- **Content data:** `lib/site.ts` + `lib/catalogue.ts` as the grounded source of truth.
- **SEO:** per-page metadata with title template, OpenGraph/Twitter, Organization JSON-LD, sitemap, robots.
- **Dependency:** `lucide-react` added to `marketing` (and `hms_frontend`) as the project-wide icon library.

**Content guardrails honoured:** no pricing numbers, no compliance-certification claims, no HIPAA, no fabricated customers/logos/testimonials, demo-led (not self-serve) onboarding.

**Testing status:** `typecheck` green · `next build` green (23 routes; 7 module pages SSG; robots.txt + sitemap.xml emitted). **Live-verified in-browser** (localhost:3001) across `/`, `/platform`, `/modules`, `/modules/appointments`, `/pricing`, `/security`, `/contact`: design tokens resolve (cream/charcoal/teal, Geist, negative tracking), **zero em/en-dashes** in copy, **no horizontal overflow** at 375 / 768 / 1280 (fixed a grid `min-width:auto` overflow where wide product tiles could not shrink), nav collapses to hamburger < 1024 and shows full links ≥ 1024 (65px tall), no live console errors.

**Decisions:** Marketing uses the Intercom editorial language (docs win); the same language will be **adapted** into `@hms/ui` for the Portal in Phase 2, preserving Dark theme, per-tenant branding, and clinical table density (per user direction; overrides development-plan §15's marketing-only framing). "Product mockups" are real `@hms/ui` previews rather than generated/faked images. No fake social proof given no reference customers yet.

**Known limitations:** demo form is inert on the static site (wire `handleSubmit` to a real endpoint before launch — field names are stable); legal pages are plain-language summaries pending counsel; 18 non-flagship modules have no dedicated pages; no blog/resources yet.

---

## 2026-08-14 — Retrofit to the HMS Design System (custom, replaces Intercom)

**What:** Swapped the marketing surface from the Intercom exploration to the approved custom **HMS Design System** (`resources/DESIGN.md`), the same language the Portal now uses.

**Changed:** `app/globals.css` `--mk-*` token values only — cool-neutral surfaces (canvas cream `#f5f1ec` → cool off-white `#f4f7f7`, surface-2 `#eaf1f1`), ink `#0f1e24`, hairline `#dbe6e7`, surface-ink `#0e1f26`; deep-teal accent retained. `.mk-display` weight 500→600, tracking -0.03em. `components/ui/Button` primary changed from charcoal to the teal accent (per DESIGN.md §5). No component markup changed — the whole site re-skinned through the tokens.

**Testing status:** `typecheck` + `next build` green (23 routes). Live-verified: body ground now `#f4f7f7`, ink `#0f1e24`, accent teal; no horizontal overflow.

---

## 2026-08-14 — Frontend rules: Lenis, back-to-top, route scroll-top, navbar About/Contact

**What:** Applied the permanent frontend rules (`resources/DESIGN.md` §9) to the marketing site.

**Changed:**
- `app/layout.tsx` — wrapped in the shared `SmoothScroll` (Lenis + route scroll-to-top) with a `BackToTop`, both from `@hms/ui`.
- `components/site/SiteHeader.tsx` — the mobile menu now uses the shared `useScrollLock(open)` (stops Lenis + locks background) instead of a manual `body.overflow` toggle.
- `lib/site.ts` — `NAV_LINKS` now includes **About** and **Contact** (7 links; verified single-line at desktop, and rendered in the mobile menu).
- `components/ui/Button.tsx` — cleaned the discriminated-union destructure (removed unused discard vars).
- Removed the leftover create-next-app demo SVGs from `public/`.

**Testing status:** `typecheck` + `next build` green (23 routes). Live-verified: Lenis active (`html.lenis`), 7 nav links incl. About/Contact with no nav overflow, `BackToTop` in the DOM, page scrollable, no console errors.

---

## 2026-08-14 — Light/Dark theme + dynamic platform branding (ADR-024)

**Light/Dark:** `lib/theme.tsx` (`ThemeProvider` + Sun/Moon toggle in the navbar, desktop + mobile), a `[data-theme="dark"]` `--mk-*` block, a no-flash script in `layout.tsx`, persisted under `mk-theme` (first visit honours `prefers-color-scheme`). Framed `@hms/ui` previews follow the same attribute. Verified: dark tokens resolve (canvas `#0b1418`), no overflow at 1280/1024/375.

**Dynamic branding:** the site trades fully-static for **ISR-dynamic** to pick up System-Admin-set colours.
- `lib/branding.ts` — server-side fetch of `GET /public/branding/marketing` (`revalidate: 300`), maps the theme-safe **brand-family** tokens (primary/secondary/accent/button) → `--mk-*` (neutrals stay theme-managed), defaults button text to white on a custom accent, falls back to built-in tokens if the API is down.
- `app/layout.tsx` — async; applies the overrides as inline `--mk-*` on `<html>` (both themes, no flash).
- `globals.css` — accent tints now derive from `--mk-accent` via `color-mix` (one value cascades); added `--mk-secondary`.

**Testing status:** `typecheck` + `next build` green (routes now ISR, `Revalidate 5m`). **Live-verified end-to-end:** super-admin set marketing `primary=#7c3aed` → the site injected `--mk-accent: #7c3aed`; primary button + wordmark went violet; reset reverts within the 5-min ISR window. On-demand revalidation (instant) is a noted follow-up.

---

## 2026-08-14 — Hero doctor animation + ambulance preloader

**What:** Replaced the hero's product mockup with a Lottie doctor animation, and added the shared Lottie preloader.

**Changed:**
- `public/animations/{doctor,ambulance}.json` — moved out of the repo root into the app's public assets (root cleaned).
- `components/home/Hero.tsx` — **removed** the `portal.hms · appointments` `ProductFrame` + `AppointmentsPreview` from the hero; replaced with the **doctor Lottie** (`@hms/ui` `LottiePlayer`, `src="/animations/doctor.json"`, loop + autoplay, responsive `max-w`, no container/border per the design). `ProductFrame`/`AppointmentsPreview` are still used on other pages (modules/security/platform), so nothing was orphaned.
- `app/layout.tsx` — added the shared `LottiePreloader` (`src="/animations/ambulance.json"`).

**Testing status:** `typecheck` + `next build` green. **Live-verified:** the hero renders the doctor Lottie (SVG), the appointments table is gone from the hero, no horizontal overflow; the ambulance preloader shows on load then unmounts and restores scroll; no console errors.

---

## 2026-08-15 — SEO/AEO/GEO: per-page metadata, canonicals, structured data (ADR-027)

**What:** The marketing site now owns product SEO properly — every public route has its own intent-matched metadata, a canonical, social cards, and honest structured data. (The Portal was made `noindex, nofollow` in the same change.)

**Added:**
- `lib/seo.ts` — the single SEO source: `SITE_URL`, `canonicalUrl()`, `pageMetadata()` (unique title + description → canonical + Open Graph + Twitter), the `COMPANY` constant, and JSON-LD builders `organizationJsonLd` / `softwareApplicationJsonLd` / `localBusinessJsonLd` / `breadcrumbJsonLd` / `faqJsonLd`.
- `components/site/JsonLd.tsx` — renders a structured-data block; `null` renders nothing (server component, no client JS).

**Changed:**
- Every route now calls `pageMetadata()` with an intent-matched title: `/` "Hospital Management System Software for Hospitals & Clinics" · `/platform` "Hospital ERP Software Platform" · `/modules` "HMS Software Modules for Hospitals" · `/solutions` "Clinic & Hospital Management Software by Role" · `/pricing` "Hospital Management Software Pricing in India" · `/security` "Security, Tenant Isolation & India Data Residency" · `/integrations` "Healthcare Integrations — FHIR, ABDM, DICOM & Payments" · `/about` "About Takoriya Technology LLP" · `/contact` "Book a Demo — Hospital Software in Ahmedabad" · both legal pages. `/modules/[slug]` gained a `MODULE_SEO` map (Patient Management System, Hospital Appointment Management Software, OPD Management & Patient Check-in Software, EMR Software, Pharmacy Management Software for Hospitals, Laboratory Management System (LIS), Hospital Billing Software); an unknown slug returns `noindex`.
- Structured data: `Organization` in the root layout (now from `lib/seo.ts`, `@id`-referenced elsewhere) · `SoftwareApplication` on `/`, `/platform`, and each module page (deliberately **no** `offers` — no prices are published) · `BreadcrumbList` on every nested route · `FAQPage` on `/pricing` for the FAQ that page renders · `LocalBusiness` on `/about` + `/contact`, emitted **only** once a real street address and phone exist.
- `app/sitemap.ts` / `app/robots.ts` now share `SITE_URL` from `lib/seo.ts` instead of each re-reading the env var.
- Removed the now-unused `SITE` import from `/contact`.

**Open item:** `COMPANY` states Ahmedabad, Gujarat, India (matching the target keywords) with address/phone/email blank — confirm with the business before launch; that one constant drives the contact copy and the gated LocalBusiness markup. Per-page OG images are still outstanding.

**Testing status:** `typecheck` green · `next build` green (23 routes, all prerendered) · eslint clean on every changed file (only the repo's four pre-existing `react/no-unescaped-entities` findings remain, untouched).

---

## 2026-08-15 — Per-route Open Graph cards

**What:** Every public route now ships its own 1200×630 social card instead of sharing one text-only preview.

**Added:**
- `lib/og.tsx` — `ogImage({ title, eyebrow })` renders the card through `next/og`'s `ImageResponse`: deep ink ground, teal mark + `HMS` wordmark, section eyebrow, the page's own headline (auto-shrinks past 46 characters), and a teal rule with the positioning line. Satori has no CSS custom properties, so this file holds the **only** hardcoded colours in the app, each annotated against `resources/DESIGN.md` §2.
- `opengraph-image.tsx` in `app/`, `platform/`, `modules/`, `solutions/`, `security/`, `integrations/`, `pricing/`, `about/`, `contact/` (three lines each), plus `app/modules/[slug]/opengraph-image.tsx` which generates one card per clinic module via `generateStaticParams`.

**Testing status:** `typecheck` + `next build` green — 39 static pages, every `*/opengraph-image` route prerendered. **Live-verified:** `/pricing` emits `og:image` + `twitter:image` (1200×630, `image/png`, alt "Pay for the modules you turn on"); fetched the PNG and confirmed it renders the wordmark, the "· PRICING" eyebrow, the headline, and the teal rule.

**Follow-ups (root `BACKLOG.md`):** a real logo mark and brand typeface would replace the placeholder square and the renderer's default font (U-3).

---

## 2026-08-15 — shadcn/ui installed as a CLI + reference layer (ADR-028)

**What:** `shadcn init` run against the marketing site so `shadcn add` and the shadcn agent skill work here, without displacing the marketing component kit.

**Added:** `components.json` (template `next`, base `base` = Base UI, preset `nova`, Lucide), `lib/utils.ts`. Dependencies `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`; the `shadcn` CLI moved to **devDependencies**.

**Incident + guard:** init **overwrote `components/ui/Button.tsx`** — the site's own token-driven button — which was restored from git. The `ui` alias now points at **`@/components/shadcn`**, so generated components land in their own folder and the CLI can never clobber the marketing kit again.

**Changed — `app/globals.css`, reconciled by hand after init** (init had inlined its palette into the middle of a token declaration, repointed `--font-sans` at itself, and appended a `.dark` block plus a base reset):
- Restored the file from git and re-applied the shadcn layer cleanly: `tw-animate-css` + `shadcn/tailwind.css` imports, `@custom-variant dark` bound to `[data-theme="dark"]`, and shadcn's semantic contract expressed entirely in `--mk-*` (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`).
- `--font-sans` (Geist) and the marketing `--color-accent` / `--color-secondary` mappings left untouched, so `bg-accent` is still the teal CTA.

**Testing status:** `typecheck` + `next build` green. **Live-verified:** in Dark, `--primary` resolves to `#22b8cf` (the dark-theme `--mk-accent`); in Light, `#0e7490` with `--border: #dbe6e7`; body ground, Geist, and the hero CTA unchanged.

---

## 2026-08-15 — Specializations + app-like mobile navigation (ADR-033, ADR-034)

**Specializations:**
- `lib/specialties.ts` — 22 specialties; six (cardiology, dentistry, pediatrics, gynecology, physiotherapy, radiology) carry real content: operational challenges, how configurable modules answer them, the modules such a practice enables, and what gets configured.
- `components/specialties/` — the reusable system (`SpecializationCard`, `SpecializationGrid`, `SpecializationFeatureList`, `SpecializationModules`, `SpecializationWorkflow`, `SpecializationSection`). A new specialty is a data entry, never a new layout.
- `/specialties` (full grid) + `/specialties/[slug]` for the six featured ones only — specialties without differentiated content stay on the index rather than becoming thin near-duplicate pages. Each page ships intent-matched metadata ("Hospital Management Software for Cardiology"), `SoftwareApplication` + `BreadcrumbList` JSON-LD, and its own OG card. Sitemap and nav updated.
- Every page repeats the honest framing: specialties differ in **configuration, not code**, and a missing capability is named during the demo.

**Mobile navigation:** `components/site/MobileNav.tsx` — bottom bar with five destinations chosen from this site's IA (Home · Modules · Specialties · Pricing · Demo) plus a top-right hamburger opening the shared drawer (full nav, legal links, sign-in / demo actions). The header's old inline mobile panel was **deleted**; below `lg` the header keeps only the wordmark and the hamburger. `main` carries `.hms-bottomnav-offset` so the fixed bar never covers content.

**Testing status:** `typecheck` + `next build` green (53 static routes). **Live-verified at 375px:** the bar renders with the active destination marked, the drawer opens from the top right, background scroll locks (`overflow: hidden`) and restores on close, Esc closes it; `/specialties/cardiology` renders all four content sections with correct title, `<h1>` and JSON-LD.

---

## 2026-08-16 — Claim accuracy: the site now says what is built and what is planned (ADR-038)

**The problem.** Every claim on the site traced to the PRD, and the site was still misleading: 25 modules, FHIR, ABDM, DICOM, WhatsApp, payment gateways and a "Most popular" pricing badge were all written in the present tense, while what exists is Phase 0 plus the MVP 0/1 clinic core, verified locally and not deployed anywhere. A visitor could not tell the roadmap from the product.

**Added — an availability model.** `lib/availability.ts` (`built` / `planned` + the shared `RELEASE_NOTE`) and `components/site/AvailabilityBadge.tsx` (badge + `ReleaseNote`). Every module and integration carries a status; badges appear on the home bento, `/modules`, each module page header and `/integrations`, and the release note wherever the catalogue is shown, including `/pricing`.

**Rewritten — the seven clinic-core modules** now carry `live` (what the Portal does today) and `planned` (the rest of their PRD scope) instead of one blended `points` list, and `/modules/[slug]` renders them as "What it does today" and a separate "Planned for this module". Taglines and per-module SEO descriptions were rewritten to describe only what is built — out went kiosk and QR self-registration, duplicate detection, family linking, multi-channel booking, reminders and no-show tracking, digital signage, specialty templates, interaction and allergy alerts, purchase orders and GRN, Schedule H/H1/X registers, LOINC coding, barcoded samples, pathologist sign-off, GST e-invoice with HSN/SAC, and payer-wise rate lists — all of which now read as planned scope.

**Corrected claims elsewhere:**
- **Integrations** — ICD-10 coding and DLT-compliant SMS/email are marked built; FHIR APIs, SNOMED/LOINC, DICOM/PACS, ABDM/ABHA, scan-and-share, WhatsApp, the payment gateway and Tally export are marked planned. The FHIR entry now says precisely what exists (a FHIR-modelled clinical core) and what does not (the APIs).
- **Security** — practices split into "Enforced today" (RBAC with overrides, server-side validation, tiered rate limiting) and "Commitment" (AES-256 at rest / TLS 1.2+, backups and the restore drill, PII masking, PCI-aligned payments, which needs the unbuilt gateway). "The platform runs on E2E Networks" became "is built to run on", since nothing is deployed. The no-certification note now also rules out audit and accreditation.
- **Pricing** — "Most popular" (we have no customers) became "What we have built"; the enterprise tier's isolation upgrade is labelled planned; a new first FAQ answers "which modules can we actually use today"; the residency answer is future tense.
- **Home / solutions / trust strip** — the module bento, role blurbs and facility blurbs now describe today's behaviour, and the hosting and encryption trust facts are written as the design commitments they are. Notifications say SMS and email, with WhatsApp planned.
- **Specialties** — cardiology, dentistry, pediatrics, gynecology, physiotherapy and radiology no longer claim reminders, waitlists, no-show tracking, family linking, specialty form templates, package draw-down billing, or imaging. The radiology page states plainly that an imaging centre cannot run its studies on the platform yet.

**Also — shared components now follow the marketing brand (ADR-040).** `globals.css` maps the `--hms-*` slots that `@hms/ui` components consume onto `--mk-*` for both themes. The back-to-top button had been rendering the Portal's default teal and ignoring a platform-branding override entirely; it, the bottom nav, the drawer and the toast now follow the marketing accent in Light and Dark.

**Testing status:** typecheck + production build clean. Manual cases added to `testcases.md` (MKT-01…MKT-08).

---

## 2026-08-16 — The product is Nirogix (ADR-041, ADR-042)

**Renamed.** `SITE.name` / `SITE.wordmark` are **Nirogix**, so the header, footer, OG cards, the `· Nirogix` title suffix and every JSON-LD publisher reference follow from one place. Page copy that named the product — security, pricing, contact, platform, legal, specialties, module descriptions and the two OG `alt` strings — now says Nirogix.

**Deliberately not renamed:** "HMS" where it is the **industry search term** hospitals actually type (`/modules` title "HMS Software Modules for Hospitals", the `HMS` and `multi-tenant HMS` keywords, the keyword map in `KNOWLEDGE.md`). That is search intent, not our product's name, and the distinction is now written down in the keyword map itself.

**Environment URLs.** `.env.example` documents `NEXT_PUBLIC_SITE_URL` (which drives `metadataBase`, canonicals, the sitemap and every absolute JSON-LD URL) and `NEXT_PUBLIC_PORTAL_LOGIN_URL` for all three environments: `nirogix.com` / `staging.nirogix.com` / localhost, and `portal.nirogix.com` / `portal-staging.nirogix.com` / localhost. Staging is access-controlled and `noindex` at Nginx, so the marketing site can never be indexed twice.

**Testing status:** typecheck + production build clean.

---

## 2026-08-16 — The "H" is gone: the Nirogix mark everywhere

The header and footer wordmark still drew a hardcoded letter **"H"** from the old name in a teal tile. Both now render the shared `BrandMark` from `@hms/ui` (N monogram, 28px), which resolves through the marketing token bridge to `--mk-accent` — so it follows the marketing brand and both themes rather than carrying a literal of its own. The OG card mark, which cannot read CSS custom properties under Satori, repeats the same geometry with the documented literals. `app/icon.svg` replaces the default Next.js `favicon.ico` (deleted).

---

## 2026-08-16 — Staging is uncrawlable; the docs stop describing a CDN we do not have (ADR-045)

**The gap.** `resources/domains.md` and the deploy config were written for a Cloudflare-fronted origin — edge TLS, WAF, Cloudflare Access on staging, `CF-Connecting-IP` as the real client address. None of that exists: `nirogix.com` is registered at GoDaddy and its nameservers stay there. Documentation that describes infrastructure you do not have is worse than none, because it is the thing you consult during an incident.

**Marketing code.** `lib/seo.ts` exports `IS_STAGING` (from `NEXT_PUBLIC_ENVIRONMENT`), and `app/robots.ts` now serves `Disallow: /` with no sitemap or host on staging. Production is unchanged. With no edge access gate in front of `staging.nirogix.com`, the same copy would otherwise be reachable and indexable on two hostnames and compete with the real site.

**Deploy config.** `deploy/nginx/nirogix.conf.template` terminates TLS on the origin with Let's Encrypt (certbot HTTP-01, so port 80 stays reachable for renewal) instead of a Cloudflare origin certificate, and the access gate on the staging hosts is Nginx basic auth. **`real_ip_header CF-Connecting-IP` is removed** — with no proxy in front, that header is client-supplied, so trusting it would let any caller claim an arbitrary address and walk straight through the IP-keyed rate limiters. `deploy/README.md` follows: GoDaddy DNS, no edge tier, the origin IP public with the VM firewall as the only network boundary, and the certbot command in the bring-up steps.

**Storage is unchanged.** The object store is still Cloudflare R2 (ADR-017) reached through `FileStorageService`; only DNS moved out of scope. `cdn.nirogix.com` is **blocked** — an R2 custom domain requires the zone on Cloudflare DNS — and PHI documents continue to be delivered by short-lived signed URLs minted by the API, never a public bucket URL.

**Testing status:** typecheck + production build clean (marketing and Portal); `npm run test` green across all four workspaces. Remaining work is on the VM and in the registrar, tracked as **I-5** in `BACKLOG.md`.

## 2026-08-18 — Fixed new pages opening slightly below the top (issue #8)

Navigating between routes (e.g. `/solutions` → `/`) landed the new page a little scrolled down, cutting off the first section. Root cause: `marketing/app/globals.css` set `html { scroll-behavior: smooth }`, which **conflicts with Lenis** (the shared `SmoothScroll`). Lenis drives smooth scrolling in JS and owns the document scroll; a CSS smooth-scroll on top of it animates every programmatic jump — so the route-change reset (`lenis.scrollTo(0, { immediate: true })`) got animated by the browser and interrupted by the incoming page, parking it partway down.

Removed `scroll-behavior: smooth` (and the now-inert `prefers-reduced-motion` override that only reset it to `auto`); smoothness still comes from Lenis. Kept `scroll-padding-top: 5rem` — it's the sticky-nav offset that anchor scrolling reads. Paired with the shared `SmoothScroll` hardening (see `packages/ui/DONE.md`), route changes now snap to the top pre-paint, and the two cross-page footer anchors (`/security#residency`, `/security#audit`) — previously yanked to the top by the old reset — now land on their section, clear of the header.

**Testing status:** verified live that computed `html` `scroll-behavior` is now `auto` (was `smooth`) with `scroll-padding-top: 80px` preserved and Lenis still active; production build + typecheck clean; no console errors. Interactive scroll behaviour to be eyeballed in a displayed browser (this session's preview pane can't composite frames).

## 2026-08-18 — Marketing brought up to date with the shipped product (issue #12)

Audited the site against the current codebase (ADR-066…071, DONE logs, permissions, capability reference). The structure was sound, so this is a content-data update, not a rewrite. Changes are almost entirely in `lib/site.ts` and `lib/catalogue.ts`; rendering components are unchanged.

- **SMS overclaim fixed (the one true overclaim).** The integrations catalogue entry "SMS & email — Built (DLT-registered templates)" is split into **Email (built)** and **SMS (planned, pending DLT template registration)**; `integrations/page.tsx` metadata + lede no longer say SMS "works today"; the platform-core Notifications blurb now says email is live and SMS is pending DLT. Traceable to `BACKLOG.md` I-1.
- **The shipped clinical journey now shows on the module pages** (was absent). Added to `live`: duplicate detection at registration (Patients); weekly rosters + online QR self-booking into an approval queue (Appointments); server-enforced payment-before-consultation (OPD); department referrals from the consultation (EMR); supplier directory + stock-correction ledger (Pharmacy); result verification + downloadable report file (Laboratory); services/procedures catalogue + manual invoices (Billing). Built features moved out of `planned` accordingly.
- **Terminology aligned to the app**: role "Hospital admin" → **"Organization Admin"**, and the missing **"Branch Admin"** role added; "Lab technician" → "Lab Technician".
- **Capability reference** (`resources/marketing-product-capability-reference.html`) reconciled and bumped **2.5 → 2.6** (last updated 18/08/2026, change-history row added): setup-console rows corrected (services catalogue BUILT on its own screen, packages PLANNED), and the SMS safe-to-say / integration row no longer claim DLT-registered templates.
- **Em dashes** removed from the two marketing copy strings and one paired parenthetical converted to parentheses (issue #11).

AI (env-gated draft + dictation) deliberately kept off the marketing site (FUTURE / CDSCO-gated), consistent with the existing decision.

**Testing status:** marketing typecheck + production build clean. Browser-verified the Appointments module page renders the new "What it does today" bullets (rosters, online self-booking) and the narrowed planned list.

## 2026-08-19 — Light is the first-load theme; OS preference no longer consulted (ADR-079)

Marketing was the one app whose first visit honoured `prefers-color-scheme` — a dark-OS visitor saw the marketing site dark while every product surface opened light. Per the owner's direction, `lib/theme.tsx` and the `layout.tsx` no-flash script now default to **Light for everyone**; Dark applies only when `mk-theme` holds an explicit prior choice, and the toggle still persists it. The no-flash script now shares the same shape as the other four apps (`stored==='dark'?'dark':'light'`).

**Testing status:** typecheck clean; browser-verified with emulated OS dark preference — first load paints Light, toggling Dark persists across reload, clearing storage returns to Light.

## 2026-08-20 — Content-Security-Policy on the public site (ADR-082, SECURITY-AUDIT M-1)

**What:** `proxy.ts` sends the CSP from `@hms/utils` plus the platform’s static security headers, in **static mode** — no per-request nonce. That is the deliberate half of the decision: these pages are statically rendered and ISR-cached (5-minute revalidate), and reading a per-request nonce in the layout would make every page dynamic, which is exactly what this site must not become. Scripts therefore keep `unsafe-inline` while `object-src`, `frame-ancestors`, `base-uri`, `form-action` and the rest stay strict — acceptable here because the site renders no user input, holds no session and reaches no PHI. Wiring `ContactForm` (BACKLOG U-2) is the change that should move it to nonce mode.

`@hms/utils` was added to this app’s dependencies and `transpilePackages` for the builder.

**Testing status:** verified live — the home page renders with zero console errors, the headers are present, and the build output confirms every route stayed static/ISR (`○` with a 5m revalidate), which was the point of not using a nonce here.

---

## 2026-08-25 — Environment files: complete, uncommented, and mirrored into `.env`

**What:** the marketing site's `.env.example` and its gitignored `.env` now hold the same keys in the same
order, every one live and uncommented, so copying the example gives a boot-ready file where only
values change (CLAUDE.md → *Environment files*).

**Changed:** `.env.example` now lists every variable the app reads, all uncommented, with 1–2 line
comments — including the two that were missing: `NEXT_PUBLIC_API_BASE_URL` (used by `proxy.ts` for
the CSP `connect-src`) and `HMS_API_URL` (used server-side by `lib/branding.ts`). The gitignored
`.env` mirrors the same keys in the same order.

**Testing status:** no runtime change — env keys and their values are unchanged for local
development. Repo-wide rule and the `README.md` environment table updated in the same change.
