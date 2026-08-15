// The platform's notification API (ADR-026, ADR-032).
//
// The component underneath is shadcn/ui's Base UI Toast (`components/toast/toast.tsx`,
// generated with `shadcn add @shadcn/toast`). This module is the thin adapter over
// its toast manager that keeps the call-site API the apps already use:
//
//     toast.success("Patient registered.")
//     toast.error({ title: "Not permitted", description: err.message })
//
// It exists for two reasons the raw manager does not cover:
//   1. It is callable from PLAIN TYPESCRIPT — the shared API client raises every
//      notification (lib/feedback.ts), and it is not a React component.
//   2. De-duplication: a retried request refreshes the toast it already has
//      instead of stacking a second identical one.

import { toast as manager } from "./components/toast/toast";

export type ToastVariant = "success" | "error" | "warning" | "info" | "loading";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
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

/** Success/info clear themselves; warnings linger; errors and loading persist. */
const DEFAULT_DURATION: Record<ToastVariant, number | null> = {
  success: 5000,
  info: 5000,
  warning: 7000,
  error: null,
  loading: null,
};

const DEFAULT_TITLE: Record<ToastVariant, string> = {
  success: "Success",
  info: "Notice",
  warning: "Warning",
  error: "Something went wrong",
  loading: "Working…",
};

/** dedupeKey → live toast id, so a repeat updates instead of stacking. */
const live = new Map<string, string>();

function show(input: string | ToastOptions): string {
  const opts: ToastOptions = typeof input === "string" ? { description: input } : input;
  const variant = opts.variant ?? "info";
  const title = opts.title ?? DEFAULT_TITLE[variant];
  const duration = opts.duration === undefined ? DEFAULT_DURATION[variant] : opts.duration;
  const key = opts.dedupeKey ?? `${variant}|${title}|${opts.description ?? ""}`;

  const payload = {
    title,
    description: opts.description,
    // Base UI drives its own icon + styling from `type`.
    type: variant,
    // 0 disables the timer in Base UI; our `null` means "persist".
    timeout: duration ?? 0,
    actionProps: opts.action
      ? { children: opts.action.label, onClick: opts.action.onClick }
      : undefined,
    onClose: () => {
      if (live.get(key) === existing) live.delete(key);
    },
  };

  const existing = opts.id ?? live.get(key);
  if (existing) {
    manager.update(existing, payload);
    return existing;
  }

  const id = manager.add(payload);
  live.set(key, id);
  return id;
}

function dismiss(id?: string): void {
  if (id) {
    manager.close(id);
    for (const [key, value] of live) if (value === id) live.delete(key);
    return;
  }
  for (const [, value] of live) manager.close(value);
  live.clear();
}

function update(id: string, patch: Partial<ToastOptions>): void {
  manager.update(id, {
    title: patch.title,
    description: patch.description,
    type: patch.variant,
    timeout: patch.duration === undefined ? undefined : (patch.duration ?? 0),
  });
}

function withVariant(variant: ToastVariant) {
  return (input: string | ToastOptions, opts: Omit<ToastOptions, "variant"> = {}): string =>
    show(typeof input === "string" ? { ...opts, description: input, variant } : { ...input, ...opts, variant });
}

/**
 * Raise a notification. Every state-changing or failing API call goes through
 * here (via the shared API client) — no page writes its own toast logic.
 */
export const toast = Object.assign(show, {
  success: withVariant("success"),
  error: withVariant("error"),
  warning: withVariant("warning"),
  info: withVariant("info"),
  loading: withVariant("loading"),
  dismiss,
  update,
});
