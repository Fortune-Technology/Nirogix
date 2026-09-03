'use client';

import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Menu, MenuItem, MenuSeparator } from '../Menu';
import { ConfirmDialog } from '../ConfirmDialog';

export interface MoreAction {
  /** Menu label — "Duplicate", "Reset password", "Archive", … */
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  /** Permission gate — hidden entirely when false. */
  permitted?: boolean;
  tone?: 'default' | 'danger';
  /** Destructive items confirm first; pass `true` for the default copy or override it. */
  confirm?: boolean | { title: string; description?: ReactNode; confirmLabel?: string };
  /** Draws a divider above this item. */
  separatorBefore?: boolean;
}

export interface MoreActionsProps {
  actions: MoreAction[];
  label?: string;
  align?: 'start' | 'end';
}

/**
 * The overflow half of the Action column (rules.md → Table Row Actions): a "…"
 * trigger opening the shared `Menu`, with destructive items routed through the
 * shared `ConfirmDialog`. Anything past the three inline icon actions lives here,
 * so every module's secondary operations are found in the same place.
 *
 * Renders nothing when the user is permitted none of the actions.
 */
export function MoreActions({ actions, label = 'More actions', align = 'end' }: MoreActionsProps) {
  const [pending, setPending] = useState<MoreAction | null>(null);
  const visible = actions.filter((a) => a.permitted !== false);
  if (visible.length === 0) return null;

  const confirmCopy =
    pending && typeof pending.confirm === 'object'
      ? pending.confirm
      : { title: `${pending?.label ?? 'Confirm'}?`, description: 'This action cannot be undone.' };

  return (
    <>
      <Menu
        align={align}
        label={label}
        triggerBase="hms-rowaction"
        trigger={<MoreHorizontal size={16} strokeWidth={2} aria-hidden />}
      >
        {(close) => (
          <>
            {visible.map((action, i) => (
              <div key={action.label}>
                {action.separatorBefore && i > 0 ? <MenuSeparator /> : null}
                <MenuItem
                  icon={action.icon}
                  tone={action.tone}
                  disabled={action.disabled}
                  onSelect={() => {
                    close();
                    if (action.confirm) setPending(action);
                    else action.onSelect();
                  }}
                >
                  {action.label}
                </MenuItem>
              </div>
            ))}
          </>
        )}
      </Menu>

      <ConfirmDialog
        open={pending !== null}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel ?? pending?.label}
        tone={pending?.tone === 'danger' ? 'danger' : 'default'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const action = pending;
          setPending(null);
          action?.onSelect();
        }}
      />
    </>
  );
}
