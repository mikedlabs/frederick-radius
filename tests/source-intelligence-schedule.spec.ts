import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  assertScheduledFirecrawlBaseline,
  FIRECRAWL_SOURCES,
  SOURCE_INTELLIGENCE_SCHEDULES,
  TAVILY_PROFILES,
  resolveSourceIntelligenceSelection,
} = require("../scripts/lib/source-intelligence-schedule.cjs") as {
  assertScheduledFirecrawlBaseline: (input: Record<string, unknown>) => void;
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
  sources: Array<{ id: string; url: string }>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

describe("Source Intelligence scheduled selection", () => {
  it("maps every audited cron to one reviewed provider target", () => {
    expect(SOURCE_INTELLIGENCE_SCHEDULES).toEqual({
      "13 13 * * 1": {
        tool: "firecrawl-watch",
        source: "county-connector-schedules",
      },
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
        tool: target.tool,
        live: true,
        initializeState: false,
      });
      if (target.tool === "tavily-scout") {
        expect(profiles.has(selection.profile)).toBe(true);
        expect(selection.profile).not.toBe("provider-smoke");
        expect(selection.source).toBe("");
      } else {
        expect(sources.has(selection.source)).toBe(true);
        expect(selection.profile).toBe("");
      }
    }
  });

  it("fails closed for a missing, unknown, or inherited-property cron", () => {
    for (const eventSchedule of ["", "0 0 * * *", "__proto__"]) {
      expect(() =>
        resolveSourceIntelligenceSelection({
          eventName: "schedule",
          eventSchedule,
        }),
      ).toThrow(/cron|schedule/i);
    }
  });

  it("refuses a scheduled Firecrawl source without its exact reviewed baseline", () => {
    const config = readJson<WatchConfig>("config/source-watch.json");
    const source = "county-connector-schedules";
    const exactUrl = config.sources.find(({ id }) => id === source)?.url;
    const scheduled = {
      mode: "schedule",
      tool: "firecrawl-watch",
      source,
      config,
    };

    expect(() =>
      assertScheduledFirecrawlBaseline({
        ...scheduled,
        state: { observations: {} },
      }),
    ).toThrow(/baseline/i);
    expect(() =>
      assertScheduledFirecrawlBaseline({
        ...scheduled,
        state: {
          observations: {
            [source]: {
              url: "https://example.com/moved",
              contentHash: "a".repeat(64),
            },
          },
        },
      }),
    ).toThrow(/baseline/i);
    expect(() =>
      assertScheduledFirecrawlBaseline({
        ...scheduled,
        state: {
          observations: {
            [source]: { url: exactUrl, contentHash: "not-a-sha256" },
          },
        },
      }),
    ).toThrow(/baseline/i);
    expect(() =>
      assertScheduledFirecrawlBaseline({
        ...scheduled,
        state: {
          observations: {
            [source]: { url: exactUrl, contentHash: "a".repeat(64) },
          },
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertScheduledFirecrawlBaseline({
        mode: "manual",
        tool: "firecrawl-watch",
        source,
      }),
    ).not.toThrow();
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
        source: "weinberg-performances",
        confirmLive: false,
        initializeState: true,
      }),
    ).toMatchObject({ live: false, initializeState: false });

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
