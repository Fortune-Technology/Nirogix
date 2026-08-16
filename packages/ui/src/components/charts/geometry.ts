/**
 * Chart maths, kept out of the components so it can be unit-tested on its own.
 *
 * Everything here works in a 0-100 × 0-100 user space; the SVG scales with
 * `preserveAspectRatio="none"` on the x axis only where that is safe, and the
 * components draw strokes in absolute units through `vector-effect`. That keeps
 * a chart resolution-independent without a layout library.
 */

export interface Series {
  /** Stable key, used for the legend and the tooltip rows. */
  key: string;
  label: string;
  values: number[];
  /** Any CSS colour — always pass a token (`var(--hms-brand)`), never a literal. */
  color: string;
}

/** The y range a chart should draw, padded so the top line is not flush with the frame. */
export function domain(all: number[], { stacked = false, count = 0 } = {}): { min: number; max: number } {
  if (all.length === 0) return { min: 0, max: 1 };
  const max = Math.max(...all, 0);
  // A flat-zero dataset still needs a non-zero range, or every point lands on the axis.
  if (max === 0) return { min: 0, max: 1 };
  void stacked;
  void count;
  return { min: 0, max: max * 1.1 };
}

/** x position (0-100) of point `i` in a series of `n`. Single-point series sit at the left edge. */
export function xAt(i: number, n: number): number {
  return n <= 1 ? 0 : (i / (n - 1)) * 100;
}

/** y position (0-100, SVG top-down) for a value in the given domain. */
export function yAt(value: number, d: { min: number; max: number }): number {
  const span = d.max - d.min || 1;
  return 100 - ((value - d.min) / span) * 100;
}

/** A polyline path through the values. */
export function linePath(values: number[], d: { min: number; max: number }): string {
  if (values.length === 0) return '';
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i, values.length).toFixed(2)} ${yAt(v, d).toFixed(2)}`)
    .join(' ');
}

/** The same line, closed to the baseline, for the filled area under it. */
export function areaPath(values: number[], d: { min: number; max: number }): string {
  if (values.length === 0) return '';
  const line = linePath(values, d);
  const lastX = xAt(values.length - 1, values.length).toFixed(2);
  return `${line} L${lastX} 100 L0 100 Z`;
}

/**
 * Which point index a pointer at `ratio` (0-1 across the plot) is nearest to.
 * Used for the hover cursor, so the readout snaps to real data rather than
 * interpolating a value that was never recorded.
 */
export function nearestIndex(ratio: number, n: number): number {
  if (n <= 1) return 0;
  return Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
}

/** Evenly-spaced tick indices, always including the first and last point. */
export function tickIndices(n: number, max = 6): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
}

/** Compact number formatting for axis labels and stat values: 1.2k, 3.4M. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(value);
}
