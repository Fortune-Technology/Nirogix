import { describe, expect, it } from "vitest";
import {
  addDays,
  compareDates,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatTime,
  formatTimeParts,
  isSameDay,
  isValidDate,
  parseDate,
  toApiDate,
  toApiDateTime,
  toApiTime,
} from "../date";

/**
 * The date layer is the one place a user-facing date is produced (ADR-030), so
 * these tests pin the behaviour that made it necessary: a fixed DD/MM/YYYY
 * rendering regardless of the machine's locale, and a date-only value that never
 * slips a day across a timezone boundary.
 *
 * Covers TC DATE-01 / DATE-02 in testcases.md.
 */

describe("formatDate", () => {
  it("renders DD/MM/YYYY, zero-padded", () => {
    expect(formatDate(new Date(2026, 7, 5))).toBe("05/08/2026");
    expect(formatDate(new Date(2026, 11, 25))).toBe("25/12/2026");
  });

  it("reads a date-only ISO string as a LOCAL calendar date, not UTC midnight", () => {
    // The bug this prevents: west of UTC, `new Date('2026-08-15')` is 14 Aug locally.
    expect(formatDate("2026-08-15")).toBe("15/08/2026");
  });

  it("never renders 'Invalid Date' — missing and unparseable values fall back", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not a date")).toBe("—");
    expect(formatDate(null, "")).toBe("");
  });

  it("accepts a Date, an ISO instant, and an epoch", () => {
    const iso = "2026-08-15T09:30:00.000Z";
    expect(formatDate(new Date(iso))).toBe(formatDate(iso));
    expect(formatDate(new Date(iso).getTime())).toBe(formatDate(iso));
  });
});

describe("formatDateTime / formatTime", () => {
  it("renders DD/MM/YYYY, hh:mm AM/PM (ADR-046)", () => {
    expect(formatDateTime(new Date(2026, 7, 15, 14, 5))).toBe("15/08/2026, 02:05 PM");
    expect(formatTime(new Date(2026, 7, 15, 9, 0))).toBe("09:00 AM");
  });

  it("keeps midnight and noon unambiguous — the two a naive %12 gets wrong", () => {
    expect(formatTime(new Date(2026, 7, 15, 0, 0))).toBe("12:00 AM");
    expect(formatTime(new Date(2026, 7, 15, 0, 30))).toBe("12:30 AM");
    expect(formatTime(new Date(2026, 7, 15, 12, 0))).toBe("12:00 PM");
    expect(formatTime(new Date(2026, 7, 15, 23, 59))).toBe("11:59 PM");
  });

  it("splits the meridiem out for the AM/PM badge", () => {
    expect(formatTimeParts(new Date(2026, 7, 15, 16, 45))).toEqual({ time: "04:45", meridiem: "PM" });
    expect(formatTimeParts(new Date(2026, 7, 15, 0, 5))).toEqual({ time: "12:05", meridiem: "AM" });
    expect(formatTimeParts(null)).toBeNull();
  });

  it("keeps a machine-readable 24-hour value for time inputs", () => {
    expect(toApiTime(new Date(2026, 7, 15, 16, 45))).toBe("16:45");
    expect(toApiTime(null)).toBeNull();
  });
});

describe("parseDate", () => {
  it("round-trips the format we render", () => {
    expect(formatDate(parseDate("15/08/2026"))).toBe("15/08/2026");
  });

  it("returns null rather than an invalid Date", () => {
    expect(parseDate("nonsense")).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(isValidDate("2026-08-15")).toBe(true);
    expect(isValidDate("32/13/2026")).toBe(false);
  });
});

describe("transport format", () => {
  it("converts back to ISO for the API", () => {
    expect(toApiDate(new Date(2026, 7, 5))).toBe("2026-08-05");
    expect(toApiDate("15/08/2026")).toBe("2026-08-15");
    expect(toApiDate(null)).toBeNull();
  });

  it("emits a full ISO instant when a timestamp is needed", () => {
    expect(toApiDateTime("2026-08-15T09:30:00.000Z")).toBe("2026-08-15T09:30:00.000Z");
  });
});

describe("comparison helpers", () => {
  it("sorts chronologically and puts invalid values last", () => {
    const dates = ["2026-08-15", "2026-01-01", null, "2026-12-31"];
    expect([...dates].sort(compareDates)).toEqual(["2026-01-01", "2026-08-15", "2026-12-31", null]);
  });

  it("treats equal dates as equal", () => {
    expect(compareDates("2026-08-15", "2026-08-15")).toBe(0);
  });

  it("isSameDay ignores the time of day", () => {
    expect(isSameDay(new Date(2026, 7, 15, 1), new Date(2026, 7, 15, 23))).toBe(true);
    expect(isSameDay("2026-08-15", "2026-08-16")).toBe(false);
    expect(isSameDay(null, "2026-08-15")).toBe(false);
  });
});

describe("formatDateRange", () => {
  it("collapses a same-day range to one date", () => {
    expect(formatDateRange("2026-08-15", "2026-08-15")).toBe("15/08/2026");
  });

  it("renders a closed range", () => {
    expect(formatDateRange("2026-08-15", "2026-08-22")).toBe("15/08/2026 – 22/08/2026");
  });

  it("handles open ends", () => {
    expect(formatDateRange("2026-08-15", null)).toBe("From 15/08/2026");
    expect(formatDateRange(null, "2026-08-22")).toBe("Until 22/08/2026");
    expect(formatDateRange(null, null)).toBe("—");
  });
});

describe("addDays", () => {
  it("moves forward and backward across month boundaries", () => {
    expect(formatDate(addDays("2026-08-31", 1))).toBe("01/09/2026");
    expect(formatDate(addDays("2026-03-01", -1))).toBe("28/02/2026");
  });

  it("returns null for an unparseable input", () => {
    expect(addDays("nope", 1)).toBeNull();
  });
});
