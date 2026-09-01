"use client";

import { useEffect } from "react";
import { useLenis } from "lenis/react";

/**
 * Locks background page scroll while an overlay (modal, drawer, dropdown, mobile
 * menu) is open (resources/DESIGN.md — frontend rules).
 *
 * The lock is native: the document is pinned with `overflow: hidden`, and the width the
 * scrollbar was occupying is given back as padding so the page does not visibly jump
 * sideways the moment a dialog opens. The overlay's own content still scrolls if it has
 * its own overflow.
 *
 * The four application portals scroll natively (ADR-111 — Lenis is the marketing site's
 * only), so on them there is no Lenis instance and `useLenis` returns undefined; the
 * hook then does nothing beyond the native pin. On marketing, Lenis is additionally
 * stopped and restarted, because a running smooth-scroll would otherwise keep animating
 * the document behind the overlay. Regions inside a Lenis page that need their own wheel
 * scrolling are marked `data-lenis-prevent`.
 *
 * Usage: `useScrollLock(isOpen)` inside the component that owns the overlay.
 */
export function useScrollLock(locked: boolean): void {
  const lenis = useLenis();

  useEffect(() => {
    if (!locked) return;
    lenis?.stop();

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    // Only compensate when a classic scrollbar actually takes layout width. Overlay
    // scrollbars (macOS, most phones) report 0 and need no compensation.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      const current = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbarWidth}px`;
    }

    return () => {
      lenis?.start();
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [locked, lenis]);
}
