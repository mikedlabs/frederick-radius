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

import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { AqiObservation } from "@/lib/integrations/airnow";
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

  const now = new Date("2026-07-21T19:00:00Z");
  const good: AqiObservation = {
    parameter: "PM2.5", aqi: 25,
    category: { id: 1, name: "Good", color: "#315A43" },
    reportingArea: "Frederick", dateObserved: "2026-07-21", hourObserved: 15,
  };

  const storm: NwsAlert = {
    id: "storm-boundary", event: "Severe Thunderstorm Warning",
    headline: "Severe Thunderstorm Warning for Frederick County",
    description: "Lightning is occurring.", severity: "Severe",
    urgency: "Immediate", certainty: "Observed",
    starts_at: "2026-07-21T19:00:30Z", ends_at: "2026-07-21T20:00:00Z",
    area: "Frederick County, MD", url: "https://api.weather.gov/alerts/storm-boundary",
  };

  it("honors a warning that begins within the caller's current minute", async () => {
    mocks.getNwsAlertsResult.mockResolvedValue({ available: true, checkedAt: now.toISOString(), alerts: [storm] });
    mocks.getAirQuality.mockResolvedValue([good]);
    await expect(loadOutdoorSafetyHold(FREDERICK_CENTER, {
      now: new Date("2026-07-21T19:00:40Z"),
    })).resolves.toMatchObject({ kind: "nws", event: "Severe Thunderstorm Warning" });
  });

  it.each([
    { name: "begins", alert: storm, held: [false, true] },
    { name: "ends", alert: { ...storm, starts_at: "2026-07-21T18:00:00Z", ends_at: "2026-07-21T19:00:30Z" }, held: [true, false] },
  ])("shares evidence but evaluates each caller when a warning $name", async ({ alert, held }) => {
    mocks.getNwsAlertsResult.mockResolvedValue({ available: true, checkedAt: now.toISOString(), alerts: [alert] });
    mocks.getAirQuality.mockResolvedValue([good]);
    const results = await Promise.all([
      loadOutdoorSafetyHold(FREDERICK_CENTER, { now: new Date("2026-07-21T19:00:29Z") }),
      loadOutdoorSafetyHold(FREDERICK_CENTER, { now: new Date("2026-07-21T19:00:31Z") }),
    ]);
    expect(results.map((result) => result?.kind === "nws")).toEqual(held);
    expect(results[held[0] ? 1 : 0]).toBeNull();
    expect(mocks.getNwsAlertsResult).toHaveBeenCalledTimes(1);
    expect(mocks.getAirQuality).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: "empty", observations: [] },
    { name: "stale", observations: [{ ...good, dateObserved: "2026-07-19" }] },
    { name: "invalid", observations: [{ ...good, dateObserved: "invalid" }] },
    { name: "future", observations: [{ ...good, hourObserved: 18 }] },
  ])("withholds outdoor clearance for $name AQI evidence", async ({ observations }) => {
    mocks.getNwsAlertsResult.mockResolvedValue({ available: true, checkedAt: now.toISOString(), alerts: [] });
    mocks.getAirQuality.mockResolvedValue(observations);
    await expect(loadOutdoorSafetyHold(FREDERICK_CENTER, { now })).resolves.toMatchObject({
      kind: "unavailable", unavailableFeeds: ["air quality"],
      reason: "Current air quality could not be verified.",
    });
  });

  it.each([
    { name: "missing", checkedAt: undefined },
    { name: "stale", checkedAt: "2026-07-21T18:44:00Z" },
    { name: "invalid", checkedAt: "invalid" },
    { name: "future", checkedAt: "2026-07-21T19:03:00Z" },
  ])("withholds outdoor clearance for $name alert check time", async ({ checkedAt }) => {
    mocks.getNwsAlertsResult.mockResolvedValue({ available: true, checkedAt, alerts: [] });
    mocks.getAirQuality.mockResolvedValue([good]);
    await expect(loadOutdoorSafetyHold(FREDERICK_CENTER, { now })).resolves.toMatchObject({
      kind: "unavailable", unavailableFeeds: ["weather alerts"],
    });
  });

  it("permits a fresh checked zero-alert feed and current healthy air", async () => {
    mocks.getNwsAlertsResult.mockResolvedValue({ available: true, checkedAt: now.toISOString(), alerts: [] });
    mocks.getAirQuality.mockResolvedValue([{ ...good, dateObserved: "2026-07-19", aqi: 175 }, good]);
    await expect(loadOutdoorSafetyHold(FREDERICK_CENTER, { now })).resolves.toBeNull();
  });

  it("keeps a fresh unhealthy observation even when alert evidence is unavailable", async () => {
    mocks.getNwsAlertsResult.mockResolvedValue({ available: false, alerts: [] });
    mocks.getAirQuality.mockResolvedValue([{
      ...good, aqi: 168, category: { id: 4, name: "Unhealthy", color: "#A02929" },
    }]);
    await expect(loadOutdoorSafetyHold(FREDERICK_CENTER, { now })).resolves.toMatchObject({
      kind: "air-quality", observation: { aqi: 168 },
    });
  });

});
