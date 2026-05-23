import { describe, it, expect } from "vitest";
import { validateOwnerPost, type OwnerPostInput } from "@/lib/submissions";

// A valid special. Negative cases override one field at a time.
function post(over: Partial<OwnerPostInput> = {}): OwnerPostInput {
  return {
    kind: "special",
    title: "Half-price growlers on Fridays",
    details: "All day, dine-in or carryout.",
    starts_at: "",
    link: "",
    ...over,
  };
}

describe("validateOwnerPost", () => {
  it("accepts a valid special", () => {
    expect(validateOwnerPost(post())).toBeNull();
  });

  it("accepts a valid event with a start time", () => {
    expect(
      validateOwnerPost(post({ kind: "event", starts_at: "2026-06-01T19:00" })),
    ).toBeNull();
  });

  it("requires a title", () => {
    expect(validateOwnerPost(post({ title: "   " }))).toMatch(/title/i);
  });

  it("requires a date and time for an event", () => {
    expect(validateOwnerPost(post({ kind: "event", starts_at: "" }))).toMatch(
      /date and time/i,
    );
  });

  it("does not require a start time for a special", () => {
    expect(
      validateOwnerPost(post({ kind: "special", starts_at: "" })),
    ).toBeNull();
  });
});
