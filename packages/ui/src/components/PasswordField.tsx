'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../cn';

export interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  error?: string;
  /** Guidance under the input — matches `Field`, so the two behave the same way. */
  hint?: ReactNode;
}

/**
 * The standard password input for the whole platform: a labelled input with a
 * built-in show/hide toggle. Use this for EVERY password field (login, password
 * reset, change-password, admin user forms) — never a bare `<input type="password">`
 * — so the reveal affordance and styling stay consistent everywhere.
 */
export function PasswordField({ label, error, hint, className, id, ...rest }: PasswordFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-msg`;
  const hasMessage = Boolean(error || hint);
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
          type={visible ? 'text' : 'password'}
          className={cn('hms-input', className)}
          aria-invalid={!!error}
          aria-describedby={hasMessage ? messageId : undefined}
          {...rest}
        />
        <button
          type="button"
          className="hms-password__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={-1}
        >
          {visible ? (
            <EyeOff size={18} strokeWidth={1.75} aria-hidden />
          ) : (
            <Eye size={18} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>
      {/* `error` replaces `hint` when both are present, so the field never shows two
          competing messages — same rule as `Field`. */}
      {error ? (
        <span id={messageId} className="hms-field__error">
          {error}
        </span>
      ) : hint ? (
        <span id={messageId} className="hms-field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
