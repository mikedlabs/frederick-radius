import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNwsAlertsResult: vi.fn(),
  getAirQuality: vi.fn(),
}));

vi.mock("@/lib/integrations/nws-alerts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/nws-alerts")>();
  return { ...actual, getNwsAlertsResult: mocks.getNwsAlertsResult };
});

vi.mock("@/lib/integrations/airnow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/airnow")>();
  return { ...actual, getAirQuality: mocks.getAirQuality };
});

import { FREDERICK_CENTER } from "@/lib/geo";
import { loadOutdoorSafetyHold } from "./outdoor-safety-live";

describe("live outdoor safety deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.getNwsAlertsResult.mockReset();
    mocks.getAirQuality.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps Ask bounded without discarding a fast official hazard", async () => {
    mocks.getNwsAlertsResult.mockResolvedValue({ available: true, alerts: [{
      id: "storm-1",
      event: "Severe Thunderstorm Warning",
      headline: "Severe Thunderstorm Warning for Frederick County",
      description: "Frequent lightning is occurring.",
      severity: "Severe",
      urgency: "Immediate",
      certainty: "Observed",
      starts_at: "2026-07-21T18:00:00Z",
      ends_at: "2026-07-21T20:00:00Z",
      area: "Frederick County, MD",
      url: "https://api.weather.gov/alerts/storm-1",
    }] });
    mocks.getAirQuality.mockReturnValue(new Promise(() => undefined));

    const pending = loadOutdoorSafetyHold(FREDERICK_CENTER, {
      deadlineMs: 1_500,
      now: new Date("2026-07-21T19:00:00Z"),
    });
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(pending).resolves.toMatchObject({
      kind: "nws",
      event: "Severe Thunderstorm Warning",
    });
  });

  it("coalesces repeated same-minute safety reads", async () => {
    mocks.getNwsAlertsResult.mockResolvedValue({ available: true, alerts: [] });
    mocks.getAirQuality.mockResolvedValue(null);
    const now = new Date("2026-07-21T19:00:20Z");

    await Promise.all([
      loadOutdoorSafetyHold(FREDERICK_CENTER, { now }),
      loadOutdoorSafetyHold(FREDERICK_CENTER, { now: new Date("2026-07-21T19:00:40Z") }),
    ]);

    expect(mocks.getNwsAlertsResult).toHaveBeenCalledTimes(1);
    expect(mocks.getAirQuality).toHaveBeenCalledTimes(1);
  });

  it("does not treat failed safety feeds as an all-clear", async () => {
    mocks.getNwsAlertsResult.mockResolvedValue({ available: false, alerts: [] });
    mocks.getAirQuality.mockResolvedValue(null);

    await expect(loadOutdoorSafetyHold(FREDERICK_CENTER, {
      now: new Date("2026-07-21T19:02:00Z"),
    })).resolves.toMatchObject({
      kind: "unavailable",
      unavailableFeeds: ["weather alerts", "air quality"],
    });
  });
});
