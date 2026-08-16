"use client";

import { ToastContainer } from "react-toastify";
// The library's own stylesheet. Imported here rather than by each app so a frontend
// cannot forget it, and so the token overrides in this package's `styles.css` always
// load after it.
import "react-toastify/dist/ReactToastify.css";
import { ToastCloseButton } from "./ToastBody";

export interface ToasterProps {
  /** Accessible label for the notification region. */
  label?: string;
  /** How long a toast waits before auto-dismissing when it sets no duration of its own. */
  duration?: number;
  /** How many toasts stay on screen; the rest queue rather than burying the page. */
  limit?: number;
}

/**
 * The single notification viewport for the platform (ADR-057). Mount it once, in each
 * app's root layout; notifications are raised through `toast()` from `@hms/ui` — in
 * practice from the shared API client, not from page code.
 *
 * **Top-right**, below the app bar, on every application and every breakpoint. The
 * offsets are set in `styles.css` against the app-bar height so a toast never covers
 * navigation the user might be reaching for.
 *
 * **Theme and branding come from the tokens, not from here.** The library's own
 * `--toastify-*` variables are re-pointed at `--hms-*` in this package's stylesheet, so
 * a toast follows Light/Dark and the active tenant's accent for free, and the same
 * mapping serves an app that scopes the tokens differently. No colour is passed at a
 * call site, and none is set on this component.
 *
 * The library owns placement, timing, stacking, hover/focus pausing, drag-to-dismiss
 * and the live region. Everything visible — icon, title, description, action, close —
 * is this package's, so a toast looks like the rest of the product.
 */
export function Toaster({ label = "Notifications", duration = 5000, limit = 4 }: ToasterProps) {
  return (
    <ToastContainer
      position="top-right"
      autoClose={duration}
      limit={limit}
      newestOnTop
      stacked={false}
      // Reading takes longer than the timer allows if the user is mid-sentence, and a
      // toast that expires while the tab was in the background was never seen at all.
      pauseOnHover
      pauseOnFocusLoss
      closeOnClick={false}
      closeButton={ToastCloseButton}
      hideProgressBar={false}
      draggable="touch"
      icon={false}
      // The container's own theme is neutralised: every colour resolves through the
      // `--toastify-*` → `--hms-*` mapping, so Light/Dark is one definition, not two.
      theme="light"
      aria-label={label}
      className="hms-toast-container"
    />
  );
}
