import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Cron = {
  path: string;
  schedule: string;
};

describe("data-health cron phases", () => {
  it("schedules bounded workers before the final reporter", () => {
    const config = JSON.parse(
      readFileSync("vercel.json", "utf8"),
    ) as { crons: Cron[] };
    const schedules = new Map(
      config.crons.map((cron) => [cron.path, cron.schedule]),
    );

    expect(schedules.get("/api/cron/data-health-feeds"))
      .toBe("5 9 * * *");
    expect(schedules.get("/api/cron/data-health-retention"))
      .toBe("10 9 * * *");
    expect(schedules.get("/api/cron/data-health"))
      .toBe("30 9 * * *");
  });
});
