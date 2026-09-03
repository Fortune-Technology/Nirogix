import type { ReactNode } from 'react';
import { cn } from '../cn';

/**
 * The one way a missing value is written (ADR-123).
 *
 * A bare dash tells a reader two different things at once — "this hospital has not filled it
 * in" and "this does not apply here" — and neither of them is the one they need. Worse, it
 * hides the third case: the value exists and the screen failed to fetch it. So a dash is not
 * a placeholder any more; a *reason* is, and the reason is chosen at the call site because
 * only the call site knows which of these is true.
 *
 * Choosing one:
 *
 *   unassigned    a link to another record that nobody has made yet — no department on a
 *                 service, no doctor on a walk-in visit. Someone can still assign it.
 *   unspecified   an optional field on a form that was left blank — gender, a note, an email.
 *   notRecorded   a clinical observation nobody took — a temperature, a blood group.
 *   notConfigured a setting the hospital has not set up — a fee rule, a letterhead.
 *   notApplicable the field cannot have a value for this row — a reference range on a
 *                 qualitative test, a refund reference on a cash payment.
 *   none          an empty list, where zero is a real and complete answer — no specialties,
 *                 no roles, no allergies.
 *   notAvailable  the value exists somewhere but this screen does not have it. Rare, and
 *                 usually a bug worth chasing rather than labelling.
 *
 * Use `<EmptyValue />` wherever a node is rendered, and `emptyLabel()` where a plain string is
 * needed — a DataTable `accessor` (so the row can be searched, sorted and filtered by its
 * emptiness), a print document, a CSV export, an `aria-label`.
 */
export type EmptyReason =
  | 'unassigned'
  | 'unspecified'
  | 'notRecorded'
  | 'notConfigured'
  | 'notApplicable'
  | 'none'
  | 'notAvailable';

const LABELS: Record<EmptyReason, string> = {
  unassigned: 'Not assigned',
  unspecified: 'Not specified',
  notRecorded: 'Not recorded',
  notConfigured: 'Not configured',
  notApplicable: 'Not applicable',
  none: 'None',
  notAvailable: 'Not available',
};

/** The plain-text label, for accessors, exports, print documents and accessible names. */
export function emptyLabel(reason: EmptyReason = 'unspecified'): string {
  return LABELS[reason];
}

/**
 * A value, or the reason it is missing — the shape almost every call site actually wants.
 * Empty strings count as missing: a blank string in a database is a field nobody filled in.
 */
export function valueLabel(
  value: string | number | null | undefined,
  reason: EmptyReason = 'unspecified',
): string {
  if (value === null || value === undefined) return LABELS[reason];
  const text = String(value).trim();
  return text === '' ? LABELS[reason] : text;
}

export interface EmptyValueProps {
  /** Why the value is missing. Defaults to the mildest reading: nobody filled it in. */
  reason?: EmptyReason;
  /** Overrides the standard wording where a field genuinely reads better in its own words. */
  label?: string;
  className?: string;
}

/** The rendered form: subdued, never coloured, never an icon. It is an absence, not a status. */
export function EmptyValue({ reason = 'unspecified', label, className }: EmptyValueProps) {
  return <span className={cn('text-fg-subtle', className)}>{label ?? LABELS[reason]}</span>;
}

export interface ValueOrEmptyProps extends EmptyValueProps {
  /** Rendered as-is when present. `null`, `undefined` and a blank string are all "missing". */
  value: ReactNode;
}

/**
 * The value, or the reason it is missing. Saves the ternary at the ~80 call sites that would
 * otherwise each write their own — which is how the dashes got there in the first place.
 */
export function ValueOrEmpty({ value, ...rest }: ValueOrEmptyProps) {
  const missing =
    value === null ||
    value === undefined ||
    value === false ||
    (typeof value === 'string' && value.trim() === '');
  return missing ? <EmptyValue {...rest} /> : <>{value}</>;
}
