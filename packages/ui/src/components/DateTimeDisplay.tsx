import {
  formatDate,
  formatDateTime,
  formatTimeParts,
  toApiDate,
  toApiDateTime,
  type DateInput,
} from '@hms/utils';
import { cn } from '../cn';

/**
 * The user-facing date/time components (ADR-046). Every screen renders dates and
 * times through these, so the platform's format lives in exactly one place and a
 * future change to it is one edit rather than a sweep of every module.
 *
 *   Date       DD/MM/YYYY              16/08/2026
 *   Time       hh:mm AM/PM             04:45 PM
 *   Together   DD/MM/YYYY, hh:mm AM/PM 16/08/2026, 04:45 PM
 *
 * Each renders a `<time datetime="…">` carrying the machine-readable ISO value, so
 * assistive technology and anything scraping the DOM get an unambiguous instant
 * while the human sees the platform format.
 */

export interface DateDisplayProps {
  value: DateInput;
  /** Shown when the value is missing or unparseable. Defaults to an em dash. */
  fallback?: string;
  className?: string;
}

export function DateDisplay({ value, fallback, className }: DateDisplayProps) {
  const iso = toApiDate(value);
  const text = formatDate(value, fallback);
  if (!iso) return <span className={className}>{text}</span>;
  return (
    <time dateTime={iso} className={cn('whitespace-nowrap', className)}>
      {text}
    </time>
  );
}

export interface TimeDisplayProps extends DateDisplayProps {
  /**
   * Render AM/PM as a small chip rather than plain text — for schedules, time
   * pickers and dense tables where the meridiem should not read as part of the
   * numerals.
   */
  badge?: boolean;
}

export function TimeDisplay({ value, fallback = '—', className, badge = false }: TimeDisplayProps) {
  const parts = formatTimeParts(value);
  const iso = toApiDateTime(value);
  if (!parts) return <span className={className}>{fallback}</span>;

  const body = badge ? (
    <>
      {parts.time}
      <span className="hms-meridiem">{parts.meridiem}</span>
    </>
  ) : (
    `${parts.time} ${parts.meridiem}`
  );

  return (
    <time dateTime={iso ?? undefined} className={cn('hms-time', className)}>
      {body}
    </time>
  );
}

export interface DateTimeDisplayProps extends TimeDisplayProps {}

export function DateTimeDisplay({
  value,
  fallback = '—',
  className,
  badge = false,
}: DateTimeDisplayProps) {
  const iso = toApiDateTime(value);
  const parts = formatTimeParts(value);
  if (!parts || !iso) return <span className={className}>{fallback}</span>;

  return (
    <time dateTime={iso} className={cn('hms-time', className)}>
      {badge ? (
        <>
          {`${formatDate(value)}, ${parts.time}`}
          <span className="hms-meridiem">{parts.meridiem}</span>
        </>
      ) : (
        formatDateTime(value, fallback)
      )}
    </time>
  );
}
