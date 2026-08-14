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
- **No fabricated social proof.** No fake customers, logos, or testimonials (there are no reference customers yet). Trust = honest architecture facts.
- **Onboarding is demo / sales led** (operator-driven), not public self-serve signup.

## The Portal link (environment-aware)

- "Sign in" / "Go to Portal" actions link to `PORTAL_LOGIN_URL` (`lib/portal.ts`) from **`NEXT_PUBLIC_PORTAL_LOGIN_URL`** (default `http://localhost:3000/login`). Site metadata base URL is `NEXT_PUBLIC_SITE_URL` (default `http://localhost:3001`).

## Running

- Dev: `npm run dev -w marketing` → `http://localhost:3001`. Build: `npm run build -w marketing`. Typecheck: `npm run typecheck -w marketing`.

## Constraints / not-yet-built

- The demo-request form (`ContactForm`) is **inert on the static site** (no backend). Before launch, wire `handleSubmit` to a real endpoint / CRM (see the `TODO` in the component). Field names are stable for drop-in wiring.
- Legal pages are plain-language summaries; the binding documents are authored with counsel before GA.
- Non-flagship modules (18 of 25) are listed on `/modules` without dedicated pages; only the 7 clinic-core modules have `/modules/[slug]` pages.
- Resource/blog content is not yet built.
