import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_PAGES } from "@/data/app-pages";
import { RADIUS_TOOLS } from "@/data/radius-tools";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";
import {
  DEFAULT_TOOL_DECK_PIN_IDS,
  TOOL_DECK_GROUP_DEFINITIONS,
} from "./toolDeckModel";
import {
  ALL_COMPASS_TOOLS_ID,
  buildToolDeckDirectory,
  buildToolDeckGroups,
  compassShortcutGridClass,
  commonCompassTasks,
  searchToolDeckGroups,
} from "./CompassHub";

type ToolDeckGroups = ReturnType<typeof buildToolDeckGroups>;
type ToolDeckItem = ToolDeckGroups[number]["items"][number];

const ASK_RADIUS_ID = "ask-radius";
const TIME_MACHINE_ID = "time-machine";

function flattenTools(groups: ToolDeckGroups): ToolDeckItem[] {
  return groups.flatMap((group) => group.items);
}

function occurrences(ids: readonly string[], target: string): number {
  return ids.filter((id) => id === target).length;
}

function pathname(href: string): string {
  return new URL(href, "https://frederickradius.app").pathname;
}

describe("Compass Tool Deck model", () => {
  it("sizes the shortcut grid to the number of pinned tools", () => {
    expect(compassShortcutGridClass(1)).toContain("grid-cols-1");
    expect(compassShortcutGridClass(2)).toContain("grid-cols-2");
    expect(compassShortcutGridClass(3)).toContain("grid-cols-3");
    expect(compassShortcutGridClass(4)).toContain("grid-cols-4");
    expect(compassShortcutGridClass(8)).toContain("grid-cols-4");
  });

  it("resolves the nine model groups in their stable order", () => {
    const groups = buildToolDeckGroups(null);
    const modeledIds = new Set<string>(
      TOOL_DECK_GROUP_DEFINITIONS.flatMap((group) => group.toolIds),
    );
    const unassignedRegistryIds = RADIUS_TOOLS
      .filter((tool) => !modeledIds.has(tool.id))
      .map((tool) => tool.id);

    expect(groups.map((group) => group.id)).toEqual(
      TOOL_DECK_GROUP_DEFINITIONS.map((group) => group.id),
    );

    for (const definition of TOOL_DECK_GROUP_DEFINITIONS) {
      const group = groups.find((candidate) => candidate.id === definition.id);
      const expectedIds = [
        ...definition.toolIds,
        ...(definition.id === "stories" &&
        CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED
          ? [TIME_MACHINE_ID]
          : []),
        ...(definition.id === "community" ? unassignedRegistryIds : []),
      ];

      expect(group, `missing Tool Deck group ${definition.id}`).toBeDefined();
      expect(
        group!.items.map((item) => item.id),
        `Tool Deck group ${definition.id} drifted from its model`,
      ).toEqual(expectedIds);
    }
  });

  it("keeps every registered tool reachable exactly once", () => {
    const ids = flattenTools(buildToolDeckGroups(null)).map((item) => item.id);

    for (const tool of RADIUS_TOOLS) {
      expect(
        occurrences(ids, tool.id),
        `${tool.id} should appear exactly once in Compass`,
      ).toBe(1);
    }
  });

  it("keeps Ask Radius as the sole non-registry tool in the base deck", () => {
    const registryIds = new Set(RADIUS_TOOLS.map((tool) => tool.id));
    const deckIds = flattenTools(buildToolDeckGroups(null)).map(
      (item) => item.id,
    );
    const baseExtras = deckIds.filter((id) => !registryIds.has(id));

    expect(registryIds.has(ASK_RADIUS_ID)).toBe(false);
    expect(baseExtras).toEqual([ASK_RADIUS_ID]);
    expect(occurrences(deckIds, ASK_RADIUS_ID)).toBe(1);
    expect(deckIds).toHaveLength(RADIUS_TOOLS.length + 1);
    expect(new Set(deckIds).size).toBe(deckIds.length);
  });

  it("does not let a selected home town inflate the base tool count", () => {
    const withoutHome = buildToolDeckDirectory(buildToolDeckGroups(null));
    const withHome = buildToolDeckDirectory(
      buildToolDeckGroups("frederick"),
    );

    expect(withHome.total).toBe(withoutHome.total);
    expect(flattenTools(withHome.groups)).toHaveLength(
      flattenTools(withoutHome.groups).length,
    );
  });

  it("builds the complete directory and default tool belt from one model", () => {
    const groups = buildToolDeckGroups(null);
    const directory = buildToolDeckDirectory(groups);
    const tasks = commonCompassTasks(groups);

    expect(directory.id).toBe(ALL_COMPASS_TOOLS_ID);
    expect(directory.label).toBe("All tools");
    expect(directory.groups).toEqual(groups);
    expect(directory.total).toBe(flattenTools(groups).length);
    expect(tasks.map((item) => item.id)).toEqual(
      DEFAULT_TOOL_DECK_PIN_IDS,
    );
    expect(
      tasks.every((item) =>
        flattenTools(groups).some((tool) => tool.id === item.id),
      ),
    ).toBe(true);
  });

  it("finds every visible tool by its own label, including Ask Radius", () => {
    const groups = buildToolDeckGroups(null);

    for (const tool of flattenTools(groups)) {
      const matchedIds = flattenTools(
        searchToolDeckGroups(groups, tool.label),
      ).map((item) => item.id);

      expect(
        matchedIds,
        `Compass search did not find ${tool.id} from label "${tool.label}"`,
      ).toContain(tool.id);
    }
  });

  it("represents every searchable app page in the flattened Tool Deck", () => {
    const compassPaths = new Set(
      flattenTools(buildToolDeckGroups(null)).map((item) =>
        pathname(item.href),
      ),
    );

    for (const page of APP_PAGES) {
      expect(
        compassPaths,
        `APP_PAGES destination missing from Compass: ${pathname(page.href)}`,
      ).toContain(pathname(page.href));
    }
  });

  it("keeps every registered tool destination in global page search", () => {
    const appPagePaths = new Set(
      APP_PAGES.map((page) => pathname(page.href)),
    );

    for (const tool of RADIUS_TOOLS) {
      expect(
        appPagePaths,
        `registered tool missing from APP_PAGES: ${pathname(tool.href)}`,
      ).toContain(pathname(tool.href));
    }
  });
});

describe("Compass feature gates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    { flag: "false", expectedCount: 0 },
    { flag: "true", expectedCount: 1 },
  ])(
    "renders Time Machine $expectedCount time(s) when the license flag is $flag",
    async ({ flag, expectedCount }) => {
      vi.stubEnv(
        "NEXT_PUBLIC_CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED",
        flag,
      );
      vi.resetModules();

      const { buildToolDeckGroups: buildGroups } = await import(
        "./CompassHub"
      );
      const ids = buildGroups(null).flatMap((group) =>
        group.items.map((item) => item.id),
      );

      expect(occurrences(ids, TIME_MACHINE_ID)).toBe(expectedCount);
    },
  );
});
