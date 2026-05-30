import { describe, it, expect } from "vitest";
import { CATEGORIES, CATEGORY_BY_SLUG, categoryKind } from "@/data/categories";
import { isUtilityEvent } from "@/lib/event-kind";
import { allUpcoming } from "@/lib/loaders/events";

/**
 * Guardrail for the draw/utility backbone (the "everything looks Civic"
 * fix). These run in CI (`npm test`) so a future data or taxonomy change
 * that would re-introduce mislabeling or a drifting hierarchy fails the
 * build instead of shipping.
 */

describe("category taxonomy integrity", () => {
  it("every parent slug references a real category", () => {
    for (const c of CATEGORIES) {
      if (c.parent) {
        expect(CATEGORY_BY_SLUG[c.parent], `parent of ${c.slug}`).toBeDefined();
      }
    }
  });

  it("every declared kind is a valid value", () => {
    for (const c of CATEGORIES) {
      if (c.kind !== undefined) {
        expect(["draw", "utility"]).toContain(c.kind);
      }
    }
  });
});

describe("categoryKind", () => {
  it("tags civic business as utility (directly and via parent)", () => {
    expect(categoryKind("civic")).toBe("utility");
    expect(categoryKind("government")).toBe("utility"); // inherits civic
    expect(categoryKind("voting")).toBe("utility");
    expect(categoryKind("public-safety")).toBe("utility");
  });

  it("treats real draws — and unknown/blank slugs — as draw", () => {
    expect(categoryKind("music")).toBe("draw");
    expect(categoryKind("food")).toBe("draw");
    expect(categoryKind("family")).toBe("draw");
    expect(categoryKind("not-a-real-slug")).toBe("draw");
    expect(categoryKind(undefined)).toBe("draw");
  });
});

describe("isUtilityEvent", () => {
  it("catches civic-tagged events", () => {
    expect(isUtilityEvent({ category: "civic", title: "Town Hall" })).toBe(true);
  });

  it("catches civic business that arrives with a blank/wrong category", () => {
    // The leak that put these next to concerts before the keyword net.
    expect(isUtilityEvent({ category: "community", title: "Adult Public Guardianship Review Board" })).toBe(true);
    expect(isUtilityEvent({ category: "", title: "Planning Commission Meeting" })).toBe(true);
    expect(isUtilityEvent({ title: "Fire and Rescue Advisory Board" })).toBe(true);
    expect(isUtilityEvent({ title: "Mayor & City Council Public Hearing" })).toBe(true);
  });

  it("leaves real draws alone", () => {
    expect(isUtilityEvent({ category: "music", title: "Alive @ Five — Mack Berry Band" })).toBe(false);
    expect(isUtilityEvent({ category: "food", title: "First Friday Beer Garden" })).toBe(false);
    expect(isUtilityEvent({ category: "arts", title: "Color on the Creek — Opening Weekend" })).toBe(false);
  });
});

describe("curated event data hygiene", () => {
  it("no curated event carries a category slug that isn't in the taxonomy", () => {
    // A typo'd / retired slug would silently render as the neutral
    // "Event" fallback — exactly the mislabel class we just fixed. Fail
    // the build so it's caught at author time, not in production.
    const events = allUpcoming(new Date());
    const unknown = events
      .filter((e) => e.category && !CATEGORY_BY_SLUG[e.category])
      .map((e) => `${e.slug}: "${e.category}"`);
    expect(unknown, `unknown category slugs:\n${unknown.join("\n")}`).toEqual([]);
  });
});
