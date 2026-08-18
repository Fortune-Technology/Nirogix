// @hms/utils — shared, framework-agnostic utilities used across hms_backend and hms_frontend.
// Formatting, date/time, currency, id/UHID helpers, and small validation helpers live here so
// no module reimplements them.
// See resources/development-plan.md §6.

// Dates: DD/MM/YYYY, hh:mm AM/PM for every user-facing value; ISO-8601 for transport
// (ADR-030, time format revised by ADR-046).
export {
  formatDate,
  formatDateTime,
  formatTime,
  formatTimeParts,
  formatDateRange,
  formatWeekday,
  formatMonthLabel,
  formatDayLabel,
  parseDate,
  isValidDate,
  compareDates,
  isSameDay,
  toApiDate,
  toApiDateTime,
  toApiTime,
  todayApiDate,
  addDays,
} from "./date";
export type { DateInput } from "./date";

// Colour: only for places a brand colour must be used where the design tokens cannot
// reach — today, the dark modules of a printed QR code (ADR-056). Components still use
// the tokens and never a literal.
export { parseHexColor, toHexColor, relativeLuminance, contrastRatio, ensureContrast } from "./color";
export type { Rgb } from "./color";
