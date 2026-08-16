import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '../cn';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  /** Guidance under the input — expected format, units, or what the value is used for. */
  hint?: ReactNode;
}

/**
 * A labelled text input built on the design tokens. `error` renders the invalid state;
 * `hint` renders guidance and is replaced by the error when there is one, so the field
 * never shows two competing messages. Both are wired to the input through
 * `aria-describedby` so a screen reader announces them with the field.
 */
export function Field({ label, error, hint, className, id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-msg`;
  const hasMessage = Boolean(error || hint);
  return (
    <div className="hms-field">
      {label && (
        <label className="hms-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn('hms-input', className)}
        aria-invalid={!!error}
        aria-describedby={hasMessage ? messageId : undefined}
        {...rest}
      />
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
