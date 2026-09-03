import { describe, expect, test } from 'vitest';
import { monthKey, monthWindow, toSeries } from '../admin.service';

/**
 * The System Admin dashboard's series maths (ADR-043). These are pure functions
 * over real `created_at` values — no DB needed, and no estimation anywhere: a
 * period with no rows is a zero, never an interpolated point.
 *
 * Covers TC PLT-04, PLT-05 in testcases.md.
 */

const NOW = new Date('2026-08-16T09:00:00Z');

describe('month window', () => {
  test('ends on the current month and runs oldest first', () => {
    expect(monthWindow(3, NOW)).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  test('crosses a year boundary correctly', () => {
    expect(monthWindow(4, new Date('2026-02-10T00:00:00Z'))).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  test('keys a date by UTC month', () => {
    expect(monthKey(new Date('2026-01-31T23:30:00Z'))).toBe('2026-01');
  });
});

describe('series', () => {
  const window = monthWindow(3, NOW); // 2026-06, 2026-07, 2026-08

  test('buckets by creation month and carries a running total', () => {
    const series = toSeries(
      [
        new Date('2026-06-02T10:00:00Z'),
        new Date('2026-06-20T10:00:00Z'),
        new Date('2026-08-01T10:00:00Z'),
      ],
      window,
    );
    expect(series.map((p) => p.created)).toEqual([2, 0, 1]);
    expect(series.map((p) => p.cumulative)).toEqual([2, 2, 3]);
  });

  test('rows created before the window seed the cumulative, not the first bar', () => {
    const series = toSeries(
      [
        new Date('2024-01-05T00:00:00Z'),
        new Date('2025-11-05T00:00:00Z'),
        new Date('2026-07-05T00:00:00Z'),
      ],
      window,
    );
    // Two rows predate the window: they count in the running total from the start,
    // so the cumulative line opens at the real platform total rather than zero.
    expect(series.map((p) => p.created)).toEqual([0, 1, 0]);
    expect(series.map((p) => p.cumulative)).toEqual([2, 3, 3]);
  });

  test('an empty platform is all zeros, never an empty array', () => {
    const series = toSeries([], window);
    expect(series).toHaveLength(3);
    expect(series.every((p) => p.created === 0 && p.cumulative === 0)).toBe(true);
  });
});
