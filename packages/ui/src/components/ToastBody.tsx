"use client";

import { CheckCircle2, Info, Loader2, OctagonX, TriangleAlert, X } from "lucide-react";
import type { ToastVariant } from "../toast";

/**
 * What a toast actually shows (ADR-057).
 *
 * React Toastify renders whatever node it is handed, so the layout, the icon set and
 * the wording are ours — the library supplies placement, timing, stacking, pausing,
 * dragging and the live region, and nothing else.
 *
 * **Status is never carried by colour alone.** Every variant renders an icon with a
 * distinct silhouette *and* a title in words ("Success", "Warning", "Something went
 * wrong"), so the state survives greyscale, colour-blindness and a screen reader
 * reading the text with no styling at all.
 */

const ICON: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: OctagonX,
  warning: TriangleAlert,
  info: Info,
  loading: Loader2,
};

export function ToastIcon({ variant }: { variant: ToastVariant }) {
  const Icon = ICON[variant];
  return (
    <span className={`hms-toast__icon hms-toast__icon--${variant}`}>
      <Icon size={18} strokeWidth={2} className={variant === "loading" ? "hms-toast__spin" : undefined} aria-hidden />
    </span>
  );
}

export function ToastBody({
  variant,
  title,
  description,
  action,
}: {
  variant: ToastVariant;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="hms-toast__body">
      <div className="hms-toast__text">
        <p className="hms-toast__title">{title}</p>
        {description ? <p className="hms-toast__desc">{description}</p> : null}
      </div>
      {action ? (
        <button type="button" className="hms-btn hms-btn--secondary hms-btn--sm hms-toast__action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/** The close control, in the design system's own affordance rather than the library's. */
export function ToastCloseButton({ closeToast }: { closeToast?: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" className="hms-toast__close" aria-label="Dismiss notification" onClick={closeToast}>
      <X size={15} strokeWidth={2} aria-hidden />
    </button>
  );
}
