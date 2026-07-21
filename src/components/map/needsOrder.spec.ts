import { describe, expect, it } from "vitest";
import { needDaypart, orderNeedsForHour } from "./needsOrder";

// Mirrors the shape of MapDock's TOP_NEEDS without importing the component
// (icons/router would ride along). Keys and kinds must match.
const NEEDS = [
  { kind: "opennow" },
  { kind: "nearme" },
  { kind: "intent", key: "coffee" },
  { kind: "intent", key: "eat" },
  { kind: "amenity", key: "restroom" },
  { kind: "parking" },
  { kind: "intent", key: "outdoor" },
  { kind: "amenity", key: "wifi" },
  { kind: "amenity", key: "water" },
  { kind: "intent", key: "family" },
] as const;

const keys = (hour: number) =>
  orderNeedsForHour(NEEDS, hour).map((n) => ("key" in n ? n.key : n.kind));

describe("needDaypart", () => {
  it("buckets the Eastern hour", () => {
    expect(needDaypart(7)).toBe("morning");
    expect(needDaypart(12)).toBe("midday");
    expect(needDaypart(16)).toBe("afternoon");
    expect(needDaypart(19)).toBe("evening");
    expect(needDaypart(23)).toBe("late");
    expect(needDaypart(2)).toBe("late");
  });
});

describe("orderNeedsForHour", () => {
  it("pins the Open now / Near me anchors first at every hour", () => {
    for (const hour of [7, 12, 16, 19, 23]) {
      expect(keys(hour).slice(0, 2)).toEqual(["opennow", "nearme"]);
    }
  });

  it("leads mornings with coffee and evenings with food", () => {
    expect(keys(8)[2]).toBe("coffee");
    expect(keys(19)[2]).toBe("eat");
  });

  it("raises restrooms late at night", () => {
    expect(keys(23).indexOf("restroom")).toBeLessThan(keys(23).indexOf("coffee"));
  });

  it("keeps every need present (reorders, never drops)", () => {
    expect([...keys(8)].sort()).toEqual(
      NEEDS.map((n) => ("key" in n ? n.key : n.kind)).sort(),
    );
  });

  it("degrades gracefully for a need it has no rank for", () => {
    const withNew = [...NEEDS, { kind: "intent", key: "brand-new" }] as const;
    const out = orderNeedsForHour(withNew, 8).map((n) => ("key" in n ? n.key : n.kind));
    expect(out).toContain("brand-new");
    expect(out.length).toBe(withNew.length);
  });
});
