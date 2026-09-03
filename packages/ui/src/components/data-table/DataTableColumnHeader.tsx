'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../cn';

export interface DataTableColumnHeaderProps {
  children: ReactNode;
  sortable?: boolean;
  /** `false` when the column is not part of the current sort. */
  direction: 'asc' | 'desc' | false;
  /** Position in a multi-column sort (1-based); hidden when there is only one level. */
  sortIndex?: number;
  onToggle?: (additive: boolean) => void;
  /**
   * Plain-text column name for the accessible label. Required because `children`
   * is usually a React node, and announcing "Column, not sorted" to a screen
   * reader tells the user nothing about which column they are on.
   */
  name?: string;
}

/**
 * A header cell with an explicit three-state sort indicator — unsorted
 * (`ChevronsUpDown`), ascending (`ArrowUp`), descending (`ArrowDown`) — per
 * rules.md → Standard DataTable. Shift+click (or Shift+Enter) adds a second sort
 * level when the table allows multi-sort.
 */
export function DataTableColumnHeader({
  children,
  sortable,
  direction,
  sortIndex,
  onToggle,
  name,
}: DataTableColumnHeaderProps) {
  // Every DataTable column is left-aligned — heading and cells alike — so the header
  // never carries an alignment of its own.
  if (!sortable) return <span>{children}</span>;

  const label =
    direction === 'asc'
      ? 'sorted ascending'
      : direction === 'desc'
        ? 'sorted descending'
        : 'not sorted';

  return (
    <button
      type="button"
      className="hms-th__sort"
      aria-label={`${name ?? (typeof children === 'string' ? children : 'Column')}, ${label}. Activate to sort.`}
      onClick={(e) => onToggle?.(e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle?.(e.shiftKey);
        }
      }}
    >
      <span>{children}</span>
      <span className={cn('hms-th__icon', direction && 'hms-th__icon--active')} aria-hidden>
        {direction === 'asc' ? (
          <ArrowUp size={14} strokeWidth={2} />
        ) : direction === 'desc' ? (
          <ArrowDown size={14} strokeWidth={2} />
        ) : (
          <ChevronsUpDown size={14} strokeWidth={1.75} />
        )}
      </span>
      {direction && sortIndex && sortIndex > 1 ? (
        <span className="hms-th__order">{sortIndex}</span>
      ) : null}
    </button>
  );
}
