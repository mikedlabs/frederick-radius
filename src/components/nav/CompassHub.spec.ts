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
  COMPASS_INTENT_DEFINITIONS,
  buildToolDeckDirectory,
  buildToolDeckGroups,
  compassShortcutGridClass,
  commonCompassTasks,
  compassStatusItems,
  compassTown,
  compassMatchSummary,
  compassToolMatches,
  groundedCompassSuggestion,
  liveLineForIntent,
  liveSuggestionForDeck,
  searchToolDeckGroups,
  type CompassStatusItem,
  type CompassTown,
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
    expect(source).toContain('aria-label="Clear tool filter"');
  });

  it("names the page All tools in Public Sans and labels its field as a tool filter", () => {
    const source = readFileSync("src/components/nav/CompassHub.tsx", "utf8");
    const header = source.slice(
      source.indexOf('<h1 className="font-sans'),
      source.indexOf("</label>"),
    );

    expect(header).toContain("{PRODUCT_NAMES.allTools.pageTitle}");
    expect(header).not.toContain("font-editorial");
    expect(header).toContain('<span className="sr-only">Filter tools</span>');
    // The COMPASS eyebrow and the editorial question are gone.
    expect(source).not.toMatch(/>\s*Compass\s*<\/p>/);
    expect(source).not.toContain("What do you need?");
  });

  it("hands the typed words to the one Find overlay instead of offering request cards", () => {
    const source = readFileSync("src/components/nav/CompassHub.tsx", "utf8");

    expect(source).toContain('requestFind("global", query)');
    expect(source).not.toContain("Ask Radius about this");
    expect(source).not.toContain("function CompassSearchActions");
    expect(source.match(/Search Frederick for “/g)).toHaveLength(1);
  });
});

describe("Compass tool-filter count", () => {
  const item = (id: string) => ({ id });

  it("leaves the generic search entry out of the match count", () => {
    const matches = compassToolMatches([item("search"), item("parking"), item("restrooms")]);
    expect(matches.map((match) => match.id)).toEqual(["parking", "restrooms"]);
    expect(compassMatchSummary("park", matches.length)).toBe("2 tools match “park”");
    expect(compassMatchSummary("parking", 1)).toBe("1 tool matches “parking”");
  });

  it("states no count when nothing matches", () => {
    const matches = compassToolMatches([item("search")]);
    expect(matches).toHaveLength(0);
    const summary = compassMatchSummary("coffee", matches.length);
    expect(summary).toBe("No tools match “coffee.”");
    expect(summary).not.toMatch(/\d/);
  });

  it("leads with resident intents and keeps the complete index behind one explicit action", () => {
    const source = readFileSync("src/components/nav/CompassHub.tsx", "utf8");

    expect(COMPASS_INTENT_DEFINITIONS.map((intent) => intent.label)).toEqual([
      "Eat, drink & go out",
      "Get around",
      "Essentials & local help",
      "Explore & save",
    ]);
    expect(source.indexOf("<CompassIntentBoard")).toBeLessThan(
      source.indexOf("<PinnedTools"),
    );
    expect(source).toContain("Browse the full tool index");
    expect(source).not.toContain("tools, organized by category");
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
    expect(RADIUS_TOOLS).toHaveLength(64);
    expect(directory.total).toBe(
      65 + (CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED ? 1 : 0),
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

  it("makes no live claim on a card whose groups hold no live tools", () => {
    // "Explore & save" (stories, yours) used to advertise headlines and river
    // gauges whose destinations live on OTHER cards, so the promise "6 local
    // headlines" led to a card with no headlines on it. A card's live line
    // may only speak for destinations the card contains; this one contains
    // none, so it stays silent even when those feeds are healthy.
    expect(
      liveLineForIntent("explore-yours", [
        key("news", "6", "local headlines"),
        key("water", "9", "gauges reporting"),
      ]),
    ).toBeNull();
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

  it("keeps quiet zero states off direction cards", () => {
    expect(
      liveLineForIntent("get-around", [
        key("buses", "None", "running"),
      ]),
    ).toBeNull();
    expect(
      liveLineForIntent("get-around", [
        key("buses", "0", "buses moving"),
        key("traffic", "12 min", "I-70 to the county line"),
      ]),
    ).toBe("12 min · I-70 to the county line");
  });
});

describe("Compass live suggestion", () => {
  const key = (id: string, value: string, label: string, status = "ok") => ({
    id,
    status,
    faces: [{ value, label }],
  });
  const crash = (
    id: string,
    towns?: string[],
  ): CompassStatusItem => ({
    id,
    family: "roads",
    severity: "advisory",
    title: "Crash on US 15 North",
    href: "/pulse?open=traffic",
    ...(towns ? { towns } : {}),
  });
  const thurmont: CompassTown = { slug: "thurmont", name: "Thurmont" };

  it("does not call one county-wide road incident a reason to interrupt", () => {
    // Oct 6, 11:03 PM: Compass showed "Needs attention" with a Sparkles
    // glyph for a single MDOT incident on the other side of the county.
    expect(liveSuggestionForDeck([], 12, [crash("a", ["frederick"])], thurmont)).toBeNull();
    expect(liveSuggestionForDeck([], 12, [crash("a"), crash("b")], null)).toBeNull();
  });

  it("interrupts for three or more road incidents with a route glyph", () => {
    expect(
      liveSuggestionForDeck([], 12, [crash("a"), crash("b"), crash("c")], null),
    ).toEqual({
      itemId: "county-pulse",
      label: "Road incidents",
      href: "/pulse?open=traffic",
      reason: "MDOT is reporting 3 road incidents in Frederick County.",
      eyebrow: "Needs attention",
      icon: "route",
    });
  });

  it("interrupts for one incident on a road through the chosen town", () => {
    expect(
      liveSuggestionForDeck([], 12, [crash("a", ["frederick"]), crash("b", ["thurmont"])], thurmont),
    ).toMatchObject({
      label: "Crash on US 15 North",
      reason: "MDOT is reporting this on a road through Thurmont.",
      eyebrow: "Needs attention",
      icon: "route",
    });
  });

  it("names the condition itself and opens its own detail", () => {
    expect(
      liveSuggestionForDeck(
        [key("buses", "12", "buses moving")],
        8,
        [
          crash("a"),
          {
            id: "firstenergy:outage",
            family: "power",
            severity: "urgent",
            title: "1,204 customers without power",
            href: "/pulse?open=power",
          },
        ],
        null,
      ),
    ).toEqual({
      itemId: "county-pulse",
      label: "1,204 customers without power",
      href: "/pulse?open=power",
      reason: "Potomac Edison is reporting this outage in the county.",
      eyebrow: "Needs attention",
      icon: "alert",
    });
  });

  it("puts an urgent item ahead of an advisory one", () => {
    expect(
      liveSuggestionForDeck([], 12, [
        { id: "fcps", family: "schools", severity: "advisory", title: "FCPS delayed opening", href: "/pulse?open=schools" },
        { id: "fire", family: "fire-rescue", severity: "urgent", title: "Structure Fire", href: "/pulse?open=safety" },
      ]),
    ).toMatchObject({ label: "Structure Fire", icon: "alert" });
  });

  it("leaves an advisory civic notice or air reading on Live conditions", () => {
    expect(
      liveSuggestionForDeck([], 12, [
        { id: "civic", family: "civic", severity: "advisory", title: "County offices closed Monday", href: "/pulse?open=alerts" },
        { id: "air", family: "air", severity: "advisory", title: "Air quality is unhealthy for sensitive groups", href: "/pulse?open=air" },
      ]),
    ).toBeNull();
  });

  it("offers commute-hour transit with a transit glyph when nothing needs attention", () => {
    expect(
      liveSuggestionForDeck([key("buses", "12", "buses moving")], 8, [crash("a")]),
    ).toMatchObject({ itemId: "transit", eyebrow: "Moving now", icon: "transit" });
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

  it("no longer interrupts from a deck reading the county status did not grade", () => {
    expect(
      liveSuggestionForDeck(
        [key("traffic", "4", "incidents"), key("power", "1,204", "customers out")],
        12,
      ),
    ).toBeNull();
  });
});

describe("Compass county status report", () => {
  const NOW = Date.parse("2026-10-07T03:05:00.000Z");
  const item = {
    id: "mdot-chart:1",
    family: "roads",
    severity: "advisory",
    title: "Crash on US 15 North",
    href: "/pulse?open=traffic",
    towns: ["frederick"],
  };

  it("reads the graded rows from a current report", () => {
    expect(
      compassStatusItems({ lastUpdated: "2026-10-07T03:03:00.000Z", items: [item] }, NOW),
    ).toEqual([item]);
  });

  it("makes no claim from a stale, malformed or off-site report", () => {
    expect(
      compassStatusItems({ lastUpdated: "2026-10-07T02:30:00.000Z", items: [item] }, NOW),
    ).toEqual([]);
    expect(compassStatusItems({ items: [item] }, NOW)).toEqual([]);
    expect(compassStatusItems(null, NOW)).toEqual([]);
    expect(
      compassStatusItems(
        {
          lastUpdated: "2026-10-07T03:03:00.000Z",
          items: [
            { ...item, href: "https://example.com/" },
            { ...item, href: "//example.com/" },
            { ...item, severity: "severe" },
            { ...item, family: "rumor" },
            { ...item, title: " " },
          ],
        },
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("Compass chosen town", () => {
  it("prefers the header town, honors Whole county, and falls back to home", () => {
    expect(compassTown("town:brunswick", "thurmont")).toEqual({ slug: "brunswick", name: "Brunswick" });
    expect(compassTown("county", "thurmont")).toBeNull();
    expect(compassTown("nearme", "thurmont")).toEqual({ slug: "thurmont", name: "Thurmont" });
    expect(compassTown(null, null)).toBeNull();
    expect(compassTown(null, "atlantis")).toBeNull();
  });
});

describe("Compass grounded suggestion", () => {
  const key = (id: string, value: string, label: string, status = "ok") => ({
    id,
    status,
    faces: [{ value, label }],
  });

  it("uses a verified live event count with a calendar glyph instead of a daypart guess", () => {
    expect(
      groundedCompassSuggestion([key("events", "4", "on today")], 14),
    ).toMatchObject({
      itemId: "events",
      href: "/events?when=today",
      reason: "4 events are still on today.",
      eyebrow: "On today",
      icon: "calendar",
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
        [key("events", "4", "on today")],
        14,
        [
          {
            id: "nws:1",
            family: "weather",
            severity: "urgent",
            title: "Severe Thunderstorm Warning",
            href: "/pulse?open=alerts",
          },
        ],
      ),
    ).toMatchObject({
      itemId: "county-pulse",
      label: "Severe Thunderstorm Warning",
      href: "/pulse?open=alerts",
      eyebrow: "Needs attention",
      icon: "alert",
    });
  });
});

describe("Compass suggestion glyph", () => {
  it("never draws Sparkles on the live suggestion card", () => {
    const source = readFileSync("src/components/nav/CompassHub.tsx", "utf8");
    const card = source.slice(
      source.indexOf("function ContextualToolSuggestion"),
      source.indexOf("function RecentTools"),
    );
    expect(card).not.toContain("Sparkles");
    expect(source).toMatch(/route: Route,\s+calendar: CalendarDays/);
  });
});
