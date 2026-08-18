# Nirogix Design System

**The canonical visual language for every Nirogix surface** — the public marketing site (`marketing/`) and the clinical Portal (`hms_frontend/` + `packages/ui`). This document is the source of truth for colour, typography, spacing, radii, components, iconography, motion, and theming. Any new UI work follows it.

> Supersedes `resources/Default-DESIGN-intercom.md` (an earlier reference exploration). Where they differ, **this document wins.**

Approved 2026-08-14. Preview styleguide: an interactive artifact demonstrating the palette, type, components, Light/Dark, and the tenant-accent slot.

---

## 1. Direction

Enterprise healthcare SaaS: **calm, trustworthy, modern, clinically precise.** Six deliberate calls define the look:

1. **Deep-teal signature** — one confident accent carries the brand; everything else stays quiet.
2. **Cool-neutral surfaces** — whites and greys biased slightly cool (never warm cream). Reads clean and clinical.
3. **Clinical precision** — tight type, aligned numerals (`tabular-nums`), dense-but-legible tables. Built to be operated.
4. **Minimal ornament** — hairline borders and soft depth over heavy shadows and gradients. Structure does the work.
5. **Light and Dark** — every token has a dark counterpart. The Portal ships both; marketing is Light-only for now.
6. **Tenant-branded** — the accent is a *slot*. Each hospital's brand colour re-skins the Portal at runtime without touching a component.

**Two surfaces, one system.** The marketing site uses the language expressively (larger type, generous layout, hero moments). The Portal uses it densely (compact controls, the Standard DataTable, both themes, per-tenant accent). They share the same tokens, type scale, radii, and iconography so they read as one brand.

---

## 2. Colour tokens

Values are the spec. In code they live as CSS custom properties: `--mk-*` in `marketing/app/globals.css` (Light only) and `--hms-*` in `packages/ui/src/styles.css` (Light `:root` + Dark `[data-theme='dark']`).

### Light (default)

| Role | Hex | Notes |
|---|---|---|
| Canvas | `#f4f7f7` | Page ground. Cool off-white, never pure white, never cream. |
| Surface | `#ffffff` | Cards, panels, inputs. |
| Surface 2 | `#eaf1f1` | Alt rows, table headers, tints, hovers. |
| Surface ink | `#0e1f26` | Inverted panels (deep CTA / quote). Cool teal-black. |
| Hairline | `#dbe6e7` | 1px borders. |
| Hairline soft | `#e8eeee` | Softer dividers. |
| Ink | `#0f1e24` | Headlines + body. Cool near-black. |
| Ink muted | `#52646a` | Secondary text. |
| Ink subtle | `#7a888d` | Helper / meta. |
| Ink faint | `#9aa8ac` | Footnotes, disabled. |
| Ink inverse | `#ffffff` | Text on accent / surface-ink. |
| **Accent** | `#0e7490` | Deep teal. The Nirogix signature and the Portal's tenant-overridable slot. |
| Accent hover | `#0b5f76` | |
| Accent ink | `#ffffff` | Text on accent. |
| Accent subtle | `#e3f2f5` | Accent tint (badges, active nav). |
| Accent border | `#bfe0e8` | Tinted borders. |

### Dark (Portal only)

| Role | Hex |
|---|---|
| Canvas | `#0b1418` |
| Surface | `#112128` |
| Surface 2 | `#16272e` |
| Hairline | `#22353c` |
| Hairline soft | `#1a2a30` |
| Ink | `#e7eff0` |
| Ink muted | `#9db0b4` |
| Ink subtle | `#6f8288` |
| Ink faint | `#566a70` |
| **Accent** | `#22b8cf` (brightened teal for contrast on dark) |
| Accent ink | `#052027` (dark text on bright teal) |
| Accent subtle | `#0d343d` |
| Accent border | `#2a4a53` |

### Semantic (separate from the accent, both themes)

| Role | Light | Light bg | Dark | Dark bg |
|---|---|---|---|---|
| Success | `#15803d` | `#e7f4ec` | `#3fb27f` | `#10251c` |
| Warning | `#b45309` | `#fbf0e2` | `#d6a04a` | `#2a2013` |
| Danger | `#c0392b` | `#fbe9e6` | `#f0776a` | `#2a1512` |
| Info | `#2563eb` | `#e8effd` | `#58a6ff` | `#0f2138` |

**Rules:** never hardcode a colour in a component — always a token. Semantic colours signal state only, never brand. Derive tints with `color-mix(in srgb, var(--accent) N%, var(--surface))` so a tenant accent override updates them automatically.

---

## 3. Typography

- **Typeface:** **Geist** (via `next/font`), with `Geist Mono` for data/code. System sans is an acceptable fallback only.
- **Hierarchy** (size / weight / tracking): negative tracking tightens display; body stays neutral.

| Token | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| Display | 40–54px | 600 | -0.03em | Marketing hero, big numbers |
| Heading | 28px | 600 | -0.02em | Section / page titles |
| Subhead | 22px | 600 | -0.02em | Sub-sections |
| Title | 18px | 600 | -0.01em | Card titles |
| Body | 16px | 400 | 0 | Default |
| Small | 14px | 400 | 0 | Secondary, table cells |
| Caption | 12px | 400/600 | 0 (0.04em upper for eyebrows) | Meta, labels |

- Headings get `text-wrap: balance`; body `text-wrap: pretty`, measure near 65ch.
- Numbers in tables/stats use `font-variant-numeric: tabular-nums`.

---

## 4. Shape, spacing, depth

- **Radii:** xs 4 · sm 6 · **md 8 (buttons, inputs)** · **lg 12 (cards)** · xl 16 (product tiles / mockups) · 2xl 24 (oversized banners) · pill 999 (toggles, badges). One radius system; do not mix arbitrarily.
- **Spacing:** 4px base. Section rhythm on marketing ~80–96px; Portal is denser (16–24px between blocks).
- **Depth:** minimal. Prefer hairline borders + `surface`-on-`canvas` lift. Shadows are soft and tinted toward the ground (`0 1px 2px` / `0 10px 30px` at low alpha), reserved for floating UI (menus, the product-preview tiles). No heavy drop shadows, no gradients as decoration.

---

## 5. Components

The shared primitives live in `@hms/ui` (`Button`, `Field`, `PasswordField`, `Card`, `Badge`, `Alert`, `Spinner`, `DataTable`) and are consumed by the Portal; marketing has a parallel token-driven kit in the same language. All derive from tokens.

- **Charts (ADR-043):** `AreaChart` (gradient fill from the series colour at 28% to 2%, 2px line, snapping hover cursor with a surface tooltip), `BarChart` (stacked, radius-sm columns, hover dims the segments to 82%), `StatCard` (label · 1.75rem tabular value · unit · delta in success/danger with a Lucide arrow · optional 4.5rem sparkline), `UsageBar` (0.4375rem pill track on surface-2, fill in the accent). Gridlines are dashed hairlines, axis text is `fg-subtle` at 0.6875rem, and **every colour is passed in as a token by the caller** — a chart never names its own. Each one repeats its numbers in a visually-hidden table.
- **BrandMark:** the Nirogix mark — an N monogram in a rounded tile (radius 8 on a 32 viewBox), tile in `--hms-brand`, letter in `--hms-brand-fg`. Drawn from tokens, so it follows the theme, the marketing accent, and a tenant override with no asset to ship. Used at 40px on the Portal's login card, 24/20px in the app shell, 28px in the marketing header and footer, and as both apps' `app/icon.svg` favicon. A tenant's uploaded logo replaces it wherever one exists.
- **Button:** `primary` = accent fill / accent-ink; `secondary` = surface + hairline; `ghost` = transparent; `danger` = danger fill. Radius md. Tactile `:active` (translateY 1px). Label ≤ 3 words for primary CTAs.
- **Badge / status pill:** radius pill; `brand` (accent-subtle), `neutral`, `success`, `warning`, `danger`, `info`.
- **Card:** surface + hairline + radius lg. Optional header with a bottom hairline.
- **Field:** label above input; input surface + hairline + radius md; focus = accent border + 3px accent-subtle ring; helper below; error text in danger below.
- **DataTable (Standard):** the one tabular component for the Portal (ADR-029). Header on surface-2, hairline row rules, hover on surface-2, `overflow-x: auto` wrapper, sticky header, built-in skeleton / empty / error states. Above it a fixed toolbar order — **Search → Filters → Columns → Actions**; below it **Rows per page → Pagination → "Showing X–Y of Z"**. Sort indicators are Lucide `ChevronsUpDown` (unsorted) / `ArrowUp` / `ArrowDown`, the active one in the accent, with an order number on a second sort level. Keep dense.
- **Menu:** the one dropdown/popover primitive — surface + hairline + radius md + `shadow-md`, accent check marks, Esc/outside-click close, arrow-key roving focus. Column visibility, faceted filters and `MoreActions` are all built on it.
- **Action column (ADR-039):** the last column of any table with row-level operations, headed "Actions", right-aligned, built with `actionsColumn()` + `TableActions`. Inside it, 2rem square icon buttons — `ViewAction` (`Eye`), `EditAction` (`Pencil`), `DeleteAction` (`Trash2`), `TableAction` (module's own icon) — transparent at rest in `fg-muted`, accent-subtle tint + accent icon on hover, danger tint for destructive ones, `--hms-ring` focus outline, 45% opacity when disabled, and a spinner in place of the icon while working. Tooltip = accessible name (or the reason it is disabled). At most three inline; the rest go in **MoreActions** (`MoreHorizontal` trigger, same icon-button shape). Destructive items route through `ConfirmDialog`; an action the user is not permitted is not rendered.
- **ToggleAction (switch):** the one Enable/Disable — Activate/Deactivate control. 2.25×1.25rem pill track, surface-2 + hairline when off, `--hms-brand` when on, thumb in `brand-fg`, `role="switch"` with `aria-checked`, focus ring on the track.
- **ConfirmDialog:** the one destructive-action confirmation — overlay at 45% ink, panel on surface with radius lg, danger icon chip, Cancel + danger confirm; focus-trapped and scroll-locked through `useScrollLock`.
- **EmptyState / ErrorState / Skeleton:** the shared states — icon chip on surface-2 (danger tint for errors), title, optional description, optional action or retry; skeletons shimmer between surface-2 and surface and hold still under `prefers-reduced-motion`.
- **Toast / notification (the one API-feedback surface):** a single `Toaster` + `toast()` primitive in `@hms/ui`, used by **both** surfaces for every API result. Card-like: surface + hairline + radius lg + soft floating shadow, a Lucide status icon, title (≤ 6 words) + optional description carrying the **API's own message**, optional action, always a dismiss control. Variants map to the semantic tokens in §2 — `success` · `error` (danger) · `warning` · `info` · `loading` — with the tinted background, the semantic foreground for the icon, and body text in `ink`. **Top-right on every breakpoint**, offset below the app bar so it never covers navigation or the primary action; on a phone it spans the width inside the safe-area inset. Stacked with a small cap (4 visible, the rest queued) and de-duplication; static under `prefers-reduced-motion`; `role="status"` (polite) for routine messages, `role="alert"` (assertive) for errors and warnings; success and info auto-dismiss (~5s), a warning lingers (~7s), errors and loading persist until dismissed or resolved; a labelled close control on every toast and a progress indicator on anything timed. **Status is never signalled by colour alone** — every variant carries both an icon and a word. Implemented on **React Toastify** behind the `@hms/ui` adapter, with the library's entire palette re-pointed at the design tokens so a tenant's branding and the active theme apply automatically (ADR-026, ADR-057).
- A **Select** primitive should be added to `@hms/ui` (dropdowns are currently hand-styled native `<select>` with `.hms-input`).

---

## 6. Iconography

- **Lucide (`lucide-react`) only**, project-wide. No other icon library, no hand-rolled SVG icon paths, no emoji as icons.
- Standard `strokeWidth` ≈ **1.75** (1.6 for larger decorative marks). Size to the text it sits with (14–22px typical).
- One icon family everywhere; consistent metaphors across surfaces.

---

## 7. Theming & tenant branding

- **Theme:** `data-theme` on `<html>` (`light` default, `dark` explicit + persisted; first visit honours `prefers-color-scheme`). **Both surfaces support Light + Dark.** Every colour is a token with a Light and Dark value; never define a colour only inside a `[data-theme]` block. A pre-hydration script paints the stored/preferred theme before first paint (no flash). Marketing persists under `mk-theme`, the Portal under `hms-theme`.
- **Per-tenant branding (Portal):** the accent is applied at runtime by overriding `--hms-brand` (derived tints via `color-mix`) inline on `<html>` from server-persisted per-tenant branding (ADR-021). Components never hardcode the teal — always `var(--hms-brand)` — so a tenant re-skin is a single token change. Logo + favicon are per-tenant.
- **Platform branding (System Admin, ADR-024):** two **independent** platform-global scopes — **Marketing** (`--mk-*`, `marketing/app/globals.css`) and the **Portal** (`--hms-*`, `packages/ui/src/styles.css`). Editing one never affects the other. Marketing reads its scope dynamically (ISR) and injects `--mk-*`; the Portal applies the `hms` scope as the product default, under any per-tenant override.
- **Scalable branding token contract.** Both scopes and both branding levels use one JSONB `tokens` shape, each key mapping to a CSS variable so new tokens need no schema change:

  | token key | Marketing var | Portal var | notes |
  |---|---|---|---|
  | `primary` | `--mk-accent` | `--hms-brand` | main brand / primary CTA |
  | `secondary` | `--mk-secondary` | `--hms-secondary` | secondary emphasis |
  | `accent` | `--mk-accent` | `--hms-brand` | highlight (unified with primary in the current system) |
  | `background` | `--mk-canvas` | `--hms-bg` | page ground |
  | `surface` | `--mk-surface` | `--hms-surface` | cards / panels |
  | `foreground` | `--mk-ink` | `--hms-fg` | text |
  | `border` | `--mk-hairline` | `--hms-border` | hairlines |
  | `buttonBg` | `--mk-accent` | `--hms-button-bg` (→ `--hms-brand`) | primary button fill |
  | `buttonFg` | `--mk-accent-ink` | `--hms-button-fg` (→ `--hms-brand-fg`) | primary button text |

  Only the keys an admin sets are injected; the rest fall back to the built-in defaults. Button vars default to the brand tokens, so leaving them unset keeps buttons on-brand.

---

## 8. Motion & accessibility

- Motion is restrained and motivated: soft entrance reveals (IntersectionObserver, not scroll listeners), hover/active micro-feedback, 150–600ms eases. No scroll-hijacks or decorative loops.
- Everything above a whisper honours `prefers-reduced-motion: reduce` (collapse to static).
- WCAG AA contrast minimum for text on every ground, both themes. Visible keyboard focus (2px accent outline). Labels associated with inputs. Touch targets ≥ 40px.

---

## 9. Frontend behaviour rules (permanent — apply to every page/component)

These are ongoing rules for **both** the marketing site and the Portal, not one-time changes. Priority order for every feature: **Correct user flow → Consistent UI/UX → Reusable architecture → Clean code → Production readiness.**

1. **Routes start at the top.** Every navigation (client-side or direct) opens the new page scrolled to the top; never preserve the previous page's scroll position. Implemented in the shared `SmoothScroll` (`@hms/ui`) via `usePathname` → `lenis.scrollTo(0, { immediate: true })`. In-page `#anchor` links are exempt (hash-only change).
2. **Smooth scrolling with Lenis** (https://lenis.dev) app-wide, via the shared `SmoothScroll` wrapper in the root layout of each app. Do not hand-roll scroll animation.
3. **Overlay scroll handling.** Any modal / drawer / dialog / dropdown overlay / mobile menu that scrolls independently must call **`useScrollLock(open)`** (`@hms/ui`): it stops Lenis and pins the background so the page cannot scroll behind it; the overlay's own scroll region is marked **`data-lenis-prevent`**. Never allow simultaneous background + overlay scrolling. Restore on close (the hook does this automatically).
4. **Back to top.** Use the shared **`BackToTop`** component (`@hms/ui`) on both surfaces — appears past a scroll threshold, smooth-scrolls to top through Lenis, responsive + accessible. Reuse it; do not duplicate.
5. **Marketing navbar** always includes the full set, including **About** and **Contact**, as real routes, working on desktop and mobile (`marketing/lib/site.ts` → `NAV_LINKS`).
6. **Separate branding per surface.** Marketing (`--mk-*` in `marketing/app/globals.css`) and the Portal (`--hms-*` in `packages/ui/src/styles.css`) are **independent branding scopes** — changing one must never affect the other. Branding/theme values are centralised as tokens (never hardcoded per component) and structured to scale to primary / secondary / accent / background / button / other tokens. System-Admin-editable branding for each surface is built on this token seam (see the branding admin + `lib/theme.tsx` runtime override for the Portal). **Only `--hms-brand` is ever overridden** — hover, pressed, subtle and the focus ring derive from it (ADR-040), so one value re-skins every interactive state — and an app consuming `@hms/ui` maps those token slots onto its own scope once in its global stylesheet (marketing points `--hms-*` at `--mk-*`) rather than teaching shared components about two scopes.
7. **No unused resources.** When a file or asset (image, icon, component, CSS, util, hook, import, constant, config, service, etc.) is no longer used anywhere, delete it. Before a feature/page is "done", check for unused imports, components, assets, and files introduced during development. Every refactor cleans up what it makes obsolete. Keep the codebase lean, organised, and production-ready; avoid duplication (prefer a shared component in `@hms/ui`).
8. **API feedback is always visible, always shared.** Every state-changing or failing API call raises a notification through the **one** `@hms/ui` toast system (§5) via the shared API client — never per-page toast code, never a silent failure. Display the API's own message when it provides one; fall back to generic copy only when it does not. Never show a stack trace, a backend internal, or PHI in a notification. Full rules: `resources/rules.md` → API Feedback & Notification Rules.
9. **SEO belongs to marketing; the Portal is never indexed.** Public marketing routes ship unique title/description, canonical, one `<h1>`, semantic structure, OG/social metadata, honest JSON-LD, sitemap + robots entries, and descriptive URLs. Authenticated Portal routes are `noindex, nofollow`, and no patient/tenant/staff data ever reaches metadata, a URL, an OG image, or a sitemap. Full rules: `resources/rules.md` → SEO / AEO / GEO Rules.
10. **Reuse before you build.** Check `@hms/ui` first, then the app's shared components. Tabular data always renders through the Standard DataTable, configured per module — never a `PatientTable` / `BillingTable` of its own. Row actions use the shared Action column (`TableActions` + `ViewAction` / `EditAction` / `DeleteAction` / `ToggleAction` / `TableAction` / `MoreActions`, ADR-039), destructive actions use `ConfirmDialog`, and empty/loading/error use the shared states. A pattern appearing a second time gets extracted in the same change.
11. **Dates read `DD/MM/YYYY`** (`DD/MM/YYYY HH:mm` with a time) everywhere a person sees them, formatted only through `@hms/utils` (ADR-030). Transport stays ISO-8601.
12. **Optimize with the platform, not around it.** `next/image` for content images (correct `sizes`, lazy by default, `priority` only for the real LCP image), `next/font` for typography, `next/script` for anything third-party, the Next Metadata API for `<head>`, `next/dynamic` for heavy below-the-fold or non-critical UI. Meet the Core Web Vitals budgets before calling a page done. Full rules: `resources/rules.md` → Frontend Performance & Next.js Optimization Rules.

## 10. Where it lives in code

- `packages/ui/src/styles.css` — `--hms-*` tokens (Light + Dark) + canonical component CSS. **Reskin the Portal here.**
- `marketing/app/globals.css` — `--mk-*` tokens (Light) mapped into Tailwind `@theme`. **Marketing lives here.**
- Both map their tokens into Tailwind so utilities (`bg-surface`, `text-ink`, `text-accent`, `rounded-lg`) resolve to the system. No component hardcodes a raw visual value.
