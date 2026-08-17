import type { ReactNode } from "react";
import type { Column } from "../data-table/types";

/**
 * The Action column, defined once (rules.md → Table Row Actions).
 *
 * A module passes only what a row's actions are; the key, header, width, and the
 * "never sortable, never hideable, always last" behaviour are fixed here so every
 * table's Action column is identical. Like every column, it is left-aligned.
 *
 *   columns = [ …, actionsColumn<Patient>((p) => (
 *     <TableActions label={`Actions for ${p.fullName}`}>
 *       <ViewAction href={`/patients/${p.id}`} />
 *       <EditAction onSelect={() => edit(p)} permitted={can.edit} />
 *     </TableActions>
 *   )) ]
 */
export function actionsColumn<Row>(
  render: (row: Row, index: number) => ReactNode,
  options?: { header?: ReactNode; width?: string },
): Column<Row> {
  return {
    key: "actions",
    header: options?.header ?? "Actions",
    cell: render,
    width: options?.width ?? "1%",
    sortable: false,
    searchable: false,
    hideable: false,
  };
}
