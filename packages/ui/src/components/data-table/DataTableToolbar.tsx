"use client";

import { Search, X } from "lucide-react";
import type { ReactNode } from "react";

export interface DataTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchable?: boolean;
  placeholder?: string;
  /** Built-in faceted filters, then the module's own filter controls. */
  facetedFilters?: ReactNode;
  filters?: ReactNode;
  viewOptions?: ReactNode;
  /** The page's primary action(s). */
  actions?: ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
}

/**
 * The table's control area, in one fixed order — Search → Filters → Columns →
 * Actions (rules.md → Standard DataTable). Every module gets the same layout, so
 * the controls are always where the user last found them.
 */
export function DataTableToolbar({
  search,
  onSearchChange,
  searchable = true,
  placeholder = "Search…",
  facetedFilters,
  filters,
  viewOptions,
  actions,
  activeFilterCount = 0,
  onClearFilters,
}: DataTableToolbarProps) {
  const hasLeft = searchable || facetedFilters || filters || activeFilterCount > 0;
  if (!hasLeft && !viewOptions && !actions) return null;

  return (
    <div className="hms-toolbar">
      <div className="hms-toolbar__left">
        {searchable ? (
          <div className="hms-search">
            <Search size={15} strokeWidth={1.75} className="hms-search__icon" aria-hidden />
            <input
              type="search"
              className="hms-input hms-search__input"
              value={search}
              placeholder={placeholder}
              aria-label={placeholder}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        ) : null}
        {facetedFilters}
        {filters}
        {activeFilterCount > 0 && onClearFilters ? (
          <button type="button" className="hms-btn hms-btn--ghost hms-btn--sm" onClick={onClearFilters}>
            <X size={15} strokeWidth={2} aria-hidden /> Clear
          </button>
        ) : null}
      </div>

      <div className="hms-toolbar__right">
        {viewOptions}
        {actions}
      </div>
    </div>
  );
}
