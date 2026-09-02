"use client";

import { useEffect } from "react";

/**
 * Scrolling over a focused number input must not change its value (ADR-127).
 *
 * The browser's built-in behaviour is a genuine hazard in a hospital: a cashier types a fee,
 * scrolls the page to reach the Save button, and the amount silently becomes ₹501 because the
 * pointer happened to be over the field. Nothing on screen announces it, and the number that was
 * checked is not the number that is saved.
 *
 * **One listener, whole application.** It is deliberately not a prop on an input component: this
 * has to hold for a raw `<input type="number">` in a page nobody has migrated yet, exactly as much
 * as for the shared `Field`. Copying an `onWheel` into every form is how half of them end up
 * missing it.
 *
 * `preventDefault` alone would fix the value and break the page — the browser stops scrolling once
 * the gesture is cancelled — so the scroll is **forwarded** to the nearest scrollable ancestor
 * instead. The page moves as the user expects; only the number stays put.
 *
 * Untouched on purpose: typing, arrow keys (an intentional keystroke on a focused field is a real
 * edit), `step`, decimals, validation, and touch devices, which have no wheel at all.
 */
export function NumberInputGuard(): null {
  useEffect(() => {
    /** The closest ancestor that can actually scroll in this direction, else the document. */
    function scrollTarget(from: HTMLElement, deltaY: number): Element {
      let node: HTMLElement | null = from.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        const scrolls = /(auto|scroll|overlay)/.test(style.overflowY);
        if (scrolls && node.scrollHeight > node.clientHeight) {
          const atTop = node.scrollTop <= 0;
          const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
          if (!((deltaY < 0 && atTop) || (deltaY > 0 && atBottom))) return node;
        }
        node = node.parentElement;
      }
      return document.scrollingElement ?? document.documentElement;
    }

    /** Wheel deltas arrive in pixels, lines or pages; normalise to pixels. */
    function pixels(e: WheelEvent): number {
      if (e.deltaMode === 1) return e.deltaY * 16;
      if (e.deltaMode === 2) return e.deltaY * window.innerHeight;
      return e.deltaY;
    }

    function onWheel(e: WheelEvent) {
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement) || active.type !== "number") return;
      // Only the gesture the browser would actually apply to the field: the pointer has to be over
      // the focused input. Scrolling elsewhere on the page never touched the value to begin with.
      if (!e.composedPath().includes(active)) return;

      e.preventDefault();
      const dy = pixels(e);
      if (dy !== 0) scrollTarget(active, dy).scrollBy({ top: dy });
    }

    // Non-passive, because a passive listener may not call preventDefault — and React's own
    // `onWheel` is registered passively, which is why this cannot be a prop on the input.
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
