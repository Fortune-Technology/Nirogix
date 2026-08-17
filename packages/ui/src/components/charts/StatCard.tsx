"use client";

import type { ReactNode } from "react";
import Link from "next/link";
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
  /**
   * Make the card a link to the records behind the number (ADR-062). Pass one
   * only when the click has a genuine destination — Total Patients to the Patients
   * table, Today's Appointments to Appointments filtered to today. Never add one
   * for visual uniformity. Takes precedence over `onClick`.
   */
  href?: string;
  /** A card whose click runs an action rather than navigates. Ignored when `href` is set. */
  onClick?: () => void;
  /**
   * Accessible name for the clickable card. Defaults to the label; set it when the
   * label alone would not tell a screen-reader user where the click goes
   * ("Outstanding" → "Outstanding balance, open the billing ledger").
   */
  linkLabel?: string;
  /** `highlight` tints the tile with the brand accent for the one figure that leads a dashboard. */
  variant?: "default" | "highlight";
  className?: string;
}

/**
 * One KPI tile (ADR-043, ADR-062). Deliberately dumb about *where* the number came
 * from — the page passes only metrics that have a data source — but it does own how
 * a trend reads and how a click behaves.
 *
 * A trend's colour is decided by what the metric means, never by its sign: pass
 * `invertDelta` where a fall is the good outcome (wait time, failed sign-ins), so a
 * drop shows as `--good` and a rise as `--bad`.
 *
 * Pass `href` (or `onClick`) only when the tile has a real destination; the card
 * then becomes a link/button with hover, focus-visible, keyboard and active states
 * and an accessible name. A tile with nowhere useful to go stays a plain `div`.
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
  href,
  onClick,
  linkLabel,
  variant = "default",
  className,
}: StatCardProps) {
  const loading = value === null;
  const dir = delta ? (delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat") : null;
  const good = dir === "flat" ? null : invertDelta ? dir === "down" : dir === "up";
  const DeltaIcon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;

  const clickable = Boolean(href) || Boolean(onClick);
  const rootClass = cn(
    "hms-stat",
    variant === "highlight" && "hms-stat--highlight",
    clickable && "hms-stat--link",
    className,
  );

  const body = (
    <>
      <div className="hms-stat__head">
        <span className="hms-stat__label">{label}</span>
        {icon || clickable ? (
          <span className="hms-stat__head-end">
            {icon ? <span className="hms-stat__icon">{icon}</span> : null}
            {clickable ? <ArrowUpRight className="hms-stat__go" size={15} strokeWidth={2} aria-hidden /> : null}
          </span>
        ) : null}
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
    </>
  );

  // A link where a destination exists; a button where a click runs an action; a
  // plain tile otherwise. The interactive states live on `.hms-stat--link` so all
  // three read identically.
  if (href) {
    return (
      <Link href={href} className={rootClass} aria-label={linkLabel ?? label}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rootClass} aria-label={linkLabel ?? label}>
        {body}
      </button>
    );
  }
  return <div className={rootClass}>{body}</div>;
}
