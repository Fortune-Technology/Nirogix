"use client";

import { parseDate, toApiDate, toApiTime } from "@hms/utils";
import { cn } from "../../cn";
import { DateField } from "./DateField";
import { TimeField } from "./TimeField";

export interface DateTimeFieldProps {
  label?: string;
  /** ISO-8601 instant in, ISO-8601 instant out. */
  value: string | null;
  onChange: (value: string | null) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  className?: string;
}

/**
 * Date and time together (ADR-048) — the `DateField` and `TimeField` side by side,
 * emitting one ISO instant. Used wherever an appointment, an admission or a
 * scheduled task needs both.
 *
 * It composes the two rather than inventing a third control, so the calendar, the
 * typed `DD/MM/YYYY` format and the AM/PM toggle behave identically to everywhere
 * else they appear.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  disabled,
  minDate,
  maxDate,
  className,
}: DateTimeFieldProps) {
  const parsed = parseDate(value);
  const datePart = parsed ? toApiDate(parsed) : null;
  const timePart = parsed ? toApiTime(parsed) : null;

  /** Rebuilds the instant from its parts; incomplete input clears the value. */
  function emit(nextDate: string | null, nextTime: string | null) {
    if (!nextDate) return onChange(null);
    const [h, m] = (nextTime ?? "00:00").split(":");
    const d = parseDate(nextDate);
    if (!d) return onChange(null);
    d.setHours(Number(h ?? 0), Number(m ?? 0), 0, 0);
    onChange(d.toISOString());
  }

  return (
    <div className={cn("hms-field", className)}>
      {label ? (
        <span className="hms-label">
          {label}
          {required ? <span aria-hidden> *</span> : null}
        </span>
      ) : null}

      <div className="hms-datetimefield">
        <DateField
          value={datePart}
          onChange={(d) => emit(d, timePart)}
          min={minDate}
          max={maxDate}
          disabled={disabled}
          required={required}
          className="hms-datetimefield__date"
        />
        <TimeField
          value={timePart}
          onChange={(t) => emit(datePart, t)}
          disabled={disabled}
          className="hms-datetimefield__time"
        />
      </div>

      {error ? (
        <span className="hms-field__error">{error}</span>
      ) : hint ? (
        <span className="hms-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
