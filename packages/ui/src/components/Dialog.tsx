'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../cn';
import { useScrollLock } from '../useScrollLock';

export interface DialogProps {
  open: boolean;
  /** Called on Esc, on the backdrop, and from the close control. */
  onClose: () => void;
  title: string;
  /** Optional line under the title — say what this dialog is for, not what it is. */
  description?: ReactNode;
  /** The footer's actions. Omit for a dialog the user only reads. */
  footer?: ReactNode;
  /** `sm` for a confirmation, `md` for a short form, `lg` for a record with sections. */
  size?: 'sm' | 'md' | 'lg';
  /** An icon beside the title, and the tone of its tint. */
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  /** `alertdialog` for a decision the user must make before continuing. */
  role?: 'dialog' | 'alertdialog';
  /** Hides the × — use for a dialog that must be answered rather than dismissed. */
  hideClose?: boolean;
  /** While true, Esc and the backdrop stop closing: a save is in flight. */
  busy?: boolean;
  children?: ReactNode;
}

/**
 * The one modal (rules.md → Reusable UI Architecture, ADR-060).
 *
 * Everything a modal has to get right and every module gets wrong lives here: it
 * portals to `document.body` so no parent's `overflow` or stacking context can clip
 * it, locks background scroll through the shared `useScrollLock`, traps Tab inside
 * itself, closes on Esc and on the backdrop, and returns focus to whatever opened it.
 *
 * `ConfirmDialog` is built on this rather than beside it — one dialog implementation,
 * one set of focus and scroll behaviour to keep correct.
 *
 * **While `busy`, Esc and the backdrop stop closing.** A dialog that vanishes
 * mid-save leaves the user unsure whether their edit was written, which is worse than
 * a moment of unresponsiveness.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  icon,
  tone = 'default',
  role = 'dialog',
  hideClose = false,
  busy = false,
  children,
}: DialogProps) {
  useScrollLock(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // The latest `onClose` and `busy`, readable from an effect that must NOT re-run when they
  // change. Almost every caller passes an inline `onClose={() => setOpen(false)}`, which is a new
  // function on every render — see the note on the focus effect below for what that used to cost.
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };

  /**
   * Open once, focus once.
   *
   * **This effect depends on `open` alone, and that is the whole point.** It used to depend on
   * `[open, onClose, busy]` as well — and since callers pass an inline arrow for `onClose`, every
   * keystroke inside the dialog changed that identity, tore the effect down and set it up again.
   * Teardown restores focus to whatever opened the dialog and setup focuses the first control in
   * the body, so typing a digit into the fee field on the fee-schedule form moved the caret to the
   * Doctor dropdown after one character. The handler reads `onClose`/`busy` from a ref instead, so
   * it always calls the current one without the effect having to notice it changed.
   */
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;

    const SELECTOR =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    /** Everything tabbable in the panel, in DOM order — the Tab trap's universe. */
    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(SELECTOR) ?? []);

    // Focus the first control in the BODY, not the first in the panel. The close × sits
    // in the header and therefore comes first in DOM order, so focusing "the first
    // focusable" would land an edit dialog on Close — the user's next keystroke would
    // dismiss the thing they opened to type into. Falls back to the panel for a dialog
    // with no body controls (a confirmation).
    const body = panelRef.current?.querySelector('.hms-dialog__body');
    const target = body?.querySelector<HTMLElement>(SELECTOR) ?? focusables()[0];
    target?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!latest.current.busy) latest.current.onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="hms-dialog__overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn('hms-dialog', `hms-dialog--${size}`)}
        data-lenis-prevent
      >
        <div className="hms-dialog__head">
          {icon ? (
            <span
              className={cn('hms-dialog__icon', tone === 'danger' && 'hms-dialog__icon--danger')}
              aria-hidden
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="hms-dialog__title">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="hms-dialog__desc">
                {description}
              </p>
            ) : null}
          </div>
          {!hideClose ? (
            <button
              type="button"
              className="hms-dialog__close"
              aria-label="Close"
              onClick={onClose}
              disabled={busy}
            >
              <X size={16} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>

        {children ? <div className="hms-dialog__body">{children}</div> : null}
        {footer ? <div className="hms-dialog__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
