// Formatting for email content. Emails must follow the platform's display rules (ADR-030/046):
// dates as DD/MM/YYYY, times as hh:mm AM/PM, money as ₹ with two decimals and Indian grouping.
// Self-contained (no browser-only APIs) so it runs server-side; formatted strings are handed to
// templates, which never touch a date/number library themselves.

/** ISO (or Date) → "DD/MM/YYYY, hh:mm AM/PM" in the server's local (hospital) timezone. */
export function formatEmailDateTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = h < 12 ? 'AM' : 'PM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${dd}/${mm}/${yyyy}, ${String(h).padStart(2, '0')}:${min} ${ampm}`;
}

/** Integer paise → "₹1,250.00" (Indian digit grouping). */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
