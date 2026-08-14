import type { ReactNode } from "react";
import { cn } from "@hms/ui";

/**
 * Frames a real slice of the Portal UI as the "product mockup" that leads a section
 * (per the marketing design language). The body sits on the real app canvas
 * (--hms-bg) so the @hms/ui components inside read as the genuine product, not a
 * hand-drawn screenshot. No drop shadow — depth comes from white-on-cream + hairline.
 */
export function ProductFrame({
  path,
  children,
  className,
}: {
  path: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-xl border border-hairline bg-surface",
        className,
      )}
    >
      {/* window chrome */}
      <div className="flex items-center gap-3 border-b border-hairline bg-surface px-4 py-3">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-hairline" />
          <span className="h-2.5 w-2.5 rounded-full bg-hairline" />
          <span className="h-2.5 w-2.5 rounded-full bg-hairline" />
        </div>
        <span className="truncate rounded-md bg-surface-2 px-2.5 py-1 font-mono text-xs text-ink-subtle">
          {path}
        </span>
      </div>
      {/* app canvas */}
      <div className="p-4 sm:p-5" style={{ background: "var(--hms-bg)" }}>
        {children}
      </div>
    </div>
  );
}
