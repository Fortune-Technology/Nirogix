import type { ReactNode } from "react";

/**
 * The Standard DataTable's column contract (ADR-029).
 *
 * A superset of the original `{ key, header, cell }` shape, so every existing
 * screen keeps working and opts into sorting / filtering / hiding by adding a
 * flag — never by forking the table.
 */
export interface Column<Row> {
  /** Stable key; the React key, the sort/filter id, and the column-visibility id. */
  key: string;
  header: ReactNode;
  /** Cell renderer. Receives the row and its index. */
  cell: (row: Row, index: number) => ReactNode;
  /** Optional fixed/min width (any CSS length). */
  width?: string;
  /**
   * The comparable/searchable value behind this column. Required for sorting,
   * filtering, and global search — a column without it is display-only.
   */
  accessor?: (row: Row) => string | number | Date | null | undefined;
  /** Sort control in the header. Defaults to **on** whenever `accessor` is set; pass `false` to opt out. */
  sortable?: boolean;
  /** Offer a faceted (multi-select) filter built from this column's distinct values. */
  filterable?: boolean;
  /** Label for the filter control; defaults to the header when it is a string. */
  filterLabel?: string;
  /** Include in the toolbar's search. Defaults to true when `accessor` is present. */
  searchable?: boolean;
  /** Allow users to hide this column. Defaults to true; set false to pin it. */
  hideable?: boolean;
  /** Start hidden (users can restore it from the Columns menu). */
  defaultHidden?: boolean;
  align?: "left" | "center" | "right";
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

/** What a server-driven table reports back when the user changes the view. */
export interface DataTableQuery {
  page: number;
  pageSize: number;
  search: string;
  sort: SortState[];
}

/**
 * Server-side mode. Supply it for large datasets (patients, audit, MIS reports):
 * the table stops paginating/sorting/filtering in the browser and asks the caller
 * for each page instead (rules.md → Standard DataTable).
 */
export interface ServerMode {
  /** Total matching rows, for "Showing X–Y of Z" and the page count. */
  total: number;
  page: number;
  pageSize: number;
  sort?: SortState[];
  search?: string;
  onChange: (query: DataTableQuery) => void;
}

export interface DataTableProps<Row> {
  columns: Array<Column<Row>>;
  rows: Row[];
  /** Stable identity per row (defaults to the array index). */
  rowKey?: (row: Row, index: number) => string;

  loading?: boolean;
  /** User-facing copy only — never a stack trace or backend internal. */
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  emptyDescription?: ReactNode;
  /** Primary action offered on the empty state — "Add patient", … */
  emptyAction?: ReactNode;

  /** Toolbar search over every searchable column. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Module-specific filter controls, rendered next to the built-in ones. */
  filters?: ReactNode;
  /** Right-hand toolbar slot — usually the page's primary action. */
  toolbarActions?: ReactNode;
  /** Show the Columns (show/hide) control. Default true when any column is hideable. */
  columnVisibility?: boolean;

  /** `false` disables paging entirely. */
  pagination?: false | { pageSize?: number; pageSizeOptions?: number[] };
  /** Shift-click a second header to add a sort level. */
  multiSort?: boolean;
  selectable?: boolean;
  onSelectionChange?: (rows: Row[]) => void;
  stickyHeader?: boolean;

  server?: ServerMode;
  /**
   * Mirror page / pageSize / sort / search into the URL query string so a view is
   * linkable and survives a reload. Pass a string to namespace the params.
   */
  urlState?: boolean | string;

  /** Rows rendered as skeletons while `loading` and no rows are present yet. */
  skeletonRows?: number;
  className?: string;
}
