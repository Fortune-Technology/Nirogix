'use client';

import { X } from 'lucide-react';
import { cn } from '../../cn';

export interface NumberRangeValue {
  /** Lower bound, or null when the end is open. Units are the caller's (e.g. rupees). */
  min: number | null;
  max: number | null;
}

export interface NumberRangeFilterProps {
  /** The control's accessible name and visible caption — "Total (₹)", "Age". */
  label: string;
  value: NumberRangeValue;
  onChange: (value: NumberRangeValue) => void;
  /** Smallest enterable value (defaults to 0 — amounts and counts are not negative). */
  min?: number;
  step?: number;
  className?: string;
}

/**
 * A min–max numeric-range filter for the DataTable toolbar (ADR-063) — the
 * date-range's numeric sibling, for a column filtered by an amount or a count
 * (invoice total, balance, quantity). It drops into the table's `filters` slot; the
 * module owns the value and sends it to its server query, so the range narrows the
 * whole dataset rather than the page in the browser.
 *
 * Values are plain numbers in the caller's own unit — a billing screen passes rupees
 * and converts to paise at the API boundary. An empty field is `null` (open end),
 * and selecting one end bounds the other so an inverted range cannot be entered.
 */
export function NumberRangeFilter({
  label,
  value,
  onChange,
  min = 0,
  step,
  className,
}: NumberRangeFilterProps) {
  const active = value.min !== null || value.max !== null;

  const parse = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className={cn('hms-rangefilter', className)} role="group" aria-label={label}>
      <span className="hms-rangefilter__label">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        className="hms-input hms-rangefilter__num"
        placeholder="Min"
        aria-label={`${label} minimum`}
        value={value.min ?? ''}
        min={min}
        max={value.max ?? undefined}
        step={step}
        onChange={(e) => onChange({ ...value, min: parse(e.target.value) })}
      />
      <span className="hms-rangefilter__dash" aria-hidden>
        –
      </span>
      <input
        type="number"
        inputMode="decimal"
        className="hms-input hms-rangefilter__num"
        placeholder="Max"
        aria-label={`${label} maximum`}
        value={value.max ?? ''}
        min={value.min ?? min}
        step={step}
        onChange={(e) => onChange({ ...value, max: parse(e.target.value) })}
      />
      {active ? (
        <button
          type="button"
          className="hms-rangefilter__clear"
          onClick={() => onChange({ min: null, max: null })}
          aria-label={`Clear ${label} filter`}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
