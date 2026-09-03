'use client';

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../cn';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything that deletes, revokes, cancels, or discharges. */
  tone?: 'danger' | 'default';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The shared confirmation for destructive actions (rules.md → Reusable UI
 * Architecture). Every delete / revoke / cancel goes through this one dialog — no
 * module writes its own `window.confirm` or bespoke modal.
 *
 * Built **on** `Dialog` rather than beside it, so portalling, scroll lock, focus
 * trapping, Esc and focus restoration have one implementation. What is left here is
 * only what makes a confirmation a confirmation: the warning icon, the two buttons,
 * and `role="alertdialog"` — a decision the user must make before continuing, which
 * a screen reader should announce as such.
 *
 * The close × is hidden on purpose: a confirmation is answered, not dismissed, and
 * Cancel already says what dismissing means.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      role="alertdialog"
      size="sm"
      tone={tone}
      hideClose
      busy={busy}
      icon={<AlertTriangle size={18} strokeWidth={1.75} />}
      footer={
        <>
          <button
            type="button"
            className="hms-btn hms-btn--secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn('hms-btn', tone === 'danger' ? 'hms-btn--danger' : 'hms-btn--primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {description}
    </Dialog>
  );
}
