'use client';

import { useEffect, useRef, useState } from 'react';
import { LottiePlayer } from './LottiePlayer';
import { cn } from '../cn';

export interface LottiePreloaderProps {
  /** URL to the preloader Lottie JSON (served from /public). */
  src: string;
  /** Minimum time the preloader stays up, so it never flashes. */
  minDurationMs?: number;
  /** Hard cap — the preloader always leaves by here, even if `load` never fires. */
  maxDurationMs?: number;
  label?: string;
  /** CSS custom property to recolour the animation to the brand (e.g. "--hms-brand"). */
  tintCssVar?: string;
}

/**
 * Full-screen loading overlay shared by both apps (marketing + Portal). Covers the page
 * (opaque, blocks scroll + interaction) while the app loads its initial JS, plays the
 * Lottie, then fades out once `window.load` fires (respecting a small minimum so it does
 * not flash, and a hard cap so it never blocks the page). Performance-conscious: it does
 * not delay the page to finish an animation loop.
 */
export function LottiePreloader({
  src,
  minDurationMs = 500,
  maxDurationMs = 4000,
  label = 'Loading',
  tintCssVar,
}: LottiePreloaderProps) {
  const [state, setState] = useState<'visible' | 'leaving' | 'gone'>('visible');
  const startRef = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();
    let begun = false;
    const begin = () => {
      if (begun) return;
      begun = true;
      const elapsed = performance.now() - startRef.current;
      window.setTimeout(() => setState('leaving'), Math.max(0, minDurationMs - elapsed));
    };
    if (document.readyState === 'complete') begin();
    else window.addEventListener('load', begin, { once: true });
    const cap = window.setTimeout(begin, maxDurationMs);
    return () => {
      window.removeEventListener('load', begin);
      window.clearTimeout(cap);
    };
  }, [minDurationMs, maxDurationMs]);

  // Once fading out, remove after the fade (timer, not transitionend — deterministic
  // even if the fade is a no-op under reduced motion or an unstyled state).
  useEffect(() => {
    if (state !== 'leaving') return;
    const t = window.setTimeout(() => setState('gone'), 520);
    return () => window.clearTimeout(t);
  }, [state]);

  // Block background scroll/interaction while the overlay is up.
  useEffect(() => {
    if (state === 'gone') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [state]);

  if (state === 'gone') return null;

  return (
    <div
      className={cn('hms-preloader', state === 'leaving' && 'hms-preloader--leaving')}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <LottiePlayer
        src={src}
        className="hms-preloader__anim"
        loop
        autoplay
        ariaLabel={label}
        tintCssVar={tintCssVar}
      />
    </div>
  );
}
