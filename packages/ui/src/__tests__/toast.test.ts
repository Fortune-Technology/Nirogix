import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The toast adapter is the seam every API notification passes through
 * (ADR-026/ADR-032), and it is called from plain TypeScript in the API client —
 * so it must work without React mounted. These tests pin the behaviour that is
 * ours rather than Base UI's: variant/duration mapping and de-duplication.
 *
 * Covers TC TOAST-01, TOAST-03 in testcases.md.
 */

const added: Array<Record<string, unknown>> = [];
const updated: Array<[string, Record<string, unknown>]> = [];
const closed: string[] = [];
let nextId = 0;

vi.mock("../components/toast/toast", () => ({
  toast: {
    add: (payload: Record<string, unknown>) => {
      added.push(payload);
      return `id-${++nextId}`;
    },
    update: (id: string, payload: Record<string, unknown>) => updated.push([id, payload]),
    close: (id: string) => closed.push(id),
  },
}));

const { toast } = await import("../toast");

beforeEach(() => {
  added.length = 0;
  updated.length = 0;
  closed.length = 0;
  toast.dismiss();
  added.length = 0;
  closed.length = 0;
});

describe("variant mapping", () => {
  it("passes the variant through as the Base UI type", () => {
    toast.success("Patient registered.");
    expect(added[0]).toMatchObject({ type: "success", description: "Patient registered." });
  });

  it("gives each variant a sensible default title", () => {
    toast.error("User not found");
    expect(added[0]).toMatchObject({ type: "error", title: "Something went wrong" });
  });

  it("lets the caller override the title", () => {
    toast.error({ title: "Not found", description: "User not found" });
    expect(added[0]).toMatchObject({ title: "Not found", description: "User not found" });
  });
});

describe("durations", () => {
  it("auto-dismisses success and info", () => {
    toast.success("saved");
    toast.info("heads up");
    expect(added[0]!.timeout).toBe(5000);
    expect(added[1]!.timeout).toBe(5000);
  });

  it("lingers on warning", () => {
    toast.warning("careful");
    expect(added[0]!.timeout).toBe(7000);
  });

  it("persists errors and loading (timeout 0 disables the timer)", () => {
    toast.error("boom");
    toast.loading("working");
    expect(added[0]!.timeout).toBe(0);
    expect(added[1]!.timeout).toBe(0);
  });

  it("honours an explicit duration, including null for persist", () => {
    toast.success({ description: "sticky", duration: null });
    expect(added[0]!.timeout).toBe(0);
    toast.success({ description: "brief", duration: 1200, dedupeKey: "brief" });
    expect(added[1]!.timeout).toBe(1200);
  });
});

describe("de-duplication", () => {
  it("refreshes an identical toast instead of stacking a second one", () => {
    toast.success("Branding saved.");
    toast.success("Branding saved.");
    toast.success("Branding saved.");
    expect(added).toHaveLength(1);
    expect(updated).toHaveLength(2);
  });

  it("treats different messages as different toasts", () => {
    toast.success("Saved.");
    toast.success("Removed.");
    expect(added).toHaveLength(2);
  });

  it("separates the same text under different variants", () => {
    toast.success("Done");
    toast.error("Done");
    expect(added).toHaveLength(2);
  });

  it("collapses by an explicit dedupeKey even when the text differs", () => {
    toast.error({ description: "attempt 1", dedupeKey: "network" });
    toast.error({ description: "attempt 2", dedupeKey: "network" });
    expect(added).toHaveLength(1);
    expect(updated[0]![1]).toMatchObject({ description: "attempt 2" });
  });

  it("allows the same message again once it has been dismissed", () => {
    const id = toast.success("Saved.");
    toast.dismiss(id);
    toast.success("Saved.");
    expect(added).toHaveLength(2);
  });
});

describe("dismissal", () => {
  it("closes a specific toast", () => {
    const id = toast.success("Saved.");
    toast.dismiss(id);
    expect(closed).toEqual([id]);
  });

  it("closes everything when called with no id", () => {
    toast.success("one");
    toast.error("two");
    toast.dismiss();
    expect(closed).toHaveLength(2);
  });
});
