import { describe, expect, it } from "vitest";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { AqiObservation } from "@/lib/integrations/airnow";
import {
  isOutdoorDangerAlert,
  isOutdoorRecommendation,
  outdoorSafetyHold,
} from "@/lib/weather-safety";

function alert(overrides: Partial<NwsAlert> = {}): NwsAlert {
  return {
    id: "alert-1",
    event: "Severe Thunderstorm Warning",
    headline: "Severe Thunderstorm Warning issued for Frederick County",
    description: "Frequent lightning is occurring. Move indoors.",
    severity: "Severe",
    urgency: "Immediate",
    certainty: "Observed",
    starts_at: "2026-07-21T18:00:00Z",
    ends_at: "2026-07-21T20:00:00Z",
    area: "Frederick County, MD",
    url: "https://api.weather.gov/alerts/alert-1",
    ...overrides,
  };
}

function air(overrides: Partial<AqiObservation> = {}): AqiObservation {
  return {
    parameter: "PM2.5",
    aqi: 160,
    category: { id: 4, name: "Unhealthy", color: "#A02929" },
    reportingArea: "Frederick",
    dateObserved: "2026-07-21",
    hourObserved: 15,
    ...overrides,
  };
}

describe("outdoor severe-weather safety", () => {
  const duringAlert = new Date("2026-07-21T19:00:00Z");

  it("holds outdoor recommendations for thunderstorm, flood, tornado, and lightning danger", () => {
    for (const sample of [
      alert(),
      alert({ event: "Flash Flood Warning", headline: "Flash Flood Warning", description: "" }),
      alert({ event: "Flood Watch", headline: "Flood Watch", severity: "Moderate", description: "" }),
      alert({ event: "Tornado Warning", headline: "Tornado Warning", description: "" }),
      alert({ event: "Special Weather Statement", headline: "Strong storms nearby", severity: "Moderate" }),
    ]) {
      expect(isOutdoorDangerAlert(sample)).toBe(true);
    }
  });

  it("does not treat unrelated advisories as lightning danger", () => {
    expect(isOutdoorDangerAlert(alert({
      event: "Heat Advisory",
      headline: "Heat Advisory remains in effect",
      description: "Hot weather is expected this afternoon.",
      severity: "Moderate",
    }))).toBe(false);
  });

  it("selects the most severe active hazard", () => {
    const hold = outdoorSafetyHold([
      alert({ event: "Flood Watch", headline: "Flood Watch", severity: "Moderate" }),
      alert({ event: "Tornado Warning", headline: "Tornado Warning", severity: "Extreme" }),
    ], [], duringAlert);
    expect(hold?.event).toBe("Tornado Warning");
  });

  it("uses the same lead for two same-tier watches as the rest of Today", () => {
    const hold = outdoorSafetyHold([
      alert({ event: "Flood Watch", headline: "Flood Watch", severity: "Severe" }),
      alert({ event: "Severe Thunderstorm Watch", headline: "Severe Thunderstorm Watch", severity: "Severe" }),
    ], [], duringAlert);
    expect(hold?.event).toBe("Severe Thunderstorm Watch");
  });

  it("ignores cached alerts after they expire", () => {
    expect(outdoorSafetyHold([alert()], [], new Date("2026-07-21T20:00:01Z"))).toBeNull();
  });

  it("holds for dangerous air but not a Code Orange notice", () => {
    const dangerous = alert({
      event: "Air Quality Alert",
      headline: "Code Red air quality is forecast",
      description: "Air may be unhealthy for the general population.",
    });
    const sensitiveGroups = alert({
      event: "Air Quality Alert",
      headline: "Code Orange air quality is forecast",
      description: "Air may be unhealthy for sensitive groups.",
    });
    expect(outdoorSafetyHold([dangerous], [], duringAlert)?.event).toBe("Air Quality Alert");
    expect(outdoorSafetyHold([sensitiveGroups], [], duringAlert)).toBeNull();
  });

  it("holds on a fresh measured Code Red AQI without an alert product", () => {
    const hold = outdoorSafetyHold([], [air()], duringAlert);
    expect(hold).toMatchObject({
      kind: "air-quality",
      event: "Unhealthy air quality",
      observation: { aqi: 160 },
    });
    expect(hold?.reason).toContain("AirNow reports AQI 160, Unhealthy");
  });

  it("does not use stale or Code Orange observations as a blanket hold", () => {
    expect(outdoorSafetyHold([], [air({
      aqi: 300,
      category: { id: 5, name: "Very Unhealthy", color: "#7E1F1F" },
      dateObserved: "2026-07-20",
    })], duringAlert)).toBeNull();
    expect(outdoorSafetyHold([], [air({
      aqi: 120,
      category: { id: 3, name: "Unhealthy for Sensitive Groups", color: "#A03A22" },
    })], duringAlert)).toBeNull();
  });

  it("recognizes outdoor tags, categories, pools, and skate parks", () => {
    expect(isOutdoorRecommendation({ category: "park", name: "Hill Street Skate Park" })).toBe(true);
    expect(isOutdoorRecommendation({ category: "wellness", name: "Brunswick Municipal Pool" })).toBe(true);
    expect(isOutdoorRecommendation({ category: "family", tags: ["outdoor"] })).toBe(true);
    expect(isOutdoorRecommendation({ category: "museum", name: "Brunswick Heritage Museum" })).toBe(false);
  });
});
