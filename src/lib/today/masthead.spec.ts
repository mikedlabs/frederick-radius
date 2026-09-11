import { describe, it, expect } from "vitest";
import { todayFrame } from "./masthead";

describe("todayFrame", () => {
  it("names each daypart, pinned to the 17:00 evening boundary", () => {
    expect(todayFrame(5).title).toBe("This morning in Frederick County");
    expect(todayFrame(8).title).toBe("This morning in Frederick County");
    expect(todayFrame(11).title).toBe("This morning in Frederick County");
    expect(todayFrame(12).title).toBe("This afternoon in Frederick County");
    expect(todayFrame(16).title).toBe("This afternoon in Frederick County");
    // 17:00 is "evening" everywhere in the app; the masthead flips to Tonight
    // at the same instant the sections reorder.
    expect(todayFrame(17).title).toBe("Tonight in Frederick County");
    expect(todayFrame(20).title).toBe("Tonight in Frederick County");
    expect(todayFrame(21).title).toBe("Late in Frederick County");
    expect(todayFrame(23).title).toBe("Late in Frederick County");
    expect(todayFrame(2).title).toBe("Late in Frederick County");
    expect(todayFrame(4).title).toBe("Late in Frederick County");
  });

  it("wraps out-of-range hours safely", () => {
    expect(todayFrame(24).title).toBe(todayFrame(0).title);
    expect(todayFrame(-1).title).toBe(todayFrame(23).title);
  });

  it("gives every daypart a complete-sentence sub", () => {
    for (const h of [7, 14, 19, 23]) {
      const { sub } = todayFrame(h);
      expect(sub.endsWith(".")).toBe(true);
      expect(sub.length).toBeGreaterThan(12);
    }
  });
});
