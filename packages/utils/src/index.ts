// @hms/utils — shared, framework-agnostic utilities used across hms_backend and hms_frontend.
// Formatting, date/time, currency, id/UHID helpers, and small validation helpers live here so
// no module reimplements them.
// See resources/development-plan.md §6.

// Dates: DD/MM/YYYY for every user-facing value, ISO-8601 for transport (ADR-030).
export {
  formatDate,
  formatDateTime,
  formatTime,
  formatDateRange,
  parseDate,
  isValidDate,
  compareDates,
  isSameDay,
  toApiDate,
  toApiDateTime,
  todayApiDate,
  addDays,
} from "./date";
export type { DateInput } from "./date";
