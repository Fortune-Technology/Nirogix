import type { ReactNode } from "react";
import { cn } from "../cn";

export interface PageHeaderProps {
  title: ReactNode;
  /** The line under the title — a count, a date, a one-line summary of the page. */
  description?: ReactNode;
  /** The page's primary action(s), aligned to the right and wrapping on a narrow screen. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The one page-title block for every Portal and Admin screen (ADR-029 spirit: one
 * reusable pattern, configured per page — never a per-page header). Title on top,
 * an optional muted description beneath it, and an optional actions cluster on the
 * right that wraps below on a narrow viewport. Every tab reads the same because the
 * typography, spacing and responsive behaviour live here, not on the page.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-fg">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
