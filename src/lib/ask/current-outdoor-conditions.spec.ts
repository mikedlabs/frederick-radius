import { describe, expect, it } from "vitest";
import type { AqiObservation } from "@/lib/integrations/airnow";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { NwsForecast } from "@/lib/integrations/nws";
import {
  currentOutdoorAreaReference,
  currentOutdoorMunicipality,
  currentOutdoorConditionsAskResult,
  wantsCurrentOutdoorConditions,
} from "@/lib/ask/current-outdoor-conditions";

const now = new Date("2026-08-13T22:00:00.000Z");

const forecast: NwsForecast = {
  asOf: "2026-08-13T21:45:00.000Z",
  hourly: [{
    startTime: "2026-08-13T21:00:00.000Z",
    endTime: "2026-08-13T23:00:00.000Z",
    temperature: 76,
    temperatureUnit: "F",
    shortForecast: "Partly Sunny",
    windSpeed: "6 mph",
    windDirection: "S",
    probabilityOfPrecipitation: 10,
    icon: "https://api.weather.gov/icons/land/day/few",
  }],
  daily: [],
};

const goodAir: AqiObservation = {
  parameter: "O3",
  aqi: 42,
  category: { id: 1, name: "Good", color: "#315A43" },
  reportingArea: "Frederick",
  dateObserved: "2026-08-13",
  hourObserved: 17,
};

function freshAlerts(alerts: NwsAlert[] = []) {
  return {
    alerts,
    available: true,
    checkedAt: "2026-08-13T21:58:00.000Z",
  };
}

function alert(overrides: Partial<NwsAlert> = {}): NwsAlert {
  return {
    id: "storm-1",
    event: "Severe Thunderstorm Warning",
    headline: "Severe Thunderstorm Warning for Frederick County",
    description: "Frequent cloud-to-ground lightning is occurring.",
    severity: "Severe",
    urgency: "Immediate",
    certainty: "Observed",
    starts_at: "2026-08-13T21:30:00.000Z",
    ends_at: "2026-08-13T22:30:00.000Z",
    area: "Frederick County, MD",
    url: "https://api.weather.gov/alerts/storm-1",
    ...overrides,
  };
}

describe("current outdoor conditions intent", () => {
  it("detects the direct safety and comfort question", () => {
    expect(wantsCurrentOutdoorConditions(
      "Is it safe and comfortable to spend time outside downtown right now?",
    )).toBe(true);
  });

  it.each([
    "Should I go for a walk right now?",
    "Is it too hot outside right now?",
    "What is it like outside right now?",
    "How hot is it outside right now?",
    "Is it nice outside right now?",
    "How does it feel outside right now?",
    "What is the weather right now?",
    "What is the AQI right now?",
  ])("understands ordinary current-condition wording: %s", (query) => {
    expect(wantsCurrentOutdoorConditions(query)).toBe(true);
  });

  it.each([
    "Can I walk to Gravel and Grind right now?",
    "Can I walk to the library right now?",
    "How long will it take to walk to the park right now?",
  ])("leaves destination and navigation questions on the discovery path: %s", (query) => {
    expect(wantsCurrentOutdoorConditions(query)).toBe(false);
  });

  it("leaves outdoor event discovery on the event path", () => {
    expect(wantsCurrentOutdoorConditions("Find an outdoor concert tonight")).toBe(false);
    expect(wantsCurrentOutdoorConditions("What events are outside right now?")).toBe(false);
  });

  it("does not answer future plans with the current-hour conditions", () => {
    expect(wantsCurrentOutdoorConditions(
      "Will it be safe to walk outside at 8 PM today?",
    )).toBe(false);
    expect(wantsCurrentOutdoorConditions(
      "Not right now, but should we eat outside later tonight?",
    )).toBe(false);
    expect(wantsCurrentOutdoorConditions(
      "Will it be comfortable outside in two hours?",
    )).toBe(false);
    expect(wantsCurrentOutdoorConditions(
      "Not right now; should I go outside after work?",
    )).toBe(false);
  });

  it("resolves a named town before a generic downtown fallback", () => {
    expect(currentOutdoorMunicipality(
      "Is it safe outside in downtown Brunswick right now?",
    )).toMatchObject({
      slug: "brunswick",
      name: "Brunswick",
      centroid: { lng: -77.628, lat: 39.3134 },
    });
    expect(currentOutdoorMunicipality(
      "Is it comfortable outside in Frederick County right now?",
    )).toBeNull();
  });

  it("distinguishes county scope from ambiguous or unsupported named areas", () => {
    expect(currentOutdoorAreaReference(
      "Is it comfortable outside in Frederick County right now?",
    )).toEqual({ kind: "county" });
    expect(currentOutdoorAreaReference(
      "Is it comfortable outside in Frederick right now?",
    )).toEqual({
      kind: "unresolved",
      label: "Frederick",
      ambiguousFrederick: true,
    });
    expect(currentOutdoorAreaReference(
      "Is it safe outside in Point of Rocks right now?",
    )).toEqual({ kind: "unresolved", label: "Point of Rocks" });
    expect(currentOutdoorAreaReference(
      "Is it safe outside in downtown Westminster right now?",
    )).toEqual({ kind: "unresolved", label: "Westminster" });
  });

  it("keeps a bare downtown request on the reviewed Frederick City point", () => {
    expect(currentOutdoorAreaReference(
      "Is it comfortable outside downtown right now?",
    )).toMatchObject({
      kind: "municipality",
      municipality: { slug: "frederick" },
    });
  });

  it.each([
    "Is it safe outside in the rain right now?",
    "Is it comfortable outside in the park right now?",
    "Is it nice outside near me right now?",
  ])("does not mistake ordinary context for a named area: %s", (query) => {
    expect(currentOutdoorAreaReference(query)).toBeNull();
  });
});

describe("current outdoor conditions answer", () => {
  it("grounds a benign read in all three current sources without claiming safety", () => {
    const result = currentOutdoorConditionsAskResult({
      forecast,
      alerts: freshAlerts(),
      airObservations: [goodAir],
    }, { areaLabel: "downtown Frederick", now });

    expect(result.answer).toContain("76°F");
    expect(result.answer).toContain("AQI 42 (Good)");
    expect(result.answer).toContain("no active Frederick County alert");
    expect(result.answer).toContain("not a personal safety guarantee");
    expect(result.answer).not.toMatch(/\b(?:is|it is) safe\b|\bsafe to\b|\ball clear\b/i);
    expect(result.answer?.match(/[.!?](?:\s|$)/g)?.length ?? 0).toBeLessThanOrEqual(3);
    expect(result.sources.map((source) => source.slug)).toEqual([
      "nws-alert-status",
      "nws-current-forecast",
      "airnow-current-aqi",
    ]);
    expect(result.sources.map((source) => source.status)).toEqual([
      "Checked 5:58 PM",
      "Updated 5:45 PM",
      "Observed 5:00 PM",
    ]);
    expect(result.intelligence).toMatchObject({ confidence: "high" });
  });

  it("does not call hot, humid conditions comfortable", () => {
    const humidForecast: NwsForecast = {
      ...forecast,
      hourly: [{
        ...forecast.hourly[0],
        temperature: 83,
        shortForecast: "Mostly Sunny",
        relativeHumidity: 90,
        dewpointC: 26,
      }],
    };
    const result = currentOutdoorConditionsAskResult({
      forecast: humidForecast,
      alerts: freshAlerts(),
      airObservations: [goodAir],
    }, { areaLabel: "downtown Frederick", now });

    expect(result.answer).toContain("relative humidity near 90%");
    expect(result.answer).toContain("may feel uncomfortable");
    expect(result.answer).not.toContain("may feel comfortable");
    expect(result.sources.find((source) => source.slug === "nws-current-forecast")?.reason)
      .toContain("90% relative humidity");
  });

  it("uses a high dew point when relative humidity is unavailable", () => {
    const muggyForecast: NwsForecast = {
      ...forecast,
      hourly: [{
        ...forecast.hourly[0],
        temperature: 82,
        shortForecast: "Mostly Clear",
        relativeHumidity: undefined,
        dewpointC: 24,
      }],
    };
    const result = currentOutdoorConditionsAskResult({
      forecast: muggyForecast,
      alerts: freshAlerts(),
      airObservations: [goodAir],
    }, { areaLabel: "downtown Frederick", now });

    expect(result.answer).toContain("a dew point near 75°F");
    expect(result.answer).toContain("may feel uncomfortable");
    expect(result.answer).not.toContain("may feel comfortable");
    expect(result.sources.find((source) => source.slug === "nws-current-forecast")?.reason)
      .toContain("Dew point 75°F");
  });

  it("does not turn failed or stale feeds into an all-clear", () => {
    const result = currentOutdoorConditionsAskResult({
      forecast,
      alerts: { alerts: [], available: false },
      airObservations: [{ ...goodAir, dateObserved: "2026-08-12" }],
    }, { areaLabel: "downtown Frederick", now });

    expect(result.answer).toContain("can’t give an all-clear");
    expect(result.answer).toContain("official alert feed");
    expect(result.answer).toContain("fresh AirNow reading");
    expect(result.answer).not.toContain("no active Frederick County alert");
    expect(result.answer).not.toContain("may feel comfortable");
    expect(result.sources.map((source) => source.name)).toContain(
      "Weather alerts not verified",
    );
    expect(result.sources.map((source) => source.name)).toContain(
      "Air quality not verified",
    );
    expect(result.intelligence).toMatchObject({ confidence: "medium" });
  });

  it.each([
    { available: true, checkedAt: undefined },
    { available: true, checkedAt: "2026-08-13T21:20:00.000Z" },
  ])("does not turn an unknown or stale successful alert response into no alerts", (alertState) => {
    const result = currentOutdoorConditionsAskResult({
      forecast,
      alerts: { alerts: [], ...alertState },
      airObservations: [goodAir],
    }, { areaLabel: "downtown Frederick", now });

    expect(result.answer).toContain("can’t give an all-clear");
    expect(result.answer).toContain("current official alert feed");
    expect(result.answer).not.toContain("no active Frederick County alert");
    expect(result.sources[0]).toMatchObject({
      name: "Weather alerts not verified",
      confidence: "medium",
    });
  });

  it("leads with an active dangerous alert", () => {
    const result = currentOutdoorConditionsAskResult({
      forecast,
      alerts: freshAlerts([alert()]),
      airObservations: [goodAir],
    }, { areaLabel: "downtown Frederick", now });

    expect(result.answer).toMatch(/^Use caution/);
    expect(result.answer).toContain("Severe Thunderstorm Warning");
    expect(result.answer).not.toContain("may feel comfortable");
    expect(result.sources[0]).toMatchObject({
      name: "Severe Thunderstorm Warning",
      status: "Active until 6:30 PM · Feed checked 5:58 PM",
    });
    expect(result.actions?.[0]).toMatchObject({
      label: "Open official alert",
      href: "https://api.weather.gov/alerts/storm-1",
    });
  });

  it("keeps an active dangerous alert first when other feeds are missing", () => {
    const result = currentOutdoorConditionsAskResult({
      forecast: null,
      alerts: freshAlerts([alert()]),
      airObservations: null,
    }, { areaLabel: "downtown Frederick", now });

    expect(result.answer).toMatch(/^Use caution/);
    expect(result.answer).toContain("Severe Thunderstorm Warning");
    expect(result.answer).toContain("a current hourly forecast");
    expect(result.answer).toContain("a fresh AirNow reading");
    expect(result.actions?.[0]).toMatchObject({
      label: "Open official alert",
      href: "https://api.weather.gov/alerts/storm-1",
    });
  });

  it("keeps every active alert visible and leads with severity then urgency", () => {
    const immediateHeat = alert({
      id: "heat-now",
      event: "Extreme Heat Warning",
      headline: "Extreme Heat Warning for Frederick County",
      description: "Dangerously hot conditions are occurring.",
      severity: "Extreme",
      urgency: "Immediate",
      url: "https://api.weather.gov/alerts/heat-now",
    });
    const futureHeat = alert({
      id: "heat-later",
      event: "Extreme Heat Warning",
      headline: "Later Extreme Heat Warning for Frederick County",
      description: "Dangerously hot conditions are possible.",
      severity: "Extreme",
      urgency: "Expected",
      url: "https://api.weather.gov/alerts/heat-later",
    });
    const result = currentOutdoorConditionsAskResult({
      forecast,
      alerts: freshAlerts([futureHeat, immediateHeat]),
      airObservations: [{
        ...goodAir,
        parameter: "PM2.5",
        aqi: 168,
        category: { id: 4, name: "Unhealthy", color: "#A02929" },
      }],
    }, { areaLabel: "downtown Frederick", now });

    expect(result.answer).toMatch(/^Use caution/);
    expect(result.answer).toContain("Extreme Heat Warning");
    expect(result.answer).toContain("1 other active alert");
    expect(result.answer).toContain("AQI 168 (Unhealthy)");
    expect(result.answer?.match(/Extreme Heat Warning/g)).toHaveLength(1);
    expect(result.sources.slice(0, 2).map((source) => source.href)).toEqual([
      "https://api.weather.gov/alerts/heat-now",
      "https://api.weather.gov/alerts/heat-later",
    ]);
    expect(result.actions?.[0]).toMatchObject({
      label: "Open official alert",
      href: "https://api.weather.gov/alerts/heat-now",
    });
  });
});
