'use client';

import { SlidersHorizontal } from 'lucide-react';
import type { Table } from '@tanstack/react-table';
import { Menu, MenuCheckboxItem, MenuSeparator } from '../Menu';

/**
 * The shared column show/hide control (rules.md → Standard DataTable). One
 * mechanism for every table — modules configure which columns are hideable and
 * which start hidden, and "Show all" restores the default set.
 */
export function DataTableViewOptions<Row>({ table }: { table: Table<Row> }) {
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide() && c.id !== '__select');
  if (columns.length === 0) return null;

  return (
    <Menu
      label="Toggle columns"
      trigger={
        <>
          <SlidersHorizontal size={15} strokeWidth={1.75} aria-hidden /> Columns
        </>
      }
    >
      {columns.map((column) => (
        <MenuCheckboxItem
          key={column.id}
          checked={column.getIsVisible()}
          onToggle={() => column.toggleVisibility(!column.getIsVisible())}
        >
          {typeof column.columnDef.meta === 'object' &&
          column.columnDef.meta &&
          'label' in column.columnDef.meta
            ? String((column.columnDef.meta as { label?: unknown }).label ?? column.id)
            : column.id}
        </MenuCheckboxItem>
      ))}
      <MenuSeparator />
      <button
        type="button"
        data-menu-item
        className="hms-menu__item"
        onClick={() => table.toggleAllColumnsVisible(true)}
      >
        Show all columns
      </button>
    </Menu>
  );
}
