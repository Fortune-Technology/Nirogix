"use client";

import { X } from "lucide-react";
import { cn } from "../../cn";
import { DateField } from "../datetime/DateField";

export interface DateRangeValue {
  /** ISO calendar date (`YYYY-MM-DD`) or null when the end is open. */
  from: string | null;
  to: string | null;
}

export interface DateRangeFilterProps {
  /** The control's accessible name and visible caption — "Registered", "Invoice date". */
  label: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
}

/**
 * A from–to date-range filter for the DataTable toolbar (ADR-063) — the structured
 * control a bare search box cannot replace when a module filters by a date
 * (registration, appointment, invoice date). It drops into the table's `filters`
 * slot; the module owns the value and sends it to its server query, so the range
 * narrows the whole dataset, not just the page already in the browser.
 *
 * Both ends are `DateField`s (ADR-048): the format is `DD/MM/YYYY` on every machine
 * while the value crossing the boundary stays ISO, and choosing one end bounds the
 * other so an inverted range cannot be entered.
 */
export function DateRangeFilter({ label, value, onChange, className }: DateRangeFilterProps) {
  const active = Boolean(value.from || value.to);
  return (
    <div className={cn("hms-rangefilter", className)} role="group" aria-label={label}>
      <span className="hms-rangefilter__label">{label}</span>
      <DateField
        value={value.from}
        onChange={(from) => onChange({ ...value, from })}
        max={value.to ?? undefined}
        placeholder="From"
        className="hms-rangefilter__field"
      />
      <span className="hms-rangefilter__dash" aria-hidden>
        –
      </span>
      <DateField
        value={value.to}
        onChange={(to) => onChange({ ...value, to })}
        min={value.from ?? undefined}
        placeholder="To"
        className="hms-rangefilter__field"
      />
      {active ? (
        <button
          type="button"
          className="hms-rangefilter__clear"
          onClick={() => onChange({ from: null, to: null })}
          aria-label={`Clear ${label} filter`}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
