# @hms/utils — DONE.md

Append-only implementation log. Newest at the bottom.

---

## 2026-08-13 — Package scaffolded (Phase 0 / Task #1)

**What:** Created the `@hms/utils` workspace as the home for shared, framework-agnostic helpers. Intentionally a stub (`export {}`) in Phase 0.

**Decisions:** Helpers are pure and framework-agnostic (usable from both API and Portal) and added only when genuinely shared by 2+ consumers. Populated as Stage 1+ modules need formatting/id/validation helpers.

**Testing status:** `typecheck` green (empty barrel).

---

## 2026-08-15 — Centralized date layer, `DD/MM/YYYY` (ADR-030)

**What:** `@hms/utils` was an empty placeholder; it now owns every user-facing date on the platform.

**Added — `src/date.ts`:** `formatDate` (`15/08/2026`), `formatDateTime` (`15/08/2026 14:05`), `formatTime` (24-hour), `formatDateRange` (collapses same-day, handles open ends), `parseDate` (Date / ISO / epoch / `YYYY-MM-DD` read as a **local** calendar date / `DD/MM/YYYY` round-trip), `isValidDate`, `compareDates` (comparator, invalid sorts last), `isSameDay`, `toApiDate` / `toApiDateTime` (ISO-8601 for transport), `todayApiDate`, `addDays`. Missing values render an em dash, never "Invalid Date". No date library — the arithmetic is deterministic and dependency-free.

**Why:** ten Portal screens formatted with bare `toLocaleDateString()` / `toLocaleString()`, which renders in the *viewer's* machine locale — `08/15/2026` on a US-configured browser. On a clinical record `08/09/2026` is genuinely ambiguous.

**Testing status:** `typecheck` green across the monorepo; verified in the running Portal (patients' "Registered" column renders `14/08/2026`).
