import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  activationFlagNames,
  classifyDataTools,
  renderDataToolStatus,
} from "../scripts/lib/data-tool-status";

const schedules = new Map([
  ["/api/cron/hours-refresh", "0 8 * * *"],
  ["/api/cron/business-status", "0 7 * * *"],
]);

describe("data-tool activation status", () => {
  it("labels Firecrawl Source Watch as manual while its schedule is deferred", () => {
    const status = classifyDataTools(
      { FIRECRAWL_API_KEY: "configured" },
      schedules,
    ).find((tool) => tool.id === "firecrawl-source-watch");
    expect(status).toMatchObject({
      label: "Firecrawl source watch",
      note: "manual only; weekly schedule deferred until county-connector-schedules has an unchanged repeat after baseline run 30734393491 attempt 2",
      scope: "operator",
      status: "active",
    });
    expect(renderDataToolStatus(status ? [status] : [])).toContain(
      "weekly schedule deferred until county-connector-schedules has an unchanged repeat after baseline run 30734393491 attempt 2",
    );
  });

  it("reports the scheduled Apify radar instead of the retired venue pilot", () => {
    const statuses = classifyDataTools(
      { APIFY_TOKEN: "configured" },
      schedules,
    );
    expect(
      statuses.find((tool) => tool.id === "apify-source-change-radar"),
    ).toMatchObject({
      label: "Apify source change radar",
      scope: "operator",
      status: "active",
    });
    expect(statuses.some((tool) => tool.id === "apify-venue-pilot")).toBe(
      false,
    );
  });

  it("reports native menus as manual review intake rather than a live scraper", () => {
    const inactive = classifyDataTools({}, schedules).find(
      (tool) => tool.id === "native-menu-review",
    );
    expect(inactive).toMatchObject({
      status: "missing_configuration",
      scope: "operator",
      missing: ["one of DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL"],
    });

    const active = classifyDataTools(
      { DATABASE_URL: "configured" },
      schedules,
    ).find((tool) => tool.id === "native-menu-review");
    expect(active).toMatchObject({
      label: "Native menu review intake",
      note: "manual, restaurant-authorized intake; stages draft/unverified records and has no publication command",
      status: "active",
    });
  });

  it("distinguishes a disabled job from an enabled job missing requirements", () => {
    const disabled = classifyDataTools({}, schedules).find(
      (tool) => tool.id === "hours-refresh",
    );
    expect(disabled).toMatchObject({ status: "disabled", missing: [] });

    const incomplete = classifyDataTools(
      { HOURS_REFRESH_CRON: "1", CRON_SECRET: "configured" },
      schedules,
    ).find((tool) => tool.id === "hours-refresh");
    expect(incomplete).toMatchObject({
      status: "missing_configuration",
      missing: [
        "one of DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL",
        "GOOGLE_PLACES_API_KEY",
      ],
    });
  });

  it("marks a fully configured scheduled job active", () => {
    const status = classifyDataTools(
      {
        HOURS_REFRESH_CRON: "1",
        CRON_SECRET: "configured",
        DATABASE_URL: "configured",
        GOOGLE_PLACES_API_KEY: "configured",
      },
      schedules,
    ).find((tool) => tool.id === "hours-refresh");

    expect(status).toMatchObject({
      status: "active",
      schedule: "0 8 * * *",
      missing: [],
    });
  });

  it("reports the paid business-status cron and its explicit spend gate", () => {
    const disabled = classifyDataTools({}, schedules).find(
      (tool) => tool.id === "business-status",
    );
    expect(disabled).toMatchObject({
      status: "disabled",
      gate: "BUSINESS_STATUS_CRON",
      schedule: "0 7 * * *",
      missing: [],
    });

    const active = classifyDataTools(
      {
        BUSINESS_STATUS_CRON: "1",
        CRON_SECRET: "configured",
        GOOGLE_PLACES_API_KEY: "configured",
      },
      schedules,
    ).find((tool) => tool.id === "business-status");
    expect(active).toMatchObject({
      status: "active",
      schedule: "0 7 * * *",
      missing: [],
    });
  });

  it("treats missing Vercel schedule wiring as missing configuration", () => {
    const status = classifyDataTools(
      {
        HOURS_REFRESH_CRON: "1",
        CRON_SECRET: "configured",
        DATABASE_URL: "configured",
        GOOGLE_PLACES_API_KEY: "configured",
      },
      new Map(),
    ).find((tool) => tool.id === "hours-refresh");

    expect(status).toMatchObject({
      status: "missing_configuration",
      missing: ["vercel.json:/api/cron/hours-refresh"],
    });
  });

  it("never includes environment values in the text report", () => {
    const secret = "never-print-this-secret-value";
    const report = renderDataToolStatus(
      classifyDataTools(
        {
          HOURS_REFRESH_CRON: "1",
          CRON_SECRET: secret,
          DATABASE_URL: secret,
        },
        schedules,
      ),
    );

    expect(report).not.toContain(secret);
    expect(report).toContain("GOOGLE_PLACES_API_KEY");
  });

  it("documents every supported activation flag in .env.example", () => {
    const envExample = readFileSync(
      resolve(process.cwd(), ".env.example"),
      "utf8",
    );
    for (const flag of activationFlagNames()) {
      expect(envExample, `${flag} must be documented`).toMatch(
        new RegExp(`^${flag}=`, "m"),
      );
    }
  });
});
