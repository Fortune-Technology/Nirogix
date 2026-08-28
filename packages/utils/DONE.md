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

## 2026-08-16 — `color.ts`: keeping a brand colour legible where tokens cannot reach

**What:** `parseHexColor`, `toHexColor`, `relativeLuminance`, `contrastRatio` and `ensureContrast`, added for the printed registration QR (ADR-056) — a raster image, so the token layer that normally derives readable values from `--hms-brand` cannot help it.

`ensureContrast` returns a colour unchanged when it already reads, and otherwise blends it toward black in 5% steps until it does. Blending rather than substituting is the point: a hospital's pale teal becomes a darker teal and stays recognisably theirs, where falling back to black would silently discard the choice they made.

**The threshold was set from measurement, not instinct.** The first draft used 7:1 and darkened the platform's own signature teal, which was the tell that the number had been guessed. Measured on white: `#0f766e` 5.5:1, `#7c3aed` 5.7:1, `#b91c1c` 6.5:1, `#0d9488` 3.7:1, and pale accents 1.3–2.3:1. The default is now **5:1** — above WCAG's 4.5:1 for text, because the reader is a camera and the paper may be a photocopy, but not so strict that it overrides a colour already dark enough to work.

**Testing status:** 11 new tests (31 in this package), covering parse rejection, the luminance and contrast bounds, a colour left alone, a marginal one nudged, a pale one darkened, hue survival, and termination even for white.

## 2026-08-20 — One Content-Security-Policy builder for all five frontends (ADR-082, SECURITY-AUDIT M-1)

**What:** `security.ts` — `buildContentSecurityPolicy()`, `SECURITY_HEADERS` and `originOf()`. No frontend had a CSP at all; five per-app policies would have drifted inside a release, so the policy is built here and each app supplies only what differs: its API origin, and whether it can carry a per-request nonce.

Two shapes, deliberately. **Nonce mode** (`nonce` + `strict-dynamic`, no `unsafe-inline`) for the four authenticated apps, which already render per request. **Static mode** for `marketing`, whose pages are statically rendered and ISR-cached — a per-request nonce would end that, so scripts fall back to `unsafe-inline` while every other directive stays strict. The trade is written into the file rather than left implicit: that site renders no user input, holds no session and reaches no PHI, and a form or authenticated surface there moves it to nonce mode.

`img-src` carries the app’s API origin as well as `https:` — added after loading the running Portal, where tenant logos are served over plain http from `localhost:4000` in development and were being blocked. `Permissions-Policy` closes camera, geolocation, payment and topics, and leaves `microphone=(self)` for dictation (ADR-070).

**Testing status:** 10 new tests (51 in this package) over the directive set, nonce vs static mode, the development relaxations, the API origin in `connect-src` and `img-src`, `upgrade-insecure-requests`, and `originOf` refusing to widen the policy on a missing or relative value.
