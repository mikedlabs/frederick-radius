import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/data/app-pages";
import { RADIUS_TOOL_GROUPS, RADIUS_TOOLS } from "@/data/radius-tools";
import {
  ALL_COMPASS_TOOLS_ID,
  buildAllToolsDirectory,
  buildCompassOutcomes,
  buildCompassSections,
  commonCompassTasks,
  searchCompassSections,
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
  it("organizes the raw directory into five recognizable outcomes", () => {
    for (const homeSlug of [null, "frederick"]) {
      const sections = buildCompassSections(homeSlug);
      const outcomes = buildCompassOutcomes(sections);
      const representedSections = outcomes.flatMap((outcome) =>
        outcome.sections.map((section) => section.id),
      );

      expect(outcomes).toHaveLength(5);
      expect(outcomes.map((outcome) => outcome.label)).toEqual([
        "Eat, drink, or go out",
        "Explore Frederick",
        "Get around",
        "Find local help",
        "Make Radius yours",
      ]);
      expect(representedSections.sort()).toEqual(
        sections.map((section) => section.id).sort(),
      );
      expect(new Set(representedSections).size).toBe(sections.length);
    }
  });

  it("keeps every registered tool discoverable exactly once", () => {
    const represented = representedRegistryIds(null);
    const expected = RADIUS_TOOLS.map((tool) => tool.id);

    expect(represented.sort()).toEqual([...expected].sort());
    expect(new Set(represented).size).toBe(expected.length);
  });

  it("provides an explicit all-tools directory with a visible total and group counts", () => {
    const directory = buildAllToolsDirectory(buildCompassSections(null));
    const directoryIds = directory.sections.flatMap((section) =>
      section.items.map((item) => item.id)
    );

    expect(directory.id).toBe(ALL_COMPASS_TOOLS_ID);
    expect(directory.label).toBe("All tools");
    expect(directory.total).toBe(directoryIds.length);
    expect(directory.total).toBeGreaterThanOrEqual(RADIUS_TOOLS.length);
    expect(directory.sections.map((section) => section.id)).toEqual(
      RADIUS_TOOL_GROUPS.map((group) => group.id),
    );

    for (const group of RADIUS_TOOL_GROUPS) {
      const directoryGroup = directory.sections.find((section) => section.id === group.id);
      expect(directoryGroup, `missing directory group ${group.id}`).toBeDefined();
      expect(
        directoryGroup!.items.map((item) => item.id),
        `incomplete directory group ${group.id}`,
      ).toEqual(expect.arrayContaining(group.tools.map((tool) => tool.id)));
    }
  });

  it("finds every registered tool by its own label", () => {
    const sections = buildCompassSections(null);

    for (const tool of RADIUS_TOOLS) {
      const matchedIds = searchCompassSections(sections, tool.label)
        .flatMap((section) => section.items.map((item) => item.id));
      expect(matchedIds, `Compass search did not find ${tool.id}`).toContain(tool.id);
    }
  });

  it("includes the road camera wall in Compass and the app-page registry", () => {
    const represented = new Set(representedRegistryIds(null));
    const cameraPage = APP_PAGES.find((page) => page.href === "/cameras");

    expect(represented).toContain("road-cameras");
    expect(cameraPage?.title).toBe("Frederick road cameras");
    expect(
      searchCompassSections(buildCompassSections(null), "traffic cameras")
        .flatMap((section) => section.items.map((item) => item.id)),
    ).toContain("road-cameras");
  });

  it("represents every searchable app page in the complete Compass model", () => {
    const sections = buildCompassSections(null);
    const compassPaths = new Set(
      [...sections.flatMap((section) => section.items), ...commonCompassTasks(sections)]
        .map((item) => new URL(item.href, "https://frederickradius.app").pathname),
    );

    for (const page of APP_PAGES) {
      const pathname = new URL(page.href, "https://frederickradius.app").pathname;
      expect(compassPaths, `APP_PAGES destination missing from Compass: ${pathname}`)
        .toContain(pathname);
    }
  });

  it("keeps every registered tool destination in global page search", () => {
    const appPagePaths = new Set(
      APP_PAGES.map((page) =>
        new URL(page.href, "https://frederickradius.app").pathname
      ),
    );

    for (const tool of RADIUS_TOOLS) {
      const pathname = new URL(tool.href, "https://frederickradius.app").pathname;
      expect(appPagePaths, `registered tool missing from APP_PAGES: ${pathname}`)
        .toContain(pathname);
    }
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
