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
});
