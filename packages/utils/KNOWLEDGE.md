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
