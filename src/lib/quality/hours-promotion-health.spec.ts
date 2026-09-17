import { describe, expect, it } from "vitest";
import {
  evaluateHoursPromotionHealth,
  HOURS_PROMOTION_MAX_LAG_HOURS,
} from "./hours-promotion-health";

const NOW = new Date("2026-08-22T12:00:00.000Z");

describe("hours publication handoff health", () => {
  it("keeps a normal same-day writer-to-artifact handoff green", () => {
    expect(
      evaluateHoursPromotionHealth({
        sourceLatestAt: "2026-08-22T08:00:00.000Z",
        artifactLatestAt: "2026-08-21T10:00:00.000Z",
        now: NOW,
      }),
    ).toMatchObject({
      green: true,
      state: "within_window",
      lagHours: 22,
      maxLagHours: HOURS_PROMOTION_MAX_LAG_HOURS,
      anomaly: null,
    });
  });

  it("flags collected Google hours that have not reached the bundled artifact", () => {
    const result = evaluateHoursPromotionHealth({
      sourceLatestAt: "2026-08-22T08:00:00.000Z",
      artifactLatestAt: "2026-08-20T10:00:00.000Z",
      now: NOW,
    });

    expect(result).toMatchObject({
      green: false,
      state: "stalled",
      lagHours: 46,
      anomaly: {
        source: "places-hours-refresh-publication",
        kind: "ingest_stale",
      },
    });
    expect(result.anomaly?.detail).toContain(
      "Collection is working, but publication is stalled",
    );
  });

  it("fails closed when either side of the handoff is missing", () => {
    expect(
      evaluateHoursPromotionHealth({
        sourceLatestAt: null,
        artifactLatestAt: "2026-08-22T08:00:00.000Z",
        now: NOW,
      }),
    ).toMatchObject({
      green: false,
      state: "unknown",
      lagHours: null,
      anomaly: { kind: "infrastructure_unavailable" },
    });
  });

  it("does not call an intentionally disabled paid handoff stalled", () => {
    expect(
      evaluateHoursPromotionHealth({
        sourceLatestAt: null,
        artifactLatestAt: "2026-08-01T08:00:00.000Z",
        now: NOW,
        refreshExpected: false,
      }),
    ).toMatchObject({
      green: false,
      state: "policy_hold",
      sourceLatestAt: null,
      artifactLatestAt: "2026-08-01T08:00:00.000Z",
      lagHours: null,
      anomaly: null,
    });
  });

  it("does not accept a source watermark older than the public artifact", () => {
    expect(
      evaluateHoursPromotionHealth({
        sourceLatestAt: "2026-08-20T08:00:00.000Z",
        artifactLatestAt: "2026-08-22T08:00:00.000Z",
        now: NOW,
      }),
    ).toMatchObject({
      green: false,
      state: "unknown",
      anomaly: { kind: "infrastructure_unavailable" },
    });
  });
});
