import { describe, expect, test } from 'vitest';
import { __testables } from '../overview.service';

const { dayKey, dayWindow } = __testables;

/**
 * The dashboard window maths (ADR-044). Deliberately server-LOCAL, not UTC: a
 * hospital's "today" is its own working day, and bucketing check-ins by UTC would
 * move the evening clinic into tomorrow for an India-hosted deployment.
 *
 * Covers TC DASH-01 in testcases.md.
 */

describe('clinical day', () => {
  test('keys a date by its local day, not UTC', () => {
    // 00:30 local on the 16th stays the 16th, even though it is the 15th in UTC.
    expect(dayKey(new Date(2026, 7, 16, 0, 30))).toBe('2026-08-16');
  });

  test('pads month and day', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('window', () => {
  test('ends today and runs oldest first', () => {
    const w = dayWindow(3, new Date(2026, 7, 16, 9, 0));
    expect(w).toEqual(['2026-08-14', '2026-08-15', '2026-08-16']);
  });

  test('crosses a month boundary', () => {
    const w = dayWindow(3, new Date(2026, 8, 1, 9, 0));
    expect(w).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
  });

  test('a single-day window is just today', () => {
    expect(dayWindow(1, new Date(2026, 7, 16))).toEqual(['2026-08-16']);
  });
});
