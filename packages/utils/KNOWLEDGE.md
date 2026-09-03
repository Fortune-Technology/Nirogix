# @hms/utils — KNOWLEDGE.md

Shared, framework-agnostic utilities used across `hms_backend` and `hms_frontend`. Read after root `CLAUDE.md`.

## What's here

`src/index.ts` — the barrel. **Currently a stub** (`export {}`). This package is the home for small, pure, dependency-free helpers so no module reimplements them:

- Formatting (dates/time in IST, currency in ₹/INR, number formatting)
- Identifier helpers (UHID/MRN formatting, slug/code generation)
- Small validation helpers (phone/PIN/email shapes for the Indian context)

## Rules

- **Framework-agnostic + pure.** No React, no Express, no Node-only APIs unless clearly server-only and documented — helpers must be usable from both the API and the Portal. No side effects.
- Add a utility here only when it is genuinely shared by 2+ apps/packages; app-specific helpers stay in the app.
- Prefer the platform (Intl, Temporal-when-stable) over new dependencies.

## Verify

- `npm run typecheck -w @hms/utils`.

## Status

Intentionally empty in Phase 0 — helpers are added as the first modules that need them land (Stage 1+). Listed here so the package's purpose and rules are set before the first helper arrives.

## Dates (ADR-030)

`src/date.ts` is the platform's only date formatter. Every user-facing date is **`DD/MM/YYYY`** (`DD/MM/YYYY HH:mm` with a time); transport stays ISO-8601.

- `formatDate` · `formatDateTime` · `formatTime` (24-hour) · `formatDateRange` — display.
- `parseDate` — Date / ISO / epoch / `YYYY-MM-DD` (read as a **local** calendar date, so a date-only value never slips a day) / `DD/MM/YYYY`.
- `toApiDate` · `toApiDateTime` — back to ISO for APIs, query strings and `<input type="date">`.
- `isValidDate` · `compareDates` (safe comparator) · `isSameDay` · `todayApiDate` · `addDays`.

Absent or unparseable values render an em dash, never "Invalid Date". No component may call `toLocaleDateString()` or add a date library — extend this module instead.

## Colour (`src/color.ts`)


Only for the few places a brand colour must be used where the design tokens cannot reach — today, the dark modules of a printed QR code (ADR-056). Components still use the tokens and never a literal.

`ensureContrast(color)` returns the darkest-necessary version of a colour that still reads against a background, blending toward black in 5% steps so the **hue survives** — a hospital's pale teal becomes a darker teal, not black. The default threshold is **5:1**, above WCAG's 4.5:1 for text because the reader is a camera and the paper may be a photocopy, but not so strict that it overrides a colour already dark enough: measured on white, `#0f766e` (5.5:1) and `#7c3aed` (5.7:1) pass untouched, `#0d9488` (3.7:1) is nudged, and pale yellows and pinks around 2:1 are darkened properly.

`parseHexColor` / `toHexColor` / `relativeLuminance` / `contrastRatio` are the pieces it is built from, exported because they are useful on their own. `parseHexColor` returns `null` rather than guessing at anything that is not `#rgb` or `#rrggbb`.

## Browser security headers (`src/security.ts`, ADR-082)

`buildContentSecurityPolicy()` + `SECURITY_HEADERS` are the one source of the frontends’ browser policy, consumed from each app’s `proxy.ts`. Two shapes: **nonce mode** (`nonce` + `strict-dynamic`, no `unsafe-inline`) for the four authenticated apps, and **static mode** for `marketing`, whose pages must stay statically rendered. An app passes only its API origin and whether it is in development; it never writes directives of its own. `connectSrc` feeds both `connect-src` and `img-src`, because the API serves tenant logos and report attachments itself — over plain http in development.

## Shared vocabularies (ADR-135)

`GENDER_OPTIONS`, `BLOOD_GROUP_OPTIONS`, `RECORD_STATUS_OPTIONS` — the small closed lists more than
one screen asks for, as `{ value, label }` pairs a `Select` consumes directly.

They live **here and not in `@hms/ui`** because `ui` depends on `utils`; the reverse would invert
the dependency graph, and a blood group is not a design-system concern in any case. A list earns a
place here on its **second** caller. Anything a *hospital* defines for itself — consultation types,
case types, departments — never belongs here: that comes from the tenant's own configuration.

Label and value are deliberately the same string for blood groups. A typographic minus (`AB−`)
reads better in isolation and is wrong here: every other surface renders the stored `AB-`, and a
picker spelling it differently from the chart beside it reads as two answers to one question.
