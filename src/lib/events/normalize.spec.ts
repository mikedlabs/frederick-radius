import { describe, it, expect } from "vitest";
import { cleanDescription } from "./normalize";

describe("cleanDescription", () => {
  it("strips a full metadata-dump block to empty", () => {
    expect(
      cleanDescription("Event date: June 9, 2026 Event Time: 6:00 PM Location: City Hall"),
    ).toBe("");
    expect(cleanDescription("Date: Jun 9 Time: 6 PM")).toBe("");
  });

  it("strips a leading metadata block but keeps the prose after it", () => {
    expect(
      cleanDescription(
        "Event date: June 9 Event Time: 6 PM Come enjoy live music at the park!",
      ),
      // The chain (date→time) is removed; the final "Event Time:" segment is
      // kept rather than risk eating the prose — prose is never lost.
    ).toBe("Event Time: 6 PM Come enjoy live music at the park!");
  });

  it("leaves ordinary prose untouched", () => {
    const prose = "Join us for a wine tasting at the vineyard with live jazz.";
    expect(cleanDescription(prose)).toBe(prose);
  });

  it("never eats a standalone one-line description that starts with a label word", () => {
    // No chain → the lone-label drop must NOT fire.
    expect(cleanDescription("Time: A Musical Journey Through the Decades")).toBe(
      "Time: A Musical Journey Through the Decades",
    );
  });

  it("preserves prose that merely contains a colon", () => {
    const s = "Our promise: a great night out for the whole family.";
    expect(cleanDescription(s)).toBe(s);
  });

  it("decodes entities and collapses whitespace (via cleanFeedText)", () => {
    expect(cleanDescription("Live   music &amp;  dancing")).toBe("Live music & dancing");
  });

  it("handles null/undefined/empty", () => {
    expect(cleanDescription(null)).toBe("");
    expect(cleanDescription(undefined)).toBe("");
    expect(cleanDescription("")).toBe("");
  });

  it("is idempotent", () => {
    const once = cleanDescription("Event date: Jun 9 Time: 6 PM Location: Carroll Creek");
    expect(cleanDescription(once)).toBe(once);
  });
});
