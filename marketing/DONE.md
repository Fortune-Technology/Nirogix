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
