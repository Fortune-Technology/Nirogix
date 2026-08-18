import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The toast adapter is the seam every API notification passes through (ADR-026,
 * ADR-057), and it is called from plain TypeScript in the shared API client — so it
 * must work with no React mounted. These tests pin the behaviour that is *ours* rather
 * than React Toastify's: variant mapping, per-variant durations and ARIA roles,
 * de-duplication, and the loading → outcome transition.
 *
 * Covers TC TOAST-01…TOAST-08 in testcases.md.
 */

type Call = { content: unknown; options: Record<string, unknown> };

const created: Call[] = [];
const updated: Array<[string, Record<string, unknown>]> = [];
const dismissed: Array<string | undefined> = [];
const activeIds = new Set<string>();

vi.mock("react-toastify", () => {
  const toastify = Object.assign(
    (content: unknown, options: Record<string, unknown> = {}) => {
      created.push({ content, options });
      activeIds.add(String(options.toastId));
      return options.toastId;
    },
    {
      update: (id: string, options: Record<string, unknown>) => updated.push([id, options]),
      dismiss: (id?: string) => {
        dismissed.push(id);
        if (id) activeIds.delete(id);
        else activeIds.clear();
      },
      isActive: (id: string) => activeIds.has(String(id)),
    },
  );
  return { toast: toastify };
});

const { toast } = await import("../toast");

beforeEach(() => {
  created.length = 0;
  updated.length = 0;
  dismissed.length = 0;
  activeIds.clear();
});

describe("variant mapping", () => {
  it("passes the variant through as the library's type", () => {
    toast.success("Patient registered.");
    expect(created[0]!.options).toMatchObject({ type: "success" });
  });

  it("carries the variant on the class so the tokens can style it", () => {
    toast.warning("Configuration incomplete");
    expect(created[0]!.options.className).toBe("hms-toast hms-toast--warning");
    expect(created[0]!.options.progressClassName).toBe("hms-toast__progress hms-toast__progress--warning");
  });

  it("maps loading to a neutral type, because the spinner is ours", () => {
    toast.loading("Generating your report…");
    expect(created[0]!.options).toMatchObject({ type: "default", isLoading: false });
  });
});

describe("durations", () => {
  it("auto-dismisses success and info after 5s", () => {
    toast.success("saved");
    toast.info("heads up");
    expect(created[0]!.options.autoClose).toBe(5000);
    expect(created[1]!.options.autoClose).toBe(5000);
  });

  it("lets a warning linger", () => {
    toast.warning("careful");
    expect(created[0]!.options.autoClose).toBe(7000);
  });

  it("persists errors and loading (false disables the timer and the progress bar)", () => {
    toast.error("boom");
    toast.loading("working");
    expect(created[0]!.options.autoClose).toBe(false);
    expect(created[1]!.options.autoClose).toBe(false);
  });

  it("honours an explicit duration, including null for persist", () => {
    toast.success({ description: "sticky", duration: null });
    expect(created[0]!.options.autoClose).toBe(false);
    toast.success({ description: "brief", duration: 1200, dedupeKey: "brief" });
    expect(created[1]!.options.autoClose).toBe(1200);
  });
});

describe("accessibility", () => {
  it("interrupts for an error or a warning, and waits its turn otherwise", () => {
    toast.error("boom");
    toast.warning("careful");
    toast.success("saved");
    toast.info("fyi");
    toast.loading("working");
    expect(created.map((c) => c.options.role)).toEqual(["alert", "alert", "status", "status", "status"]);
  });

  it("always carries a title in words, so status never rests on colour alone", () => {
    toast.error("User not found");
    toast.success("Saved");
    // The title is rendered inside the body node; assert the adapter supplied one.
    const titles = created.map((c) => (c.content as { props: { title: string } }).props.title);
    expect(titles).toEqual(["Something went wrong", "Success"]);
  });

  it("lets the caller override the title", () => {
    toast.error({ title: "Not permitted", description: "You don't have permission to do that." });
    expect((created[0]!.content as { props: { title: string } }).props.title).toBe("Not permitted");
  });
});

describe("de-duplication", () => {
  it("refreshes an identical toast instead of stacking a second one", () => {
    toast.success("Branding saved.");
    toast.success("Branding saved.");
    toast.success("Branding saved.");
    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(2);
  });

  it("treats different messages as different toasts", () => {
    toast.success("Saved.");
    toast.success("Removed.");
    expect(created).toHaveLength(2);
  });

  it("separates the same text under different variants", () => {
    toast.success("Done");
    toast.error("Done");
    expect(created).toHaveLength(2);
  });

  it("collapses by an explicit dedupeKey even when the text differs", () => {
    toast.error({ description: "attempt 1", dedupeKey: "network" });
    toast.error({ description: "attempt 2", dedupeKey: "network" });
    expect(created).toHaveLength(1);
    const body = updated[0]![1].render as { props: { description: string } };
    expect(body.props.description).toBe("attempt 2");
  });

  it("allows the same message again once it has been dismissed", () => {
    const id = toast.success("Saved.");
    toast.dismiss(id);
    toast.success("Saved.");
    expect(created).toHaveLength(2);
  });
});

describe("loading flows", () => {
  it("turns a loading toast into its outcome, timer and role included", () => {
    const id = toast.loading("Generating your report…");
    toast.update(id, { variant: "success", description: "Report ready." });

    expect(updated).toHaveLength(1);
    const [updatedId, options] = updated[0]!;
    expect(updatedId).toBe(id);
    expect(options).toMatchObject({ type: "success", autoClose: 5000, role: "status" });
    expect((options.render as { props: { variant: string } }).props.variant).toBe("success");
  });

  it("turns a loading toast into a failure that persists", () => {
    const id = toast.loading("Uploading…");
    toast.update(id, { variant: "error", description: "Upload failed." });
    expect(updated[0]![1]).toMatchObject({ type: "error", autoClose: false, role: "alert" });
  });
});

describe("dismissal", () => {
  it("closes a specific toast", () => {
    const id = toast.success("Saved.");
    toast.dismiss(id);
    expect(dismissed).toEqual([id]);
  });

  it("closes everything when called with no id", () => {
    toast.success("one");
    toast.error("two");
    toast.dismiss();
    expect(dismissed).toEqual([undefined]);
    expect(toast.isActive("anything")).toBe(false);
  });
});
