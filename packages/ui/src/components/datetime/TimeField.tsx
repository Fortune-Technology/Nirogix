"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../cn";

export interface TimeFieldProps {
  label?: string;
  /** 24-hour `HH:mm` — the transport shape, in and out. The UI is 12-hour (ADR-046). */
  value: string | null;
  onChange: (value: string | null) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
}

type Meridiem = "AM" | "PM";

/** `14:05` → `{ hour: "02", minute: "05", meridiem: "PM" }`. */
function split(value: string | null): { hour: string; minute: string; meridiem: Meridiem } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!m) return { hour: "", minute: "", meridiem: "AM" };
  const h24 = Number(m[1]);
  const meridiem: Meridiem = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour: String(h12).padStart(2, "0"), minute: m[2]!, meridiem };
}

/** The inverse — only when every part is present and in range. */
function join(hour: string, minute: string, meridiem: Meridiem): string | null {
  const h = Number(hour);
  const min = Number(minute);
  if (!hour || !minute || Number.isNaN(h) || Number.isNaN(min)) return null;
  if (h < 1 || h > 12 || min < 0 || min > 59) return null;
  const h24 = meridiem === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
  return `${String(h24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * The one time input (ADR-048) — `hh:mm` plus an **AM/PM toggle**, matching how
 * the platform displays time (ADR-046) and how a hospital's staff actually read a
 * schedule. A native `<input type="time">` renders 12- or 24-hour depending on the
 * browser's locale, which is exactly the inconsistency the standard forbids.
 *
 * The value crossing the boundary stays 24-hour `HH:mm`, so nothing downstream has
 * to know about the meridiem.
 */
export function TimeField({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  disabled,
  className,
  name,
}: TimeFieldProps) {
  const id = useId();
  const initial = split(value);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [meridiem, setMeridiem] = useState<Meridiem>(initial.meridiem);
  const lastValue = useRef(value);

  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value;
      const next = split(value);
      setHour(next.hour);
      setMinute(next.minute);
      setMeridiem(next.meridiem);
    }
  }, [value]);

  function commit(h: string, m: string, mer: Meridiem) {
    const next = join(h, m, mer);
    lastValue.current = next;
    onChange(next);
  }

  return (
    <div className={cn("hms-field", className)}>
      {label ? (
        <span className="hms-label" id={`${id}-label`}>
          {label}
          {required ? <span aria-hidden> *</span> : null}
        </span>
      ) : null}

      <div
        className={cn("hms-timefield", disabled && "hms-timefield--disabled", error && "hms-timefield--error")}
        role="group"
        aria-labelledby={label ? `${id}-label` : undefined}
      >
        <input
          id={id}
          name={name ? `${name}-hour` : undefined}
          className="hms-timefield__part"
          value={hour}
          placeholder="hh"
          inputMode="numeric"
          maxLength={2}
          disabled={disabled}
          aria-label="Hour"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setHour(v);
            commit(v, minute, meridiem);
          }}
          onBlur={() => hour && setHour(hour.padStart(2, "0"))}
        />
        <span className="hms-timefield__sep" aria-hidden>
          :
        </span>
        <input
          name={name ? `${name}-minute` : undefined}
          className="hms-timefield__part"
          value={minute}
          placeholder="mm"
          inputMode="numeric"
          maxLength={2}
          disabled={disabled}
          aria-label="Minute"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setMinute(v);
            commit(hour, v, meridiem);
          }}
          onBlur={() => minute && setMinute(minute.padStart(2, "0"))}
        />

        <div className="hms-timefield__meridiem" role="group" aria-label="AM or PM">
          {(["AM", "PM"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={disabled}
              aria-pressed={meridiem === m}
              className={cn("hms-timefield__mer-btn", meridiem === m && "hms-timefield__mer-btn--on")}
              onClick={() => {
                setMeridiem(m);
                commit(hour, minute, m);
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <span className="hms-field__error">{error}</span>
      ) : hint ? (
        <span className="hms-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
