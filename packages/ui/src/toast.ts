// The shared notification store behind `<Toaster />` (ADR-026).
//
// Deliberately framework-free: `toast()` is called from the apps' shared API
// client (plain TypeScript, outside React), so the store is a tiny pub/sub the
// React viewport subscribes to. There is exactly ONE notification system in the
// monorepo — see resources/rules.md → API Feedback & Notification Rules. Never
// build a second one, and never pass a stack trace, backend internal, or PHI in.

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Supply to update/replace a specific toast; otherwise generated. */
  id?: string;
  title?: string;
  /** The detail line — this is where the API's own message goes. */
  description?: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss. `null` persists until dismissed. Defaults per variant. */
  duration?: number | null;
  action?: ToastAction;
  /** Repeats within the visible stack collapse onto one toast. Defaults to variant+title+description. */
  dedupeKey?: string;
}

export interface ToastRecord {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number | null;
  action?: ToastAction;
  dedupeKey: string;
  /** Bumped when a duplicate arrives, so the viewport restarts the timer. */
  seq: number;
}

/** Success/info clear themselves; warnings linger; errors and loading persist until acted on. */
const DEFAULT_DURATION: Record<ToastVariant, number | null> = {
  success: 5000,
  info: 5000,
  warning: 7000,
  error: null,
  loading: null,
};

const DEFAULT_TITLE: Record<ToastVariant, string> = {
  success: 'Success',
  info: 'Notice',
  warning: 'Warning',
  error: 'Something went wrong',
  loading: 'Working…',
};

/** Stack cap — beyond this the oldest is dropped so notifications never bury the UI. */
const MAX_VISIBLE = 4;

type Listener = (toasts: ToastRecord[]) => void;

let toasts: ToastRecord[] = [];
const listeners = new Set<Listener>();
let counter = 0;
let seq = 0;

function emit(): void {
  for (const listener of listeners) listener(toasts);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastRecord[] {
  return toasts;
}

function normalize(input: string | ToastOptions): ToastRecord {
  const opts: ToastOptions = typeof input === 'string' ? { description: input } : input;
  const variant = opts.variant ?? 'info';
  const title = opts.title ?? DEFAULT_TITLE[variant];
  return {
    id: opts.id ?? `t${++counter}`,
    title,
    description: opts.description,
    variant,
    duration: opts.duration === undefined ? DEFAULT_DURATION[variant] : opts.duration,
    action: opts.action,
    dedupeKey: opts.dedupeKey ?? `${variant}|${title}|${opts.description ?? ''}`,
    seq: ++seq,
  };
}

function show(input: string | ToastOptions): string {
  const next = normalize(input);

  const existing = toasts.find((t) => (next.id && t.id === next.id) || t.dedupeKey === next.dedupeKey);
  if (existing) {
    // A repeat (e.g. a retried request) refreshes the existing toast instead of stacking.
    toasts = toasts.map((t) => (t.id === existing.id ? { ...next, id: existing.id } : t));
    emit();
    return existing.id;
  }

  toasts = [...toasts, next].slice(-MAX_VISIBLE);
  emit();
  return next.id;
}

function dismiss(id?: string): void {
  toasts = id ? toasts.filter((t) => t.id !== id) : [];
  emit();
}

function update(id: string, patch: Partial<ToastOptions>): void {
  const current = toasts.find((t) => t.id === id);
  if (!current) return;
  const merged = normalize({ ...current, ...patch, id });
  toasts = toasts.map((t) => (t.id === id ? merged : t));
  emit();
}

function withVariant(variant: ToastVariant) {
  return (input: string | ToastOptions, opts: Omit<ToastOptions, 'variant'> = {}): string =>
    show(typeof input === 'string' ? { ...opts, description: input, variant } : { ...input, ...opts, variant });
}

/**
 * Raise a notification. `toast('Saved.')` is shorthand for an info toast whose
 * description is that text; pass an object for a title, variant, action, or a
 * custom duration. Every state-changing or failing API call goes through here
 * (via the shared API client) — no page writes its own toast logic.
 */
export const toast = Object.assign(show, {
  success: withVariant('success'),
  error: withVariant('error'),
  warning: withVariant('warning'),
  info: withVariant('info'),
  loading: withVariant('loading'),
  dismiss,
  update,
});
