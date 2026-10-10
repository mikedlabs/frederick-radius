import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ alerts: vi.fn(), air: vi.fn(), forecast: vi.fn() }));
vi.mock("@/lib/integrations/nws-alerts", () => ({ getNwsAlertsResult: mocks.alerts }));
vi.mock("@/lib/integrations/airnow", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/integrations/airnow")>(), getAirQuality: mocks.air,
}));
vi.mock("@/lib/integrations/nws", () => ({ getNwsForecast: mocks.forecast }));
import WeatherSafeGoldenHour from "./WeatherSafeGoldenHour";
const now = new Date("2026-07-21T23:30:00Z");
const good = {
  parameter: "PM2.5", aqi: 25, category: { id: 1, name: "Good", color: "#315A43" },
  reportingArea: "Frederick", dateObserved: "2026-07-21", hourObserved: 19,
};
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks();
  mocks.forecast.mockResolvedValue(null);
  mocks.alerts.mockResolvedValue({ available: true, checkedAt: now.toISOString(), alerts: [] });
  mocks.air.mockResolvedValue([good]);
});
afterEach(() => { vi.useRealTimers(); });

describe("Today golden-hour recommendation evidence", () => {
  it.each([
    { name: "empty air", air: [], checkedAt: now.toISOString() },
    { name: "stale air", air: [{ ...good, dateObserved: "2026-07-19" }], checkedAt: now.toISOString() },
    { name: "missing alert time", air: [good], checkedAt: undefined },
    { name: "stale alert time", air: [good], checkedAt: "2026-07-21T23:14:00Z" },
  ])("withholds the outdoor prompt for $name", async ({ air, checkedAt }) => {
    mocks.alerts.mockResolvedValue({ available: true, checkedAt, alerts: [] });
    mocks.air.mockResolvedValue(air);
    const html = renderToStaticMarkup(await WeatherSafeGoldenHour({ now }));
    expect(html).toBe("");
  });
  it("retains golden-hour timing when alert and air evidence are current", async () => {
    const html = renderToStaticMarkup(await WeatherSafeGoldenHour({ now }));
    expect(html).toContain('aria-label="Golden hour"');
    expect(html).toContain("Golden hour starts soon.");
    expect(html).toMatch(/The calculated golden-hour window runs from \d{1,2}:\d{2} PM to \d{1,2}:\d{2} PM\./);
  });
});
