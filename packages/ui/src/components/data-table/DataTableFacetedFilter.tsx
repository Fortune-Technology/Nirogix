'use client';

import { ListFilter } from 'lucide-react';
import type { Column } from '@tanstack/react-table';
import { Menu, MenuCheckboxItem, MenuSeparator } from '../Menu';

/**
 * A multi-select filter built from a column's own distinct values (rules.md →
 * Standard DataTable: "filters are reusable components"). A module marks a column
 * `filterable` — status, department, doctor, branch, role, priority, payment
 * status — and gets the same control everywhere, no per-page implementation.
 *
 * `options` overrides the derived values with a fixed set — required for a closed
 * enum on a server-mode table, where the data only ever holds one page (ADR-063).
 */
export function DataTableFacetedFilter<Row>({
  column,
  label,
  options: fixed,
}: {
  column: Column<Row, unknown>;
  label: string;
  options?: Array<{ value: string; label?: string }>;
}) {
  const selected = new Set((column.getFilterValue() as string[] | undefined) ?? []);
  const counts = column.getFacetedUniqueValues();
  // Fixed options keep their given order; derived options are sorted. A fixed
  // option shows a count only when that value happens to be on the current page.
  const options: Array<{ value: string; label: string; count?: number }> = fixed
    ? fixed.map((o) => ({ value: o.value, label: o.label ?? o.value, count: counts.get(o.value) }))
    : [...counts.entries()]
        .filter(([value]) => value !== undefined && value !== null && value !== '')
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
        .map(([value, count]) => ({ value: String(value), label: String(value), count }));

  if (options.length === 0) return null;

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    column.setFilterValue(next.size ? [...next] : undefined);
  }

  return (
    <Menu
      align="start"
      label={`Filter by ${label}`}
      trigger={
        <>
          <ListFilter size={15} strokeWidth={1.75} aria-hidden /> {label}
          {selected.size > 0 ? <span className="hms-filter__count">{selected.size}</span> : null}
        </>
      }
    >
      {options.map((o) => (
        <MenuCheckboxItem
          key={o.value}
          checked={selected.has(o.value)}
          onToggle={() => toggle(o.value)}
        >
          <span className="hms-filter__label">{o.label}</span>
          {o.count !== undefined ? <span className="hms-filter__facet">{o.count}</span> : null}
        </MenuCheckboxItem>
      ))}
      {selected.size > 0 ? (
        <>
          <MenuSeparator />
          <button
            type="button"
            data-menu-item
            className="hms-menu__item"
            onClick={() => column.setFilterValue(undefined)}
          >
            Clear filter
          </button>
        </>
      ) : null}
    </Menu>
  );
}
