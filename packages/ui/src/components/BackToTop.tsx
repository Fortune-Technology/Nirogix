"use client";

import { useEffect, useState } from "react";
import { useLenis } from "lenis/react";
import { ArrowUp } from "lucide-react";
import { cn } from "../cn";

export interface BackToTopProps {
  /** Pixels the user must scroll before the button appears. */
  threshold?: number;
  className?: string;
}

/**
 * Reusable "back to top" control, shared by the four application portals and the
 * marketing site (resources/DESIGN.md — frontend rules). Appears after the page is
 * scrolled past `threshold`. Styled via the token-driven `.hms-backtotop` class (see
 * styles.css), so it inherits the current theme + accent. Accessible: it is removed from
 * the tab order while hidden and labelled for screen readers.
 *
 * Visibility is driven by the native scroll position rather than by Lenis, because the
 * portals scroll natively (ADR-111) and only marketing runs a Lenis instance. Where
 * Lenis is running it animates the return to the top so the button matches the rest of
 * that page's motion; everywhere else the browser's own smooth scrolling does it.
 */
export function BackToTop({ threshold = 600, className }: BackToTopProps) {
  const [visible, setVisible] = useState(false);
  const lenis = useLenis();

  useEffect(() => {
    function onScroll() {
      const next = window.scrollY > threshold;
      setVisible((prev) => (prev === next ? prev : next));
    }
    onScroll(); // a restored scroll position must not need a wheel event to be noticed
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  function toTop() {
    if (lenis) lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: "smooth" });
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
