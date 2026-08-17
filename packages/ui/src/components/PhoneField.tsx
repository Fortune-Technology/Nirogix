"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn";

/**
 * The 10-digit local part of an Indian mobile from any input — typed, or pasted as
 * `+91XXXXXXXXXX`, `91XXXXXXXXXX`, `0XXXXXXXXXX`, or with spaces/dashes. Everything
 * but digits is stripped and a leading `91` country code or `0` trunk prefix is
 * dropped, so a duplicated country code (`+91+919876543210`) collapses to the last
 * ten digits rather than being accepted twice.
 */
export function localIndianMobile(value: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  // A leading country code or trunk prefix only makes sense once the number is
  // already long enough to have a 10-digit tail; keep the last ten either way.
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

/** The canonical stored/API form `+91XXXXXXXXXX`, or `""` when the local part is not a valid 10-digit mobile. */
export function canonicalIndianMobile(value: string): string {
  const local = localIndianMobile(value);
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : "";
}

export interface PhoneFieldProps {
  label?: ReactNode;
  /**
   * Canonical value `+91XXXXXXXXXX` (empty when unset). Existing records in any
   * legacy format — bare 10 digits, `91…`, spaced — are read leniently for display.
   */
  value: string;
  /** Fires with the canonical `+91XXXXXXXXXX`, or `""` while the number is incomplete. */
  onChange: (canonical: string) => void;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
}

/**
 * The one Indian-mobile input. `+91` is a fixed, non-editable prefix, so the user
 * types only their 10 digits and the country code can never be doubled or forgotten.
 * The value crossing the boundary is always canonical `+91XXXXXXXXXX` (or `""`),
 * matching what the backend stores and what the SMS provider needs — the display
 * format never reaches the API. Use it only for genuine Indian mobile numbers, not
 * landlines or international contacts.
 */
export function PhoneField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  disabled,
  name,
  id,
  className,
}: PhoneFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-msg`;
  const [local, setLocal] = useState(() => localIndianMobile(value));
  const last = useRef(value);

  // Re-seed the display only when the value changes from outside (a form reset or a
  // loaded record), never while the user is mid-edit — the same discipline as DateField.
  useEffect(() => {
    if (last.current !== value) {
      last.current = value;
      setLocal(localIndianMobile(value));
    }
  }, [value]);

  function apply(raw: string) {
    const next = localIndianMobile(raw);
    setLocal(next);
    const canonical = next.length === 10 ? canonicalIndianMobile(next) : "";
    last.current = canonical;
    onChange(canonical);
  }

  const incomplete = local.length > 0 && canonicalIndianMobile(local) === "";
  const shownError = error ?? (incomplete ? "Enter a 10-digit Indian mobile number." : undefined);
  const hasMessage = Boolean(shownError || hint);

  return (
    <div className="hms-field">
      {label ? (
        <label className="hms-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          "hms-phonefield",
          disabled && "hms-phonefield--disabled",
          shownError && "hms-phonefield--error",
          className,
        )}
      >
        <span className="hms-phonefield__prefix">+91</span>
        <input
          id={inputId}
          name={name}
          className="hms-phonefield__input"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="10-digit mobile number"
          maxLength={10}
          value={local}
          disabled={disabled}
          required={required}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          onChange={(e) => apply(e.target.value)}
          onPaste={(e) => {
            // Take the pasted text ourselves so a pasted "+91…"/"91…" cannot double the code.
            e.preventDefault();
            apply(e.clipboardData.getData("text"));
          }}
        />
      </div>
      {shownError ? (
        <span id={messageId} className="hms-field__error">
          {shownError}
        </span>
      ) : hint ? (
        <span id={messageId} className="hms-field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
