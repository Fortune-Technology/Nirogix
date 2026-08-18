// Date & time entry (ADR-048) — shadcn/ui's Base UI date picker promoted into the
// canonical kit and restyled onto the design tokens.
//
// Native `<input type="date">` and `type="time"` render in the BROWSER's locale, so
// the same field reads differently on different machines. These own their format,
// which is what makes the platform standard (ADR-046) hold at the point of entry as
// well as at display: `DD/MM/YYYY` typed and picked, `hh:mm` with an AM/PM toggle.
// The value crossing the boundary is always ISO.

export { Calendar } from './Calendar';
export type { CalendarProps } from './Calendar';
export { DateField } from './DateField';
export type { DateFieldProps } from './DateField';
export { TimeField } from './TimeField';
export type { TimeFieldProps } from './TimeField';
export { DateTimeField } from './DateTimeField';
export type { DateTimeFieldProps } from './DateTimeField';
