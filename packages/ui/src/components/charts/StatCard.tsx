"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "../../cn";
import { compact, domain, linePath } from "./geometry";

export interface StatCardProps {
  label: string;
  /** The number itself. Pass `null` while loading — the card shows a skeleton, never a zero. */
  value: number | string | null;
  /** Units or a qualifier shown next to the value — "hospitals", "of 12". */
  unit?: string;
  /** Secondary line under the value. Keep it factual. */
  hint?: ReactNode;
  /**
   * Period-over-period change. Only pass one when a real prior period exists —
   * a delta against no data is a fabricated metric (ADR-043).
   */
  delta?: { value: number; label: string } | null;
  /** For a delta where a rise is bad (failed sign-ins, error rate). */
  invertDelta?: boolean;
  /** Optional trailing sparkline; same token colour rules as the charts. */
  spark?: { values: number[]; color: string };
  icon?: ReactNode;
  className?: string;
}

/**
 * One KPI tile (ADR-043). Deliberately dumb: it renders what it is given and has
 * no opinion about where the number came from — the page is responsible for only
 * passing metrics that have a data source.
 */
export function StatCard({
  label,
  value,
  unit,
  hint,
  delta,
  invertDelta = false,
  spark,
  icon,
  className,
}: StatCardProps) {
  const loading = value === null;
  const dir = delta ? (delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat") : null;
  const good = dir === "flat" ? null : invertDelta ? dir === "down" : dir === "up";
  const DeltaIcon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;

  return (
    <div className={cn("hms-stat", className)}>
      <div className="hms-stat__head">
        <span className="hms-stat__label">{label}</span>
        {icon ? <span className="hms-stat__icon">{icon}</span> : null}
      </div>

      {loading ? (
        <span className="hms-skeleton hms-stat__skeleton" aria-hidden />
      ) : (
        <div className="hms-stat__value">
          <span>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</span>
          {unit ? <span className="hms-stat__unit">{unit}</span> : null}
        </div>
      )}

      <div className="hms-stat__foot">
        {delta ? (
          <span
            className={cn(
              "hms-stat__delta",
              good === true && "hms-stat__delta--good",
              good === false && "hms-stat__delta--bad",
            )}
          >
            <DeltaIcon size={14} strokeWidth={2} aria-hidden />
            {delta.value > 0 ? "+" : ""}
            {compact(delta.value)} {delta.label}
          </span>
        ) : hint ? (
          <span className="hms-stat__hint">{hint}</span>
        ) : null}

        {spark && spark.values.length > 1 ? (
          <svg className="hms-stat__spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path
              d={linePath(spark.values, domain(spark.values))}
              fill="none"
              stroke={spark.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
      </div>
    </div>
  );
}
