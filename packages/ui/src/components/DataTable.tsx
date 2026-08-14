import type { ReactNode } from 'react';
import { Spinner } from './Spinner';

export interface Column<Row> {
  /** Stable key; also used as the React key for the header cell. */
  key: string;
  header: ReactNode;
  /** Cell renderer. Receives the row and its index. */
  cell: (row: Row, index: number) => ReactNode;
  /** Optional fixed/min width (any CSS length). */
  width?: string;
}

export interface DataTableProps<Row> {
  columns: Array<Column<Row>>;
  rows: Row[];
  /** Stable identity per row (defaults to the array index). */
  rowKey?: (row: Row, index: number) => string;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
}

/**
 * The Standard DataTable (resources/rules.md → Design System). Every tabular view
 * in the Portal renders through this one component, so headers, spacing, empty /
 * loading / error states, and horizontal overflow behave identically everywhere.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  emptyMessage = 'No records found.',
}: DataTableProps<Row>) {
  const colSpan = columns.length || 1;

  return (
    <div className="hms-table__wrap">
      <table className="hms-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td className="hms-table__state" colSpan={colSpan}>
                <Spinner /> Loading…
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td className="hms-table__state" colSpan={colSpan}>
                {error}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td className="hms-table__state" colSpan={colSpan}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey ? rowKey(row, i) : String(i)}>
                {columns.map((c) => (
                  <td key={c.key}>{c.cell(row, i)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
