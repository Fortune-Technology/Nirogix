import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AreaChart, BarChart, StatCard, UsageBar } from "../components/charts";
import { areaPath, compact, domain, linePath, nearestIndex, tickIndices, yAt } from "../components/charts/geometry";

/**
 * The dashboard charts (ADR-043). Two things matter and are easy to get wrong:
 * the geometry must be exact (a chart that lies is worse than no chart), and the
 * numbers must reach a screen reader, since an SVG on its own says nothing.
 *
 * Covers TC PLT-06, PLT-07 in testcases.md.
 */

describe("geometry", () => {
  it("pads the top of the domain so the peak is not flush with the frame", () => {
    expect(domain([0, 5, 10])).toEqual({ min: 0, max: 11 });
  });

  it("keeps a usable range when every value is zero", () => {
    expect(domain([0, 0, 0])).toEqual({ min: 0, max: 1 });
  });

  it("maps values top-down: the maximum is nearer y=0 than the minimum", () => {
    const d = domain([0, 10]);
    expect(yAt(10, d)).toBeLessThan(yAt(0, d));
    expect(yAt(0, d)).toBe(100);
  });

  it("closes the area path back to the baseline", () => {
    const path = areaPath([1, 2], domain([1, 2]));
    expect(path.endsWith("L0 100 Z")).toBe(true);
    expect(linePath([1, 2], domain([1, 2])).startsWith("M0")).toBe(true);
  });

  it("snaps the cursor to the nearest real point, never between two", () => {
    expect(nearestIndex(0, 5)).toBe(0);
    expect(nearestIndex(0.49, 5)).toBe(2);
    expect(nearestIndex(1, 5)).toBe(4);
  });

  it("always keeps the first and last tick", () => {
    const ticks = tickIndices(12, 6);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(11);
  });

  it("formats compactly without inventing precision", () => {
    expect(compact(999)).toBe("999");
    expect(compact(1500)).toBe("1.5k");
    expect(compact(2_400_000)).toBe("2.4M");
  });
});

const SERIES = [{ key: "h", label: "Hospitals", values: [1, 3, 7], color: "var(--hms-brand)" }];
const LABELS = ["Jun", "Jul", "Aug"];

describe("area chart", () => {
  it("exposes its numbers to assistive technology, not just a drawing", () => {
    render(<AreaChart series={SERIES} labels={LABELS} ariaLabel="Hospitals over time" />);
    expect(screen.getByRole("img", { name: "Hospitals over time" })).toBeDefined();
    const row = screen.getByRole("row", { name: /Jul/ });
    expect(within(row).getByText("3")).toBeDefined();
  });

  it("shows the empty state instead of a flat line when there is no data", () => {
    render(
      <AreaChart
        series={[{ key: "h", label: "Hospitals", values: [0, 0], color: "var(--hms-brand)" }]}
        labels={["Jun", "Jul"]}
        emptyMessage="No hospitals onboarded yet."
      />,
    );
    expect(screen.getByText("No hospitals onboarded yet.")).toBeDefined();
  });
});

describe("bar chart", () => {
  it("renders a column per period and repeats the values in a table", () => {
    render(<BarChart series={SERIES} labels={LABELS} ariaLabel="New hospitals" />);
    expect(screen.getByRole("img", { name: "New hospitals" })).toBeDefined();
    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3 periods
  });
});

describe("stat card", () => {
  it("shows a skeleton rather than a zero while the value is unknown", () => {
    const { container } = render(<StatCard label="Hospitals" value={null} />);
    expect(container.querySelector(".hms-skeleton")).not.toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("marks a rise as bad when rising is bad", () => {
    const { container } = render(
      <StatCard label="Failed sign-ins" value={12} invertDelta delta={{ value: 4, label: "vs last month" }} />,
    );
    expect(container.querySelector(".hms-stat__delta--bad")).not.toBeNull();
  });

  it("stays a plain tile — not a link or button — when it has nowhere to go", () => {
    const { container } = render(<StatCard label="Outstanding" value={42} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".hms-stat--link")).toBeNull();
    expect(container.querySelector(".hms-stat__go")).toBeNull();
  });

  it("becomes a link with a destination and an accessible name when given an href", () => {
    render(<StatCard label="Total patients" value={12450} href="/patients" />);
    const link = screen.getByRole("link", { name: "Total patients" });
    expect(link.getAttribute("href")).toBe("/patients");
    expect(link.classList.contains("hms-stat--link")).toBe(true);
    // The affordance is present at rest, not only on hover.
    expect(link.querySelector(".hms-stat__go")).not.toBeNull();
  });

  it("prefers a caller's accessible name over the bare label", () => {
    render(<StatCard label="Outstanding" value={42} href="/billing" linkLabel="Outstanding balance, open billing" />);
    expect(screen.getByRole("link", { name: "Outstanding balance, open billing" })).toBeDefined();
  });

  it("runs an action as a button when given onClick, not a navigation", () => {
    const onClick = vi.fn();
    render(<StatCard label="Refresh" value={7} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Refresh" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("applies the highlight variant when asked", () => {
    const { container } = render(<StatCard label="Collected" value={99} variant="highlight" />);
    expect(container.querySelector(".hms-stat--highlight")).not.toBeNull();
  });
});

describe("usage bar", () => {
  it("announces the real value against its total", () => {
    render(<UsageBar label="Pharmacy" value={3} total={4} />);
    const bar = screen.getByRole("progressbar", { name: "Pharmacy" });
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("4");
  });
});
