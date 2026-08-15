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
