import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Cron = {
  path: string;
  schedule: string;
};

describe("data-health cron phases", () => {
  it("keeps source probes inside the hourly ledger's three-hour evidence window", () => {
    const config = JSON.parse(
      readFileSync("vercel.json", "utf8"),
    ) as { crons: Cron[] };
    const schedules = new Map(
      config.crons.map((cron) => [cron.path, cron.schedule]),
    );

    expect(schedules.get("/api/cron/data-health-feeds"))
      .toBe("5 */2 * * *");
    expect(schedules.get("/api/cron/runtime-source-health"))
      .toBe("43 */2 * * *");
    // Retention is destructive maintenance, not a freshness prerequisite.
    // Its route remains available for a deliberate operator run after a
    // current backup is confirmed, but it must not consume a daily no-op cron
    // while DATA_RETENTION_PRUNE is disabled in Production.
    expect(schedules.has("/api/cron/data-health-retention")).toBe(false);
    expect(schedules.get("/api/cron/data-health"))
      .toBe("30 9 * * *");
  });
});
