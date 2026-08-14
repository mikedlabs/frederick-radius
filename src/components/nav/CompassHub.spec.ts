import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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
  groundedCompassSuggestion,
  liveLineForIntent,
  liveSuggestionForDeck,
  searchToolDeckGroups,
} from "./CompassHub";

type ToolDeckGroups = ReturnType<typeof buildToolDeckGroups>;
type ToolDeckItem = ToolDeckGroups[number]["items"][number];

const ASK_RADIUS_ID = "ask-radius";
const TIME_MACHINE_ID = "time-machine";

describe("Compass search control", () => {
  it("uses one explicit clear control instead of adding the browser's second X", () => {
    const source = readFileSync("src/components/nav/CompassHub.tsx", "utf8");
    expect(source).toContain('type="text"');
    expect(source).toContain('role="searchbox"');
    expect(source).toContain('aria-label="Clear tool search"');
  });
});

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
    expect(RADIUS_TOOLS).toHaveLength(63);
    expect(directory.total).toBe(
      64 + (CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED ? 1 : 0),
    );
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

  it("keeps every registered in-app tool destination in global page search", () => {
    const appPagePaths = new Set(
      APP_PAGES.map((page) => pathname(page.href)),
    );

    for (const tool of RADIUS_TOOLS) {
      // Off-app doors (external: true) open another site in a new tab; an
      // outside URL can never be an APP_PAGE and must not be forced into
      // the internal search index.
      if (tool.external) continue;
      expect(
        appPagePaths,
        `registered tool missing from APP_PAGES: ${pathname(tool.href)}`,
      ).toContain(pathname(tool.href));
    }
  });

  it("requires every off-app tool to name its outside source in the description", () => {
    for (const tool of RADIUS_TOOLS) {
      if (!tool.external) continue;
      expect(tool.href).toMatch(/^https:\/\//);
      // "on GasBuddy" style attribution: the hostname's brand must appear in
      // the door's description so the door never pretends the data is ours.
      const brand = new URL(tool.href).hostname.replace(/^www\./, "").split(".")[0];
      expect(tool.description.toLowerCase()).toContain(brand.toLowerCase());
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

describe("compass live lines", () => {
  const key = (id: string, value: string, label: string, status = "ok") => ({
    id,
    status,
    faces: [{ value, label }],
  });

  it("states the live fact for an intent from the county's own feeds", () => {
    expect(
      liveLineForIntent("get-around", [key("buses", "10", "buses moving")]),
    ).toBe("10 buses moving");
    expect(
      liveLineForIntent("local-help", [key("weather", "78°", "partly sunny")]),
    ).toBe("78° · partly sunny");
  });

  it("falls through the intent's priority order when the lead feed is down", () => {
    expect(
      liveLineForIntent("get-around", [
        key("buses", "10", "buses moving", "unavailable"),
        key("traffic", "17 min", "I-70 to the county line"),
      ]),
    ).toBe("17 min · I-70 to the county line");
  });

  it("puts an active road condition ahead of routine moving buses", () => {
    expect(
      liveLineForIntent("get-around", [
        key("buses", "10", "buses moving"),
        key("traffic", "2", "incidents"),
      ]),
    ).toBe("2 incidents");
  });

  it("puts a power outage ahead of a clear weather reading", () => {
    expect(
      liveLineForIntent("local-help", [
        key("weather", "Clear", "no alerts"),
        key("power", "78", "customers out"),
      ]),
    ).toBe("78 customers out");
  });

  it("uses the remaining deck feeds in the intent rows without inventing state", () => {
    expect(
      liveLineForIntent("explore-yours", [
        key("news", "6", "local headlines"),
        key("water", "9", "gauges reporting"),
      ]),
    ).toBe("6 local headlines");
  });

  it("stays silent rather than rendering a placeholder", () => {
    // A row with no live fact keeps its plain registry sentence. An honest
    // absence, never "—" or "loading".
    expect(liveLineForIntent("get-around", [])).toBeNull();
    expect(
      liveLineForIntent("get-around", [
        key("buses", "", "buses moving"),
      ]),
    ).toBeNull();
    expect(liveLineForIntent("explore-yours", [key("buses", "10", "buses moving")])).toBeNull();
  });
});

describe("Compass live suggestion", () => {
  const key = (id: string, value: string, label: string, status = "ok") => ({
    id,
    status,
    faces: [{ value, label }],
  });

  it("promotes an outage when weather is clear", () => {
    expect(
      liveSuggestionForDeck(
        [
          key("weather", "Clear", "no alerts"),
          key("power", "1,204", "customers out"),
        ],
        12,
      ),
    ).toMatchObject({
      itemId: "county-pulse",
      label: "Power outages",
      href: "/pulse?open=power",
      eyebrow: "Needs attention",
    });
  });

  it("keeps a small countywide outage visible without taking over the recommendation", () => {
    expect(
      liveSuggestionForDeck(
        [
          key("weather", "Clear", "no alerts"),
          key("power", "7", "customers out"),
        ],
        12,
      ),
    ).toBeNull();
  });

  it("promotes serious traffic over routine commute-hour buses", () => {
    expect(
      liveSuggestionForDeck(
        [
          key("buses", "12", "buses moving"),
          key("traffic", "3", "incidents"),
        ],
        8,
      ),
    ).toMatchObject({
      label: "Road incidents",
      href: "/pulse?open=traffic",
      eyebrow: "Needs attention",
    });
  });

  it("keeps routine readings out of the single recommendation slot", () => {
    expect(
      liveSuggestionForDeck(
        [
          key("weather", "Clear", "no alerts"),
          key("power", "All on", "no outages"),
          key("buses", "9", "buses moving"),
        ],
        12,
      ),
    ).toBeNull();
  });

  it("does not promote a number from a feed that is unavailable", () => {
    expect(
      liveSuggestionForDeck(
        [key("traffic", "4", "incidents", "unavailable")],
        8,
      ),
    ).toBeNull();
  });
});

describe("Compass grounded suggestion", () => {
  const key = (id: string, value: string, label: string, status = "ok") => ({
    id,
    status,
    faces: [{ value, label }],
  });

  it("uses a verified live event count instead of a daypart guess", () => {
    expect(
      groundedCompassSuggestion([key("events", "4", "on today")], 14),
    ).toMatchObject({
      itemId: "events",
      href: "/events?when=today",
      reason: "4 events are still on today.",
      eyebrow: "On today",
    });
  });

  it("stays silent when current event inventory is empty or unavailable", () => {
    expect(
      groundedCompassSuggestion([key("events", "None", "left today")], 14),
    ).toBeNull();
    expect(
      groundedCompassSuggestion(
        [key("events", "4", "on today", "unavailable")],
        19,
      ),
    ).toBeNull();
    expect(groundedCompassSuggestion([], 8)).toBeNull();
  });

  it("still lets a serious live condition outrank events", () => {
    expect(
      groundedCompassSuggestion(
        [
          key("events", "4", "on today"),
          key("weather", "1", "active alert"),
        ],
        14,
      ),
    ).toMatchObject({
      itemId: "county-pulse",
      label: "Weather alert",
      eyebrow: "Needs attention",
    });
  });
});
