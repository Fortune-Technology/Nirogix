import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '../cn';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
}

/** A labelled text input built on the design tokens. `error` renders the invalid state. */
export function Field({ label, error, className, id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="hms-field">
      {label && (
        <label className="hms-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input id={inputId} className={cn('hms-input', className)} aria-invalid={!!error} {...rest} />
      {error && <span className="hms-field__error">{error}</span>}
    </div>
  );
}
