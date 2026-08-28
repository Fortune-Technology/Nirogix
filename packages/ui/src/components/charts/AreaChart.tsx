"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../../cn";
import { areaPath, compact, domain, linePath, nearestIndex, tickIndices, xAt, yAt, type Series } from "./geometry";

export interface AreaChartProps {
  series: Series[];
  /** One label per point — the x axis and the tooltip heading. */
  labels: string[];
  /** Plot height in pixels. The chart always fills its container's width. */
  height?: number;
  /** Formats a value in the tooltip and on the y axis. Defaults to a compact number. */
  format?: (value: number) => string;
  /** Draw the y-axis gridlines and their labels. */
  grid?: boolean;
  /** Shown instead of the plot when every series is empty. */
  emptyMessage?: string;
  className?: string;
  /** Describes the chart for screen readers; the data table below it carries the numbers. */
  ariaLabel?: string;
  /**
   * Draw the line and fade the area in when the dataset changes — a date-range
   * filter switch eases the new shape in instead of snapping. On by default; the
   * hover cursor does not retrigger it, and a reduced-motion user sees the final
   * state at once.
   */
  animate?: boolean;
}

/**
 * A token-driven area chart with a snapping hover cursor (ADR-043).
 *
 * Built from plain SVG rather than a charting library: the platform needs a small,
 * consistent set of visualisations, and a dependency would add a bundle cost and a
 * second styling system to keep on-brand (rules.md → Dependency Rules). Every
 * colour arrives as a token from the caller, so charts follow Light/Dark and a
 * tenant accent like the rest of the design system.
 *
 * Accessible by construction: the SVG is `img`-roled with a label, and the same
 * numbers are rendered as a visually-hidden table so a screen reader gets the data
 * and not a shape. The cursor snaps to real points — no interpolated readouts.
 */
export function AreaChart({
  series,
  labels,
  height = 220,
  format = compact,
  grid = true,
  emptyMessage = "No data yet.",
  className,
  ariaLabel,
  animate = true,
}: AreaChartProps) {
  const gradientId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  const points = Math.max(...series.map((s) => s.values.length), 0);
  const all = series.flatMap((s) => s.values);
  const hasData = points > 0 && all.some((v) => v !== 0);
  const d = domain(all);
  const ticks = tickIndices(points);
  // Changes only when the data does; keys the series group so the draw-in replays on
  // a filter switch, while a hover (cursor state) leaves it untouched.
  const animKey = series.map((s) => s.values.join(",")).join(";");

  if (!hasData) {
    return (
      <div className={cn("hms-chart hms-chart--empty", className)} style={{ height }}>
        <span className="hms-chart__empty">{emptyMessage}</span>
      </div>
    );
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setCursor(nearestIndex((e.clientX - box.left) / box.width, points));
  }

  return (
    <div className={cn("hms-chart", animate && "hms-chart--animate", className)}>
      <div
        ref={plotRef}
        className="hms-chart__plot"
        style={{ height }}
        onPointerMove={onMove}
        onPointerLeave={() => setCursor(null)}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel ?? `${series.map((s) => s.label).join(", ")} over time`}
          className="hms-chart__svg"
        >
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
              </linearGradient>
            ))}
          </defs>

          {grid &&
            [0, 25, 50, 75, 100].map((y) => (
              <line key={y} x1="0" y1={y} x2="100" y2={y} className="hms-chart__grid" vectorEffect="non-scaling-stroke" />
            ))}

          {series.map((s, i) => (
            <g className="hms-chart__series" key={animate ? `${s.key}:${animKey}` : s.key}>
              <path d={areaPath(s.values, d)} fill={`url(#${gradientId}-${i})`} />
              <path
                d={linePath(s.values, d)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {cursor !== null && (
            <g>
              <line
                x1={xAt(cursor, points)}
                y1="0"
                x2={xAt(cursor, points)}
                y2="100"
                className="hms-chart__cursor"
                vectorEffect="non-scaling-stroke"
              />
              {series.map((s) => (
                <circle
                  key={s.key}
                  cx={xAt(cursor, points)}
                  cy={yAt(s.values[cursor] ?? 0, d)}
                  r="4"
                  fill={s.color}
                  className="hms-chart__dot"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          )}
        </svg>

        {grid && (
          <div className="hms-chart__yaxis" aria-hidden>
            <span>{format(Math.round(d.max))}</span>
            <span>{format(Math.round(d.max / 2))}</span>
            <span>0</span>
          </div>
        )}

        {cursor !== null && (
          <div
            className="hms-chart__tooltip"
            style={{ left: `${xAt(cursor, points)}%` }}
            role="status"
          >
            <span className="hms-chart__tooltip-title">{labels[cursor]}</span>
            {series.map((s) => (
              <span key={s.key} className="hms-chart__tooltip-row">
                <span className="hms-chart__swatch" style={{ background: s.color }} aria-hidden />
                {s.label}
                <strong>{format(s.values[cursor] ?? 0)}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="hms-chart__xaxis" aria-hidden>
        {ticks.map((i) => (
          <span key={i} style={{ left: `${xAt(i, points)}%` }}>
            {labels[i]}
          </span>
        ))}
      </div>

      <ChartTable series={series} labels={labels} format={format} />
    </div>
  );
}

/**
 * The same numbers as a table, visually hidden. A chart that only exists as a
 * drawing is unreadable to a screen reader, and this is cheaper and more accurate
 * than trying to describe a trend in prose.
 */
export function ChartTable({
  series,
  labels,
  format = compact,
  caption,
}: {
  series: Series[];
  labels: string[];
  format?: (value: number) => string;
  caption?: ReactNode;
}) {
  return (
    <table className="hms-visually-hidden">
      {caption ? <caption>{caption}</caption> : null}
      <thead>
        <tr>
          <th scope="col">Period</th>
          {series.map((s) => (
            <th key={s.key} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((label, i) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            {series.map((s) => (
              <td key={s.key}>{format(s.values[i] ?? 0)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
