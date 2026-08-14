# marketing — KNOWLEDGE.md

Current state of the public marketing / SEO site. Read after root `CLAUDE.md` and `marketing/AGENTS.md`. See `DONE.md` for the chronological log.

> ⚠ **Next.js 16 (App Router, Turbopack, React 19).** Read the version-matched docs in `node_modules/next/dist/docs/` before writing routing/rendering code.

## Purpose

The public-facing product site (unauthenticated). Its job in Phase 0 is minimal: present the product and route visitors to the **Portal login**. It shares the `@hms/ui` design system so the public site and the app look like one brand.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + TypeScript, **Tailwind v4**
- **@hms/ui** for design tokens + primitives (brand consistency with the Portal)
- Static — all pages prerender (`○ (Static)`); no backend calls, no auth.

## Layout

```
app/
  layout.tsx     Root: fonts, @hms/ui styles, SiteHeader + SiteFooter, Light theme, SEO metadata
  globals.css    Tailwind + maps --hms-* tokens into @theme
  page.tsx       Landing: hero + features + CTA (all sign-in actions → Portal)
components/
  SiteHeader.tsx  Logo + "Sign in" / "Go to Portal" (→ Portal login)
  SiteFooter.tsx  Copyright + staff sign-in link
lib/
  portal.ts       PORTAL_LOGIN_URL — the Portal login target (env-driven)
```

## The Portal link (environment-aware)

- Every "Sign in" / "Go to Portal" action links to `PORTAL_LOGIN_URL` (`lib/portal.ts`), read from **`NEXT_PUBLIC_PORTAL_LOGIN_URL`** — never hard-coded. Default `http://localhost:3000/login`; set per environment (staging/production) in `.env.local`.
- The site does **not** authenticate or call the API; it only hands off to the Portal, which owns login.

## Design consistency

- `import '@hms/ui/styles.css'` supplies the `--hms-*` tokens; `globals.css` maps them into Tailwind's `@theme`, so the marketing site uses the exact same colours/radii/type as the Portal. Renders in the Light (default) theme. No component hardcodes a visual value.

## Running

- Dev: `npm run dev -w marketing` → `http://localhost:3001`. Build: `npm run build -w marketing`. Typecheck: `npm run typecheck -w marketing`.
- All apps together: `npm run dev` at the repo root (backend `:4000`, portal `:3000`, marketing `:3001`).

## Constraints / not-yet-built

- Single landing page only — real marketing content, SEO structured data (JSON-LD), sitemap/robots, blog, and pricing land in a later marketing phase.
- No dark theme toggle (public site is Light-only for now).
