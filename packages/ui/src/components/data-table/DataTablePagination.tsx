"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../cn";
import { Select } from "../Select";

export interface DataTablePaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  pageSizeOptions: number[];
  /** Total matching rows (server total in server mode, filtered count otherwise). */
  total: number;
  selectedCount?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/** Windowed page numbers: 1 … 4 5 [6] 7 8 … 20 — never an unbounded strip. */
function pageWindow(page: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages: Array<number | "gap"> = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) pages.push("gap");
  for (let p = from; p <= to; p++) pages.push(p);
  if (to < pageCount - 1) pages.push("gap");
  pages.push(pageCount);
  return pages;
}

/**
 * The shared pagination bar: rows-per-page → page controls → "Showing X–Y of Z"
 * (rules.md → Standard DataTable). Page size is always configurable; no table
 * hardcodes one.
 */
export function DataTablePagination({
  page,
  pageCount,
  pageSize,
  pageSizeOptions,
  total,
  selectedCount,
  onPageChange,
  onPageSizeChange,
}: DataTablePaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="hms-pagination">
      <div className="hms-pagination__info">
        <span>
          Showing <strong>{first}</strong>–<strong>{last}</strong> of <strong>{total}</strong>
        </span>
        {selectedCount ? <span className="hms-pagination__selected">{selectedCount} selected</span> : null}
      </div>

      <div className="hms-pagination__controls">
        {/* The kit's own control, not the browser's — a native `<select>` here would have been
            the one place in the product that ignored the design tokens on every single table
            (ADR-112). Not searchable: four numbers do not need a search box. */}
        <div className="hms-pagination__size">
          <span aria-hidden>Rows per page</span>
          <Select
            value={String(pageSize)}
            onChange={(v) => v && onPageSizeChange(Number(v))}
            options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
            searchable={false}
            aria-label="Rows per page"
            className="hms-pagination__size-select"
            triggerClassName="hms-select__trigger--sm"
          />
        </div>

        <nav className="hms-pagination__pages" aria-label="Pagination">
          <button
            type="button"
            className="hms-pagination__btn"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden />
          </button>

          {pageWindow(page, Math.max(pageCount, 1)).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="hms-pagination__gap" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={cn("hms-pagination__btn", p === page && "hms-pagination__btn--active")}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            ),
          )}

          <button
            type="button"
            className="hms-pagination__btn"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight size={16} strokeWidth={2} aria-hidden />
          </button>
        </nav>
      </div>
    </div>
  );
}
