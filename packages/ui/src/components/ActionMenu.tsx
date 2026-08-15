"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "./Menu";
import { ConfirmDialog } from "./ConfirmDialog";

export interface RowAction {
  /** Menu label — "View", "Edit", "Delete", "Approve", … */
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  /** Hidden entirely when false — use for permission gating. */
  visible?: boolean;
  tone?: "default" | "danger";
  /** Destructive actions confirm first; pass `true` for the default copy or override it. */
  confirm?: boolean | { title: string; description?: ReactNode; confirmLabel?: string };
  /** Draws a divider above this item. */
  separatorBefore?: boolean;
}

export interface ActionMenuProps {
  actions: RowAction[];
  label?: string;
  align?: "start" | "end";
}

/**
 * The one row-actions affordance (resources/rules.md → Reusable UI Architecture):
 * a "…" trigger opening the shared Menu, with destructive items routed through the
 * shared ConfirmDialog. Every module's table uses this, so View/Edit/Delete look
 * and behave identically platform-wide.
 */
export function ActionMenu({ actions, label = "Row actions", align = "end" }: ActionMenuProps) {
  const [pending, setPending] = useState<RowAction | null>(null);
  const visible = actions.filter((a) => a.visible !== false);
  if (visible.length === 0) return null;

  const confirmCopy =
    pending && typeof pending.confirm === "object"
      ? pending.confirm
      : { title: `${pending?.label ?? "Confirm"}?`, description: "This action cannot be undone." };

  return (
    <>
      <Menu
        align={align}
        label={label}
        triggerClassName="hms-actions__trigger"
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
        tone={pending?.tone === "danger" ? "danger" : "default"}
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
