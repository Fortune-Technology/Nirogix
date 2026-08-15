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

---

## 2026-08-15 — Vitest + date-layer tests (found and fixed an overflow bug)

**What:** First automated test suite outside the backend, per the strengthened testing rule (implement → automated tests → manual cases → verify).

- Added `vitest` (dev) and `test` / `test:watch` scripts.
- `src/__tests__/date.test.ts` — 18 cases covering DD/MM/YYYY rendering, zero-padding, the locale-independence the layer exists for, date-only strings read as **local** calendar dates, 24-hour times, DD/MM/YYYY round-trip, ISO transport conversion, the comparator's ordering (invalid last), same-day collapse and open-ended ranges, and month-boundary arithmetic. Mapped to `testcases.md` DATE-01 / DATE-02.

**Bug found and fixed:** `parseDate` accepted `32/13/2026`. JavaScript rolls `new Date(2026, 12, 32)` over into February 2027, so a typo'd date parsed as a real — but wrong — date instead of failing. Added `fromParts()`, which rejects any value whose components do not round-trip. This is exactly the class of defect that would have reached a clinical record silently.

**Testing status:** `npm run test -w @hms/utils` — 18 passed. `typecheck` green.
