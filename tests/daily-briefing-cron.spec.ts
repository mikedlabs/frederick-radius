import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Cron = {
  path: string;
  schedule: string;
};

describe("daily briefing cron", () => {
  it("runs after the minute-zero event cache warm-up", () => {
    const config = JSON.parse(
      readFileSync("vercel.json", "utf8"),
    ) as { crons: Cron[] };
    const schedules = new Map(
      config.crons.map((cron) => [cron.path, cron.schedule]),
    );

    expect(schedules.get("/api/cron/warm-events"))
      .toBe("*/15 * * * *");
    expect(schedules.get("/api/cron/daily-briefing"))
      .toBe("3 12,13 * * *");
  });
});
