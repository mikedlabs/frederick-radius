import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NwsForecast, NwsHourly } from "@/lib/integrations/nws";
import { frederickForecastRange } from "./retained-forecast-high";

const { entries, get, pending } = vi.hoisted(() => ({
  entries: new Map<string, unknown>(),
  get: vi.fn<(key: string) => Promise<unknown>>(),
  pending: [] as Promise<unknown>[],
}));

vi.mock("next/cache", () => ({
  unstable_cache: (loader: () => Promise<unknown>, key: string[]) => async () => {
    const id = JSON.stringify(key);
    const found = await get(id);
    if (found !== undefined) return found;
    const value = await loader();
    entries.set(id, value);
    return value;
  },
}));
vi.mock("next/server", () => ({ after: (task: Promise<unknown>) => pending.push(task) }));

const noon = new Date("2026-11-19T12:00:00-05:00");
const evening = new Date("2026-11-19T22:00:00-05:00");
const issuedAt = "2026-11-19T10:00:00-05:00";
const daytime: NwsHourly = {
  startTime: "2026-11-19T06:00:00-05:00", endTime: "2026-11-19T18:00:00-05:00", isDaytime: true,
  temperature: 63, temperatureUnit: "F", shortForecast: "", windSpeed: "", windDirection: "", icon: "",
};
const tonight: NwsHourly = {
  ...daytime, startTime: daytime.endTime, endTime: "2026-11-20T06:00:00-05:00", isDaytime: false, temperature: 36,
};
function forecast(daily: NwsHourly[], dailyAsOf: string | null = issuedAt): NwsForecast {
  return { asOf: issuedAt, hourlyAsOf: issuedAt, dailyAsOf, hourly: [], daily };
}
beforeEach(() => {
  entries.clear();
  get.mockReset().mockImplementation(async (key) => entries.get(key));
  pending.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("the retained Frederick daytime high", () => {
  it("preserves the original daily issuance after UTC midnight and lets newer direct values win", async () => {
    expect((await frederickForecastRange(forecast([daytime, tonight]), noon)).highF).toBe(63);
    await Promise.all(pending);
    expect(await frederickForecastRange(forecast([{ ...daytime, temperature: 59 }, tonight]), noon)).toEqual({
      highF: 59, lowF: 36, retainedHighIssuedAt: null,
    });
    await Promise.all(pending);
    expect(await frederickForecastRange(forecast([tonight]), evening)).toEqual({
      highF: 63, lowF: 36, retainedHighIssuedAt: issuedAt,
    });
  });

  it("leaves a cold evening empty, allows a later fill and never uses that entry the following Eastern day", async () => {
    expect((await frederickForecastRange(forecast([tonight]), evening)).highF).toBeNull();
    expect(entries.size).toBe(0);
    await frederickForecastRange(forecast([daytime, tonight]), noon);
    await Promise.all(pending);
    const nextNight = { ...tonight, startTime: "2026-11-20T18:00:00-05:00", endTime: "2026-11-21T06:00:00-05:00" };
    expect((await frederickForecastRange(forecast([nextNight]), new Date(nextNight.startTime))).highF).toBeNull();
    expect(entries.size).toBe(1);
    expect(await frederickForecastRange(null, evening)).toEqual({ highF: null, lowF: null, retainedHighIssuedAt: null });
  });

  it.each([null, "invalid", "2026-11-19T10:00:00", "2026-11-18T15:00:00-05:00", "2026-11-19T15:00:00-05:00"])(
    "never saves an hourly or render timestamp in place of the valid daily forecast clock (%s)", async (bad) => {
      expect((await frederickForecastRange(forecast([daytime], bad), noon)).highF).toBe(63);
      expect(pending).toHaveLength(0);
      expect(entries.size).toBe(0);
    },
  );

  it("rejects impossible readings and mismatched cache content", async () => {
    expect((await frederickForecastRange(forecast([{ ...daytime, temperature: 999 }]), noon)).highF).toBeNull();
    expect(pending).toHaveLength(0);
    for (const value of [
      { day: "2026-11-20", highF: 63, issuedAt },
      { day: "2026-11-19", highF: "63", issuedAt },
      { day: "2026-11-19", highF: 63, issuedAt: "wrong" },
    ]) {
      get.mockResolvedValueOnce(value);
      expect((await frederickForecastRange(forecast([tonight]), evening)).highF).toBeNull();
    }
  });

  it("returns direct forecasts immediately during a cache stall and bounds the evening lookup", async () => {
    vi.useFakeTimers();
    get.mockImplementation(() => new Promise(() => {}));
    expect((await frederickForecastRange(forecast([daytime, tonight]), noon)).highF).toBe(63);
    const night = frederickForecastRange(forecast([tonight]), evening);
    await vi.advanceTimersByTimeAsync(150);
    expect(await night).toEqual({ highF: null, lowF: 36, retainedHighIssuedAt: null });
    get.mockRejectedValueOnce(new Error("Data Cache unavailable"));
    expect((await frederickForecastRange(forecast([tonight]), evening)).highF).toBeNull();
  });
});
