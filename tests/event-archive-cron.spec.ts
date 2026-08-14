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
      .toBe("4,34 * * * *");
    expect(schedules.has("/api/cron/visit-frederick")).toBe(false);
    expect(warmRoute).not.toContain("syncEventArchiveBatch");
  });

  it("documents the complete Visit Frederick re-enable path while dormant", () => {
    const operatorSchedule = readFileSync(
      "docs/AGENTS_SCHEDULE.md",
      "utf8",
    );

    expect(operatorSchedule).toContain(
      "Setting `VISIT_FREDERICK_FACTS_REUSE_APPROVED=1` alone does not schedule",
    );
    expect(operatorSchedule).toContain(
      '`{ "path": "/api/cron/visit-frederick", "schedule": "40 9 * * *" }`',
    );
    expect(operatorSchedule).toContain(
      "`visit-frederick-snapshot` ingest run",
    );
  });
});
