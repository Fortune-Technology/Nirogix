"use client";

import { useState } from "react";
import { useLenis } from "lenis/react";
import { ArrowUp } from "lucide-react";
import { cn } from "../cn";

export interface BackToTopProps {
  /** Pixels the user must scroll before the button appears. */
  threshold?: number;
  className?: string;
}

/**
 * Reusable "back to top" control, shared by the Portal and the marketing site
 * (resources/DESIGN.md — frontend rules). Appears after the page is scrolled past
 * `threshold`, and smooth-scrolls to the top through Lenis so it matches the app's
 * smooth-scroll behaviour. Styled via the token-driven `.hms-backtotop` class
 * (see styles.css), so it inherits the current theme + accent. Accessible: it is
 * removed from the tab order while hidden and labelled for screen readers.
 */
export function BackToTop({ threshold = 600, className }: BackToTopProps) {
  const [visible, setVisible] = useState(false);

  const lenis = useLenis((l) => {
    const next = l.scroll > threshold;
    setVisible((prev) => (prev === next ? prev : next));
  });

  function toTop() {
    if (lenis) lenis.scrollTo(0);
    else if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn("hms-backtotop", visible && "hms-backtotop--visible", className)}
    >
      <ArrowUp size={20} strokeWidth={2} aria-hidden />
    </button>
  );
}
