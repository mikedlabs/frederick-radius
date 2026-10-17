import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNwsForecast } from "./nws";
const now = new Date("2026-10-12T12:00:00-04:00");
const period = { number: 1, name: "This Afternoon", startTime: "2026-10-12T12:00:00-04:00", endTime: "2026-10-12T13:00:00-04:00", temperature: 68, temperatureUnit: "F", shortForecast: "Mostly Sunny", windSpeed: "5 mph", windDirection: "NW", icon: "https://api.weather.gov/icons/land/day/few", isDaytime: true };
let hourlyClock: Record<string, string>; let dailyClock: Record<string, string>; let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  hourlyClock = { updated: "2026-10-12T07:00:00-04:00" }; dailyClock = { updateTime: now.toISOString() };
  fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/points/")
    ? { properties: { forecastHourly: "https://api.weather.gov/hourly", forecast: "https://api.weather.gov/daily" } }
    : { properties: { ...(url.endsWith("hourly") ? hourlyClock : dailyClock), periods: [period] } } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("NWS hourly issuance", () => {
  it("retains the hourly clock separately when a daily update wins the legacy combined timestamp", async () => {
    const result = await getNwsForecast({ lat: 39.4142, lng: -77.4126 });
    expect(result?.asOf).toBe(dailyClock.updateTime); expect(result?.hourlyAsOf).toBe(hourlyClock.updated);
    expect(result?.hourly[0].temperature).toBe(68);
  });
  it("prefers the actual hourly updateTime and never stamps a render clock", async () => {
    hourlyClock = { updateTime: "2026-10-12T11:00:00-04:00", updated: "2026-10-12T07:00:00-04:00" };
    const result = await getNwsForecast({ lat: 39.4143, lng: -77.4126 });
    expect(result?.hourlyAsOf).toBe(hourlyClock.updateTime); expect(result?.hourlyAsOf).not.toBe(now.toISOString());
  });
  it("keeps missing hourly issuance unknown even when the daily forecast has a clock", async () => {
    hourlyClock = {}; const result = await getNwsForecast({ lat: 39.4144, lng: -77.4126 });
    expect(result?.hourlyAsOf).toBeNull(); expect(result?.asOf).toBe(dailyClock.updateTime);
  });
  it("uses the same bounded abort signal for points and both forecast requests", async () => {
    await getNwsForecast({ lat: 39.4145, lng: -77.4126 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const signals = fetchMock.mock.calls.map((call) => call[1].signal);
    expect(signals[0]).toBeInstanceOf(AbortSignal); expect(signals[1]).toBe(signals[0]); expect(signals[2]).toBe(signals[0]);
  });
});
