import { beforeEach, describe, expect, it, vi } from "vitest";

const unified = vi.hoisted(() => ({
  current: {
    publicEvents: [] as Array<{ starts_at: string }>,
    sourceHealth: {
      degraded: false,
      unavailable: [] as string[],
    },
  },
}));

vi.mock("@/lib/loaders/unifiedEvents", () => ({
  assembleUnifiedEvents: vi.fn(async () => unified.current),
}));

vi.mock("@/lib/eventWhenLabel", () => ({
  isEventToday: vi.fn(() => true),
}));

import { eventsTripwire } from "./tripwires";

describe("eventsTripwire", () => {
  beforeEach(() => {
    unified.current = {
      publicEvents: [],
      sourceHealth: { degraded: false, unavailable: [] },
    };
  });

  it("goes red for broad source degradation even when one fallback event remains", async () => {
    unified.current = {
      publicEvents: [{ starts_at: "2026-07-26T18:00:00.000Z" }],
      sourceHealth: {
        degraded: true,
        unavailable: ["county", "Visit Frederick"],
      },
    };

    const anomalies = await eventsTripwire(
      new Date("2026-07-26T16:00:00.000Z"),
    );

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].kind).toBe("events_sources_degraded");
    expect(
      anomalies.some((anomaly) => anomaly.kind === "events_empty"),
    ).toBe(false);
  });

  it("keeps availability and content checks independent", async () => {
    unified.current = {
      publicEvents: [],
      sourceHealth: {
        degraded: true,
        unavailable: ["county", "Visit Frederick"],
      },
    };

    const anomalies = await eventsTripwire(
      new Date("2026-07-26T16:00:00.000Z"),
    );

    expect(anomalies.map((anomaly) => anomaly.kind)).toEqual([
      "events_empty",
      "events_sources_degraded",
    ]);
  });
});
