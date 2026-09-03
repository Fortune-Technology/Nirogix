'use client';

import { useCallback, useState } from 'react';
import { resolveDateRange, type DateRangePreset } from '@hms/utils';
import { makePeriod, type PeriodValue } from './components/PeriodFilter';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads a persisted range off the current URL, or null when there is none / it is
 * invalid. A preset is stored by key (`?range=last30Days`) and re-resolved against
 * today, so a bookmarked "Last 7 days" stays relative; a custom range stores its two
 * ISO dates (`?range=custom&rangeFrom=…&rangeTo=…`). Client-only.
 */
function readPeriodFromUrl(key: string): PeriodValue | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  const preset = p.get(key) as DateRangePreset | null;
  if (!preset) return null;
  if (preset === 'custom') {
    const from = p.get(`${key}From`);
    const to = p.get(`${key}To`);
    if (from && to && ISO.test(from) && ISO.test(to) && to >= from)
      return { preset: 'custom', start: from, end: to };
    return null;
  }
  const r = resolveDateRange(preset);
  return r ? { preset, start: r.start, end: r.end } : null;
}

/**
 * A `PeriodValue` bound to the URL, so a filtered view is deep-linkable and survives a
 * refresh (ADR-046). Drop-in for `useState` under `<PeriodFilter>`: seeds from the URL
 * when present (else the given default), and every change writes back with
 * `history.replaceState` — Next's supported native-History path, so it updates the
 * address bar without a navigation, a refetch, or spamming the back button.
 *
 * The reading happens at mount and is client-only; the authenticated shells mount their
 * pages on the client (the layout gates on the session), so this seeds the real range on
 * the first render with no default-then-correct flash.
 */
export function usePeriodParam(
  defaultPreset: Exclude<DateRangePreset, 'custom'>,
  key = 'range',
): [PeriodValue, (next: PeriodValue) => void] {
  const [value, setValue] = useState<PeriodValue>(
    () => readPeriodFromUrl(key) ?? makePeriod(defaultPreset),
  );

  const set = useCallback(
    (next: PeriodValue) => {
      setValue(next);
      if (typeof window === 'undefined') return;
      const p = new URLSearchParams(window.location.search);
      p.set(key, next.preset);
      if (next.preset === 'custom') {
        p.set(`${key}From`, next.start);
        p.set(`${key}To`, next.end);
      } else {
        p.delete(`${key}From`);
        p.delete(`${key}To`);
      }
      const qs = p.toString();
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(window.history.state, '', url);
    },
    [key],
  );

  return [value, set];
}
