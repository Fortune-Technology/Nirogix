// The Standard DataTable system (ADR-029). One table, configured per module —
// never a per-page table implementation. See resources/rules.md → Standard DataTable.

export { DataTable } from "./DataTable";
export { DataTableToolbar } from "./DataTableToolbar";
export { DataTablePagination } from "./DataTablePagination";
export { DataTableColumnHeader } from "./DataTableColumnHeader";
export { DataTableViewOptions } from "./DataTableViewOptions";
export { DataTableFacetedFilter } from "./DataTableFacetedFilter";
export { DateRangeFilter } from "./DateRangeFilter";
export type { DateRangeValue, DateRangeFilterProps } from "./DateRangeFilter";
export { NumberRangeFilter } from "./NumberRangeFilter";
export type { NumberRangeValue, NumberRangeFilterProps } from "./NumberRangeFilter";
export type { Column, ColumnFilters, DataTableProps, DataTableQuery, ServerMode, SortState } from "./types";
