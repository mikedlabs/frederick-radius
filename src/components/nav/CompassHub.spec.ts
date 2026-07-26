import { describe, expect, it } from "vitest";
import { RADIUS_TOOLS } from "@/data/radius-tools";
import {
  buildCompassSections,
  commonCompassTasks,
  splitEssentialItems,
} from "./CompassHub";

function representedRegistryIds(homeSlug: string | null): string[] {
  const registryIds = new Set(RADIUS_TOOLS.map((tool) => tool.id));
  return buildCompassSections(homeSlug).flatMap((section) => {
    const items = section.id === "essentials"
      ? (() => {
          const { openAll, amenities, rows } = splitEssentialItems(section.items);
          return [...(openAll ? [openAll] : []), ...amenities, ...rows];
        })()
      : section.items;
    return items.map((item) => item.id).filter((id) => registryIds.has(id));
  });
}

describe("Compass browse model", () => {
  it("keeps every registered tool discoverable exactly once", () => {
    const represented = representedRegistryIds(null);
    const expected = RADIUS_TOOLS.map((tool) => tool.id);

    expect(represented.sort()).toEqual([...expected].sort());
    expect(new Set(represented).size).toBe(expected.length);
  });

  it("keeps non-amenity essentials such as County Scanner in the browse rows", () => {
    const essentials = buildCompassSections(null).find((section) => section.id === "essentials");
    expect(essentials).toBeDefined();

    const split = splitEssentialItems(essentials!.items);
    expect(split.rows.map((item) => item.id)).toContain("scanner");
  });

  it("uses one settings destination before a home town is chosen", () => {
    const yours = buildCompassSections(null).find((section) => section.id === "yours");
    expect(yours).toBeDefined();

    const settingsLinks = yours!.items.filter((item) => item.href === "/settings");
    expect(settingsLinks).toHaveLength(1);
    expect(settingsLinks[0].label).toBe("Choose your home town");
  });

  it("leads quick access with the decision gateway and practical utilities", () => {
    const tasks = commonCompassTasks(buildCompassSections(null));

    expect(tasks.map((item) => item.id)).toEqual([
      "ask-radius",
      "nearby",
      "county-pulse",
      "public-essentials",
    ]);
    expect(tasks.map((item) => item.id)).not.toContain("events");
    expect(tasks.map((item) => item.id)).not.toContain("county-map");
    expect(
      tasks
        .filter((item) => item.id !== "ask-radius")
        .every((item) => RADIUS_TOOLS.some((tool) => tool.id === item.id)),
    ).toBe(true);
  });

  it("keeps Events, Map, and local guides available in their browse topics", () => {
    const sections = buildCompassSections(null);
    const represented = new Set(sections.flatMap((section) => section.items.map((item) => item.id)));

    expect([...represented]).toEqual(expect.arrayContaining([
      "events",
      "county-map",
      "food-trucks",
      "beer-tools",
      "sports",
      "live-music",
      "trails",
      "rivers",
    ]));
  });
});
