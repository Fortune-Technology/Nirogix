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

// ---------------------------------------------------------------------------
// Date-range presets (ADR-046). The one place the platform turns a named period —
// "This month", "Last financial year" — into a concrete inclusive ISO {start, end},
// so a filter never hand-rolls the arithmetic and every page agrees on what
// "Last 6 months" means. Results are local calendar dates in `YYYY-MM-DD` transport
// shape; the "this…" periods run to *today* (period-to-date), since data for future
// days does not exist.
// ---------------------------------------------------------------------------

/**
 * The month the financial year starts in. India runs 1 April – 31 March, and this is
 * an India-resident platform (ADR-042). There is no per-tenant FY configuration yet,
 * so this single convention stands; change it here (or thread a param) if that ever
 * becomes configurable.
 */
export const FINANCIAL_YEAR_START_MONTH = 4; // April (1 = January)

/** The weekday a week starts on for "this/last week" — Monday, the business convention. */
const WEEK_STARTS_ON = 1; // 0 = Sunday, 1 = Monday

/** Shifts by whole calendar months, clamping the day to the target month's length. */
export function addMonths(value: DateInput, months: number): Date | null {
  const d = parseDate(value);
  if (!d) return null;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return target;
}

/** Monday of the week containing `value` (local midnight). */
export function startOfWeek(value: DateInput): Date | null {
  const d = parseDate(value);
  if (!d) return null;
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (base.getDay() - WEEK_STARTS_ON + 7) % 7;
  base.setDate(base.getDate() - diff);
  return base;
}

export function startOfMonth(value: DateInput): Date | null {
  const d = parseDate(value);
  return d ? new Date(d.getFullYear(), d.getMonth(), 1) : null;
}

export function endOfMonth(value: DateInput): Date | null {
  const d = parseDate(value);
  return d ? new Date(d.getFullYear(), d.getMonth() + 1, 0) : null;
}

/** The financial year CONTAINING `value`: `{ start: 1 Apr, end: 31 Mar next year }` as ISO. */
export function financialYearRange(
  value: DateInput,
  startMonth = FINANCIAL_YEAR_START_MONTH,
): { start: string; end: string } | null {
  const d = parseDate(value);
  if (!d) return null;
  const month = d.getMonth() + 1; // 1-12
  const startYear = month >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(startYear + 1, startMonth - 1, 0); // last day of the month before startMonth
  return { start: toApiDate(start)!, end: toApiDate(end)! };
}

/** An inclusive calendar-date window, transport shape. */
export interface DateRange {
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

/** The named periods the shared filter offers. `custom` is resolved by the caller. */
export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "last3Months"
  | "last6Months"
  | "last12Months"
  | "last24Months"
  | "thisFinancialYear"
  | "lastFinancialYear"
  | "thisYear"
  | "lastYear"
  | "custom";

/**
 * Resolves a preset to an inclusive ISO `{ start, end }`. Rolling day/month windows
 * end on `today`; "this…" periods run from their start to today; "last…" periods are
 * the whole prior period. `custom` returns null — the caller supplies its own dates.
 */
export function resolveDateRange(
  preset: DateRangePreset,
  opts: { today?: DateInput; fyStartMonth?: number } = {},
): DateRange | null {
  if (preset === "custom") return null;
  const today = parseDate(opts.today) ?? new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const fy = opts.fyStartMonth ?? FINANCIAL_YEAR_START_MONTH;
  const iso = (d: Date) => toApiDate(d)!;
  const range = (start: Date, end: Date): DateRange => ({ start: iso(start), end: iso(end) });

  // N days ending today, inclusive (Last 7 days = today-6 … today).
  const lastDays = (n: number) => range(addDays(t, -(n - 1))!, t);
  // N months of buckets ending this month (Last 6 months = start of the month 5 back … today).
  const lastMonths = (n: number) => range(startOfMonth(addMonths(t, -(n - 1))!)!, t);

  switch (preset) {
    case "today":
      return range(t, t);
    case "yesterday": {
      const y = addDays(t, -1)!;
      return range(y, y);
    }
    case "last7Days":
      return lastDays(7);
    case "last30Days":
      return lastDays(30);
    case "last90Days":
      return lastDays(90);
    case "thisWeek":
      return range(startOfWeek(t)!, t);
    case "lastWeek": {
      const prevStart = addDays(startOfWeek(t)!, -7)!;
      return range(prevStart, addDays(prevStart, 6)!);
    }
    case "thisMonth":
      return range(startOfMonth(t)!, t);
    case "lastMonth": {
      const prev = addMonths(t, -1)!;
      return range(startOfMonth(prev)!, endOfMonth(prev)!);
    }
    case "last3Months":
      return lastMonths(3);
    case "last6Months":
      return lastMonths(6);
    case "last12Months":
      return lastMonths(12);
    case "last24Months":
      return lastMonths(24);
    case "thisFinancialYear": {
      const cur = financialYearRange(t, fy)!;
      return { start: cur.start, end: iso(t) };
    }
    case "lastFinancialYear": {
      const cur = financialYearRange(t, fy)!;
      const prevAnchor = addDays(parseDate(cur.start)!, -1)!; // a day inside the prior FY
      return financialYearRange(prevAnchor, fy)!;
    }
    case "thisYear":
      return range(new Date(t.getFullYear(), 0, 1), t);
    case "lastYear":
      return range(new Date(t.getFullYear() - 1, 0, 1), new Date(t.getFullYear() - 1, 11, 31));
  }
}

/**
 * Whole years between a date of birth and today, or `null` when the date of birth is missing or
 * in the future.
 *
 * Age was calculated in two places before this existed, and a chart header that says a different
 * number from the list it was opened from is a bug people report. Returns a number so the caller
 * decides how to say "unknown" — a table cell and a patient header word it differently.
 */
export function ageInYears(dateOfBirth: DateInput, today: DateInput = new Date()): number | null {
  const dob = parseDate(dateOfBirth);
  const now = parseDate(today);
  if (!dob || !now) return null;
  let years = now.getFullYear() - dob.getFullYear();
  const months = now.getMonth() - dob.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < dob.getDate())) years--;
  return years >= 0 ? years : null;
}
