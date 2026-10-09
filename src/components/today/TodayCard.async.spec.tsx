import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NwsForecast } from "@/lib/integrations/nws";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { AqiObservation } from "@/lib/integrations/airnow";
import TodayCard, { TODAY_SAFETY_GLANCE_DEADLINE_MS } from "./TodayCard";
import TodayWeatherView from "./TodayWeatherView";

const providers = vi.hoisted(() => ({
  forecast: vi.fn(),
  alerts: vi.fn(),
  air: vi.fn(),
  capture: vi.fn(() => null),
}));

vi.mock("@/lib/integrations/nws", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/integrations/nws")>(),
  getNwsForecast: providers.forecast,
}));
vi.mock("@/lib/integrations/nws-alerts", () => ({ getNwsAlertsResult: providers.alerts }));
vi.mock("@/lib/integrations/airnow", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/integrations/airnow")>(),
  getAirQuality: providers.air,
}));
vi.mock("@/components/pwa/OfflineTodayCapture", () => ({ default: providers.capture }));
vi.mock("@/components/today/DaylightLeftInline", () => ({
  default: () => createElement("span", { "data-live-daylight": true }, " · 5h 40m of daylight left"),
}));

const NOW = new Date("2026-10-08T14:00:00.000Z");
const FORECAST: NwsForecast = {
  asOf: "2026-10-08T11:35:00.000Z",
  hourly: [{
    startTime: "2026-10-08T14:00:00.000Z",
    endTime: "2026-10-08T15:00:00.000Z",
    temperature: 72,
    temperatureUnit: "F",
    shortForecast: "Mostly Sunny",
    windSpeed: "5 mph",
    windDirection: "NW",
    probabilityOfPrecipitation: 0,
    icon: "",
  }],
  daily: [{
    startTime: "2026-10-08T10:00:00.000Z",
    endTime: "2026-10-08T22:00:00.000Z",
    temperature: 76,
    temperatureUnit: "F",
    shortForecast: "Mostly Sunny",
    windSpeed: "5 mph",
    windDirection: "NW",
    isDaytime: true,
    icon: "",
  }],
};
const GOOD_AIR: AqiObservation = {
  parameter: "PM2.5", aqi: 42, category: { id: 1, name: "Good", color: "#315A43" },
  reportingArea: "Frederick", dateObserved: "2026-10-08", hourObserved: 9,
};
const WARNING: NwsAlert = {
  id: "fixture-warning", event: "Flash Flood Warning", headline: "Flash Flood Warning",
  description: "", severity: "Severe", urgency: "Immediate", certainty: "Observed",
  starts_at: "2026-10-08T13:00:00.000Z", ends_at: "2026-10-08T16:00:00.000Z",
  area: "Frederick County, MD", url: "https://api.weather.gov/alerts/fixture-warning",
};

async function renderCard() {
  return renderToStaticMarkup(await TodayCard());
}

describe("TodayCard provider composition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    providers.forecast.mockResolvedValue(FORECAST);
    providers.alerts.mockResolvedValue({ alerts: [], available: true, checkedAt: NOW.toISOString() });
    providers.air.mockResolvedValue([GOOD_AIR]);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected provider request"))));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("puts the real forecast condition, values, and issuance beside the reading", async () => {
    const html = await renderCard();
    expect(html).toContain("Mostly sunny");
    expect(html).toContain("72°");
    expect(html).toContain("High 76°");
    expect(html).toContain("Sunset");
    expect(html).toContain("NWS forecast · Frederick");
    expect(html).toMatch(/datetime="2026-10-08T11:35:00.000Z"/i);
    expect(html).toContain("Oct 8, 2026, 7:35 AM EDT");
    expect(html).not.toContain("10:00 AM EDT");
    expect(html).toContain("data-live-daylight");
    expect(providers.capture).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: expect.objectContaining({
        dayKey: "2026-10-08",
        weather: expect.objectContaining({ temperatureF: 72, highF: 76, condition: "Mostly Sunny" }),
      }),
    }), undefined);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([null, "", "not-a-date"])("does not fabricate an issuance for %s", async (asOf) => {
    providers.forecast.mockResolvedValue({ ...FORECAST, asOf });
    const html = await renderCard();
    expect(html).toContain("Issue time unavailable");
    expect(html).not.toMatch(/datetime=/i);
    expect(html).not.toContain("Just updated");
    expect(html).toContain("72°");
  });

  it("keeps an older issuance visibly dated instead of advancing the render time", async () => {
    providers.forecast.mockResolvedValue({ ...FORECAST, asOf: "2026-10-07T11:35:00.000Z" });
    const html = await renderCard();
    expect(html).toContain("Oct 7, 2026, 7:35 AM EDT");
    expect(html).not.toContain("Oct 8, 2026, 10:00 AM");
  });

  it("collapses a null forecast without inventing temperature or an offline read", async () => {
    providers.forecast.mockResolvedValue(null);
    const html = await renderCard();
    expect(html).toContain('data-weather-state="unavailable"');
    expect(html).toContain("County status");
    expect(html).not.toContain("72°");
    expect(html).not.toContain("70°");
    expect(providers.capture).not.toHaveBeenCalled();
  });

  it("preserves partial-feed notes and neutral forecast copy", async () => {
    providers.alerts.mockResolvedValue({ alerts: [], available: false });
    const html = await renderCard();
    expect(html).toContain("Mostly sunny");
    expect(html).toContain("The weather-alert feed is unavailable.");
    expect(html).not.toContain("It is clear and comfortable.");
    expect(html).toContain("NWS forecast · Frederick");
    expect(providers.capture).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: expect.objectContaining({ weather: expect.objectContaining({ safetyNote: "The weather-alert feed is unavailable." }) }),
    }), undefined);
  });

  it("keeps a real warning ahead of pleasant forecast conditions", async () => {
    providers.alerts.mockResolvedValue({ alerts: [WARNING], available: true });
    providers.air.mockResolvedValue(null);
    const html = await renderCard();
    expect(html).toContain("Flash Flood Warning is active.");
    expect(html.indexOf("Flash Flood Warning is active.")).toBeLessThan(html.indexOf("72°"));
    expect(html).not.toContain("It is clear and comfortable.");
  });

  it("retains an active warning when the ordinary forecast fails", async () => {
    providers.forecast.mockResolvedValue(null);
    providers.alerts.mockResolvedValue({ alerts: [WARNING], available: true });
    const html = await renderCard();
    expect(html).toContain("Flash Flood Warning is active.");
    expect(html).toContain("The NWS forecast is briefly unavailable.");
    expect(html).not.toContain("70°");
    expect(html).not.toContain("High");
    expect(html).not.toContain("data-live-daylight");
  });

  it("retains fresh unhealthy measured air without manufacturing forecast values", async () => {
    providers.forecast.mockResolvedValue(null);
    providers.air.mockResolvedValue([{ ...GOOD_AIR, aqi: 151, category: { id: 4, name: "Unhealthy", color: "#A02929" } }]);
    const html = await renderCard();
    expect(html).toContain("The air is unhealthy right now.");
    expect(html).not.toContain("70°");
    expect(html).not.toContain("It is clear and comfortable.");
  });

  it("does not let a stale air observation authorize reassuring weather copy", async () => {
    providers.air.mockResolvedValue([{ ...GOOD_AIR, dateObserved: "2026-10-07" }]);
    const html = await renderCard();
    expect(html).toContain("The air-quality reading is unavailable.");
    expect(html).toContain("Mostly sunny");
    expect(html).not.toContain("It is clear and comfortable.");
  });

  it("starts all three reads together and bounds a stalled provider at the existing deadline", async () => {
    providers.air.mockReturnValue(new Promise(() => {}));
    let settled = false;
    const pending = renderCard().then((html) => { settled = true; return html; });
    expect(providers.forecast).toHaveBeenCalledTimes(1);
    expect(providers.alerts).toHaveBeenCalledTimes(1);
    expect(providers.air).toHaveBeenCalledWith(expect.anything(), { deadlineMs: TODAY_SAFETY_GLANCE_DEADLINE_MS });
    await vi.advanceTimersByTimeAsync(TODAY_SAFETY_GLANCE_DEADLINE_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const html = await pending;
    expect(html).toContain("The air-quality reading is unavailable.");
    expect(html).toContain("72°");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds a total provider stall without inventing a reading", async () => {
    providers.forecast.mockReturnValue(new Promise(() => {}));
    providers.alerts.mockReturnValue(new Promise(() => {}));
    providers.air.mockReturnValue(new Promise(() => {}));
    const pending = renderCard();
    await vi.advanceTimersByTimeAsync(TODAY_SAFETY_GLANCE_DEADLINE_MS);
    const html = await pending;
    expect(html).toContain('data-weather-state="unavailable"');
    expect(providers.capture).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });


  it("retains live daylight when the forecast high is present without a sun label", () => {
    const html = renderToStaticMarkup(createElement(TodayWeatherView, {
      headline: "Mostly sunny", condition: "Mostly sunny", temperatureF: 72,
      highF: 76, sun: null, variant: "Sun", forecastAvailable: true,
      issuedAt: FORECAST.asOf, safetyNote: null,
      daylight: createElement("span", null, " · 5h 40m of daylight left"),
    }));
    expect(html).toContain("High 76°");
    expect(html).toContain("5h 40m of daylight left");
  });

});
