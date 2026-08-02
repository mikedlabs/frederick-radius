import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  FIRECRAWL_SOURCES,
  SOURCE_INTELLIGENCE_SCHEDULES,
  TAVILY_PROFILES,
  resolveSourceIntelligenceSelection,
} = require("../scripts/lib/source-intelligence-schedule.cjs") as {
  FIRECRAWL_SOURCES: Set<string>;
  SOURCE_INTELLIGENCE_SCHEDULES: Record<
    string,
    { tool: string; profile?: string; source?: string }
  >;
  TAVILY_PROFILES: Set<string>;
  resolveSourceIntelligenceSelection: (input: Record<string, unknown>) => {
    mode: string;
    tool: string;
    profile: string;
    source: string;
    live: boolean;
    initializeState: boolean;
  };
};

type ScoutConfig = {
  profiles: Array<{ id: string; enabled: boolean }>;
};

type WatchConfig = {
  sources: Array<{ id: string }>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

describe("Source Intelligence scheduled selection", () => {
  it("maps every audited cron to one reviewed Tavily profile", () => {
    expect(SOURCE_INTELLIGENCE_SCHEDULES).toEqual({
      "11 14 2,16 * *": {
        tool: "tavily-scout",
        profile: "official-civic-mdot",
      },
      "21 14 5,19 * *": {
        tool: "tavily-scout",
        profile: "official-new-events",
      },
      "31 14 8,22 * *": {
        tool: "tavily-scout",
        profile: "food-truck-schedules",
      },
      "41 14 11 * *": {
        tool: "tavily-scout",
        profile: "menus-reservations-accessibility",
      },
      "51 14 25 * *": {
        tool: "tavily-scout",
        profile: "unresolved-source-recovery",
      },
    });

    const scout = readJson<ScoutConfig>("config/source-scout.json");
    const watch = readJson<WatchConfig>("config/source-watch.json");
    const profiles = new Set(
      scout.profiles.filter(({ enabled }) => enabled).map(({ id }) => id),
    );
    const sources = new Set(watch.sources.map(({ id }) => id));
    expect(TAVILY_PROFILES).toEqual(profiles);
    expect(FIRECRAWL_SOURCES).toEqual(sources);
    for (const [cron, target] of Object.entries(
      SOURCE_INTELLIGENCE_SCHEDULES,
    )) {
      const selection = resolveSourceIntelligenceSelection({
        eventName: "schedule",
        eventSchedule: cron,
        confirmLive: false,
        initializeState: true,
      });
      expect(selection).toMatchObject({
        mode: "schedule",
        tool: "tavily-scout",
        live: true,
        initializeState: false,
      });
      expect(target.tool).toBe("tavily-scout");
      expect(profiles.has(selection.profile)).toBe(true);
      expect(selection.profile).not.toBe("provider-smoke");
      expect(selection.source).toBe("");
    }
  });

  it("fails closed for a missing, unknown, or inherited-property cron", () => {
    for (const eventSchedule of ["", "0 0 * * *", "13 13 * * 1", "__proto__"]) {
      expect(() =>
        resolveSourceIntelligenceSelection({
          eventName: "schedule",
          eventSchedule,
        }),
      ).toThrow(/cron|schedule/i);
    }
  });

  it("preserves manual plans and requires confirmation before manual live work", () => {
    expect(
      resolveSourceIntelligenceSelection({
        eventName: "workflow_dispatch",
        tool: "tavily-plan",
        profile: "provider-smoke",
        confirmLive: true,
        initializeState: true,
      }),
    ).toMatchObject({
      mode: "manual",
      tool: "tavily-plan",
      profile: "provider-smoke",
      live: false,
      initializeState: false,
    });

    expect(
      resolveSourceIntelligenceSelection({
        eventName: "workflow_dispatch",
        tool: "firecrawl-watch",
        source: "county-connector-schedules",
        confirmLive: "true",
        initializeState: "false",
      }),
    ).toMatchObject({
      mode: "manual",
      tool: "firecrawl-watch",
      source: "county-connector-schedules",
      live: true,
      initializeState: false,
    });

    expect(
      resolveSourceIntelligenceSelection({
        eventName: "workflow_dispatch",
        tool: "tavily-scout",
        profile: "official-new-events",
        confirmLive: "true",
        initializeState: "true",
      }),
    ).toMatchObject({ live: true, initializeState: true });
  });

  it("rejects unreviewed manual targets and unsupported events", () => {
    expect(() =>
      resolveSourceIntelligenceSelection({
        eventName: "workflow_dispatch",
        tool: "tavily-scout",
        profile: "arbitrary-profile",
        confirmLive: true,
      }),
    ).toThrow(/profile/i);
    expect(() =>
      resolveSourceIntelligenceSelection({
        eventName: "workflow_dispatch",
        tool: "firecrawl-watch",
        source: "arbitrary-page",
        confirmLive: true,
      }),
    ).toThrow(/source/i);
    expect(() =>
      resolveSourceIntelligenceSelection({ eventName: "push" }),
    ).toThrow(/unsupported/i);
  });
});
