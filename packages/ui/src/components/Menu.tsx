"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn";

export interface MenuProps {
  /** The control that opens the panel. Rendered inside a button. */
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Which edge the panel aligns to. */
  align?: "start" | "end";
  label?: string;
  triggerClassName?: string;
  panelClassName?: string;
  disabled?: boolean;
}

/**
 * The one dropdown/popover primitive (resources/rules.md → Reusable UI Architecture).
 * Used by the DataTable's column-visibility and faceted-filter controls and by
 * `ActionMenu`; reach for it before hand-rolling another dropdown.
 *
 * Accessible by construction: `aria-expanded` / `aria-haspopup` on the trigger,
 * Esc and outside-click close, focus returns to the trigger on close, and
 * ArrowDown/ArrowUp/Home/End move between items inside the panel.
 */
export function Menu({
  trigger,
  children,
  align = "end",
  label,
  triggerClassName,
  panelClassName,
  disabled,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (!panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>("[data-menu-item]:not([disabled])")];
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = e.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
        items[next]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <div className="hms-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cn("hms-btn hms-btn--secondary hms-btn--sm", triggerClassName)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          ref={panelRef}
          role="menu"
          aria-label={label}
          className={cn("hms-menu__panel", align === "start" && "hms-menu__panel--start", panelClassName)}
        >
          {typeof children === "function" ? children(() => close()) : children}
        </div>
      )}
    </div>
  );
}

export interface MenuItemProps {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  /** Destructive items read in the danger tone; pair with a confirmation. */
  tone?: "default" | "danger";
  icon?: ReactNode;
  className?: string;
}

export function MenuItem({ children, onSelect, disabled, tone = "default", icon, className }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      data-menu-item
      disabled={disabled}
      onClick={onSelect}
      className={cn("hms-menu__item", tone === "danger" && "hms-menu__item--danger", className)}
    >
      {icon ? <span className="hms-menu__item-icon">{icon}</span> : null}
      {children}
    </button>
  );
}

/** A checkable row — used by column visibility and faceted filters. */
export function MenuCheckboxItem({
  checked,
  onToggle,
  children,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      data-menu-item
      disabled={disabled}
      onClick={onToggle}
      className="hms-menu__item"
    >
      <span className={cn("hms-menu__check", checked && "hms-menu__check--on")} aria-hidden />
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="hms-menu__sep" role="separator" />;
}
