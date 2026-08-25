import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CRON_DELIVERY_BUDGET,
  auditCronDeliveryBudget,
  summarizeCronDeliveries,
} from "../scripts/cron-delivery-budget.mjs";

describe("Vercel cron delivery budget", () => {
  it("keeps the current schedule at or below the reviewed ceiling", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    const result = auditCronDeliveryBudget(config);
    expect(result.failures).toEqual([]);
    expect(result.summary.weekly).toBe(4_474);
    expect(result.summary.peakDay).toBe(640);
  });

  it("detects a new high-frequency schedule", () => {
    const crons = Array.from(
      { length: CRON_DELIVERY_BUDGET.definitions + 1 },
      (_, index) => ({ path: `/api/cron/test-${index}`, schedule: "* * * * *" }),
    );
    expect(auditCronDeliveryBudget({ crons }).failures.length).toBeGreaterThan(0);
  });

  it("handles weekly schedules instead of multiplying them as daily", () => {
    const summary = summarizeCronDeliveries([
      { path: "/weekly", schedule: "0 12 * * 1" },
      { path: "/daily", schedule: "0 12 * * *" },
    ]);
    expect(summary.weekly).toBe(8);
    expect(summary.byPath).toEqual([
      { path: "/daily", schedule: "0 12 * * *", weekly: 7 },
      { path: "/weekly", schedule: "0 12 * * 1", weekly: 1 },
    ]);
  });
});
