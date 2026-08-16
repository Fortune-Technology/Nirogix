# @hms/ui — KNOWLEDGE.md

The shared design system for the HMS monorepo. Consumed by `hms_frontend` (Portal) and `marketing`. Read after root `CLAUDE.md`.

## What's here

- **`src/styles.css`** — the **single design-token layer** (`--hms-*`: colour, radius, type, shadow) with **Light default (`:root`) + Dark (`[data-theme="dark"]`)**, plus overridable brand tokens (`--hms-brand*`) and the canonical CSS for every primitive. Imported once by the app: `import '@hms/ui/styles.css'`.
- **Primitives** (`src/components/`, all token-only — no hardcoded colour/spacing/radius/type): `Button`, `Field`, `PasswordField`, `Card`, `Badge`, `Alert`, `Spinner`.
- **`PasswordField`** is the **required** control for every password input across the platform (login, reset, change-password, admin user forms) — it carries a built-in show/hide (eye) toggle. Never use a bare `<input type="password">`; always reach for `PasswordField` so the reveal affordance is consistent everywhere.
- **The Standard DataTable system** (`src/components/data-table/`, ADR-029) — `DataTable` on a **TanStack Table** core, following the shadcn/ui Data Table pattern, plus `DataTableToolbar`, `DataTablePagination`, `DataTableColumnHeader`, `DataTableViewOptions`, `DataTableFacetedFilter`. Sorting (multi-level, Lucide indicators), search, faceted filters, column visibility, row selection, configurable page sizes (10/20/50/100), sticky headers, contained horizontal scroll, skeleton/empty/error states, optional URL state, and a `server` mode that delegates paging/sorting/search to the API. Columns are a **superset of the original `{ key, header, cell }`** shape — add `sortable` / `filterable` / `hideable` / `accessor` to opt in — so existing screens kept working when the engine changed.
- **`Menu` / `MenuItem` / `MenuCheckboxItem`** — the one dropdown primitive (Esc + outside-click close, arrow-key roving focus); `MoreActions` and `ConfirmDialog` (focus-trapped, scroll-locked) build on it. `triggerBase` swaps the trigger's base classes so a row action's "…" matches the other icon actions.
- **The Action column** (`src/components/table-actions/`, ADR-039) — `actionsColumn()` defines the column (last, right-aligned, headed "Actions", never sortable or hideable); `TableActions` groups up to three inline icon actions built from `ViewAction` / `EditAction` / `DeleteAction` / `ToggleAction`, plus `TableAction` for a module's own operation ("Check in", "Start consult", "Revoke module"), with `MoreActions` for the overflow. The components own the icons, sizing, hover/active/focus, tooltips, accessible names, `disabledReason`, loading spinner, confirmation, and permission gating (`permitted={false}` renders nothing); a page passes intent only. `DeleteAction` always confirms; `ToggleAction` is a real `role="switch"`. Supersedes the old `ActionMenu`, which was migrated into `MoreActions` and deleted.
- **`EmptyState` / `ErrorState` / `Skeleton`** — the shared states, used by the DataTable and directly by pages.
- **`cn`** — tiny classname joiner (no clsx dependency).
- Behaviour helpers: `SmoothScroll` (Lenis), `useScrollLock`, `BackToTop`, `LottiePlayer`/`LottiePreloader`, `lottieRecolor`.

## `Toaster` / `toast()` — the one notification surface

shadcn/ui's **Base UI Toast**, generated with `shadcn add @shadcn/toast` and adapted into this package (ADR-032) so both apps share one implementation. Never build a second one.

- **`src/components/toast/toast.tsx`** — upstream shadcn source with three annotated adaptations: `cn` from this package, shadcn's `Button` dependency replaced by our `.hms-btn` classes, and Base UI's `className`-as-a-function state API merged rather than dropped. Its Tailwind classes (`bg-popover`, `text-muted-foreground`, `rounded-2xl`…) resolve to `--hms-*` / `--mk-*` through each app's token remap, so it is on-brand in Light/Dark and under a tenant accent with no extra styling. The desktop viewport is lifted to clear `BackToTop`.
- **`src/toast.ts`** — the thin adapter over Base UI's `createToastManager()`. Keeps the call-site API (`toast(msg)` / `toast.success|error|warning|info|loading(...)` / `toast.dismiss(id?)` / `toast.update(id, patch)`), maps our variants to Base UI `type`s and our durations to `timeout` (success/info 5s, warning 7s, error/loading persist), and de-duplicates by `dedupeKey` so a retried request refreshes its toast instead of stacking. It is plain TypeScript because the **shared API client** raises every notification from outside React.
- **`Toaster`** — mount once per app in the root layout; `limit` caps the visible stack at 4.
- Base UI supplies hover/focus pause, swipe-to-dismiss, F6 focus movement, and the polite/assertive live region. **Removal is animation-completion driven**, so a toast waits while a tab is backgrounded and clears once it is shown again.
- Tailwind must scan this package for those classes: both apps carry `@source "../../packages/ui/src/**/*.{ts,tsx}"` in `globals.css`.

## Rules

- No component hardcodes a raw visual value — everything derives from `--hms-*` (resources/rules.md → Design System). Theme switches by toggling `data-theme` on `<html>`; tenant branding overrides `--hms-brand` at runtime.
- **`--hms-brand` is the only brand value ever set** (ADR-040). `--hms-brand-hover` and `--hms-brand-subtle` derive from it with `color-mix` (darkening on Light, lightening on Dark), and `--hms-ring` is `var(--hms-brand)` — so one override re-skins resting, hover, pressed, focus and tinted states everywhere. Never write a second brand literal, and never set `--hms-brand-hover` from application code.
- **A consuming app maps these tokens onto its own scope, once.** The marketing site defines `--hms-*` in terms of `--mk-*` in its `globals.css`, so shared components (BackToTop, BottomNav, NavDrawer, Toast) follow the marketing accent and its platform-branding override instead of the Portal defaults.
- Consumed from **source** via the app's `transpilePackages` (no build step). React 19 is a peer dependency.
- Adding a token → add it to `styles.css`; the consuming app maps it into Tailwind's `@theme` if it needs a utility for it.

## Verify / build

- `npm run typecheck -w @hms/ui`. Visual verification happens in the consuming app in **Light + Dark** and under a non-default brand.
