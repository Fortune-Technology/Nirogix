"use client";

import { useState } from "react";
import { cn } from "../../cn";
import { compact, domain, type Series } from "./geometry";

export interface BarChartProps {
  /** One or more series. Multiple series stack, so a period reads as one total. */
  series: Series[];
  labels: string[];
  height?: number;
  format?: (value: number) => string;
  emptyMessage?: string;
  className?: string;
  ariaLabel?: string;
  /**
   * Ease the bars in when the dataset changes — switching a date-range filter grows
   * the new bars up from the baseline instead of snapping. On by default; a hover or
   * a re-render with the same numbers does not retrigger it, and a reduced-motion
   * user always sees the final state at once.
   */
  animate?: boolean;
}

/**
 * A token-driven bar chart; multiple series stack (ADR-043). Same contract as
 * `AreaChart` — colours arrive as tokens, the hover readout snaps to a real
 * period, and the numbers are repeated in a visually-hidden table.
 *
 * Laid out with flex boxes rather than SVG rects so bar widths, gaps and radii
 * come from CSS and stay consistent with the rest of the design system at any
 * container width.
 */
export function BarChart({
  series,
  labels,
  height = 200,
  format = compact,
  emptyMessage = "No data yet.",
  className,
  ariaLabel,
  animate = true,
}: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const points = labels.length;
  const totals = Array.from({ length: points }, (_, i) =>
    series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
  );
  const hasData = totals.some((t) => t !== 0);
  const d = domain(totals);
  // Changes only when the data does; used as the `.hms-bars` key so the grow-in
  // replays on a filter switch but not on hover or an identical re-render.
  const animKey = animate ? `${points}|${series.map((s) => s.values.join(",")).join(";")}` : undefined;

  if (!hasData) {
    return (
      <div className={cn("hms-chart hms-chart--empty", className)} style={{ height }}>
        <span className="hms-chart__empty">{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className={cn("hms-chart", className)}>
      <div
        key={animKey}
        className={cn("hms-bars", animate && "hms-bars--animate")}
        style={{ height }}
        role="img"
        aria-label={ariaLabel ?? `${series.map((s) => s.label).join(", ")} by period`}
      >
        {labels.map((label, i) => (
          <div
            key={label}
            className={cn("hms-bars__col", hover === i && "hms-bars__col--on")}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <div className="hms-bars__stack">
              {series.map((s) => {
                const v = s.values[i] ?? 0;
                return (
                  <div
                    key={s.key}
                    className="hms-bars__seg"
                    style={{ height: `${(v / d.max) * 100}%`, background: s.color }}
                  />
                );
              })}
            </div>
            {hover === i && (
              <div className="hms-chart__tooltip hms-chart__tooltip--bar" role="status">
                <span className="hms-chart__tooltip-title">{label}</span>
                {series.map((s) => (
                  <span key={s.key} className="hms-chart__tooltip-row">
                    <span className="hms-chart__swatch" style={{ background: s.color }} aria-hidden />
                    {s.label}
                    <strong>{format(s.values[i] ?? 0)}</strong>
                  </span>
                ))}
              </div>
            )}
            <span className="hms-bars__label">{label}</span>
          </div>
        ))}
      </div>

      <table className="hms-visually-hidden">
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
    </div>
  );
}
