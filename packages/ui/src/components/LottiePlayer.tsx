'use client';

import { useEffect, useMemo, useState } from 'react';
import Lottie from 'lottie-react';
import { cn } from '../cn';
import { recolorLottie } from '../lottieRecolor';

type LottieData = Record<string, unknown>;

export interface LottiePlayerProps {
  /** URL to a Lottie JSON served from /public (fetched on mount, keeps it out of the JS bundle). */
  src?: string;
  /** Or pass the animation data directly (bundled). */
  animationData?: LottieData;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
  ariaLabel?: string;
  /**
   * Recolour the animation to the brand, read live from this CSS custom property
   * (e.g. "--mk-accent" / "--hms-brand"). Re-applies when the theme or platform
   * branding changes. Omit to keep the animation's original colours.
   */
  tintCssVar?: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function readCssColor(cssVar: string): string | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (!raw) return null;
  if (raw.startsWith('#') || raw.startsWith('rgb')) return raw;
  // Normalise any other form (e.g. color-mix) to rgb() via a probe element.
  const probe = document.createElement('span');
  probe.style.color = raw;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || null;
}

/**
 * Renders a Lottie animation (lottie-react). Load either from a `src` URL (lazy fetch —
 * best for large JSON like the hero) or from bundled `animationData`. Honours
 * `prefers-reduced-motion` (holds a static first frame) and can recolour the animation to
 * the brand via `tintCssVar` (updates live on theme / branding change).
 */
export function LottiePlayer({
  src,
  animationData,
  loop = true,
  autoplay = true,
  className,
  ariaLabel,
  tintCssVar,
}: LottiePlayerProps) {
  const [data, setData] = useState<LottieData | null>(animationData ?? null);
  const [reduced, setReduced] = useState(false);
  const [tint, setTint] = useState<string | null>(null);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (animationData || !src) return;
    const controller = new AbortController();
    fetch(src, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: LottieData | null) => {
        if (d) setData(d);
      })
      .catch(() => {
        /* animation unavailable — render nothing rather than break the page */
      });
    return () => controller.abort();
  }, [src, animationData]);

  // Track the brand colour from the CSS var, re-reading when <html> theme/branding changes.
  useEffect(() => {
    if (!tintCssVar) return;
    const read = () => setTint(readCssColor(tintCssVar));
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style', 'class'],
    });
    return () => observer.disconnect();
  }, [tintCssVar]);

  const rendered = useMemo(() => {
    if (!data) return null;
    if (!tint) return data;
    return recolorLottie(data, tint);
  }, [data, tint]);

  if (!rendered) return null;

  return (
    <Lottie
      animationData={rendered}
      loop={reduced ? false : loop}
      autoplay={reduced ? false : autoplay}
      className={cn(className)}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    />
  );
}
