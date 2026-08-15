import { describe, expect, it, vi } from "vitest";

// The toast is the side effect, not the subject: these tests pin what the user is
// TOLD for each failure mode (ADR-026), which is a security boundary as much as a
// UX one — a 5xx must never surface a backend internal.
vi.mock("@hms/ui", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

const { describeError, successMessage } = await import("../feedback");
const { ApiRequestError, NetworkError, TimeoutError } = await import("../apiErrors");

/** Covers TC TOAST-02, TOAST-04, TOAST-05 in testcases.md. */
describe("describeError", () => {
  it("shows the backend's own message when it is usable", () => {
    const d = describeError(new ApiRequestError(404, "NOT_FOUND", "User not found"));
    expect(d.title).toBe("Not found");
    expect(d.description).toBe("User not found");
  });

  it("NEVER surfaces a server message on a 5xx", () => {
    const leaky = new ApiRequestError(500, "ERROR", 'relation "users" does not exist at character 15');
    const d = describeError(leaky);
    expect(d.description).not.toContain("users");
    expect(d.description).not.toContain("relation");
    expect(d.description).toMatch(/something went wrong/i);
  });

  it("rejects developer-shaped messages and falls back", () => {
    const stacky = new ApiRequestError(400, "ERROR", "Error: at Object.handler (/srv/app/dist/x.js:12:9)");
    expect(describeError(stacky).description).not.toContain("/srv/app");
  });

  it("rejects a bare error code as user-facing copy", () => {
    expect(describeError(new ApiRequestError(409, "CONFLICT", "CONFLICT_STATE")).description).not.toBe("CONFLICT_STATE");
  });

  it("maps each status to its own copy and dedupe key", () => {
    expect(describeError(new ApiRequestError(401, "UNAUTHORIZED", "")).title).toBe("Session expired");
    expect(describeError(new ApiRequestError(403, "FORBIDDEN", "")).title).toBe("Not permitted");
    expect(describeError(new ApiRequestError(409, "CONFLICT", "")).title).toBe("Conflict");
    expect(describeError(new ApiRequestError(429, "TOO_MANY_REQUESTS", "")).title).toBe("Too many requests");
    expect(describeError(new ApiRequestError(422, "VALIDATION_ERROR", "")).title).toBe("Check the details");
  });

  it("explains offline and timeout distinctly", () => {
    expect(describeError(new NetworkError()).title).toBe("Can't reach the server");
    expect(describeError(new TimeoutError()).title).toBe("Request timed out");
  });

  it("handles a thrown value that is not an Error at all", () => {
    const d = describeError("something odd");
    expect(d.title).toBe("Something went wrong");
    expect(d.description.length).toBeGreaterThan(0);
  });

  it("de-duplicates repeats of the same failure", () => {
    const a = describeError(new ApiRequestError(401, "UNAUTHORIZED", ""));
    const b = describeError(new ApiRequestError(401, "UNAUTHORIZED", ""));
    expect(a.dedupeKey).toBe(b.dedupeKey);
  });
});

describe("successMessage", () => {
  it("prefers the API's own message", () => {
    expect(successMessage({ message: "Hospital registered successfully." }, "Saved.", "POST")).toBe(
      "Hospital registered successfully.",
    );
  });

  it("falls back to the call's copy when the API says nothing", () => {
    expect(successMessage({ id: "1" }, "Patient registered.", "POST")).toBe("Patient registered.");
  });

  it("builds copy from the response when given a formatter", () => {
    const msg = successMessage({ drugName: "Amoxicillin", quantity: 2 }, (r: never) => {
      const res = r as unknown as { drugName: string; quantity: number };
      return `Dispensed ${res.drugName} × ${res.quantity}.`;
    }, "POST");
    expect(msg).toBe("Dispensed Amoxicillin × 2.");
  });

  it("uses a verb-appropriate default as the last resort", () => {
    expect(successMessage({}, undefined, "POST")).toBe("Saved.");
    expect(successMessage({}, undefined, "DELETE")).toBe("Removed.");
  });
});
