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

---

## 2026-08-15 — Standard DataTable rebuilt on TanStack + shared UI patterns (ADR-029)

**What:** The 83-line `DataTable` (columns/rows + three states) became the platform's full table system, and the patterns every module was about to duplicate now exist once.

**Added — `src/components/data-table/`** (dependency: `@tanstack/react-table` ^8.21.3, headless, following the shadcn/ui Data Table pattern):
- `DataTable.tsx` — sorting (multi-level via Shift+click), toolbar search, faceted filters, column visibility, row selection with select-all, configurable pagination (10/20/50/100), sticky header, contained horizontal scroll, skeleton/empty/error states, optional **URL state** (`?page/size/q/sort`), and a **`server` mode** that reports `{ page, pageSize, search, sort }` to the caller (debounced search) instead of paging in the browser.
- `DataTableToolbar` (Search → Filters → Columns → Actions), `DataTablePagination` (rows-per-page + windowed page numbers + "Showing X–Y of Z"), `DataTableColumnHeader` (three-state Lucide sort indicator + multi-sort order badge), `DataTableViewOptions` (show/hide/restore columns), `DataTableFacetedFilter` (multi-select built from a column's distinct values, with counts), `types.ts`.
- **Column API is a superset of the old one** — `{ key, header, cell }` plus optional `accessor`, `sortable`, `filterable`, `filterLabel`, `searchable`, `hideable`, `defaultHidden`, `align`, `width` — so all 12 existing Portal screens compiled unchanged and opt into features by adding flags.

**Added — shared patterns:** `Menu` (the one dropdown: `aria-expanded`/`aria-haspopup`, Esc + outside-click close, arrow-key roving focus, checkbox items), `ActionMenu` (row actions; destructive items route through a confirmation), `ConfirmDialog` (portalled, focus-trapped, Esc, scroll-locked via `useScrollLock`), `EmptyState`, `ErrorState` (with retry), `Skeleton`.

**Changed:** `styles.css` gained the toolbar/search, sortable-header, pagination, menu, states, skeleton (shimmer, disabled under `prefers-reduced-motion`) and dialog blocks — all token-driven. `src/index.ts` exports the new system. **Deleted** `src/components/DataTable.tsx` (replaced, not kept alongside).

**Testing status:** `typecheck` green (8 workspaces) · `next build` green. **Live-verified in the Portal:** Providers — clicking a header cycled unsorted → asc → desc with the indicator active, search narrowed 3 rows to 1, faceted filters rendered for Specialties and Status. Patients (server mode) — typing `ravi` issued one debounced request, put `?q=ravi` in the URL and returned 1 row; the Columns menu listed only hideable columns, restoring the default-hidden "Registered" column showed `14/08/2026`; pagination read "Showing 1–3 of 3" with a 10/20/50/100 selector; each row carried the shared action menu.

---

## 2026-08-15 — Toast replaced with shadcn/ui's Base UI Toast (ADR-032)

**What:** The hand-written notification system was swapped for the real registry component, at the owner's direction (superseding ADR-031, which had kept ours).

**Added:**
- `src/components/toast/toast.tsx` — generated with `shadcn add @shadcn/toast` (base-nova) and moved here so both apps still share **one** implementation. Three annotated adaptations: `cn` from this package; shadcn's `Button` dependency replaced with our `.hms-btn` classes (the shared kit must not carry a second button); Base UI's `className`-as-a-function state API merged instead of dropped. Desktop viewport lifted (`sm:bottom-22 sm:right-7`) so it clears `BackToTop`.
- `@base-ui/react` as a real dependency of `@hms/ui` (it was installed in the apps but unused).

**Changed:**
- `src/toast.ts` — no longer a bespoke store; now a thin adapter over Base UI's `createToastManager()` that preserves the existing call-site API (`toast.success(...)`, `toast.error({title, description})`, `dismiss`, `update`), maps our variants → Base UI `type` and durations → `timeout` (success/info 5s, warning 7s, error/loading persist), and keeps **de-duplication** so a retried request refreshes its toast. Plain TypeScript, because the shared API client raises notifications from outside React.
- `src/components/Toaster.tsx` — wraps the generated `Toaster` (stack limit 4).
- `styles.css` — the whole `.hms-toast*` block **deleted**; only `.hms-toast-close-btn` remains (shadcn's close renders its own Button, which we replaced). `src/index.ts` drops `subscribeToasts` / `getToasts` / `ToastRecord`, which the store no longer provides.
- Both apps: `@source "../../packages/ui/src/**/*.{ts,tsx}"` in `globals.css`, so Tailwind compiles the classes the shared component ships. The per-app generated copies (`hms_frontend/components/ui/{toast,button}.tsx`) were **deleted** — the shared version is canonical.

**Testing status:** `typecheck` green (8 workspaces) · both apps `next build` green. **Live-verified in the Portal:** a branding save renders the Base UI toast (`data-slot="toast"` + portal/viewport/content/icon/title/description/close slots) reading "Success — Branding saved."; a 404 renders "Not found — User not found" with the danger icon colour (`#c0392b`); three rapid saves produce **one** toast (de-dup works); background resolves to `--hms-surface` in Light and `#112128` in Dark; radius comes from our `--hms-radius-lg` scale.

**Not verified — needs a human glance:** dismissal timing (auto-dismiss and the close button). Base UI removes a toast only once its exit animation completes, and the agent's preview pane does not composite frames (`document.hidden === true`, zero `requestAnimationFrame` ticks), so CSS animations never run there and toasts stay in the DOM. Expected to behave normally in a real browser; worth one look. The behavioural difference from the old timer-driven implementation is real: a backgrounded tab holds its toasts until it is shown again.

---

## 2026-08-15 — Shared app-like mobile navigation (ADR-033)

`src/components/MobileNav.tsx` — one implementation for both apps:
- **`BottomNav`** — fixed bottom bar, capped at five items (`BOTTOM_NAV_MAX_ITEMS`), icon + label, active state with `aria-current`, safe-area padding, ≥3rem touch targets, optional trailing slot, and a `linkAs` prop so each app passes `next/link` and navigation stays client-side.
- **`NavDrawer`** / **`NavDrawerItem`** / **`NavDrawerSection`** — portalled slide-out drawer: background scroll locked through the shared `useScrollLock`, its own scroll region marked `data-lenis-prevent`, focus trapped and returned to the trigger, closes on Esc and backdrop press.
- `styles.css` gained `.hms-bottomnav*`, `.hms-drawer*` and `.hms-bottomnav-offset` (the padding that keeps page content clear of the fixed bar), all token-driven, animations disabled under `prefers-reduced-motion`.

**Testing status:** `typecheck` green; both apps build. Live-verified at 375px in the Portal — bar shows the permission-filtered destinations with the active one marked, drawer lists every permitted module, scroll lock + Esc + focus trap all behave.

---

## 2026-08-15 — Component tests, and the accessibility defect they found

**Added:** Vitest + Testing Library (jsdom) with `test` / `test:watch` scripts. 27 tests:
- `toast.test.ts` (14) — variant → Base UI `type` mapping, per-variant durations (success/info 5s, warning 7s, error/loading persist), explicit-duration override, and **de-duplication**: three identical calls produce one toast and two updates, different variants of the same text stay separate, an explicit `dedupeKey` collapses differing text, and a dismissed message can be raised again.
- `DataTable.test.tsx` (13) — the full sort cycle (unsorted → asc → desc → unsorted), numeric-not-lexical sorting, no sort control on a column without an accessor, search across searchable columns, client pagination with a true total, and the **server-mode contract**: rows are not re-paginated locally, page changes report `{ page, pageSize }`, and a header click emits the sort the user just asked for.

**Defect found and fixed:** every sortable header announced as **"Column, not sorted"** to a screen reader, because `children` is a React node rather than a string. `DataTableColumnHeader` gained an explicit `name` prop, and `DataTable` passes the column label from its meta — so headers now announce "Patient, not sorted. Activate to sort." This was invisible to sighted testing and only surfaced because the test asked for the control by its accessible name.

**Testing status:** 27 passed; both apps still build.

---

## 2026-08-16 — One Action column, and branding that survives a hover (ADR-039, ADR-040)

**Added — `src/components/table-actions/`:** the single row-actions system. `actionsColumn()` fixes the column (last, right-aligned, "Actions", never sortable or hideable); `TableActions` groups the controls; `ViewAction` / `EditAction` / `DeleteAction` / `ToggleAction` cover the common set, `TableAction` carries a module's own operation with its own icon and label, and `MoreActions` holds the overflow. One internal control implements all of them, so iconography, sizing, spacing, hover / active / focus, tooltips, accessible names, `disabledReason`, the loading spinner, confirmation, and permission gating exist once. `permitted={false}` renders nothing; `DeleteAction` always routes through `ConfirmDialog`; `ToggleAction` is a real `role="switch"` on the brand token.

**Migrated and deleted:** `ActionMenu` became `MoreActions` (its `RowAction` type is now `MoreAction`, with `visible` renamed to `permitted`), and `ActionMenu.tsx` was removed rather than left alongside. `Menu` gained `triggerBase` so the "…" trigger can wear the row-action shape instead of the secondary-button one.

**Fixed — branding held at rest and broke on interaction.** `--hms-brand-hover` was a second literal in both themes, and the Portal's tenant-branding path wrote the *same* hex into brand and brand-hover, so a branded control flattened on hover and had no pressed state. Hover and subtle now derive from `--hms-brand` via `color-mix` (darken on Light, lighten on Dark), `BackToTop` gained an `:active` state, and only `--hms-brand` is ever set at runtime.

**Styles:** `.hms-rowactions` / `.hms-rowaction` (2rem icon button, accent-subtle hover, danger tint for destructive, ring focus, 45% disabled, spinner) and `.hms-switch` (brand-filled track, `brand-fg` thumb). `.hms-actions__trigger` was deleted with `ActionMenu`. All of it reduced-motion aware.

**Testing status:** 38 passed (11 new in `TableActions.test.tsx` — permission gating, group labelling, disabled reason surfaced as the tooltip, no input while loading, delete requiring the confirmation, cancel leaving the record alone, switch semantics and its confirm gate, `MoreActions` rendering nothing when nothing is permitted, and the generic action using the same control). Both apps build.

---

## 2026-08-16 — `BrandMark`: one Nirogix mark, drawn from tokens

**Added `BrandMark`** — an N monogram in a rounded tile, inline SVG with the tile in `--hms-brand` and the letter in `--hms-brand-fg`. It replaces four separate placeholders: a hardcoded letter **"H"** left over from the old name in the marketing header and footer, and blank teal squares on the Portal's login card and in the app shell (desktop sidebar and mobile header). Because it reads the tokens, it follows Light/Dark, a tenant accent, and — through the marketing token bridge (ADR-040) — the marketing accent, with no asset to ship and nothing to re-export when the brand colour changes.

Both apps now carry `app/icon.svg` with the same geometry (literal colours, since a favicon renders outside the page's token scope), replacing the default Next.js `favicon.ico` in each — deleted, not left alongside.

**Testing status:** typecheck + both builds clean; verified in the running apps — the mark resolves to `#0e7490` in the Portal and to the marketing accent on the marketing site, and no stray "H" remains.

---

## 2026-08-16 — Dashboard charts, without a charting dependency (ADR-043)

**Added `src/components/charts/`:** `AreaChart` (gradient fill, hover cursor that snaps to a real data point), `BarChart` (stacked), `StatCard` (KPI tile with delta and optional sparkline), `UsageBar` (labelled proportion as a real `progressbar`), and `geometry.ts` holding the maths so it can be tested away from the DOM.

**Why no library:** the platform needs a small, consistent set of visualisations. A charting package would add bundle weight and a second styling system to keep on-brand, when the whole requirement is four shapes drawn from tokens. Colours arrive as tokens from the caller, so every chart follows Light/Dark and a tenant accent for free.

**Accessibility is part of the component, not a follow-up:** each chart repeats its numbers in a visually-hidden table (a `<svg>` alone tells a screen reader nothing), the cursor never reads out an interpolated value, and `UsageBar` announces its real value against its total.

**Testing status:** 13 new tests (domain padding, the flat-zero case, top-down mapping, closed area paths, cursor snapping, tick endpoints, compact formatting, the accessible table, empty states, the loading skeleton in place of a false zero, inverted deltas, and the progressbar's ARIA values). 51 pass.

---

## 2026-08-16 — The document kit, and date/time display components (ADR-046, ADR-047)

**Added `src/components/print/`** — `PrintDocument` (branded header, title, reference, meta block, confidentiality footer, generated-at stamp) plus `PrintSection`, `PrintFields`, `PrintTable`, `PrintTotals`, `PrintSignatures`, `PrintNote` and `PrintToolbar`. The stylesheet owns what makes a document a document: A4 `@page` margins, millimetre geometry, **repeating table headers across pages**, rows and totals that never split across a break, and `print-color-adjust: exact` so the hospital's accent survives the printer's default of stripping backgrounds. Branding is passed in — the kit never assumes whose document it is, which is what lets tenant branding and the platform default share one implementation.

**Added `DateDisplay` / `TimeDisplay` / `DateTimeDisplay`** for the new universal format: `DD/MM/YYYY`, `hh:mm AM/PM`, `DD/MM/YYYY, hh:mm AM/PM`. Each renders `<time datetime="…">` carrying the ISO instant, so assistive technology gets something unambiguous while the reader gets the platform format. `badge` renders the meridiem as a token-styled chip for schedules and pickers.

`@hms/utils` became a dependency of this package — the render layer and the formatting layer belong together, and duplicating the format here is exactly what ADR-046 exists to prevent.

**Testing status:** 7 new tests (format, the ISO attribute, the badge, midnight as 12 AM). 58 pass.

---

## 2026-08-16 — Date and time entry: shadcn's picker, promoted into the kit (ADR-048)

**Added `src/components/datetime/`** — `Calendar`, `DateField`, `TimeField`, `DateTimeField`.

`Calendar` is shadcn/ui's Base UI calendar (generated with the CLI, `react-day-picker` engine) restyled onto `--hms-*` and wired to this package's `cn`. The generator also pulled in shadcn's own `Button` and `lib/utils`; both were dropped and the generated copies deleted, because keeping them would have been the second button system ADR-028 exists to prevent.

`DateField` owns its own text and its own calendar: typed and picked in `DD/MM/YYYY`, emitting ISO. An impossible date (`32/13/2026`) or one outside `min`/`max` restores the last good value rather than leaving the form with something it would submit. `TimeField` is `hh:mm` plus an AM/PM toggle and emits 24-hour `HH:mm`. `DateTimeField` composes the two into one ISO instant.

**`react-day-picker` is the one new dependency**, and it belongs to this package rather than an app. It earns its place: an accessible month grid with roving focus, keyboard navigation and disabled ranges is hard to get right and expensive to get wrong. Its internal `date-fns` never formats anything the platform displays — that remains `@hms/utils` (ADR-046).

**One defect found in the browser, not by the tests.** The calendar opened and never closed — not on selecting a day, not on the trigger, not on Escape. Base UI marks a closing popup with `data-ending-style` and unmounts it once the exit animation *completes*; our stylesheet declared no transition, so nothing ever completed. Adding one surfaced the second half: Base UI closes some interactions instantly (`data-instant`), leaving `data-ending-style` behind, which then rendered the **next** open invisible. The popup's visibility is now keyed off `data-closed` alone — the attribute that stays truthful — with `visibility: hidden` so a closed popup is out of the accessibility tree whether or not it has been unmounted yet. Worth remembering for the next Base UI surface we style.

**A second layout defect, also only visible in a browser.** The month arrows floated across the middle of the day grid, covering the first week. `react-day-picker` renders its `nav` as a **sibling of the month**, inside `months` — not inside the caption — so `position: absolute; inset: 0` resolved against the popup and stretched the nav over the whole calendar. `months` is now the containing block and the nav is pinned to the caption's own 2rem strip, with the caption padded so a long month name never runs under an arrow.

**And a third: the calendar rendered *behind* the table.** `z-index: 70` sat on the popup — which Base UI leaves `position: static` — and z-index does nothing on a static element. The positioned box is the Positioner, so that is where the stacking layer belongs; a sticky table header was painting straight over an open calendar until it moved. Confirmed with `elementFromPoint` at four points across the calendar: all four now hit the popover.

**Testing status:** 10 new tests (ISO ↔ DD/MM/YYYY both ways, clearing, impossible dates, range refusal, the labelled calendar trigger, meridiem conversion, the noon/midnight edges, incomplete entry). 68 pass. Verified in the running Portal: typing `32/13/2026` reverts to the last good date, a valid date commits, the calendar opens, picks, and closes.

## 2026-08-16 — `Field` gains a `hint` (ADR-049)

**What:** `Field` now takes `hint` alongside `error`. The hospital-information form needed guidance on twelve fields at once ("6 digits", "15 characters", "include https://"), and hand-rolling a caption under each input would have been the second implementation of the same pattern — which is exactly what ADR-029 rules out.

`error` replaces `hint` when both are present, so a field never shows two competing messages, and both are wired through `aria-describedby` so a screen reader announces the guidance with the field rather than leaving it as unattached text. The new `.hms-field__hint` class takes its colour from `--hms-fg-muted`, so it reads as help rather than as an error in both themes.

**Testing status:** 68 tests pass (no behaviour change to existing usage — `hint` is optional and absent everywhere else). Rendered in the Portal's hospital-information form in Light and Dark.


## 2026-08-16 — `PasswordField` gains `hint`

**What:** The same `hint` prop `Field` got with the hospital-information form. The AI Portal's sign-in needed to explain that there is no self-service password reset, and reaching for a hand-rolled caption under one input while `Field` had a proper prop would have been the second implementation of the same pattern.

`error` replaces `hint` when both are present, and whichever renders is wired through `aria-describedby` — identical behaviour to `Field`, which is the point.

**Testing status:** 68 tests pass; `hint` is optional and absent everywhere else, so nothing changed for existing usage.

## 2026-08-16 — `Textarea`, and letterhead in the print kit (ADR-056)

**What:** `Textarea` — the multi-line counterpart to `Field`, with the same label / error / hint contract and the same `aria-describedby` wiring, on the same `hms-input` definition so a form can mix single and multi-line inputs without a second set of conventions. There was no shared multi-line field; the letterhead footer would otherwise have been the first hand-rolled one.

`DocumentBrand` gained `headerLine`, `footerLine`, `signatoryName` and `signatoryDesignation`. The header line prints between the hospital's name and its address block (it reads as identity, not another contact); the footer line prints full-width above the platform's confidentiality notice rather than replacing it — one is the hospital speaking, the other is ours, and neither should silence the other. `PrintSignatures` takes `brand` and an **opt-in** `useDefaultSignatory` per line, so a patient's signature line is never filled in with the hospital's signatory.

**Testing status:** 68 tests pass; every new field is optional, so existing documents render exactly as before.

## 2026-08-16 — Column alignment was only ever half applied

**What:** `align` on a DataTable column moved the **cells** and left the **heading** behind, in every table in the product. The class was going onto the sort control inside the `th` — an `inline-flex` button that shrinks to its label, so `justify-content: flex-end` had no space to work in and the `th` itself was never told to align anything. Billing's Total sat right while "Total" sat left; the Actions heading sat left of its own buttons.

Fixed in one place: the alignment class goes on the `th`, and a non-left alignment makes the sort control `display: flex; width: 100%` so it can justify. Heading and values now move together, for every column of every table.

Also added `.hms-qr-poster` to the document kit, for the patient-registration poster (ADR-056).

**Testing status:** 68 tests pass; typecheck and build clean across the monorepo.

## 2026-08-16 — React Toastify replaces the shadcn/Base UI Toast (ADR-057)

**What:** The engine changed. The API did not.

`react-toastify` is now known to exactly two modules, both inside this package — the adapter `src/toast.tsx` and the viewport `src/components/Toaster.tsx` — and the adapter exposes exactly the same surface it did before — `toast.success | error | warning | info | loading`, `dismiss`, `update`, the same `ToastOptions`. **No page changed, and no page could have**: every notification already goes through the shared API client, which is what ADR-026 is for. A migration that touched call sites would have been evidence that ADR-026 was not being followed.

**What went away:** `src/components/toast/toast.tsx` (~200 lines of generated shadcn source) and its Tailwind-class styling, which resolved to `--hms-*` only indirectly through each app's shadcn token remap. `@base-ui/react` stays a dependency — `DateField` uses its Popover.

**De-duplication got simpler and more correct.** The de-dupe key *is* the toast id now, and liveness is read back with `toast.isActive`, so the adapter keeps no state. The old version held its own key→id map that could retain an entry for a toast the user had already dismissed.

**Theming is one commented block.** Every `--toastify-*` variable points at a `--hms-*` token, and the library's own `theme` prop is pinned and neutralised so Light/Dark is one definition rather than two. Verified in the browser with `data-theme="dark"` and an accent of `#c026d3`: surface `#112128`, text `#e7eff0`, border `#22353c`, and the icon, accent edge and progress bar all `rgb(192,38,211)` — the whole chain, tenant brand → tokens → toast, with no colour at any call site.

**Two things found by looking rather than assuming:**
- React Toastify's own `<=480px` rule sets `top`, `left` and `width` as **literal values, not through its variables** — so overriding the variables left a phone toast pinned at the very top, covering the app bar. The mobile block overrides the properties directly and keeps the safe-area inset.
- At the same breakpoint the library forces `border-radius: 0`; the override needed container scoping to outrank it regardless of stylesheet order.

**Accessibility:** each variant renders a distinct icon *and* a title in words, so status never rests on colour; errors and warnings take `role="alert"` and everything else `role="status"`; the region is labelled; the close control has an accessible name. Verified in the DOM.

**Testing status:** 19 tests (was 14), covering variant and role mapping, durations, de-duplication, the loading → outcome transition, and dismissal — 73 in this package. Verified live in the Portal across all five variants, a four-deep stack, an action button, Light and Dark, a non-default accent, and a 375px viewport.

## 2026-08-17 — `Dialog`, and `ConfirmDialog` rebuilt on it (ADR-060)

**What:** `@hms/ui` had no modal primitive — only `ConfirmDialog`, which carried its own portal, scroll lock, focus trap, Esc handling and focus restoration. That blocked edit-in-place on three tables, and a second modal would have meant a second copy of all of it.

`Dialog` is that shell extracted: portal to `document.body`, `useScrollLock`, Tab trap, Esc, backdrop close, focus restore, `sm`/`md`/`lg` sizes, and a scrolling body so a long form doesn't overflow a short viewport. **`ConfirmDialog` is now built on it** rather than beside it — migrate, verify, delete, not two systems side by side. What's left in it is only what makes a confirmation one: the warning icon, two buttons, `role="alertdialog"`, and no close × because a confirmation is answered rather than dismissed.

**One thing the browser caught that the typecheck could not.** Focus opened on the **close ×**, not the first field — the close control sits in the header and therefore comes first in DOM order, so "focus the first focusable" did exactly the wrong thing for an edit dialog: the user's next keystroke would have dismissed the thing they opened to type into. Focus now targets the first control in the *body*, falling back to the panel for a confirmation that has none. My own code comment had claimed the correct behaviour while the code did the opposite, which is the kind of thing only rendering it finds.

**Verified in the browser**, not by inspection: portalled to body; `role`, `aria-modal`, and both `aria-labelledby` and `aria-describedby` resolving to real elements; the field prefilled and focused; Save disabled until something actually changes; the submitted patch containing **only the changed field**; the dialog closing after save; scroll unlocking; and Esc closing.

**Testing status:** 73 tests pass; typecheck and build clean across all six workspaces.

## 2026-08-17 — Clickable stat cards, server-side DataTable filters, and a date-range control (ADR-062, ADR-063)

**Stat cards act now.** `StatCard` already coloured a trend by what it *means* (`invertDelta`) and skeletoned a loading value; what it could not do was be a destination, so dashboards had begun hand-rolling clickable tiles around it. It now takes an optional `href` (Next `Link`) or `onClick` and renders a link/button with hover, `focus-visible`, keyboard and active states, a persistent arrow affordance, an accessible name (`linkLabel`), and a `highlight` variant — or stays a plain `div` when there is nowhere useful to go. One tile for every dashboard; none is made clickable for uniformity.

**The DataTable server contract now carries filters.** The bug ADR-063 names: `server.onChange` emitted only page/size/search/sort, so a faceted filter on a server-paged table narrowed only the rows already in the browser. `DataTableQuery`/`ServerMode` gained a `filters` map; the table seeds it on mount, re-emits on change and on Clear, and resolves the filter updater *outside* `setColumnFilters` so the request fires once, not twice under StrictMode. Callers that filter client-side are unaffected; the five server-mode tables just needed `filters: {}` in their initial query.

**`DateRangeFilter`** — the structured control a bare search box cannot replace for a date column. Two `DateField`s (so `DD/MM/YYYY` display, ISO value), each bounding the other, plus a clear control; it drops into the toolbar's `filters` slot and the module owns the value.

**Testing status:** 83 `@hms/ui` tests pass (+10: stat-card link/button/variant/affordance, the server-filter seed + emit + clear path, faceted-select emit, and the date-range control); typecheck clean across all eleven workspaces.

## 2026-08-17 — Faceted filters take predefined options (ADR-063)

`DataTableFacetedFilter` derived its options from the data, which is wrong in **server mode**: the table holds one page, so a closed enum (status, severity) would only offer the values that happened to be on it. A column may now declare `filterOptions` — a fixed list the filter shows in full, with a live count where a value is present on the page. This is what let appointments, billing and audit drop their bespoke status/severity `<select>`s for the one shared faceted filter.

**Testing status:** 84 `@hms/ui` tests pass (+1); typecheck clean across all workspaces.

## 2026-08-17 — Shared `PageHeader` and `PhoneField`

**`PageHeader` moved into `@hms/ui`.** The Portal and the Admin console each carried an identical local `PageHeader`, and the Portal's role dashboards used a *different* title block (a context line above a `text-2xl` title) via `DashboardShell`. There is now one `PageHeader` here — title, optional muted description beneath, optional right-aligned actions that wrap on a narrow screen — and both apps' local files re-export it, so every tab reads the same and cannot drift. `DashboardShell` renders it too (the day/shift context becomes the description, the range chips and primary action the actions), so a dashboard's header now matches Patients, Reports and every other page. `/reports` gained the description it was missing.

**`PhoneField` — the Indian-mobile input.** `+91` is a fixed, non-editable prefix, so the user types only their 10 digits; the value crossing the boundary is always canonical `+91XXXXXXXXXX` (or `""` while incomplete), matching what the backend stores and what the SMS provider needs. Paste is taken over so a pasted `+91…`/`91…`/`+91+91…` collapses to the last ten digits instead of doubling the country code; a legacy value in any format seeds the display leniently. `localIndianMobile` / `canonicalIndianMobile` are exported for reuse. Built on the `.hms-input` tokens, verified in both themes.

**Testing status:** 93 `@hms/ui` tests pass (+6: PhoneField normalisation, seeding, paste, incomplete-state); typecheck clean across all workspaces; the four consuming apps build clean.

## 2026-08-17 — `NumberRangeFilter`, the amount range (ADR-063)

The date-range's numeric sibling: a min–max control for a column filtered by an amount or count, built on the same `.hms-rangefilter` chrome. Values are plain numbers in the caller's unit (billing passes rupees and converts to paise at the API), an emptied field is an open end (`null`, not zero), and one end bounds the other. Wired into billing as the invoice-total filter — the last named ADR-063 gap.

**Testing status:** 87 `@hms/ui` tests pass (+3); typecheck clean across all workspaces.

## 2026-08-17 — Every DataTable column is left-aligned (ADR-064)

The DataTable's per-column `align` option is **gone** — removed from the `Column` type, the header (`th`), the sort control and the cells (`td`), so every column renders left, heading and values alike, with no way to opt out. The Action column (`actionsColumn`) lost its right-alignment too (still last, still shrink-to-fit). Every `align:` in a DataTable config across both apps and the now-dead `hms-cell--right/center` + `hms-th__sort--right/center` styles were deleted. `PrintTable` is untouched — a printed invoice still right-aligns money.

**Testing status:** 93 `@hms/ui` tests pass (the Qty column's `align` assertion was dropped with the option); typecheck clean across all 11 workspaces; both apps build clean.

## 2026-08-17 — PrintDocument: letterhead image + page size (ADR-065)

`DocumentBrand` gains `letterheadImageUrl` and `pageSize`, and `PrintDocument` a `pageSize` prop that overrides the tenant default. When a letterhead image is set it renders as a full-width band that **replaces** the constructed name/logo/contact header, and the document title moves to a bar beneath it. A single `PAGE_GEOMETRY` table maps each size (`A4`/`A5`/`LETTER`/`LEGAL`) to a sheet width (the `--doc-width` custom property) and a CSS `@page size` keyword the component injects itself — a bare `@page` cannot be scoped by selector, and the document renders one-per-page in a print route. New `.hms-doc__header--image`, `.hms-doc__letterhead` and `.hms-doc__title-bar` styles; `.hms-doc` width now follows `--doc-width` (A4 default). `PrintTable` alignment untouched.

**Testing status:** 93 `@hms/ui` tests pass; typecheck clean. Verified live: an invoice print document renders the uploaded letterhead band with the title beneath it and injects the configured `@page` size.

## 2026-08-18 — SmoothScroll: new routes start at the top, cross-page anchors respected (issue #8)

`ScrollTopOnRoute` (renamed `ScrollOnRouteChange`) was resetting scroll on every pathname change via `useEffect` → `lenis.scrollTo(0, { immediate: true })`. Two problems: (1) it ran **after** paint, so a new page could flash at the previous scroll position, and (2) it force-scrolled to the top on **every** route change — including navigations that carry a hash (`/security#residency`), so cross-page anchors were yanked to the top instead of landing on the anchor.

Now it runs in a **pre-paint** isomorphic layout effect and branches on the URL hash:
- **No hash** → `lenis.scrollTo(0, { immediate: true, force: true })` (native `window.scrollTo(0,0)` fallback for the first mount before the Lenis instance exists). The previous page's scroll never carries over.
- **Hash** → scrolls to that element, offset by the sticky-nav height read from CSS `scroll-padding-top`, so the anchor clears a fixed header. Unknown/stale hash falls through to the top.

`force: true` makes the reset win even if an overlay had `stop()`ped Lenis. Only the top-level document scroll is touched — `data-lenis-prevent` / `useScrollLock` regions are untouched. Component doc now warns consumers not to also set CSS `scroll-behavior: smooth` (it fights Lenis — see the marketing fix).

**Testing status:** `@hms/ui` typecheck clean; marketing + Portal production builds clean; no console errors after HMR. (End-to-end visual scroll behaviour verifies in a displayed browser — this session's preview pane can't composite frames, so Lenis' RAF loop is paused there.)

## 2026-08-19 — Global theme-aware scrollbars

**What:** One scrollbar treatment in `styles.css` for every scroll container in every consuming app: `scrollbar-width: thin` + `scrollbar-color` (Firefox) and `::-webkit-scrollbar*` pseudo-elements (Chromium/WebKit) — token-coloured thumb (`--hms-border`, hover `--hms-fg-subtle`), transparent track/corner, padding-box gutter. Colours come only from tokens, so Light/Dark follow `data-theme` and marketing's `--hms-* → --mk-*` bridge re-colours the marketing site with zero extra CSS.

**Testing status:** typecheck green; computed-style verified in the Portal — light thumb `#dbe6e7`, dark thumb `#22353c`, transparent track, `thin` — switching with the theme toggle.

## 2026-09-01 — `Select`, and the portals off Lenis (ADR-111, ADR-112)

**What:** The kit gained the primitive it was most obviously missing. `Select` is the one dropdown:
label, optional second line, optional right-aligned detail, grouping, extra search keywords, clear,
loading and empty states, and full combobox keyboard + ARIA behaviour. Search appears automatically
past seven options. **The panel is portalled to `document.body` and positioned in viewport
coordinates** — recomputed on capture-phase scroll and on resize, flipping above the trigger when the
space below is short and bounded by the room actually available — so a dialog body, a scrolling table
container or any other ancestor `overflow` cannot clip it. `--hms-text-xs` was added to the token
scale rather than hard-coding the smallest size inside one component.

Lenis was removed from the Portal and the Admin app (ADR-111), which meant two shared pieces had to
stop assuming it: `useScrollLock` now pins the document natively and compensates for the scrollbar
width so an opening dialog does not shift the page sideways, still stopping Lenis where an instance
exists; `BackToTop` takes visibility from the native scroll position, which is what makes it work at
all in the portals — its `useLenis` callback never fired there, so the button was dead.

**Testing status:** `@hms/ui` typecheck clean. **14 new `Select` tests** cover the search (including
multi-term matching in any order), the automatic search threshold, keyboard opening on the current
selection, disabled-option skipping, Escape and focus return, clearing, grouping, the loading and
empty states, the error/hint wiring, and — the one that guards the design decision — that the panel
renders **outside** an ancestor with `overflow`. The package now runs **107 tests, all passing** (was
93). `setup.ts` gained a `scrollIntoView` stub, which jsdom does not implement.

Browser-checked: no Lenis instance on the Portal or Admin after hydration, and the `lenis` class still
present on marketing. Visual verification of `Select` in Light + Dark under a non-default accent is
manual — cases SEL-01…SEL-10 in `testcases.md`.

## 2026-09-02 — A missing value says which kind of missing it is (ADR-123)

`src/components/EmptyValue.tsx`: `EmptyValue` and `ValueOrEmpty` for rendered absences,
`emptyLabel()` and `valueLabel()` for the places that need a string — a DataTable `accessor`, a
print document, an export, an accessible name.

Seven reasons, because a dash was saying three different things in the same three characters:
`unassigned`, `unspecified`, `notRecorded`, `notConfigured`, `notApplicable`, `none`,
`notAvailable`. The reason is a required decision at the call site, since only the call site knows
whether nobody has filled the field in, the field cannot apply to that row, or the value never
arrived.

Rendering is `text-fg-subtle`, no colour and no icon: an absence is not a status. The pairing that
matters is `valueLabel()` in the accessor with `ValueOrEmpty` in the cell — the column then filters
and searches on "Not assigned", which a `"—"` accessor could never do.

## 2026-09-02 — `.hms-bottomnav-offset` adds to the page padding instead of replacing it

The class exists to keep content clear of the fixed mobile bottom bar. It did that with
`padding-bottom: calc(4.25rem + safe-area)` below the breakpoint and **`padding-bottom: 0` above
it** — which silently cancelled the consuming layout's own bottom padding on every desktop screen.
The Portal shell's `<main class="p-5">` therefore padded three sides, and content sat flush against
the bottom of the scroll area.

It now composes: `padding-bottom: calc(var(--hms-page-pad, 1.25rem) + 4.25rem + safe-area)` on
mobile and `var(--hms-page-pad, 1.25rem)` on desktop. The default matches the app shell's `p-5`; an
app that pads differently sets the variable rather than fighting the rule.

Verified on the running Portal: `20px 20px 20px 20px` at 1280px wide, `20px 20px 88px 20px` at
375px.

## 2026-09-02 — A chart's screen-reader table was adding its full height to the page

`AreaChart` and `BarChart` each render a `<table>` of the plotted values for a screen reader,
marked `.hms-visually-hidden`. That class is a correct visually-hidden recipe for almost any
element and **not for a table**: a table sizes to its content and ignores `width: 1px;
height: 1px`, so the box never shrank. The element stayed absolutely positioned at its natural
height — 744px on a dashboard — and lengthened the document by however much of that fell below the
app shell, which is the blank scroll area reported on `/dashboard` in both the Portal and the admin
console.

The wrapper now carries the class and the table sits inside it: clipped, invisible, and still a
table. Putting `display: block` on the table would also have hidden it and would have stripped the
table semantics the markup exists for, which is the one thing it is there to provide. The utility
now says so in a comment, so the next table does not repeat it.

## 2026-09-02 — The focus trap was re-arming on every keystroke, and a wheel could edit a number (ADR-127)

**`Dialog` and `NavDrawer` depended on their `onClose` prop.** Their focus-trap effect listed
`[open, onClose, busy]`, and every caller passes an inline `onClose={() => setOpen(false)}` — a new
function on each render. So a keystroke inside the dialog changed a dependency, ran the cleanup
(which returns focus to whatever opened it) and set the effect up again (which focuses the first
control in the body). Typing a digit into the fee field on the fee-schedule form moved the caret to
the Doctor dropdown after one character. Both now keep the current callback in a ref and depend on
`open` alone. Fixed here rather than by memoising the handler at ~20 call sites: a rule that says
"wrap your `onClose` in `useCallback` or the dialog misbehaves" is a rule that gets broken.

**`NumberInputGuard`** — one document-level wheel listener, mounted beside the providers in each
app. When the pointer is over a *focused* `input[type=number]` it cancels the wheel and **forwards
the scroll** to the nearest scrollable ancestor, so the value holds still and the page still moves.
Cancelling alone would have frozen the page. It is a document listener because React registers
`onWheel` passively and a passive listener may not `preventDefault`, and it is not a prop on an
input because it has to cover raw `<input type="number">` too.

Untouched on purpose: typing, arrow keys, `step`, decimals, validation, and touch devices, which
have no wheel.

**Testing status:** 107 `@hms/ui` component tests pass. Verified in the running Portal: typing
`500` into the fee field leaves focus on the field with the value intact, and wheeling up and down
over it leaves the value at `500`.

## 2026-09-02 — One place for a page's primary action (ADR-128)

*Book appointment* and *Check in* sat top-right in the page header. *Register patient* sat one row
lower, inside the table's filter toolbar beside **Columns** — one screen out of twenty-one, and the
one a receptionist opens most. It now matches every other list.

The mechanism was `toolbarActions` on the Standard DataTable, used by exactly one page in the whole
monorepo. A slot with one caller doing something no other caller does is not a feature in use; it
is an available way to be inconsistent. It is **deleted**, along with the `actions` prop it fed on
`DataTableToolbar`, so the toolbar is Search → Filters → Sort → Column visibility → Pagination and a
create button has nowhere else to go. A rule you cannot break beats one you have to remember.

Written down with it: supporting actions first and the primary **last** (right-most) — `ghost` for
navigating away, `secondary` for a side task like *Print / PDF*, the default variant for the action
the page exists for. That is what every multi-action header already did.

**Testing status:** 107 `@hms/ui` component tests pass unchanged; frontend typecheck clean.
Verified in the running Portal — *Register patient* now sits level with the page title, and the
filter row holds only search, filters and Columns.
