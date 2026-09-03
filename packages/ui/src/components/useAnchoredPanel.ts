"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Room the panel wants below the anchor before it gives up and flips above it. */
const PANEL_SPACE = 260;

export interface PanelRect {
  left: number;
  width: number;
  top: number | null;
  bottom: number | null;
  maxHeight: number;
}

/**
 * Positions a portalled dropdown panel against the control that opened it (ADR-029 —
 * the pattern appeared in `Select` and again in `Combobox`, so it lives in one place).
 *
 * The panel is rendered into `document.body` and positioned in **viewport** coordinates,
 * so a dialog's scrolling body, a sticky table header or any ancestor's `overflow` cannot
 * clip it — the failure that makes an in-flow dropdown feel cramped and half-usable. It is
 * width-matched to the anchor, capped at the room actually available, and flipped above the
 * anchor when the space below is too small.
 *
 * While open it re-measures on scroll (capture phase, so an ancestor's scroll counts, not
 * just the window's) and on resize. Closed, it holds no listeners and no rect.
 */
export function useAnchoredPanel<T extends HTMLElement>(anchorRef: RefObject<T | null>, open: boolean) {
  const [rect, setRect] = useState<PanelRect | null>(null);
  // The anchor ref is read inside a stable callback; keeping it in a ref of its own means
  // `measure` never changes identity and the scroll listener is armed exactly once.
  const anchor = useRef(anchorRef);
  anchor.current = anchorRef;

  const measure = useCallback(() => {
    const el = anchor.current.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const up = spaceBelow < PANEL_SPACE && spaceAbove > spaceBelow;
    setRect({
      left: r.left,
      width: r.width,
      top: up ? null : r.bottom + gap,
      bottom: up ? window.innerHeight - r.top + gap : null,
      maxHeight: Math.max(140, Math.min(PANEL_SPACE + 60, up ? spaceAbove : spaceBelow) - 8),
    });
  }, []);

  const clear = useCallback(() => setRect(null), []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => measure();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, measure]);

  return { rect, measure, clear };
}
