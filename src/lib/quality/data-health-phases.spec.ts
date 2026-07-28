import { describe, expect, it } from "vitest";
import type { IngestRunSummary } from "@/lib/quality/db-health";
import {
  DATA_HEALTH_FEEDS_RUN,
  evaluateDataHealthPhase,
} from "./data-health-phases";

const NOW = new Date("2026-07-28T09:30:00.000Z");

function run(
  overrides: Partial<IngestRunSummary> = {},
): IngestRunSummary {
  return {
    source: DATA_HEALTH_FEEDS_RUN,
    status: "ok",
    startedAt: "2026-07-28T09:05:00.000Z",
    endedAt: "2026-07-28T09:05:15.000Z",
    recordsIn: 12,
    recordsUpserted: 12,
    recordsFailed: 0,
    error: null,
    stale: false,
    ...overrides,
  };
}

describe("evaluateDataHealthPhase", () => {
  it("accepts only a recent, completed, zero-failure heartbeat", () => {
    expect(
      evaluateDataHealthPhase(DATA_HEALTH_FEEDS_RUN, [run()], NOW),
    ).toMatchObject({
      green: true,
      anomaly: null,
    });
  });

  it("fails closed when the phase heartbeat is missing", () => {
    expect(
      evaluateDataHealthPhase(DATA_HEALTH_FEEDS_RUN, [], NOW),
    ).toMatchObject({
      green: false,
      anomaly: {
        source: DATA_HEALTH_FEEDS_RUN,
        kind: "tripwire_failed",
        detail: expect.stringContaining("No heartbeat"),
      },
    });
  });

  it("rejects stale, partial, and incomplete heartbeats", () => {
    expect(
      evaluateDataHealthPhase(
        DATA_HEALTH_FEEDS_RUN,
        [run({ startedAt: "2026-07-28T05:00:00.000Z" })],
        NOW,
      ).green,
    ).toBe(false);
    expect(
      evaluateDataHealthPhase(
        DATA_HEALTH_FEEDS_RUN,
        [run({ status: "partial" })],
        NOW,
      ).green,
    ).toBe(false);
    expect(
      evaluateDataHealthPhase(
        DATA_HEALTH_FEEDS_RUN,
        [run({ endedAt: null, status: "running" })],
        NOW,
      ).green,
    ).toBe(false);
  });

  it("keeps controlled feed-worker source names actionable", () => {
    const state = evaluateDataHealthPhase(
      DATA_HEALTH_FEEDS_RUN,
      [
        run({
          status: "partial",
          recordsFailed: 2,
          error:
            "Phase checks failed: snapshot-persist. Live sources failed: city-frederick.",
        }),
      ],
      NOW,
    );

    expect(state.anomaly?.detail).toContain("snapshot-persist");
    expect(state.anomaly?.detail).toContain("city-frederick");
  });

  it("never copies an arbitrary worker error into an alert", () => {
    const state = evaluateDataHealthPhase(
      DATA_HEALTH_FEEDS_RUN,
      [
        run({
          status: "error",
          recordsFailed: 1,
          error: "postgres://user:secret@example.invalid/database",
        }),
      ],
      NOW,
    );

    expect(state.anomaly?.detail).toContain("1 operation failed");
    expect(state.anomaly?.detail).not.toContain("user:secret");
    expect(state.anomaly?.detail).not.toContain("postgres://");
  });

  it("caps even a controlled phase diagnostic before delivery", () => {
    const sources = Array.from(
      { length: 40 },
      (_, index) => `source-${index}`,
    ).join(", ");
    const state = evaluateDataHealthPhase(
      DATA_HEALTH_FEEDS_RUN,
      [
        run({
          status: "partial",
          recordsFailed: 40,
          error: `Live sources failed: ${sources}.`,
        }),
      ],
      NOW,
    );

    expect(state.anomaly?.detail).toContain("source-0");
    expect(state.anomaly?.detail).toContain("…");
    expect(state.anomaly?.detail).not.toContain("source-39");
  });
});
