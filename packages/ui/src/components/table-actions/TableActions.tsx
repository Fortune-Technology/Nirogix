'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Eye, Loader2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '../../cn';
import { ConfirmDialog } from '../ConfirmDialog';

/** Confirmation copy for an action that asks before it runs. */
export interface ActionConfirm {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
}

export interface TableActionProps {
  /** Tooltip + accessible name. Each action ships a sensible default ("View", "Edit", …). */
  label?: string;
  /** What the action does. Omit when `href` is given. */
  onSelect?: () => void;
  /** Navigating actions render a link (client-side routed) rather than a button. */
  href?: string;
  /**
   * Permission gate. `false` renders nothing at all — the row simply has fewer
   * actions. The server still re-checks (rules.md → Authorization Rules).
   */
  permitted?: boolean;
  /** Temporarily unavailable — rendered, greyed, and explained by `disabledReason`. */
  disabled?: boolean;
  /** Why the action is disabled; becomes the tooltip so the state is never silent. */
  disabledReason?: string;
  /** In-flight: spinner in place of the icon, and the control stops accepting input. */
  loading?: boolean;
  /** Ask first. `true` uses the default copy; pass an object to write your own. */
  confirm?: boolean | ActionConfirm;
  /** Override the default icon. Sizing and colour still come from the shared styles. */
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
}

/**
 * The one row-action control (rules.md → Table Row Actions). Every table's Action
 * column is built from these — iconography, size, spacing, hover/active/focus,
 * tooltip, accessible label, disabled and loading states, confirmation, and
 * permission handling all live here, so no module styles or re-implements them.
 *
 * Colour comes only from the design tokens, so a tenant accent (Portal) or a
 * platform-branding override (marketing) re-skins every action column at once.
 */
function RowAction({
  label,
  defaultLabel,
  defaultIcon,
  onSelect,
  href,
  permitted = true,
  disabled = false,
  disabledReason,
  loading = false,
  confirm,
  icon,
  tone = 'default',
  className,
}: TableActionProps & { defaultLabel: string; defaultIcon: ReactNode }) {
  const [asking, setAsking] = useState(false);
  if (!permitted) return null;

  const name = label ?? defaultLabel;
  const inert = disabled || loading;
  const tooltip = disabled && disabledReason ? disabledReason : name;
  const body = loading ? (
    <Loader2 size={16} strokeWidth={2} className="hms-rowaction__spin" aria-hidden />
  ) : (
    (icon ?? defaultIcon)
  );
  const classes = cn(
    'hms-rowaction',
    tone === 'danger' && 'hms-rowaction--danger',
    inert && 'hms-rowaction--inert',
    className,
  );

  const copy: ActionConfirm =
    typeof confirm === 'object'
      ? confirm
      : { title: `${name}?`, description: 'This action cannot be undone.', confirmLabel: name };

  return (
    <>
      {href && !inert ? (
        <Link href={href} className={classes} title={tooltip} aria-label={name}>
          {body}
        </Link>
      ) : (
        <button
          type="button"
          className={classes}
          title={tooltip}
          aria-label={name}
          aria-busy={loading || undefined}
          disabled={inert}
          onClick={() => (confirm ? setAsking(true) : onSelect?.())}
        >
          {body}
        </button>
      )}

      {confirm ? (
        <ConfirmDialog
          open={asking}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirmLabel ?? name}
          tone={tone === 'danger' ? 'danger' : 'default'}
          busy={loading}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            onSelect?.();
          }}
        />
      ) : null}
    </>
  );
}

export interface TableActionsProps {
  children: ReactNode;
  /** Accessible name for the group — "Actions for Ananya Sharma". */
  label?: string;
  className?: string;
}

/**
 * The Action column's container: a labelled group of row actions, right-aligned
 * and evenly spaced. Keep it to three inline actions and move the rest into
 * `MoreActions` (rules.md → Table Row Actions).
 */
export function TableActions({ children, label = 'Actions', className }: TableActionsProps) {
  return (
    <div className={cn('hms-rowactions', className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export interface GenericTableActionProps extends TableActionProps {
  /** Required — it is the tooltip and the accessible name. */
  label: string;
  /** Required — a Lucide icon at `size={16}`, matching the rest of the column. */
  icon: ReactNode;
}

/**
 * A context-specific action — "Check in", "Start consult", "Cancel" — expressed
 * through the same control as View/Edit/Delete instead of a one-off button
 * (rules.md → Table Row Actions). Only the icon and label are module-specific.
 */
export function TableAction({ label, icon, ...rest }: GenericTableActionProps) {
  return <RowAction {...rest} label={label} icon={icon} defaultLabel={label} defaultIcon={icon} />;
}

/** View / Details — the eye. Pass `href` for a detail route, `onSelect` for a drawer or dialog. */
export function ViewAction(props: TableActionProps) {
  return (
    <RowAction
      {...props}
      defaultLabel="View"
      defaultIcon={<Eye size={16} strokeWidth={2} aria-hidden />}
    />
  );
}

/** Edit — the pencil. */
export function EditAction(props: TableActionProps) {
  return (
    <RowAction
      {...props}
      defaultLabel="Edit"
      defaultIcon={<Pencil size={16} strokeWidth={2} aria-hidden />}
    />
  );
}

export interface DeleteActionProps extends Omit<TableActionProps, 'tone'> {
  /** Named in the confirmation so the user knows exactly what is going. */
  recordName?: string;
}

/**
 * Delete — the bin. Always confirms first (rules.md → Table Row Actions); the
 * default copy names the record when `recordName` is supplied.
 */
export function DeleteAction({ recordName, confirm, ...rest }: DeleteActionProps) {
  const fallback: ActionConfirm = {
    title: recordName ? `Delete ${recordName}?` : 'Delete this record?',
    description: 'This action cannot be undone.',
    confirmLabel: 'Delete',
  };
  return (
    <RowAction
      {...rest}
      tone="danger"
      confirm={confirm === undefined || confirm === true ? fallback : confirm}
      defaultLabel="Delete"
      defaultIcon={<Trash2 size={16} strokeWidth={2} aria-hidden />}
    />
  );
}

export interface ToggleActionProps {
  /** Current state — on = enabled / active. */
  on: boolean;
  /** Receives the state the user asked for. */
  onToggle: (next: boolean) => void;
  /** Tooltips + accessible name per state. */
  onLabel?: string;
  offLabel?: string;
  permitted?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  /** Ask first — useful when disabling cuts off access. */
  confirm?: boolean | ActionConfirm;
  className?: string;
}

/**
 * The one Enable/Disable — Activate/Deactivate control. A real switch
 * (`role="switch"`, `aria-checked`), branded from `--hms-brand`, so every module's
 * status toggle looks and behaves identically.
 */
export function ToggleAction({
  on,
  onToggle,
  onLabel = 'Disable',
  offLabel = 'Enable',
  permitted = true,
  disabled = false,
  disabledReason,
  loading = false,
  confirm,
  className,
}: ToggleActionProps) {
  const [asking, setAsking] = useState(false);
  if (!permitted) return null;

  const name = on ? onLabel : offLabel;
  const inert = disabled || loading;
  const copy: ActionConfirm =
    typeof confirm === 'object' ? confirm : { title: `${name}?`, confirmLabel: name };

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={name}
        aria-busy={loading || undefined}
        title={disabled && disabledReason ? disabledReason : name}
        disabled={inert}
        onClick={() => (confirm ? setAsking(true) : onToggle(!on))}
        className={cn(
          'hms-switch',
          on && 'hms-switch--on',
          inert && 'hms-switch--inert',
          className,
        )}
      >
        <span className="hms-switch__thumb" aria-hidden />
      </button>

      {confirm ? (
        <ConfirmDialog
          open={asking}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirmLabel ?? name}
          tone="default"
          busy={loading}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            onToggle(!on);
          }}
        />
      ) : null}
    </>
  );
}
