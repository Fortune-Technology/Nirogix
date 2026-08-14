"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useId, useState } from "react";
import { cn } from "../cn";

export interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  error?: string;
}

// Eye (visible) — click to hide.
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Eye with a slash (hidden) — click to show.
function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.16 3.19" />
      <path d="M6.6 6.6A13.3 13.3 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 5.4-1.6" />
      <path d="m2 2 20 20" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

/**
 * The standard password input for the whole platform: a labelled input with a
 * built-in show/hide toggle. Use this for EVERY password field (login, password
 * reset, change-password, admin user forms) — never a bare `<input type="password">`
 * — so the reveal affordance and styling stay consistent everywhere.
 */
export function PasswordField({ label, error, className, id, ...rest }: PasswordFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="hms-field">
      {label && (
        <label className="hms-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="hms-password">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          className={cn("hms-input", className)}
          aria-invalid={!!error}
          {...rest}
        />
        <button
          type="button"
          className="hms-password__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          tabIndex={-1}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error && <span className="hms-field__error">{error}</span>}
    </div>
  );
}
