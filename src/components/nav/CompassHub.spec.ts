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

  it("derives quick access from registered tools", () => {
    const tasks = commonCompassTasks(buildCompassSections(null));

    expect(tasks.map((item) => item.id)).toEqual([
      "places",
      "nearby",
      "events",
      "county-map",
      "parking",
      "public-essentials",
    ]);
    expect(tasks.every((item) => RADIUS_TOOLS.some((tool) => tool.id === item.id))).toBe(true);
  });
});
