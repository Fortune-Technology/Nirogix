"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import { cn } from "../cn";
import { subscribeToasts, toast, type ToastRecord, type ToastVariant } from "../toast";

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
};

export interface ToasterProps {
  /** Accessible label for the notification region. */
  label?: string;
  className?: string;
}

/**
 * The single notification viewport for the whole platform (ADR-026,
 * resources/DESIGN.md §5). Mount it once per app, at the root layout; every
 * notification is raised through `toast()` from `@hms/ui` — in practice from the
 * shared API client, not from page code.
 *
 * Behaviour: top-full-width on mobile, bottom-right on desktop clear of
 * `BackToTop`; success/info auto-dismiss, errors persist until dismissed; the
 * timer pauses while the pointer or keyboard focus is inside the stack; Esc
 * dismisses the newest toast. Errors/warnings announce assertively, everything
 * else politely. All visuals derive from `--hms-*` tokens, so it follows the
 * theme and the tenant accent with no per-app styling.
 */
export function Toaster({ label = "Notifications", className }: ToasterProps) {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const [mounted, setMounted] = useState(false);
  const [paused, setPaused] = useState(false);
  const timers = useRef(new Map<string, { seq: number; handle: ReturnType<typeof setTimeout> }>());

  useEffect(() => setMounted(true), []);
  useEffect(() => subscribeToasts(setItems), []);

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t.handle);
      timers.current.delete(id);
    }
  }, []);

  // Auto-dismiss. A de-duplicated repeat carries a new `seq`, which restarts the
  // timer; pausing (hover / focus inside the stack) clears them until it resumes.
  useEffect(() => {
    const timeouts = timers.current;

    for (const [id, t] of [...timeouts]) {
      const live = items.find((i) => i.id === id);
      if (paused || !live || live.duration == null || live.seq !== t.seq) {
        clearTimeout(t.handle);
        timeouts.delete(id);
      }
    }

    if (paused) return;
    for (const item of items) {
      if (item.duration == null || timeouts.has(item.id)) continue;
      timeouts.set(item.id, {
        seq: item.seq,
        handle: setTimeout(() => {
          timeouts.delete(item.id);
          toast.dismiss(item.id);
        }, item.duration),
      });
    }
  }, [items, paused]);

  useEffect(() => {
    const timeouts = timers.current;
    return () => {
      for (const t of timeouts.values()) clearTimeout(t.handle);
      timeouts.clear();
    };
  }, []);

  // Esc dismisses the newest notification.
  useEffect(() => {
    if (items.length === 0) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const newest = items[items.length - 1];
      if (newest) toast.dismiss(newest.id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items]);

  if (!mounted) return null;

  const view = (
    <ol
      role="region"
      aria-label={label}
      className={cn("hms-toaster", className)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {items.map((item) => {
        const Icon = ICONS[item.variant];
        const assertive = item.variant === "error" || item.variant === "warning";
        return (
          <li
            key={item.id}
            role={assertive ? "alert" : "status"}
            aria-live={assertive ? "assertive" : "polite"}
            aria-atomic="true"
            className={cn("hms-toast", `hms-toast--${item.variant}`)}
          >
            <Icon
              size={18}
              strokeWidth={1.75}
              aria-hidden
              className={cn("hms-toast__icon", item.variant === "loading" && "hms-toast__icon--spin")}
            />
            <div className="hms-toast__body">
              <p className="hms-toast__title">{item.title}</p>
              {item.description ? <p className="hms-toast__desc">{item.description}</p> : null}
              {item.action ? (
                <button
                  type="button"
                  className="hms-toast__action"
                  onClick={() => {
                    item.action?.onClick();
                    toast.dismiss(item.id);
                  }}
                >
                  {item.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="hms-toast__close"
              aria-label="Dismiss notification"
              onClick={() => {
                clearTimer(item.id);
                toast.dismiss(item.id);
              }}
            >
              <X size={15} strokeWidth={2} aria-hidden />
            </button>
          </li>
        );
      })}
    </ol>
  );

  return createPortal(view, document.body);
}
