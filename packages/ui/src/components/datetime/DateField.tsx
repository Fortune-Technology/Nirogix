'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CalendarDays } from 'lucide-react';
import { formatDate, parseDate, toApiDate } from '@hms/utils';
import { cn } from '../../cn';
import { Calendar } from './Calendar';

export interface DateFieldProps {
  label?: string;
  /** ISO calendar date (`2026-08-16`) — the transport shape, in and out (ADR-046). */
  value: string | null;
  onChange: (value: string | null) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Bounds passed to the calendar and enforced on typed input. */
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  name?: string;
}

/**
 * The one date input (ADR-048).
 *
 * **Typed and picked, both in `DD/MM/YYYY`.** A native `<input type="date">` renders
 * in the *browser's* locale, so the same field reads `16/08/2026` on one machine and
 * `08/16/2026` on another — unacceptable on a clinical record, and the reason
 * ADR-046 exists. This field owns its own text and its own calendar, so the format
 * is the platform's on every machine.
 *
 * The value crossing the boundary is always ISO (`YYYY-MM-DD`): the display format
 * never reaches an API.
 */
export function DateField({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  disabled,
  min,
  max,
  placeholder = 'DD/MM/YYYY',
  className,
  name,
}: DateFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => (value ? formatDate(value, '') : ''));
  const lastValue = useRef(value);

  // Keep the text in step when the value changes from outside (a form reset, a
  // loaded record) — but never while the user is mid-edit.
  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value;
      setText(value ? formatDate(value, '') : '');
    }
  }, [value]);

  const selected = parseDate(value) ?? undefined;

  function commitText(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      lastValue.current = null;
      onChange(null);
      return;
    }
    const parsed = parseDate(trimmed);
    const iso = parsed ? toApiDate(parsed) : null;
    if (iso && (!min || iso >= min) && (!max || iso <= max)) {
      lastValue.current = iso;
      onChange(iso);
      setText(formatDate(iso, ''));
    } else {
      // Unparseable or out of range: restore the last good value rather than
      // silently keeping a half-typed date the form would submit.
      setText(value ? formatDate(value, '') : '');
    }
  }

  return (
    <label className={cn('hms-field', className)} htmlFor={id}>
      {label ? (
        <span className="hms-label">
          {label}
          {required ? <span aria-hidden> *</span> : null}
        </span>
      ) : null}

      <div
        className={cn(
          'hms-datefield',
          disabled && 'hms-datefield--disabled',
          error && 'hms-datefield--error',
        )}
      >
        <input
          id={id}
          name={name}
          className="hms-datefield__input"
          value={text}
          placeholder={placeholder}
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${id}-hint` : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commitText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText(text);
            }
          }}
        />

        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            type="button"
            className="hms-datefield__trigger"
            disabled={disabled}
            aria-label={label ? `Choose ${label.toLowerCase()}` : 'Choose a date'}
          >
            <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
          </Popover.Trigger>
          <Popover.Portal>
            {/* The z-index belongs on the POSITIONER: it is the positioned element,
                and z-index does nothing on the static popup inside it. */}
            <Popover.Positioner className="hms-popover-positioner" sideOffset={6} align="end">
              <Popover.Popup className="hms-popover" data-lenis-prevent>
                <Calendar
                  mode="single"
                  selected={selected}
                  defaultMonth={selected}
                  startMonth={min ? (parseDate(min) ?? undefined) : undefined}
                  endMonth={max ? (parseDate(max) ?? undefined) : undefined}
                  disabled={[
                    ...(min ? [{ before: parseDate(min)! }] : []),
                    ...(max ? [{ after: parseDate(max)! }] : []),
                  ]}
                  onSelect={(d) => {
                    const iso = d ? toApiDate(d) : null;
                    lastValue.current = iso;
                    onChange(iso);
                    setText(iso ? formatDate(iso, '') : '');
                    setOpen(false);
                  }}
                  autoFocus
                />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>

      {error ? (
        <span id={`${id}-hint`} className="hms-field__error">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="hms-field__hint">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
