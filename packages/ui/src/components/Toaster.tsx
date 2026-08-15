"use client";

import { Toaster as ShadcnToaster } from "./toast/toast";

export interface ToasterProps {
  /** Accessible label for the notification region. */
  label?: string;
  /** How long a toast waits before auto-dismissing when it sets no timeout of its own. */
  timeout?: number;
  /** How many toasts stay stacked before older ones collapse. */
  limit?: number;
}

/**
 * The single notification viewport for the platform (ADR-032). Mount it once, in
 * each app's root layout; notifications are raised through `toast()` from
 * `@hms/ui` — in practice from the shared API client, not from page code.
 *
 * This wraps shadcn/ui's Base UI Toast (`components/toast/toast.tsx`). Base UI
 * provides the behaviour we would otherwise hand-roll: hover/focus pauses the
 * timer, swipe dismisses on touch, F6 moves focus to the stack, and the live
 * region announces politely or assertively by type. Placement clears the shared
 * `BackToTop` control on desktop.
 */
export function Toaster({ label = "Notifications", timeout = 5000, limit = 4 }: ToasterProps) {
  return (
    <ShadcnToaster
      timeout={timeout}
      limit={limit}
      // The generated viewport sits at bottom-4; lift it so it never covers BackToTop.
      // (Provider props flow through; the viewport class is set in toast.tsx.)
      aria-label={label}
    />
  );
}
