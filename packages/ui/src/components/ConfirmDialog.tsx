"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "../cn";
import { useScrollLock } from "../useScrollLock";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything that deletes, revokes, cancels, or discharges. */
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The shared confirmation for destructive actions (resources/rules.md → Reusable
 * UI Architecture). Every delete / revoke / cancel goes through this one dialog —
 * no module writes its own `window.confirm` or bespoke modal.
 *
 * Locks background scroll through the shared `useScrollLock` (DESIGN.md §9.3),
 * traps focus, closes on Esc, and returns focus to whatever opened it.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useScrollLock(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="hms-dialog__overlay" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hms-confirm-title"
        className="hms-dialog"
        data-lenis-prevent
      >
        <div className="hms-dialog__head">
          <span className={cn("hms-dialog__icon", tone === "danger" && "hms-dialog__icon--danger")} aria-hidden>
            <AlertTriangle size={18} strokeWidth={1.75} />
          </span>
          <h2 id="hms-confirm-title" className="hms-dialog__title">
            {title}
          </h2>
        </div>
        {description ? <div className="hms-dialog__body">{description}</div> : null}
        <div className="hms-dialog__foot">
          <button type="button" className="hms-btn hms-btn--secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={cn("hms-btn", tone === "danger" ? "hms-btn--danger" : "hms-btn--primary")}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
