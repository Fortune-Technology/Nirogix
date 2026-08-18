// The platform's date layer (ADR-030, time format revised by ADR-046).
//
// Every user-facing date and time in the Portal and the marketing site is rendered
// as `DD/MM/YYYY`, `hh:mm AM/PM`, and `DD/MM/YYYY, hh:mm AM/PM` — and only from here. Components never
// call toLocaleDateString(): that renders in the *viewer's* machine locale, so the
// same appointment reads 15/08/2026 in India and 08/15/2026 in the US, and
// 08/09/2026 becomes ambiguous on a clinical record.
//
// Display format is separate from transport format: APIs, the database and query
// parameters stay ISO-8601 (`toApiDate` / `toApiDateTime`), and conversion happens
// once, at the display boundary.
//
// No date library: the formatting the platform needs is deterministic arithmetic on
// the local calendar fields, which keeps the bundle free of a dependency we would
// only use for `format()`.

/** Anything the helpers accept: a Date, an ISO string, or an epoch in milliseconds. */
export type DateInput = Date | string | number | null | undefined;

const PLACEHOLDER = "—";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Builds a local date and REJECTS overflow. `new Date(2026, 12, 32)` silently
 * rolls into February 2027, so a typo like 32/13/2026 would otherwise parse as a
 * real — and wrong — date. Requiring the parts to round-trip catches it.
 */
function fromParts(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/**
 * Coerces input to a Date, or null when it is absent or unparseable.
 * A bare `YYYY-MM-DD` is read as a *local* calendar date, not UTC midnight —
 * otherwise a date-only value can display as the previous day west of UTC.
 */
export function parseDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return fromParts(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
  }

  // Accept a DD/MM/YYYY string coming back from an input we rendered.
  const display = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (display) {
    return fromParts(Number(display[3]), Number(display[2]), Number(display[1]));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isValidDate(value: DateInput): boolean {
  return parseDate(value) !== null;
}

/** `15/08/2026`. Returns an em dash for a missing/invalid value, never "Invalid Date". */
export function formatDate(value: DateInput, fallback = PLACEHOLDER): string {
  const d = parseDate(value);
  if (!d) return fallback;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * The clock parts of a time, so a caller can render the meridiem differently from
 * the numerals — the AM/PM badge in schedules and pickers (ADR-046).
 * `{ time: "02:05", meridiem: "PM" }`.
 */
export function formatTimeParts(
  value: DateInput,
): { time: string; meridiem: "AM" | "PM" } | null {
  const d = parseDate(value);
  if (!d) return null;
  const hours24 = d.getHours();
  const meridiem = hours24 < 12 ? "AM" : "PM";
  // 00:xx is 12 AM and 12:xx is 12 PM — the two cases a naive `% 12` gets wrong.
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return { time: `${pad(hours12)}:${pad(d.getMinutes())}`, meridiem };
}

/** `02:05 PM` (12-hour with an explicit meridiem — ADR-046). */
export function formatTime(value: DateInput, fallback = PLACEHOLDER): string {
  const parts = formatTimeParts(value);
  if (!parts) return fallback;
  return `${parts.time} ${parts.meridiem}`;
}

/** `15/08/2026, 02:05 PM`. The comma is part of the standard, not decoration. */
export function formatDateTime(value: DateInput, fallback = PLACEHOLDER): string {
  const d = parseDate(value);
  if (!d) return fallback;
  return `${formatDate(d)}, ${formatTime(d)}`;
}

/** `14:05` — the value shape `<input type="time">` requires. Never shown as text. */
export function toApiTime(value: DateInput): string | null {
  const d = parseDate(value);
  if (!d) return null;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The weekday name, for a context line that also carries a real date
 * ("Sunday · 16/08/2026"). Never a substitute for the date itself.
 */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function formatWeekday(value: DateInput, fallback = PLACEHOLDER): string {
  const d = parseDate(value);
  return d ? WEEKDAYS[d.getDay()]! : fallback;
}

/**
 * Compact axis labels for charts, where a full `DD/MM/YYYY` cannot fit twelve
 * across (ADR-046). These are the ONLY abbreviated date forms in the platform, and
 * they live here so a module never hand-rolls one:
 *   `formatMonthLabel("2026-08")` → `Aug 26`
 *   `formatDayLabel("2026-08-16")` → `16/08`
 */
export function formatMonthLabel(period: string, fallback = PLACEHOLDER): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return fallback;
  const month = MONTHS_SHORT[Number(m[2]) - 1];
  return month ? `${month} ${m[1]!.slice(2)}` : fallback;
}

export function formatDayLabel(period: string, fallback = PLACEHOLDER): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
  return m ? `${m[3]}/${m[2]}` : fallback;
}

/**
 * `15/08/2026 – 22/08/2026`, collapsing to a single date when both ends are the
 * same day and to the open end when one side is missing.
 */
export function formatDateRange(from: DateInput, to: DateInput, fallback = PLACEHOLDER): string {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a && !b) return fallback;
  if (a && !b) return `From ${formatDate(a)}`;
  if (!a && b) return `Until ${formatDate(b)}`;
  if (isSameDay(a, b)) return formatDate(a);
  return `${formatDate(a)} – ${formatDate(b)}`;
}

/** ISO calendar date (`2026-08-15`) for APIs, query strings and `<input type="date">`. */
export function toApiDate(value: DateInput): string | null {
  const d = parseDate(value);
  if (!d) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Full ISO-8601 instant for APIs that take a timestamp. */
export function toApiDateTime(value: DateInput): string | null {
  const d = parseDate(value);
  return d ? d.toISOString() : null;
}

/** `-1` / `0` / `1`, sorting invalid values last. Safe as a comparator. */
export function compareDates(a: DateInput, b: DateInput): number {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.getTime() - db.getTime() === 0 ? 0 : da.getTime() < db.getTime() ? -1 : 1;
}

export function isSameDay(a: DateInput, b: DateInput): boolean {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return false;
  return (
    da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
  );
}

/** Today as an ISO calendar date — the default for "today's" filters and date inputs. */
export function todayApiDate(): string {
  return toApiDate(new Date())!;
}

/** Shifts by whole days; negative goes back. Used by date-range presets. */
export function addDays(value: DateInput, days: number): Date | null {
  const d = parseDate(value);
  if (!d) return null;
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}
