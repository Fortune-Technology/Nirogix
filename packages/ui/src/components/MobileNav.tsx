"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../cn";
import { useScrollLock } from "../useScrollLock";

/**
 * App-like mobile navigation (ADR-033), shared by the Portal and the marketing
 * site: a fixed bottom bar with up to five primary destinations, plus a
 * top-right hamburger that opens a slide-out drawer for everything else.
 *
 * Desktop keeps its own professional navigation — these components are rendered
 * only under the `md` breakpoint by their callers.
 */

export interface MobileNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Marks the item active; callers pass the result of their own route match. */
  active?: boolean;
}

export interface BottomNavProps {
  /** Up to five items — more are ignored, since a crowded bar stops being tappable. */
  items: MobileNavItem[];
  /** Rendered as the last slot, typically the hamburger trigger. */
  trailing?: ReactNode;
  /** Router-aware link component (`next/link`), so navigation stays client-side. */
  linkAs?: React.ElementType;
  label?: string;
  className?: string;
}

/** The maximum a thumb can comfortably hit on a phone-width bar. */
export const BOTTOM_NAV_MAX_ITEMS = 5;

export function BottomNav({
  items,
  trailing,
  linkAs: Link = "a",
  label = "Primary",
  className,
}: BottomNavProps) {
  const visible = items.slice(0, trailing ? BOTTOM_NAV_MAX_ITEMS - 1 : BOTTOM_NAV_MAX_ITEMS);
  if (visible.length === 0 && !trailing) return null;

  return (
    <nav className={cn("hms-bottomnav", className)} aria-label={label}>
      {visible.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("hms-bottomnav__item", item.active && "hms-bottomnav__item--active")}
            aria-current={item.active ? "page" : undefined}
          >
            <Icon size={20} strokeWidth={item.active ? 2 : 1.75} aria-hidden />
            <span className="hms-bottomnav__label">{item.label}</span>
          </Link>
        );
      })}
      {trailing}
    </nav>
  );
}

export interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /** Which edge it slides from. Right pairs with a top-right hamburger. */
  side?: "right" | "left";
  footer?: ReactNode;
}

/**
 * The slide-out navigation drawer. Locks background scrolling through the shared
 * `useScrollLock` (DESIGN.md §9.3) and marks its own scroll region
 * `data-lenis-prevent`, so the page never scrolls behind it and normal scrolling
 * resumes on close. Focus is trapped while open and returns to the trigger.
 */
export function NavDrawer({ open, onClose, children, title = "Menu", side = "right", footer }: NavDrawerProps) {
  useScrollLock(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="hms-drawer__overlay"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-lenis-prevent
        className={cn("hms-drawer", side === "left" && "hms-drawer--left")}
      >
        <div className="hms-drawer__head">
          <span className="hms-drawer__title">{title}</span>
          <button type="button" className="hms-drawer__close" aria-label="Close menu" onClick={onClose}>
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="hms-drawer__body">{children}</div>
        {footer ? <div className="hms-drawer__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** A row inside the drawer — same affordance in both apps. */
export function NavDrawerItem({
  href,
  icon: Icon,
  active,
  onClick,
  linkAs: Link = "a",
  children,
}: {
  href: string;
  icon?: LucideIcon;
  active?: boolean;
  onClick?: () => void;
  linkAs?: React.ElementType;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn("hms-drawer__item", active && "hms-drawer__item--active")}
    >
      {Icon ? <Icon size={18} strokeWidth={1.75} aria-hidden /> : null}
      <span>{children}</span>
    </Link>
  );
}

export function NavDrawerSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="hms-drawer__section">
      {title ? <p className="hms-drawer__section-title">{title}</p> : null}
      {children}
    </div>
  );
}
