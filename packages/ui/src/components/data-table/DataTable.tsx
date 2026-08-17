"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table";
import { cn } from "../../cn";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { DataTableColumnHeader } from "./DataTableColumnHeader";
import { DataTableFacetedFilter } from "./DataTableFacetedFilter";
import { DataTablePagination } from "./DataTablePagination";
import { DataTableToolbar } from "./DataTableToolbar";
import { DataTableViewOptions } from "./DataTableViewOptions";
import type { Column, ColumnFilters, DataTableProps, SortState } from "./types";

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

/**
 * **The Standard DataTable** (ADR-029, rules.md → Standard DataTable). One table
 * for the whole platform: sorting (multi-level), search, faceted filters, column
 * visibility, row selection, configurable pagination, sticky headers, contained
 * horizontal scroll, and shared loading / empty / error states — all styled from
 * `--hms-*` tokens, so Light/Dark and a tenant's accent apply for free.
 *
 * Modules supply a *configuration*, never a table: columns (with `sortable` /
 * `filterable` / `hideable` flags), rows, and optional toolbar actions. Large
 * datasets pass `server` and the table delegates paging/sorting/search to the API
 * instead of pulling everything into the browser.
 *
 * Built on TanStack Table (headless) following the shadcn/ui Data Table pattern.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  emptyMessage = "No records found.",
  emptyDescription,
  emptyAction,
  searchable,
  searchPlaceholder = "Search…",
  filters,
  toolbarActions,
  columnVisibility: showColumnVisibility,
  pagination = {},
  multiSort = true,
  selectable = false,
  onSelectionChange,
  stickyHeader = true,
  server,
  urlState,
  skeletonRows = 5,
  className,
}: DataTableProps<Row>) {
  const paginationOn = pagination !== false;
  const pageSizeOptions = (paginationOn && pagination?.pageSizeOptions) || DEFAULT_PAGE_SIZES;
  const initialPageSize = (paginationOn && pagination?.pageSize) || pageSizeOptions[1] || 20;

  const urlPrefix = typeof urlState === "string" ? `${urlState}_` : "";
  const urlEnabled = Boolean(urlState);

  // ---- state (URL-seeded when the caller asked for linkable views) ----------
  const initial = useMemo(() => readUrlState(urlEnabled, urlPrefix), [urlEnabled, urlPrefix]);
  const [sorting, setSorting] = useState<SortingState>(
    server?.sort?.map((s) => ({ id: s.key, desc: s.dir === "desc" })) ?? initial.sorting,
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
    server?.filters ? recordToColumnFilters(server.filters) : [],
  );
  const [visibility, setVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(columns.filter((c) => c.defaultHidden).map((c) => [c.key, false])),
  );
  const [selection, setSelection] = useState({});
  const [search, setSearch] = useState(server?.search ?? initial.search);
  const [page, setPage] = useState(server?.page ?? initial.page);
  const [pageSize, setPageSize] = useState(server?.pageSize ?? initial.pageSize ?? initialPageSize);

  // ---- columns → TanStack defs --------------------------------------------
  const columnDefs = useMemo<Array<ColumnDef<Row>>>(() => {
    const defs: Array<ColumnDef<Row>> = columns.map((col: Column<Row>) => ({
      id: col.key,
      accessorFn: col.accessor ? (row) => normalize(col.accessor!(row)) : undefined,
      // A column that knows its value is sortable and searchable by default —
      // opting out is explicit. This is why every configured table gets working
      // sort + search without repeating flags on every column.
      enableSorting: col.sortable ?? Boolean(col.accessor),
      enableHiding: col.hideable !== false,
      enableColumnFilter: Boolean(col.filterable),
      enableGlobalFilter: col.searchable ?? Boolean(col.accessor),
      filterFn: col.filterable ? "arrIncludesSome" : "includesString",
      meta: { label: typeof col.header === "string" ? col.header : col.key, width: col.width },
      header: () => col.header,
      cell: (ctx) => col.cell(ctx.row.original, ctx.row.index),
    }));

    if (selectable) {
      defs.unshift({
        id: "__select",
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            className="hms-checkbox"
            aria-label="Select all rows on this page"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = !table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected();
            }}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="hms-checkbox"
            aria-label="Select row"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
          />
        ),
      });
    }
    return defs;
  }, [columns, selectable]);

  // ---- server mode: report view changes; never fetch from inside the table --
  const emit = useCallback(
    (
      next: Partial<{
        page: number;
        pageSize: number;
        search: string;
        sorting: SortingState;
        columnFilters: ColumnFiltersState;
      }>,
    ) => {
      if (!server) return;
      const sort: SortState[] = (next.sorting ?? sorting).map((s) => ({
        key: s.id,
        dir: s.desc ? "desc" : "asc",
      }));
      server.onChange({
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        search: next.search ?? search,
        sort,
        // The fix at the heart of ADR-063: a faceted filter now reaches the API,
        // so on a server-paged table it narrows the whole dataset, not just the
        // rows already in the browser.
        filters: columnFiltersToRecord(next.columnFilters ?? columnFilters),
      });
    },
    [server, sorting, page, pageSize, search, columnFilters],
  );

  /**
   * A faceted filter changed. Client mode just updates local state (TanStack
   * filters the rows); server mode also resets to page 1 and asks the API for the
   * newly-narrowed set. Resolved outside `setColumnFilters` so the emit fires once,
   * not once per StrictMode double-invocation.
   */
  const changeColumnFilters = useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      const nextFilters = typeof updater === "function" ? updater(columnFilters) : updater;
      setColumnFilters(nextFilters);
      if (server) {
        setPage(1);
        emit({ columnFilters: nextFilters, page: 1 });
      }
    },
    [columnFilters, server, emit],
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: {
      sorting,
      columnFilters,
      columnVisibility: visibility,
      rowSelection: selection,
      globalFilter: server ? "" : search,
      ...(paginationOn && !server ? { pagination: { pageIndex: page - 1, pageSize } } : {}),
    },
    getRowId: rowKey ? (row, index) => rowKey(row, index) : undefined,
    enableRowSelection: selectable,
    enableMultiSort: multiSort,
    manualPagination: Boolean(server) || !paginationOn,
    manualSorting: Boolean(server),
    manualFiltering: Boolean(server),
    pageCount: server ? Math.max(1, Math.ceil(server.total / server.pageSize)) : undefined,
    onSortingChange: setSorting,
    onColumnFiltersChange: changeColumnFilters,
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(paginationOn && !server ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  // Debounce search so typing does not fire a request per keystroke.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
      if (!server) return;
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => emit({ search: value, page: 1 }), 300);
    },
    [server, emit],
  );

  useEffect(() => () => (searchTimer.current ? clearTimeout(searchTimer.current) : undefined), []);

  useEffect(() => {
    if (onSelectionChange) onSelectionChange(table.getSelectedRowModel().rows.map((r) => r.original));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // Keep the URL in step with the view when the caller opted in.
  useEffect(() => {
    if (!urlEnabled || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setParam(params, `${urlPrefix}page`, page > 1 ? String(page) : null);
    setParam(params, `${urlPrefix}size`, pageSize !== initialPageSize ? String(pageSize) : null);
    setParam(params, `${urlPrefix}q`, search || null);
    setParam(params, `${urlPrefix}sort`, sorting.length ? sorting.map((s) => `${s.id}:${s.desc ? "desc" : "asc"}`).join(",") : null);
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [urlEnabled, urlPrefix, page, pageSize, search, sorting, initialPageSize]);

  // ---- derived view --------------------------------------------------------
  const facetColumns = columns.filter((c) => c.filterable);
  const activeFilterCount = columnFilters.length;
  const total = server ? server.total : table.getFilteredRowModel().rows.length;
  const pageCount = server ? Math.max(1, Math.ceil(server.total / server.pageSize)) : table.getPageCount();
  const currentPage = server ? server.page : page;
  const bodyRows = table.getRowModel().rows;
  const headerGroups = table.getHeaderGroups();
  const colSpan = table.getVisibleLeafColumns().length || 1;
  const showSkeleton = loading && rows.length === 0;

  function changePage(next: number) {
    const clamped = Math.min(Math.max(1, next), Math.max(1, pageCount));
    setPage(clamped);
    if (server) emit({ page: clamped });
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
    if (server) emit({ pageSize: size, page: 1 });
  }

  /**
   * Cycles a column: unsorted → ascending → descending → unsorted. Shift (with
   * `multiSort`) adds a level instead of replacing. The next state is computed
   * here rather than read back from the table, so server mode can send exactly
   * what the user just asked for.
   */
  function toggleSort(columnId: string, additive: boolean) {
    const current = sorting.find((s) => s.id === columnId);
    const keepOthers = multiSort && additive;
    let next: SortingState;

    if (!current) {
      next = keepOthers ? [...sorting, { id: columnId, desc: false }] : [{ id: columnId, desc: false }];
    } else if (!current.desc) {
      next = keepOthers
        ? sorting.map((s) => (s.id === columnId ? { ...s, desc: true } : s))
        : [{ id: columnId, desc: true }];
    } else {
      next = sorting.filter((s) => s.id !== columnId);
    }

    setSorting(next);
    if (server) {
      setPage(1);
      emit({ sorting: next, page: 1 });
    }
  }

  return (
    <div className={cn("hms-datatable", className)}>
      <DataTableToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchable={searchable ?? columns.some((c) => c.searchable ?? Boolean(c.accessor))}
        placeholder={searchPlaceholder}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => changeColumnFilters([])}
        facetedFilters={
          facetColumns.length
            ? facetColumns.map((c) => {
                const column = table.getColumn(c.key);
                return column ? (
                  <DataTableFacetedFilter
                    key={c.key}
                    column={column}
                    label={c.filterLabel ?? (typeof c.header === "string" ? c.header : c.key)}
                    options={c.filterOptions}
                  />
                ) : null;
              })
            : null
        }
        filters={filters}
        viewOptions={
          (showColumnVisibility ?? columns.some((c) => c.hideable !== false)) ? (
            <DataTableViewOptions table={table} />
          ) : null
        }
        actions={toolbarActions}
      />

      <div className="hms-table__wrap">
        <table className={cn("hms-table", stickyHeader && "hms-table--sticky")}>
          <thead>
            {headerGroups.map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | { width?: string; label?: string }
                    | undefined;
                  const sortIndex = sorting.findIndex((s) => s.id === header.column.id) + 1;
                  return (
                    // Every column is left-aligned (heading and cells alike), so the `th`
                    // carries no alignment class — only its optional width.
                    <th key={header.id} style={meta?.width ? { width: meta.width } : undefined}>
                      <DataTableColumnHeader
                        sortable={header.column.getCanSort()}
                        direction={header.column.getIsSorted()}
                        sortIndex={sortIndex}
                        name={meta?.label}
                        onToggle={(additive) => toggleSort(header.column.id, additive)}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </DataTableColumnHeader>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {showSkeleton ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  {Array.from({ length: colSpan }).map((__, j) => (
                    <td key={j}>
                      <Skeleton height="0.85rem" width={j === 0 ? "60%" : "40%"} />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td className="hms-table__state" colSpan={colSpan}>
                  <ErrorState message={error} onRetry={onRetry} />
                </td>
              </tr>
            ) : bodyRows.length === 0 ? (
              <tr>
                <td className="hms-table__state" colSpan={colSpan}>
                  <EmptyState title={emptyMessage} description={emptyDescription} action={emptyAction} />
                </td>
              </tr>
            ) : (
              bodyRows.map((row) => (
                <tr key={row.id} data-selected={row.getIsSelected() || undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {paginationOn && !showSkeleton && !error && total > 0 ? (
        <DataTablePagination
          page={currentPage}
          pageCount={pageCount}
          pageSize={server ? server.pageSize : pageSize}
          pageSizeOptions={pageSizeOptions}
          total={total}
          selectedCount={selectable ? table.getSelectedRowModel().rows.length : undefined}
          onPageChange={changePage}
          onPageSizeChange={changePageSize}
        />
      ) : null}
    </div>
  );
}

/** Comparable primitive for sorting/filtering (Dates sort chronologically). */
function normalize(value: string | number | Date | null | undefined): string | number {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.getTime();
  return value;
}

/** TanStack's filter state → the flat `{ key: values }` a server query wants. */
function columnFiltersToRecord(filters: ColumnFiltersState): ColumnFilters {
  const out: ColumnFilters = {};
  for (const f of filters) {
    const arr = Array.isArray(f.value)
      ? f.value.map(String)
      : f.value === undefined || f.value === null || f.value === ""
        ? []
        : [String(f.value)];
    if (arr.length) out[f.id] = arr;
  }
  return out;
}

/** The inverse — restore server-provided filters into TanStack's shape on mount. */
function recordToColumnFilters(filters: ColumnFilters): ColumnFiltersState {
  return Object.entries(filters)
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([id, value]) => ({ id, value }));
}

function setParam(params: URLSearchParams, key: string, value: string | null) {
  if (value === null) params.delete(key);
  else params.set(key, value);
}

function readUrlState(enabled: boolean, prefix: string) {
  const empty = { sorting: [] as SortingState, search: "", page: 1, pageSize: undefined as number | undefined };
  if (!enabled || typeof window === "undefined") return empty;
  const params = new URLSearchParams(window.location.search);
  const sortParam = params.get(`${prefix}sort`);
  return {
    sorting: sortParam
      ? sortParam
          .split(",")
          .map((part) => {
            const [id, dir] = part.split(":");
            return { id: id ?? "", desc: dir === "desc" };
          })
          .filter((s) => s.id !== "")
      : [],
    search: params.get(`${prefix}q`) ?? "",
    page: Number(params.get(`${prefix}page`)) || 1,
    pageSize: Number(params.get(`${prefix}size`)) || undefined,
  };
}
