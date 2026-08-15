import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Cron = { path: string; schedule: string };

describe("Vercel cron cost guardrails", () => {
  it("keeps saved reminders gated without making the feature impossible to enable", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: Cron[];
    };
    const route = readFileSync(
      "src/app/api/cron/saved-reminders/route.ts",
      "utf8",
    );

    expect(route).toContain('process.env.SAVED_REMINDERS_ENABLED !== "1"');
    expect(config.crons).toContainEqual(
      expect.objectContaining({
        path: "/api/cron/saved-reminders",
        schedule: "*/10 * * * *",
      }),
    );
  });
});
