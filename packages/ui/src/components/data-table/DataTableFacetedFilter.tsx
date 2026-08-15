"use client";

import { ListFilter } from "lucide-react";
import type { Column } from "@tanstack/react-table";
import { Menu, MenuCheckboxItem, MenuSeparator } from "../Menu";

/**
 * A multi-select filter built from a column's own distinct values (rules.md →
 * Standard DataTable: "filters are reusable components"). A module marks a column
 * `filterable` — status, department, doctor, branch, role, priority, payment
 * status — and gets the same control everywhere, no per-page implementation.
 */
export function DataTableFacetedFilter<Row>({ column, label }: { column: Column<Row, unknown>; label: string }) {
  const selected = new Set((column.getFilterValue() as string[] | undefined) ?? []);
  const options = [...column.getFacetedUniqueValues().entries()]
    .filter(([value]) => value !== undefined && value !== null && value !== "")
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

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
      {options.map(([value, count]) => (
        <MenuCheckboxItem key={String(value)} checked={selected.has(String(value))} onToggle={() => toggle(String(value))}>
          <span className="hms-filter__label">{String(value)}</span>
          <span className="hms-filter__facet">{count}</span>
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
