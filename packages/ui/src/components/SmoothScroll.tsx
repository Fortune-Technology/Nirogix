"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis, useLenis } from "lenis/react";

// Starts every newly-opened route at the top (resources/DESIGN.md — frontend
// rules): on client-side navigation the pathname changes and we jump to the top
// immediately. Hash-only changes are left alone so in-page anchors still work.
function ScrollTopOnRoute() {
  const pathname = usePathname();
  const lenis = useLenis();
  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else if (typeof window !== "undefined") window.scrollTo(0, 0);
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
 */
export function SmoothScroll({ children, duration = 1.1 }: SmoothScrollProps) {
  return (
    <ReactLenis root options={{ duration, smoothWheel: true }}>
      <ScrollTopOnRoute />
      {children}
    </ReactLenis>
  );
}
