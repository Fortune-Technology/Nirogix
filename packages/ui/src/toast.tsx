// The platform's one notification API (ADR-026, ADR-057).
//
// Engine: **React Toastify**, mounted once per app by `<Toaster />`. Nothing outside
// this file imports `react-toastify` — a page calls the API client, the API client
// calls `notifyError` / `notifySuccess` in `@hms/client`, and those call in here.
// That is the whole notification architecture, and it is deliberately one path.
//
//     toast.success("Patient registered.")
//     toast.error({ title: "Not permitted", description: err.message })
//     const id = toast.loading("Generating your report…")
//     toast.update(id, { variant: "success", description: "Report ready." })
//
// Two things the raw library does not give us and this adapter does:
//   1. It is callable from **plain TypeScript** with no React mounted — the shared API
//      client raises every notification and is not a component.
//   2. **De-duplication.** A retried request refreshes the toast it already has rather
//      than stacking a fifth identical one. The de-dupe key *is* the toast id, so
//      liveness is the library's to track and this module cannot leak a stale entry.

import { toast as toastify, type Id, type ToastOptions as ToastifyOptions } from "react-toastify";
import { ToastBody, ToastIcon } from "./components/ToastBody";

export type ToastVariant = "success" | "error" | "warning" | "info" | "loading";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Explicit id — pass one to update a specific toast later. Otherwise the dedupe key. */
  id?: string;
  title?: string;
  /** The detail line — this is where the API's own message goes. */
  description?: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss. `null` persists until dismissed. Defaults per variant. */
  duration?: number | null;
  action?: ToastAction;
  /** Repeats collapse onto one toast. Defaults to variant+title+description. */
  dedupeKey?: string;
}

/**
 * Success and info clear themselves; a warning lingers because it usually asks for a
 * decision; an error persists because the user may need to read it twice or copy it;
 * loading persists by definition, until whatever it reports on finishes.
 */
const DEFAULT_DURATION: Record<ToastVariant, number | null> = {
  success: 5000,
  info: 5000,
  warning: 7000,
  error: null,
  loading: null,
};

/** The words half of "never signal by colour alone". */
const DEFAULT_TITLE: Record<ToastVariant, string> = {
  success: "Success",
  info: "Notice",
  warning: "Warning",
  error: "Something went wrong",
  loading: "Working…",
};

/**
 * An error or a warning interrupts; everything else waits its turn. `alert` maps to an
 * assertive live region, `status` to a polite one — the difference between a screen
 * reader cutting the user off and letting them finish the sentence they are on.
 */
const ROLE: Record<ToastVariant, string> = {
  success: "status",
  info: "status",
  loading: "status",
  warning: "alert",
  error: "alert",
};

function optionsFor(variant: ToastVariant, duration: number | null, id: string): ToastifyOptions {
  return {
    toastId: id,
    // `false` disables the timer; the progress bar is not rendered without one.
    autoClose: duration ?? false,
    role: ROLE[variant],
    icon: <ToastIcon variant={variant} />,
    className: `hms-toast hms-toast--${variant}`,
    progressClassName: `hms-toast__progress hms-toast__progress--${variant}`,
    // The spinner is ours, so the library's own loading affordance stays off.
    isLoading: false,
  };
}

function show(input: string | ToastOptions): string {
  const opts: ToastOptions = typeof input === "string" ? { description: input } : input;
  const variant = opts.variant ?? "info";
  const title = opts.title ?? DEFAULT_TITLE[variant];
  const duration = opts.duration === undefined ? DEFAULT_DURATION[variant] : opts.duration;
  const id = opts.id ?? opts.dedupeKey ?? `${variant}|${title}|${opts.description ?? ""}`;

  const content = <ToastBody variant={variant} title={title} description={opts.description} action={opts.action} />;
  const config = optionsFor(variant, duration, id);

  // A live toast with this id is refreshed in place. Asking the library rather than
  // keeping our own map means a toast the user dismissed is genuinely gone, and the
  // same message can be raised again.
  if (toastify.isActive(id)) {
    toastify.update(id, { ...config, render: content, type: variant === "loading" ? "default" : variant });
    return id;
  }

  toastify(content, { ...config, type: variant === "loading" ? "default" : variant });
  return id;
}

function dismiss(id?: string): void {
  if (id) toastify.dismiss(id);
  else toastify.dismiss();
}

/**
 * Change a toast that is already on screen — the second half of a loading flow.
 * Passing a new variant swaps the icon, the role and the default duration with it, so
 * a "Working…" toast becomes a real success or failure rather than hanging forever.
 */
function update(id: string, patch: Partial<ToastOptions>): void {
  const variant = patch.variant ?? "info";
  const title = patch.title ?? DEFAULT_TITLE[variant];
  const duration = patch.duration === undefined ? DEFAULT_DURATION[variant] : patch.duration;
  toastify.update(id, {
    ...optionsFor(variant, duration, id),
    type: variant === "loading" ? "default" : variant,
    render: <ToastBody variant={variant} title={title} description={patch.description} action={patch.action} />,
  });
}

function withVariant(variant: ToastVariant) {
  return (input: string | ToastOptions, opts: Omit<ToastOptions, "variant"> = {}): string =>
    show(typeof input === "string" ? { ...opts, description: input, variant } : { ...input, ...opts, variant });
}

/**
 * Raise a notification. Every state-changing or failing API call arrives here through
 * the shared API client — no page writes its own toast logic, and no module configures
 * React Toastify independently (`resources/rules.md` → API Feedback & Notification).
 */
export const toast = Object.assign(show, {
  success: withVariant("success"),
  error: withVariant("error"),
  warning: withVariant("warning"),
  info: withVariant("info"),
  loading: withVariant("loading"),
  dismiss,
  update,
  /** Whether a given toast (or de-dupe key) is currently on screen. */
  isActive: (id: string): boolean => toastify.isActive(id as Id),
});
