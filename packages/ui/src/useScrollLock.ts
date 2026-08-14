"use client";

import { useEffect } from "react";
import { useLenis } from "lenis/react";

/**
 * Locks background page scroll while an overlay (modal, drawer, dropdown, mobile
 * menu) is open (resources/DESIGN.md — frontend rules). Stops Lenis and pins the
 * document so the page cannot scroll behind the overlay; the overlay's own content
 * still scrolls if it has its own overflow (mark such regions `data-lenis-prevent`
 * so the wheel scrolls them, not the page). Restores Lenis + scroll on unlock.
 *
 * Usage: `useScrollLock(isOpen)` inside the component that owns the overlay.
 */
export function useScrollLock(locked: boolean): void {
  const lenis = useLenis();

  useEffect(() => {
    if (!locked) return;
    lenis?.stop();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      lenis?.start();
      document.body.style.overflow = previous;
    };
  }, [locked, lenis]);
}
