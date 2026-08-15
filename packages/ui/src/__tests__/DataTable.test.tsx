import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DataTable } from "../components/data-table/DataTable";
import type { Column } from "../components/data-table/types";

/**
 * The Standard DataTable is the one tabular surface in the platform (ADR-029), so
 * a regression here hits every module at once. These cover the behaviour the
 * modules depend on: the sort cycle, search, pagination, the states, and the
 * server-mode contract.
 *
 * Covers TC TBL-01, TBL-03, TBL-04, TBL-08, TBL-09, TBL-10 in testcases.md.
 */

type Row = { id: string; name: string; city: string; qty: number };

const ROWS: Row[] = [
  { id: "1", name: "Ananya Sharma", city: "Pune", qty: 3 },
  { id: "2", name: "Rohit Mehta", city: "Mumbai", qty: 1 },
  { id: "3", name: "Vivaan Patil", city: "Pune", qty: 2 },
];

const columns: Array<Column<Row>> = [
  { key: "name", header: "Name", accessor: (r) => r.name, cell: (r) => r.name },
  { key: "city", header: "City", filterable: true, accessor: (r) => r.city, cell: (r) => r.city },
  { key: "qty", header: "Qty", align: "right", accessor: (r) => r.qty, cell: (r) => String(r.qty) },
];

function bodyNames(): string[] {
  const rows = screen.getAllByRole("row").slice(1); // drop the header row
  return rows.map((r) => within(r).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("rendering", () => {
  it("renders a row per record", () => {
    render(<DataTable columns={columns} rows={ROWS} rowKey={(r) => r.id} />);
    expect(bodyNames()).toEqual(["Ananya Sharma", "Rohit Mehta", "Vivaan Patil"]);
  });

  it("shows the shared empty state, not a blank table", () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyMessage="No patients registered yet." />);
    expect(screen.getByText("No patients registered yet.")).toBeDefined();
  });

  it("shows the error state with a retry when one is offered", () => {
    const onRetry = vi.fn();
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} error="Could not load patients." onRetry={onRetry} />);
    expect(screen.getByText("Could not load patients.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders skeletons while loading with no rows yet", () => {
    const { container } = render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading skeletonRows={3} />);
    expect(container.querySelectorAll(".hms-skeleton").length).toBeGreaterThan(0);
  });
});

describe("sorting", () => {
  it("cycles unsorted → ascending → descending → unsorted", () => {
    render(<DataTable columns={columns} rows={ROWS} rowKey={(r) => r.id} />);
    const header = screen.getByRole("button", { name: /^Name/ });

    expect(bodyNames()[0]).toBe("Ananya Sharma"); // insertion order

    fireEvent.click(header);
    expect(bodyNames()).toEqual(["Ananya Sharma", "Rohit Mehta", "Vivaan Patil"]);

    fireEvent.click(header);
    expect(bodyNames()).toEqual(["Vivaan Patil", "Rohit Mehta", "Ananya Sharma"]);

    fireEvent.click(header);
    expect(bodyNames()).toEqual(["Ananya Sharma", "Rohit Mehta", "Vivaan Patil"]); // back to source order
  });

  it("sorts numerically, not lexically", () => {
    render(<DataTable columns={columns} rows={ROWS} rowKey={(r) => r.id} />);
    fireEvent.click(screen.getByRole("button", { name: /^Qty/ }));
    const qtys = screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[2]?.textContent);
    expect(qtys).toEqual(["1", "2", "3"]);
  });

  it("does not offer sorting on a column with no accessor", () => {
    const display: Array<Column<Row>> = [{ key: "actions", header: "Actions", cell: () => "…" }];
    render(<DataTable columns={display} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.queryByRole("button", { name: /Actions/ })).toBeNull();
  });
});

describe("search", () => {
  it("filters across searchable columns", () => {
    render(<DataTable columns={columns} rows={ROWS} rowKey={(r) => r.id} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Rohit" } });
    expect(bodyNames()).toEqual(["Rohit Mehta"]);
  });

  it("falls back to the empty state when nothing matches", () => {
    render(<DataTable columns={columns} rows={ROWS} rowKey={(r) => r.id} emptyMessage="No matches." />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz" } });
    expect(screen.getByText("No matches.")).toBeDefined();
  });
});

describe("pagination", () => {
  const many: Row[] = Array.from({ length: 25 }, (_, i) => ({
    id: String(i),
    name: `Patient ${String(i).padStart(2, "0")}`,
    city: "Pune",
    qty: i,
  }));

  it("pages client-side and reports the true total", () => {
    render(<DataTable columns={columns} rows={many} rowKey={(r) => r.id} pagination={{ pageSize: 10 }} />);
    expect(bodyNames()).toHaveLength(10);
    expect(screen.getByText(/of/).textContent).toContain("25");
  });

  it("moves to the next page", () => {
    render(<DataTable columns={columns} rows={many} rowKey={(r) => r.id} pagination={{ pageSize: 10 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(bodyNames()[0]).toBe("Patient 10");
  });
});

describe("server mode", () => {
  it("reports the requested page instead of slicing locally", () => {
    const onChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={ROWS}
        rowKey={(r) => r.id}
        server={{ total: 426, page: 1, pageSize: 20, onChange }}
      />,
    );
    // Every row the caller supplied is rendered — the table must not paginate again.
    expect(bodyNames()).toHaveLength(3);
    expect(screen.getByText(/of/).textContent).toContain("426");

    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 20 }));
  });

  it("emits the sort the user just asked for, not the previous state", () => {
    const onChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={ROWS}
        rowKey={(r) => r.id}
        server={{ total: 3, page: 1, pageSize: 20, onChange }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Name/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sort: [{ key: "name", dir: "asc" }], page: 1 }),
    );
  });
});
