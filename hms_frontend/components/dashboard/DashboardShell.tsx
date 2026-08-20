"use client";

import type { ReactNode } from "react";
import { PageHeader, cn } from "@hms/ui";

/**
 * The one dashboard layout (ADR-044). Every role's dashboard — hospital admin,
 * doctor, receptionist, pharmacist, lab technician, and the platform operator's —
 * is a *configuration* of these pieces, never its own page design.
 *
 * The skeleton is always: context line → title → range/actions → KPI row →
 * sections. What changes per role is which KPIs and which sections, not the
 * shape, so a nurse and an administrator can hand a screen to each other and both
 * know where to look.
 */

export function DashboardShell({
  /** Small line above the title: the day, the shift, the branch — whatever locates the reader. */
  context,
  title,
  /** Range chips, filters — anything that re-queries the whole screen. */
  controls,
  /** The page's primary action. */
  actions,
  children,
}: {
  context?: ReactNode;
  title: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* The same title block as every other tab (the shared PageHeader): the context
          line — the day, the shift — is the description, and the range chips and
          primary action sit in the actions cluster. */}
      <PageHeader
        title={title}
        description={context}
        actions={controls || actions ? (
          <>
            {controls}
            {actions}
          </>
        ) : undefined}
      />
      {children}
    </div>
  );
}

/** KPI row. Four across on a wide screen, two on a tablet, one on a phone. */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

/**
 * A row of panels. `split` picks the rhythm: `wide` gives the first child the
 * larger share (a chart beside a list), `even` splits it in two, `thirds` in three.
 */
export function DashboardRow({
  split = "even",
  children,
  className,
}: {
  split?: "wide" | "even" | "thirds";
  children: ReactNode;
  className?: string;
}) {
  // `minmax(0,…)` (not a bare `1.6fr`, which is `minmax(auto,…)`) keeps the ratio
  // fixed: without it a panel with wide intrinsic content — e.g. a bar chart with
  // many bars at a longer date range — pushes its own track wider and inverts the
  // split. `[&>*]:min-w-0` lets the panels shrink to their track so their charts
  // (already `min-width:0`) reflow instead of overflowing.
  const cols =
    split === "wide"
      ? "xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
      : split === "thirds"
        ? "lg:grid-cols-3"
        : "xl:grid-cols-2";
  return <div className={cn("grid gap-4 [&>*]:min-w-0", cols, className)}>{children}</div>;
}

/** A labelled row inside a panel — "Pending labs · 4", a provider's load, a stock line. */
export function PanelRow({
  icon,
  title,
  meta,
  value,
  tone = "default",
}: {
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0 last:pb-0">
      <span className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          <span
            className={cn(
              "inline-flex shrink-0",
              tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-fg-subtle",
            )}
          >
            {icon}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block truncate text-sm text-fg">{title}</span>
          {meta ? <span className="block truncate text-xs text-fg-subtle">{meta}</span> : null}
        </span>
      </span>
      {value ? <span className="shrink-0 text-sm font-medium text-fg">{value}</span> : null}
    </div>
  );
}

/**
 * The name to greet someone by. "Dr. Ananya Sharma" is Ananya, not "Dr." — an
 * honorific as a first name reads like a bug, and in a hospital most staff have one.
 */
const HONORIFICS = new Set(["dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "prof", "prof.", "shri", "smt"]);

export function firstName(fullName?: string): string | null {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const named = parts.filter((p) => !HONORIFICS.has(p.toLowerCase()));
  return named[0] ?? parts[0] ?? null;
}

/** Nothing-to-show state inside a panel — never an empty box. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-fg-subtle">{children}</p>;
}
