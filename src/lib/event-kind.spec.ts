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

  it("treats closures and internal meetings on an events calendar as notices", () => {
    // Each of these ranked as a draw on the production board on Nov 9, 2026.
    expect(isUtilityEvent({ category: "community", title: "Veteran's Day - Libraries Closed" })).toBe(true);
    expect(isUtilityEvent({ category: "community", title: "Centers are Closed for Veteran Day" })).toBe(true);
    expect(isUtilityEvent({ category: "community", title: "WFS- No School" })).toBe(true);
    expect(isUtilityEvent({ category: "community", title: "Circulation Department Meeting" })).toBe(true);
    expect(isUtilityEvent({ category: "community", title: "WFS- Winter Break" })).toBe(true);
    expect(isUtilityEvent({ category: "community", title: "School Closed for Fall Break" })).toBe(true);
    expect(isUtilityEvent({ category: "community", title: "Thanksgiving Eve - Libraries Close" })).toBe(true);
    expect(isUtilityEvent({ category: "community", title: "Libraries Closing at 5 PM" })).toBe(true);
    expect(isUtilityEvent({ category: "community", title: "Holiday Schedule: Offices Closing" })).toBe(true);
  });

  it("does not read an activity that mentions a break, a school or a closing as a notice", () => {
    // Guards for the nearest wrong matches, not rows from the board.
    expect(isUtilityEvent({ category: "family", title: "Spring Break Camp" })).toBe(false);
    expect(isUtilityEvent({ category: "gallery", title: "Closing Reception: Shorelines" })).toBe(false);
    expect(isUtilityEvent({ category: "gallery", title: "Library Closing Reception" })).toBe(false);
    expect(isUtilityEvent({ category: "community", title: "Senior Center Closing Ceremony" })).toBe(false);
    expect(isUtilityEvent({ category: "music", title: "Old School Hip Hop Night" })).toBe(false);
    expect(isUtilityEvent({ category: "family", title: "Break My Game: Tabletop Game Play Testing" })).toBe(false);
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
