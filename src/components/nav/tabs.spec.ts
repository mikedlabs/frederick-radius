import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { TABS, tabIndexForPath } from "./tabs";

describe("Ask Radius navigation context", () => {
  it("treats Ask as a focused workspace without adding another primary tab", () => {
    expect(tabIndexForPath("/ask")).toBe(-1);
    expect(tabIndexForPath("/ask/history")).toBe(-1);
    expect(TABS).toHaveLength(4);
  });

  it("makes Ask discoverable from an installed app", () => {
    expect(manifest().shortcuts).toContainEqual({
      name: "Ask Radius",
      short_name: "Ask",
      url: "/ask",
    });
  });

  it("keeps mapped utilities and live music in the expected primary section", () => {
    expect(tabIndexForPath("/trails")).toBe(1);
    expect(tabIndexForPath("/rivers")).toBe(1);
    expect(tabIndexForPath("/parking")).toBe(1);
    expect(tabIndexForPath("/transit")).toBe(1);
    expect(tabIndexForPath("/live-music")).toBe(2);
  });
});
