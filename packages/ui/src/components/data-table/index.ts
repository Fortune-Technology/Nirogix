// The Standard DataTable system (ADR-029). One table, configured per module —
// never a per-page table implementation. See resources/rules.md → Standard DataTable.

export { DataTable } from "./DataTable";
export { DataTableToolbar } from "./DataTableToolbar";
export { DataTablePagination } from "./DataTablePagination";
export { DataTableColumnHeader } from "./DataTableColumnHeader";
export { DataTableViewOptions } from "./DataTableViewOptions";
export { DataTableFacetedFilter } from "./DataTableFacetedFilter";
export type { Column, DataTableProps, DataTableQuery, ServerMode, SortState } from "./types";
