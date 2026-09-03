import { asc, desc, type Column, type SQL } from 'drizzle-orm';

/**
 * Turning a client's requested sort into ORDER BY, safely (ADR-136).
 *
 * The Standard DataTable offers sorting on any column that knows its value, and in **server
 * mode** it hands the page a `sort` array which the page forwards to the API. Several endpoints
 * accepted the parameter's existence and then dropped it: the header showed an arrow, the URL
 * changed, and the rows did not move. A control that does nothing is worse than one that is not
 * offered, because the user concludes the data is already in that order.
 *
 * The one rule this file exists to enforce: **a client never names a column.** It names a *sort
 * key* the module has published, and the module maps that key to a column or expression it
 * chose. An unknown key is dropped rather than rejected — a stale bookmark or a renamed column
 * should give somebody the default list, not a 422 — and dropping every key falls back to the
 * module's own default ordering, which is the workflow-aware one.
 */
export interface SortRequest {
  key: string;
  dir: 'asc' | 'desc';
}

/** What a module publishes: the sort keys it accepts, and what each one orders by. */
export type SortableColumns = Record<string, Column | SQL>;

/**
 * Parses the wire format the DataTable's URL state uses — `key:dir,key:dir`.
 *
 * Tolerant on purpose: a missing or malformed direction is `asc`, and anything unparseable is
 * skipped. This reads a query string, which is the least trustworthy input in the system.
 */
export function parseSort(raw: string | undefined | null): SortRequest[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3) // Three levels is more than any screen offers; the rest is noise or an attack.
    .map((part) => {
      const [key, dir] = part.split(':');
      return {
        key: (key ?? '').trim(),
        dir: dir?.trim().toLowerCase() === 'desc' ? 'desc' : 'asc',
      } as SortRequest;
    })
    .filter((s) => s.key !== '');
}

/**
 * The ORDER BY the user asked for, or `null` when they asked for nothing this module allows —
 * in which case the caller uses its own default, which is the point of returning `null` rather
 * than an empty array.
 */
export function resolveSort(
  requested: SortRequest[] | undefined,
  allowed: SortableColumns,
): SQL[] | null {
  if (!requested?.length) return null;
  const out: SQL[] = [];
  for (const { key, dir } of requested) {
    const column = allowed[key];
    if (!column) continue; // Unknown key: the module never published it. Ignore, do not fail.
    out.push(dir === 'desc' ? desc(column) : asc(column));
  }
  return out.length > 0 ? out : null;
}
