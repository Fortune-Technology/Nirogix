"use client";

import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis, useLenis } from "lenis/react";

// Run synchronously before the browser paints on the client (so a new route never flashes at the
// previous scroll position), but fall back to a plain effect during SSR where useLayoutEffect warns.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Positions the scroll on every client-side route change (resources/DESIGN.md — frontend rules):
 *
 *   - A route with NO hash opens at the very top. The previous page's scroll never carries over.
 *   - A route WITH a hash (`/security#residency`, cross-page anchors) scrolls to that element,
 *     offset by the sticky-nav height read from CSS `scroll-padding-top`, so the anchor is not
 *     yanked to the top.
 *
 * The scroll goes through Lenis, which owns the document scroll in `root` mode (a bare
 * `window.scrollTo` is reverted by Lenis on its next frame). A native fallback covers the first
 * mount, before the Lenis instance exists. Only the top-level document scroll is touched —
 * overlay/table scroll regions (`data-lenis-prevent`, `useScrollLock`) are unaffected.
 */
function ScrollOnRouteChange() {
  const pathname = usePathname();
  const lenis = useLenis();

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    if (hash.length > 1) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        // Match CSS `scroll-padding-top` so the anchor clears a sticky header; 0 when unset.
        const padTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        if (lenis) lenis.scrollTo(target, { offset: -padTop, immediate: true, force: true });
        else target.scrollIntoView();
        return;
      }
      // Unknown/stale hash → fall through to the top.
    }

    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);
  }, [pathname, lenis]);

  return null;
}

export interface SmoothScrollProps {
  children: ReactNode;
  /** Lenis easing duration (seconds). */
  duration?: number;
}

/**
 * App-wide smooth scrolling via Lenis (https://lenis.dev), shared by the Portal and
 * the marketing site. Wrap the app once in the root layout. `root` mode drives the
 * document scroll and renders no wrapper element, so page layout is unaffected.
 * Overlays call `useScrollLock(open)` to stop this while open; inner scroll regions
 * (dense tables, scrollable panels, modal bodies) are marked `data-lenis-prevent`.
 *
 * Do NOT also set CSS `scroll-behavior: smooth` on `html` in a consuming app — a native
 * smooth-scroll fights Lenis and breaks the route-change reset below.
 */
export function SmoothScroll({ children, duration = 1.1 }: SmoothScrollProps) {
  return (
    <ReactLenis root options={{ duration, smoothWheel: true }}>
      <ScrollOnRouteChange />
      {children}
    </ReactLenis>
  );
}
