import { describe, expect, it } from 'vitest';
import { parseSort, resolveSort } from '../sort';
import { appointments, invoices } from '../schema';

/**
 * The rule under test is a security boundary as much as a UX one (ADR-136): a client names a
 * **sort key the module published**, never a column, and anything else is dropped so the
 * module's own default ordering stands.
 */
describe('parseSort', () => {
  it('reads the DataTable’s own URL format', () => {
    expect(parseSort('when:desc,patient:asc')).toEqual([
      { key: 'when', dir: 'desc' },
      { key: 'patient', dir: 'asc' },
    ]);
  });

  it('treats a missing or unrecognised direction as ascending', () => {
    expect(parseSort('when')).toEqual([{ key: 'when', dir: 'asc' }]);
    expect(parseSort('when:sideways')).toEqual([{ key: 'when', dir: 'asc' }]);
    expect(parseSort('when:DESC')).toEqual([{ key: 'when', dir: 'desc' }]);
  });

  it('is empty for nothing, rather than throwing on a query string', () => {
    expect(parseSort(undefined)).toEqual([]);
    expect(parseSort('')).toEqual([]);
    expect(parseSort(',,, ,')).toEqual([]);
  });

  it('caps the number of levels, so a long query string cannot become a long ORDER BY', () => {
    expect(parseSort('a:asc,b:asc,c:asc,d:asc,e:asc')).toHaveLength(3);
  });
});

describe('resolveSort', () => {
  const allowed = { when: appointments.scheduledAt, status: appointments.status };

  it('returns null when nothing was asked for, so the caller keeps its own default', () => {
    expect(resolveSort([], allowed)).toBeNull();
    expect(resolveSort(undefined, allowed)).toBeNull();
  });

  it('resolves a published key', () => {
    const out = resolveSort([{ key: 'when', dir: 'desc' }], allowed);
    expect(out).toHaveLength(1);
  });

  it('drops a key the module never published', () => {
    expect(resolveSort([{ key: 'tenantId', dir: 'asc' }], allowed)).toBeNull();
    expect(resolveSort([{ key: 'password', dir: 'asc' }], allowed)).toBeNull();
  });

  it('keeps the published keys and drops the rest, rather than failing the whole request', () => {
    const out = resolveSort(
      [
        { key: 'nonsense', dir: 'asc' },
        { key: 'status', dir: 'desc' },
      ],
      allowed,
    );
    expect(out).toHaveLength(1);
  });

  /**
   * The decisive one. A client string is only ever a **key** into a map the developer wrote;
   * it never reaches SQL. If this ever regressed into interpolation, the value below is what
   * would arrive in an ORDER BY.
   */
  it('cannot be used to inject SQL, because the client string is only a map key', () => {
    const nasty = parseSort('scheduled_at; drop table appointments--:asc');
    expect(resolveSort(nasty, allowed)).toBeNull();
    expect(resolveSort(nasty, { number: invoices.invoiceNumber })).toBeNull();
  });
});
