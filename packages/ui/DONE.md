# @hms/ui — DONE.md

Append-only implementation log. Newest at the bottom.

---

## 2026-08-14 — Design system foundation (Phase 0 / Task #12)

**What:** Built the shared design system — the single design-token layer, the core primitives, and the Standard DataTable — consumed by `hms_frontend` and `marketing`.

**Added:**
- `src/styles.css` — the `--hms-*` design-token layer (colour, radius, type, shadow) with **Light default (`:root`) + Dark (`[data-theme="dark"]`)** and overridable brand tokens, plus the canonical component CSS.
- Primitives (token-only, no hardcoded values): `Button`, `Field`, **`PasswordField`** (labelled input with a built-in show/hide eye toggle — the required control for every password field platform-wide), `Card`, `Badge`, `Alert`, `Spinner`.
- **`DataTable`** — the Standard DataTable (columns + rows + rowKey, built-in loading/error/empty + horizontal overflow).
- `cn` helper; barrel `index.ts`; `./styles.css` + `.` exports; React 19 peer dependency.

**Decisions:** Everything visual derives from `--hms-*` tokens — no component hardcodes colour/spacing/radius/type. Light default; Dark via `data-theme`; tenant branding overrides `--hms-brand` at runtime. Self-contained CSS (semantic classes) so the system works identically in the Portal and marketing without depending on the consumer's Tailwind config; the apps additionally map the tokens into Tailwind's `@theme`. `PasswordField` standardises the password-reveal affordance.

**Testing status:** `typecheck` green. Verified live in the Portal in **Light + Dark** and under a **non-default tenant brand**; the DataTable renders the Providers and Audit views; the `PasswordField` toggle works both directions.

---

## 2026-08-14 — Reskin to the HMS Design System + Lucide PasswordField

**What:** Applied the approved custom **HMS Design System** (`resources/DESIGN.md`) to the shared token layer, and moved the last hand-rolled icons to Lucide.

**Changed:**
- `src/styles.css` — retooled `--hms-*` for Light + Dark to the new palette: cool-neutral surfaces (canvas `#f4f7f7` / dark `#0b1418`), ink `#0f1e24` / `#e7eff0`, deep-teal accent `#0e7490` (dark `#22b8cf`), teal-tinted hairlines and soft shadows, radius sm 4→6. `--hms-brand-subtle` is now **derived from `--hms-brand` via `color-mix`**, so a per-tenant accent override also re-skins active nav, badges, and tints. Focus ring follows the accent. The DataTable gained `tabular-nums`.
- `src/components/PasswordField.tsx` — replaced the inline eye SVGs with Lucide `Eye` / `EyeOff`; added `lucide-react` as a dependency of `@hms/ui`.

**Invariants held:** Dark theme intact; per-tenant branding intact (accent still overrides `--hms-brand` at runtime, now flowing into derived tints); clinical density unchanged. No component hardcodes a colour.

**Testing status:** `typecheck` green (7 ws) · both apps `next build` green. Live-verified in the running Portal: Light + Dark token values resolve correctly, nav + password icons render, no console errors.

---

## 2026-08-14 — Shared smooth-scroll + back-to-top + scroll-lock (frontend rules)

**What:** Reusable scroll infrastructure shared by the Portal and the marketing site, per the new permanent frontend rules (`resources/DESIGN.md` §9).

**Added:**
- `src/components/SmoothScroll.tsx` — Lenis (https://lenis.dev) root wrapper + route-change scroll-to-top (`usePathname` → `lenis.scrollTo(0, immediate)`). Wrap the app once in the root layout. `next` added as a peer dependency (both consumers are Next apps).
- `src/components/BackToTop.tsx` — reusable button, appears past a scroll threshold, smooth-scrolls to top through Lenis, token-styled `.hms-backtotop`, accessible (removed from tab order while hidden).
- `src/useScrollLock.ts` — `useScrollLock(locked)`: stops Lenis + pins the background while an overlay is open, restores on close. Overlay inner scroll regions use `data-lenis-prevent`.
- `styles.css` — `.hms-backtotop` styles (token-driven, reduced-motion aware). `lenis` added as a dependency.

**Testing status:** `typecheck` green (7 ws) · both apps `next build` green. Live-verified: Lenis mounts on both apps, BackToTop renders and is token-styled, no console errors. (Smooth-scroll/back-to-top motion verifies in a displayed browser; the headless pane does not tick rAF.)

---

## 2026-08-14 — Shared Lottie player + preloader

**Added (`lottie-react` dependency):**
- `src/components/LottiePlayer.tsx` — renders a Lottie from a `src` URL (lazy `fetch`, keeps large JSON out of the JS bundle) or bundled `animationData`; loop/autoplay; **honours `prefers-reduced-motion`** (holds a static frame).
- `src/components/LottiePreloader.tsx` — shared full-screen loading overlay for both apps. Opaque, blocks scroll/interaction, plays the Lottie, then fades out after `window.load` (with a small minimum so it never flashes and a hard cap so it never blocks). Leaving→gone is a deterministic **timer** (not `transitionend`, which is a no-op under reduced motion / unstyled states).
- `styles.css` — `.hms-preloader` overlay (token-driven `--hms-bg`, fade, reduced-motion aware).

**Testing status:** `typecheck` green (7 ws) · both apps `next build` green. Live-verified: the preloader mounts on load, plays the ambulance Lottie, unmounts and restores scroll on both apps; no console errors.

---

## 2026-08-14 — Brand-dynamic Lottie recolouring

**What:** Both Lottie animations recolour to the brand accent at runtime, following the theme and platform branding.

**Added:**
- `src/lottieRecolor.ts` — `recolorLottie(data, brand)`: remaps the "brand-adjacent" colour family (saturated blues, ~185–255°) to the brand's **hue + saturation + lightness** (the solid accent lands on the brand's exact shade; lighter/darker shades keep their offset, so shading survives). **Pale backgrounds (l ≥ 0.75, e.g. the tint circle behind the doctor) keep their lightness and get only a gentle tint** — they stay a soft wash, not a saturated fill. **Neutral brands (black/white/grey) desaturate to grayscale** instead of collapsing to hue-0 red. Skin/white/black/red are left untouched. Pure colour math (no deps).
- `LottiePlayer` gained `tintCssVar` — reads the brand colour from a CSS var (e.g. `--mk-accent` / `--hms-brand`), recolours (memoised), and re-applies on theme / branding change via a `MutationObserver` on `<html>`. `LottiePreloader` forwards it.

**Wired:** marketing hero doctor + marketing preloader → `--mk-accent`; Portal preloader → `--hms-brand`.

**Testing status:** `typecheck` green (7 ws) · both apps `next build` green. **Live-verified:** the doctor's accent (`#2ca6ff`, hue 208) renders at the brand hue — 188 in dark (`#22b8cf`), 193 in light (`#0e7490`) — updating live on theme toggle; skin tones and neutrals unchanged. Same tint path drives the ambulance preloader.

---

## 2026-08-15 — Shared Toast / notification system (ADR-026)

**What:** The one API-feedback surface for the whole platform. Until now `@hms/ui` shipped `Alert` only, so every page invented its own success/error copy.

**Added:**
- `src/toast.ts` — framework-free pub/sub store so `toast()` works from the apps' shared API client (outside React). `toast()` + `.success|.error|.warning|.info|.loading|.dismiss|.update`; de-duplication by `dedupeKey` (a repeat refreshes the existing toast and restarts its timer instead of stacking); visible stack capped at 4; per-variant default durations (success/info 5s, warning 7s, error/loading persist).
- `src/components/Toaster.tsx` — the viewport (mount once per app). Portals to `document.body`; timers pause on pointer/focus inside the stack; **Esc** dismisses the newest; per-toast dismiss button; optional action button. `role="alert"`/assertive for error+warning, `role="status"`/polite otherwise, inside a labelled `region`.
- `styles.css` — `--hms-info` / `--hms-info-subtle` tokens (Light + Dark; the palette had success/warning/danger only) and the `.hms-toast*` block: token-driven variants, Lucide icons, radius `lg`, `--hms-shadow-md`, mobile top-full-width → desktop bottom-right at `bottom: 5.5rem` (clears `BackToTop`), `z-index: 1000`, entrance animation disabled under `prefers-reduced-motion`.
- Exported `Toaster`, `toast`, `subscribeToasts`, `getToasts` + types from `src/index.ts`.

**Design reference:** shadcn/ui Toast as a *pattern* only — no shadcn/Radix dependency (Dependency Rules: no second UI library).

**Testing status:** `typecheck` green · both apps `next build` green. **Live-verified in the Portal:** a branding save raised `hms-toast--success` (`role="status"`, "Branding saved."); a 404 raised `hms-toast--error` (`role="alert"`, `aria-live="assertive"`, backend message "User not found") which persists until dismissed. Positioned bottom-right (352×67 at y=573 in a 1280×720 viewport, `bottom: 88px`) clear of `BackToTop`; Dark theme re-checked via `data-theme="dark"` (bg `#2a1512`, fg `#e7eff0`, icon `#f0776a`).
