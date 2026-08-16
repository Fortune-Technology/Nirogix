import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '../cn';

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  /** Guidance under the field — expected format, or what the value is used for. */
  hint?: ReactNode;
}

/**
 * The multi-line counterpart to `Field`, with the same label / error / hint contract and
 * the same `aria-describedby` wiring — so a form can mix single and multi-line inputs
 * without a second set of conventions. Uses `hms-input` so both share one visual
 * definition; only the vertical-resize affordance is textarea-specific.
 */
export function Textarea({ label, error, hint, className, id, ...rest }: TextareaFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-msg`;
  const hasMessage = Boolean(error || hint);
  return (
    <div className="hms-field">
      {label && (
        <label className="hms-label" htmlFor={fieldId}>
          {label}
        </label>
      )}
      <textarea
        id={fieldId}
        className={cn('hms-input resize-y', className)}
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
