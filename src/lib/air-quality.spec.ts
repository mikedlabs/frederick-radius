import { describe, expect, it } from "vitest";
import {
  aqiParameterLabel,
  aqiObservationLabel,
  hasObservationForAlert,
  isElevatedAirQualityPeriodActive,
  summarizeAirQualityAlert,
} from "./air-quality";

const FREDERICK_SMOKE_ALERT = {
  event: "Air Quality Alert",
  headline: "Air Quality Alert issued July 17 at 4:40PM EDT by NWS Baltimore MD/Washington DC",
  description: `The Maryland Department of the Environment has issued a Code
ORANGE Air Quality Alert Saturday for the Maryland Piedmont region.

Concentrations of fine particulate matter due to wildfire smoke will persist at
levels consistent with an Air Quality Index of Unhealthy (Red Alert) to Very
Unhealthy (Purple Alert) Friday night into Saturday morning. Air quality begins
to improve Saturday afternoon.

Code Purple and Code Red Air Quality Alerts mean that air pollution may be
unhealthy for the general population.`,
};

describe("air-quality alert semantics", () => {
  it("uses MDE's issued Code Orange level, not a worse historical period later in the bulletin", () => {
    expect(summarizeAirQualityAlert(FREDERICK_SMOKE_ALERT)).toEqual({
      level: "orange",
      levelLabel: "Orange",
      forecastPeriod: "Saturday",
      pollutant: "pm25",
      elevatedRange: "Red-to-Purple",
      elevatedPeriod: "Friday night into Saturday morning",
      improvementPeriod: "Saturday afternoon",
    });
  });

  it("still recognizes a directly named Code Purple product", () => {
    expect(summarizeAirQualityAlert({
      event: "Code Purple Air Quality Alert",
      description: "Very unhealthy air is expected today.",
    })?.level).toBe("purple");
  });

  it("does not treat an ozone-only observation as coverage for a PM2.5 smoke alert", () => {
    const summary = summarizeAirQualityAlert(FREDERICK_SMOKE_ALERT);
    expect(hasObservationForAlert(summary, ["O3"])).toBe(false);
    expect(hasObservationForAlert(summary, ["O3", "PM2.5"])).toBe(true);
  });

  it("recognizes the stated Red-to-Purple window in Frederick local time", () => {
    const summary = summarizeAirQualityAlert(FREDERICK_SMOKE_ALERT);
    expect(isElevatedAirQualityPeriodActive(summary, new Date("2026-07-18T02:00:00Z"))).toBe(true); // Fri 10 PM
    expect(isElevatedAirQualityPeriodActive(summary, new Date("2026-07-18T12:00:00Z"))).toBe(true); // Sat 8 AM
    expect(isElevatedAirQualityPeriodActive(summary, new Date("2026-07-18T18:00:00Z"))).toBe(false); // Sat 2 PM
  });
});

describe("AirNow pollutant labels", () => {
  it("turns API parameter codes into user-facing pollutant names", () => {
    expect(aqiParameterLabel("O3")).toBe("ozone");
    expect(aqiParameterLabel("PM2.5")).toBe("PM2.5");
    expect(aqiObservationLabel("O3", 12)).toBe("Ozone AQI 12");
  });
});
