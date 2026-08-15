# @hms/ui — KNOWLEDGE.md

The shared design system for the HMS monorepo. Consumed by `hms_frontend` (Portal) and `marketing`. Read after root `CLAUDE.md`.

## What's here

- **`src/styles.css`** — the **single design-token layer** (`--hms-*`: colour, radius, type, shadow) with **Light default (`:root`) + Dark (`[data-theme="dark"]`)**, plus overridable brand tokens (`--hms-brand*`) and the canonical CSS for every primitive. Imported once by the app: `import '@hms/ui/styles.css'`.
- **Primitives** (`src/components/`, all token-only — no hardcoded colour/spacing/radius/type): `Button`, `Field`, `PasswordField`, `Card`, `Badge`, `Alert`, `Spinner`.
- **`PasswordField`** is the **required** control for every password input across the platform (login, reset, change-password, admin user forms) — it carries a built-in show/hide (eye) toggle. Never use a bare `<input type="password">`; always reach for `PasswordField` so the reveal affordance is consistent everywhere.
- **`DataTable`** — the **Standard DataTable**: `columns` + `rows` + `rowKey`, with built-in loading / error / empty states and horizontal overflow. Every tabular view in the Portal renders through it.
- **`cn`** — tiny classname joiner (no clsx dependency).
- Behaviour helpers: `SmoothScroll` (Lenis), `useScrollLock`, `BackToTop`, `LottiePlayer`/`LottiePreloader`, `lottieRecolor`.

## `Toaster` / `toast()` — the one notification surface

The single API-feedback surface for both apps (ADR-026, `resources/DESIGN.md` §5, `resources/rules.md` → API Feedback & Notification Rules). Never build a second one.

- **`src/toast.ts`** — a framework-free pub/sub store, so `toast()` can be called from the apps' shared **API client** (plain TypeScript, outside React). `toast(msg)` / `toast.success|error|warning|info|loading(...)` / `toast.dismiss(id?)` / `toast.update(id, patch)`. Repeats collapse by `dedupeKey` (default `variant|title|description`) and refresh the existing toast; the visible stack is capped at 4.
- **`src/components/Toaster.tsx`** — mount once per app in the root layout. Portals into `document.body`. Durations: success/info 5s, warning 7s, error + loading persist. Timers pause while the pointer or keyboard focus is inside the stack; **Esc** dismisses the newest; each toast has its own dismiss button.
- **A11y:** `role="alert"` + `aria-live="assertive"` for error/warning, `role="status"` + polite otherwise; the viewport is a labelled `region`.
- **Visuals:** `.hms-toast*` in `styles.css` — semantic tokens (`--hms-success|danger|warning|info` + `-subtle`), Lucide icons, radius `lg`, `--hms-shadow-md`. Mobile: top, full width. Desktop: bottom-right at `bottom: 5.5rem`, clear of `BackToTop`. `z-index: 1000`. Entrance animation collapses under `prefers-reduced-motion`.
- API/ergonomics follow the shadcn/ui Toast **pattern**; shadcn/Radix is **not** installed (no second UI library — Dependency Rules).

## Rules

- No component hardcodes a raw visual value — everything derives from `--hms-*` (resources/rules.md → Design System). Theme switches by toggling `data-theme` on `<html>`; tenant branding overrides `--hms-brand` at runtime.
- Consumed from **source** via the app's `transpilePackages` (no build step). React 19 is a peer dependency.
- Adding a token → add it to `styles.css`; the consuming app maps it into Tailwind's `@theme` if it needs a utility for it.

## Verify / build

- `npm run typecheck -w @hms/ui`. Visual verification happens in the consuming app in **Light + Dark** and under a non-default brand.
