"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCcw } from "lucide-react";
import { cn } from "../cn";

/**
 * The shared empty / error / skeleton states (resources/rules.md → Reusable UI
 * Architecture). Every module uses these so a page with no data, a failed load,
 * and a pending load look the same everywhere. The DataTable renders them inside
 * itself; pages use them directly for non-tabular views.
 */

export interface EmptyStateProps {
  title?: string;
  description?: ReactNode;
  /** A primary action — "Add patient", "Book appointment", … */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title = "Nothing here yet", description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn("hms-state", className)}>
      <span className="hms-state__icon" aria-hidden>
        {icon ?? <Inbox size={22} strokeWidth={1.75} />}
      </span>
      <p className="hms-state__title">{title}</p>
      {description ? <p className="hms-state__desc">{description}</p> : null}
      {action ? <div className="hms-state__action">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  /** User-facing copy only — never a stack trace or backend internal (ADR-026). */
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Could not load this",
  message,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("hms-state hms-state--error", className)}>
      <span className="hms-state__icon" aria-hidden>
        <AlertTriangle size={22} strokeWidth={1.75} />
      </span>
      <p className="hms-state__title">{title}</p>
      {message ? <p className="hms-state__desc">{message}</p> : null}
      {onRetry ? (
        <div className="hms-state__action">
          <button type="button" className="hms-btn hms-btn--secondary hms-btn--sm" onClick={onRetry}>
            <RotateCcw size={15} strokeWidth={2} aria-hidden /> {retryLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export interface SkeletonProps {
  /** Any CSS width — defaults to filling its container. */
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
}

/** A single shimmer block. Compose for cards; the DataTable builds rows from it. */
export function Skeleton({ width, height, radius, className }: SkeletonProps) {
  return (
    <span
      className={cn("hms-skeleton", className)}
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}
