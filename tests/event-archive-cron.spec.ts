import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Cron = {
  path: string;
  schedule: string;
};

describe("durable event archive schedule", () => {
  it("keeps archive writes out of the frequent visitor-cache warm", () => {
    const config = JSON.parse(
      readFileSync("vercel.json", "utf8"),
    ) as { crons: Cron[] };
    const schedules = new Map(
      config.crons.map((cron) => [cron.path, cron.schedule]),
    );
    const warmRoute = readFileSync(
      "src/app/api/cron/warm-events/route.ts",
      "utf8",
    );

    expect(schedules.get("/api/cron/warm-events"))
      .toBe("*/15 * * * *");
    expect(schedules.get("/api/cron/event-archive"))
      .toBe("11 */2 * * *");
    expect(warmRoute).not.toContain("syncEventArchiveBatch");
  });
});
