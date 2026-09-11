import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyDataTools,
  DATA_TOOL_DEFINITIONS,
} from "../../../scripts/lib/data-tool-status";

function vercelSchedules(): Map<string, string> {
  const config = JSON.parse(
    readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"),
  ) as { crons?: Array<{ path?: string; schedule?: string }> };
  return new Map(
    (config.crons ?? []).flatMap((cron) =>
      cron.path && cron.schedule ? [[cron.path, cron.schedule] as const] : [],
    ),
  );
}

describe("data-tool activation inventory", () => {
  it("accounts for every scheduled Vercel route", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"),
    ) as { crons?: Array<{ path?: string }> };
    const scheduled = new Set(
      (config.crons ?? []).flatMap((cron) => cron.path ? [cron.path] : []),
    );
    const inventoried = new Set(
      DATA_TOOL_DEFINITIONS.flatMap((definition) =>
        definition.vercelPath ? [definition.vercelPath] : [],
      ),
    );

    expect([...scheduled].filter((path) => !inventoried.has(path))).toEqual([]);
    expect([...inventoried].filter((path) => !scheduled.has(path))).toEqual([]);
  });

  it("does not require the optional Firecrawl fallback for the native Visit Frederick refresh", () => {
    const statuses = classifyDataTools(
      {
        CRON_SECRET: "configured",
        DATABASE_URL: "configured",
        BLOB_READ_WRITE_TOKEN: "configured",
        VISIT_FREDERICK_FACTS_REUSE_APPROVED: "1",
      },
      vercelSchedules(),
    );

    expect(statuses.find((item) => item.id === "visit-frederick-refresh"))
      .toMatchObject({ status: "active", missing: [] });
    expect(statuses.find((item) => item.id === "visit-frederick-recovery"))
      .toMatchObject({
        status: "missing_configuration",
        missing: expect.arrayContaining([
          "FIRECRAWL_FETCH_FALLBACK=1",
          "FIRECRAWL_API_KEY",
        ]),
      });
  });

  it("keeps disabled operator routes out of the paid schedule", () => {
    const schedules = vercelSchedules();
    const dormant = [
      ["parking-alerts", "/api/cron/parking-alerts"],
      ["saved-reminders", "/api/cron/saved-reminders"],
      ["data-retention", "/api/cron/data-health-retention"],
      ["link-health", "/api/cron/link-health"],
      ["rain-tomorrow", "/api/cron/rain-tomorrow"],
      ["first-saturday", "/api/cron/first-saturday"],
      ["visit-frederick-refresh", "/api/cron/visit-frederick"],
    ] as const;
    for (const [, path] of dormant) expect(schedules.has(path)).toBe(false);

    const statuses = classifyDataTools({}, schedules);
    for (const [id] of dormant) {
      expect(statuses.find((item) => item.id === id))
        .toMatchObject({ status: "disabled", scope: "operator", missing: [] });
    }
  });

  it("reports semantic recall separately from the required full-text index", () => {
    const baseline = classifyDataTools(
      {
        CRON_SECRET: "configured",
        DATABASE_URL: "configured",
        RADIUS_SEARCH_CRON: "1",
      },
      vercelSchedules(),
    );

    expect(baseline.find((item) => item.id === "radius-search")).toMatchObject({
      status: "active",
      missing: [],
    });
    expect(
      baseline.find((item) => item.id === "radius-search-semantic"),
    ).toMatchObject({
      status: "disabled",
      missing: [],
    });

    const withSemantic = classifyDataTools(
      {
        RADIUS_SEARCH_SEMANTIC_ENABLED: "1",
        RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT: "100",
        OPENAI_API_KEY: "configured",
      },
      vercelSchedules(),
    );
    expect(
      withSemantic.find((item) => item.id === "radius-search-semantic"),
    ).toMatchObject({ status: "active", missing: [] });

    const incomplete = classifyDataTools(
      { RADIUS_SEARCH_SEMANTIC_ENABLED: "1" },
      vercelSchedules(),
    );
    expect(
      incomplete.find((item) => item.id === "radius-search-semantic"),
    ).toMatchObject({
      status: "missing_configuration",
      missing: [
        "OPENAI_API_KEY",
        "RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT",
      ],
    });
  });

  it("does not call a Google cron active from its key and cron switch alone", () => {
    const held = classifyDataTools(
      {
        CRON_SECRET: "configured",
        DATABASE_URL: "configured",
        HOURS_REFRESH_CRON: "1",
        GOOGLE_PLACES_API_KEY: "configured",
      },
      vercelSchedules(),
    );

    expect(held.find((item) => item.id === "hours-refresh")).toMatchObject({
      status: "missing_configuration",
      missing: expect.arrayContaining([
        "GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL=written-google-authorization-confirmed",
        "GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED=1",
      ]),
    });

    const authorized = classifyDataTools(
      {
        CRON_SECRET: "configured",
        DATABASE_URL: "configured",
        HOURS_REFRESH_CRON: "1",
        GOOGLE_PLACES_API_KEY: "configured",
        GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL:
          "written-google-authorization-confirmed",
        GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED: "1",
      },
      vercelSchedules(),
    );

    expect(authorized.find((item) => item.id === "hours-refresh"))
      .toMatchObject({ status: "active", missing: [] });
  });
});
