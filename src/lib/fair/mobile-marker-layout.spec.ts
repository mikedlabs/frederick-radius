import { describe, expect, it } from "vitest";

import { groupCollidingMobileMarkers } from "./mobile-marker-layout";

describe("groupCollidingMobileMarkers", () => {
  it("collapses connected overlapping hit targets into one reachable group", () => {
    const groups = groupCollidingMobileMarkers([
      { id: "a", item: "A", x: 40, y: 40 },
      { id: "b", item: "B", x: 84, y: 40 },
      { id: "c", item: "C", x: 128, y: 40 },
      { id: "d", item: "D", x: 240, y: 40 },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.items).toEqual(["A", "B", "C"]);
    expect(groups[0]?.representative.id).toBe("b");
    expect(groups[1]?.items).toEqual(["D"]);
  });

  it("keeps nearby diagonal targets in one group", () => {
    const groups = groupCollidingMobileMarkers([
      { id: "a", item: "A", x: 20, y: 20 },
      { id: "b", item: "B", x: 62, y: 62 },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toEqual(["A", "B"]);
  });

  it("leaves targets separated by one axis as individual markers", () => {
    const groups = groupCollidingMobileMarkers([
      { id: "a", item: "A", x: 20, y: 20 },
      { id: "b", item: "B", x: 72, y: 30 },
      { id: "c", item: "C", x: 20, y: 72 },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.items[0])).toEqual(["A", "B", "C"]);
  });
});
