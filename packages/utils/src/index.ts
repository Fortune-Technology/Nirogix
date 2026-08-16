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
