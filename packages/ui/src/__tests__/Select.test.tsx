import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Select, type SelectOption } from "../components/Select";

/**
 * The one dropdown (ADR-112). What is worth protecting here is behaviour a native
 * `<select>` does not have and that a page would otherwise have to re-implement: the
 * search, the automatic threshold that decides whether there is one, the keyboard
 * contract, and the portal that keeps the panel out of an ancestor's `overflow`.
 */

const DOCTORS: SelectOption[] = [
  { value: "p1", label: "Dr Anita Sharma", description: "Cardiology", meta: "₹500", keywords: "cardiology" },
  { value: "p2", label: "Dr Rohit Sharma", description: "Orthopaedics", keywords: "orthopaedics" },
  { value: "p3", label: "Dr Meera Iyer", description: "Paediatrics", keywords: "paediatrics" },
];

/** Eight options — one past the threshold at which the search box appears on its own. */
const MANY: SelectOption[] = Array.from({ length: 8 }, (_, i) => ({
  value: `v${i}`,
  label: `Option ${i}`,
}));

function open(name: string) {
  fireEvent.click(screen.getByRole("combobox", { name }));
}

describe("Select", () => {
  it("shows the placeholder until something is chosen, then the chosen label", () => {
    const { rerender } = render(
      <Select label="Provider" value="" onChange={() => {}} options={DOCTORS} placeholder="Assign later" />,
    );
    expect(screen.getByRole("combobox").textContent).toContain("Assign later");

    rerender(<Select label="Provider" value="p3" onChange={() => {}} options={DOCTORS} placeholder="Assign later" />);
    expect(screen.getByRole("combobox").textContent).toContain("Dr Meera Iyer");
  });

  it("renders the second line and the right-aligned detail a native select cannot", () => {
    render(<Select label="Provider" value="" onChange={() => {}} options={DOCTORS} />);
    open("Provider");
    const option = screen.getByRole("option", { name: /Dr Anita Sharma/ });
    expect(within(option).getByText("Cardiology")).toBeDefined();
    expect(within(option).getByText("₹500")).toBeDefined();
  });

  it("selects on click and closes", () => {
    const onChange = vi.fn();
    render(<Select label="Provider" value="" onChange={onChange} options={DOCTORS} />);
    open("Provider");
    fireEvent.click(screen.getByRole("option", { name: /Dr Rohit Sharma/ }));
    expect(onChange).toHaveBeenCalledWith("p2");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("only offers a search box once the list is long enough to need one", () => {
    const { unmount } = render(<Select label="Short" value="" onChange={() => {}} options={DOCTORS} />);
    open("Short");
    expect(screen.queryByRole("textbox", { name: "Search options" })).toBeNull();
    unmount();

    render(<Select label="Long" value="" onChange={() => {}} options={MANY} />);
    open("Long");
    expect(screen.getByRole("textbox", { name: "Search options" })).toBeDefined();
  });

  it("matches search terms in any order, across the label, the second line and the keywords", () => {
    render(<Select label="Provider" value="" onChange={() => {}} options={DOCTORS} searchable />);
    open("Provider");
    const search = screen.getByRole("textbox", { name: "Search options" });

    // Two Sharmas: the speciality is what separates them, in either order.
    fireEvent.change(search, { target: { value: "sharma cardio" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Dr Anita Sharma");

    fireEvent.change(search, { target: { value: "cardio sharma" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);

    fireEvent.change(search, { target: { value: "sharma" } });
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("says nothing matched rather than showing an empty list", () => {
    render(<Select label="Provider" value="" onChange={() => {}} options={DOCTORS} searchable emptyMessage="No doctor matches." />);
    open("Provider");
    fireEvent.change(screen.getByRole("textbox", { name: "Search options" }), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No doctor matches.")).toBeDefined();
  });

  it("opens on the current selection so the keyboard continues from where the user is", () => {
    const onChange = vi.fn();
    render(<Select label="Provider" value="p2" onChange={onChange} options={DOCTORS} />);
    const trigger = screen.getByRole("combobox", { name: /Provider/ });
    fireEvent.keyDown(trigger, { key: "Enter" });

    const listbox = screen.getByRole("listbox");
    // Not the top of the list — the option that is already selected.
    expect(listbox.getAttribute("aria-activedescendant")).toContain("-opt-1");

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("p3");
  });

  it("skips a disabled option instead of parking the highlight on it", () => {
    const onChange = vi.fn();
    const withDisabled: SelectOption[] = [
      { value: "a", label: "Available" },
      { value: "b", label: "Retired", disabled: true },
      { value: "c", label: "Also available" },
    ];
    render(<Select label="Item" value="a" onChange={onChange} options={withDisabled} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: /Item/ }), { key: "ArrowDown" });
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("closes on Escape without selecting, and returns focus to the trigger", () => {
    const onChange = vi.fn();
    render(<Select label="Provider" value="" onChange={onChange} options={DOCTORS} />);
    open("Provider");
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  it("clears to empty without opening the list", () => {
    const onChange = vi.fn();
    render(<Select label="Department" value="p1" onChange={onChange} options={DOCTORS} clearable />);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("renders the panel outside the field, so an ancestor's overflow cannot clip it", () => {
    const { container } = render(
      <div style={{ overflow: "auto", height: 40 }}>
        <Select label="Provider" value="" onChange={() => {}} options={DOCTORS} />
      </div>,
    );
    open("Provider");
    const listbox = screen.getByRole("listbox");
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
  });

  it("says it is loading rather than claiming the list is empty", () => {
    render(<Select label="Provider" value="" onChange={() => {}} options={[]} loading />);
    open("Provider");
    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("groups options under their heading, in the order the caller gave them", () => {
    const grouped: SelectOption[] = [
      { value: "a", label: "Anaesthesia", group: "Clinical" },
      { value: "b", label: "Cardiology", group: "Clinical" },
      { value: "c", label: "Billing desk", group: "Administrative" },
    ];
    render(<Select label="Department" value="" onChange={() => {}} options={grouped} />);
    open("Department");
    const headings = screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(headings).toEqual(["Clinical", "Administrative"]);
  });

  it("wires the error to the control for a screen reader, and hides the hint behind it", () => {
    render(<Select label="Provider" value="" onChange={() => {}} options={DOCTORS} hint="Pick a doctor" error="Required" />);
    const trigger = screen.getByRole("combobox");
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
    const describedBy = trigger.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)?.textContent).toBe("Required");
    expect(screen.queryByText("Pick a doctor")).toBeNull();
  });
});
