import type { ReactNode } from "react";
import { cn } from "../cn";

export interface PageHeaderProps {
  title: ReactNode;
  /** The line under the title — a count, a date, a one-line summary of the page. */
  description?: ReactNode;
  /** The page's primary action(s), aligned to the right and wrapping on a narrow screen. */
  actions?: ReactNode;
  /**
   * Keep the header — and therefore the page's primary action — in view while the page
   * scrolls (ADR-128).
   *
   * For a page whose *work* is longer than the viewport: a consultation where the doctor
   * fills prescriptions and lab orders well below the fold and must not have to scroll back
   * up to press Save. On a page that fits, this does nothing but cost a border, so it is
   * opt-in. Sits directly beneath the app bar (`h-14`) and below every overlay.
   */
  sticky?: boolean;
  className?: string;
}

/**
 * The one page-title block for every Portal and Admin screen (ADR-029 spirit: one
 * reusable pattern, configured per page — never a per-page header). Title on top,
 * an optional muted description beneath it, and an optional actions cluster on the
 * right that wraps below on a narrow viewport. Every tab reads the same because the
 * typography, spacing and responsive behaviour live here, not on the page.
 */
export function PageHeader({ title, description, actions, sticky = false, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        // The negative inline margin + padding lets the sticky bar's background span the
        // page gutter, so content scrolling underneath is covered rather than showing
        // through beside the title.
        sticky && "sticky top-14 z-10 -mx-4 border-b border-border bg-surface px-4 py-3 sm:-mx-6 sm:px-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-fg">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
