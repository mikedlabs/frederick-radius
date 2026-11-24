import { afterEach, describe, expect, it, vi } from "vitest";
import type { AqiObservation } from "./airnow";
import { airQualityObservedAt, getAirQuality, getFrederickAirReport, isFreshAqiObservation, parseAirNowObservations, parseFrederickAirReport } from "./airnow";
import { FREDERICK_CENTER } from "@/lib/geo";

const cachedEntries = vi.hoisted(() => new Map<string, unknown>());
vi.mock("next/cache", () => ({
  unstable_cache: <T,>(load: () => Promise<T>, keys: string[]) => async () => {
    const key = keys.join("|");
    if (cachedEntries.has(key)) return cachedEntries.get(key) as T;
    const data = await load();
    cachedEntries.set(key, data);
    return data;
  },
}));

const originalAirNowKey = process.env.AIRNOW_API_KEY;

afterEach(() => {
  cachedEntries.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalAirNowKey === undefined) delete process.env.AIRNOW_API_KEY;
  else process.env.AIRNOW_API_KEY = originalAirNowKey;
});

function observation(dateObserved: string, hourObserved: number): AqiObservation {
  return {
    parameter: "PM2.5",
    aqi: 42,
    category: { id: 1, name: "Good", color: "#315A43" },
    reportingArea: "Frederick",
    dateObserved,
    hourObserved,
  };
}

describe("AirNow observation freshness", () => {
  it("parses AirNow's ISO and slash date shapes as Eastern wall time", () => {
    expect(airQualityObservedAt(observation("2026-07-17", 12))?.toISOString())
      .toBe("2026-07-17T16:00:00.000Z");
    expect(airQualityObservedAt(observation("07/17/2026", 12))?.toISOString())
      .toBe("2026-07-17T16:00:00.000Z");
  });

  it("accepts an hourly reading within three hours", () => {
    expect(isFreshAqiObservation(
      observation("2026-07-17", 12),
      new Date("2026-07-17T18:59:00.000Z"),
    )).toBe(true);
  });

  it("rejects stale, malformed, and implausibly future readings", () => {
    const now = new Date("2026-07-17T20:01:00.000Z");
    expect(isFreshAqiObservation(observation("2026-07-17", 12), now)).toBe(false);
    expect(isFreshAqiObservation(observation("not-a-date", 12), now)).toBe(false);
    expect(isFreshAqiObservation(
      observation("2026-07-17", 18),
      new Date("2026-07-17T20:00:00.000Z"),
    )).toBe(false);
  });
});

describe("AirNow request deadline", () => {
  it("aborts a stalled upstream request and fails soft", async () => {
    vi.useFakeTimers();
    process.env.AIRNOW_API_KEY = "test-key";
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://files.airnowtech.org/")) return Promise.resolve(new Response(""));
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }));

    const pending = getAirQuality(FREDERICK_CENTER, { deadlineMs: 50 });
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toBeNull();
    expect(signal?.aborted).toBe(true);
  });
});

const noon = new Date("2026-11-24T17:00:00Z");
const liveObservation = {
  parameterName: "OZONE", nowcastAQI: "36", aqiCategoryName: "Good",
  reportingAreaName: "Maryland Piedmont", stateCode: "MD", latitude: 39.47, longitude: -77.31,
  dateObserved: "2026-11-24", hourObserved: "11:00", localTimeZone: "EST",
};
const forecastRow = "11/23/26|11/24/26||EST|1|F|Y|Maryland Piedmont|MD|39.4732|-77.3139|PM2.5|17|Good|No||Maryland";
const observedRow = "11/24/26|11/24/26|11:00|EST|0|O|Y|Maryland Piedmont|MD|39.4732|-77.3139|PM2.5|51|Moderate|No||Maryland";

describe("EPA current ZIP/coordinate service", () => {
  it("uses the replacement endpoint, query shape, and the actual pollutant and time", async () => {
    vi.useFakeTimers().setSystemTime(noon);
    process.env.AIRNOW_API_KEY = "test-key";
    const fetcher = vi.fn(async () => Response.json([liveObservation]));
    vi.stubGlobal("fetch", fetcher);
    const result = await getAirQuality(FREDERICK_CENTER);
    const call = vi.mocked(fetch).mock.calls.find(([target]) => String(target).startsWith("https://www.airnowapi.org/"))!;
    const url = new URL(String(call[0]));
    expect(url.origin + url.pathname).toBe("https://www.airnowapi.org/aq/observation/current/ziplatlong");
    expect([...url.searchParams.keys()].sort()).toEqual(["API_KEY", "format", "latitude", "longitude"]);
    expect(result?.[0]).toMatchObject({ parameter: "O3", aqi: 36, reportingArea: "Maryland Piedmont", hourObserved: 11 });
    expect(parseAirNowObservations([{ ...liveObservation, nowcastAQI: null, aqi: 38 }], noon)?.[0].aqi).toBe(38);
  });

  it("rejects impossible dates, absent fields, invalid categories, stale readings and provider errors", () => {
    const invalid = [
      { nowcastAQI: "" }, { nowcastAQI: -1 }, { nowcastAQI: 501 }, { nowcastAQI: 49.5 }, { aqiCategoryName: "Unknown" },
      { aqiCategoryName: "Hazardous" }, { dateObserved: "2026-11-31" }, { hourObserved: "" },
      { hourObserved: "24:00" }, { dateObserved: "2026-11-23" }, { reportingAreaName: "" },
    ];
    expect(parseAirNowObservations(invalid.map((fields) => ({ ...liveObservation, ...fields })), noon)).toEqual([]);
    expect(parseAirNowObservations({ WebServiceError: [] }, noon)).toBeNull();
  });
});

describe("Frederick regional reporting-area file", () => {
  it("uses only the exact regional reporting area and a forecast valid today in Eastern time", () => {
    const others = [
      forecastRow.replace("Maryland Piedmont", "Baltimore"), forecastRow.replace("|MD|", "|VA|"),
      forecastRow.replace("11/24/26", "11/25/26"), forecastRow.replace("11/23/26", "11/25/26"),
      forecastRow.replace("|17|", "||"), forecastRow.replace("|F|", "|Y|"),
      forecastRow.replace("11/24/26", "11/23/26"),
    ];
    expect(parseFrederickAirReport(others.join("\r\n"), noon)).toEqual({ forecast: null, observations: [] });
    expect(parseFrederickAirReport(forecastRow.replace("Maryland Piedmont", "Baltimore"), noon)).toBeNull();
    const report = parseFrederickAirReport([forecastRow, observedRow.replace("|O|", "|Y|")].join("\n"), noon);
    expect(report?.observations).toEqual([]);
    expect(report?.forecast).toMatchObject({ aqi: 17, parameter: "PM2.5", issueDate: "2026-11-23", validDate: "2026-11-24" });
    expect(parseFrederickAirReport(forecastRow, new Date("2026-11-25T04:00:00Z"))?.forecast?.aqi).toBe(17);
    expect(parseFrederickAirReport(forecastRow, new Date("2026-11-25T05:00:00Z"))?.forecast).toBeNull();
  });

  it("keeps the newest fresh O observation for a pollutant separate from the forecast", () => {
    const oldHour = observedRow.replace("|11:00|", "|10:00|").replace("|51|", "|65|");
    const stale = observedRow.replace("|11:00|", "|05:00|");
    const report = parseFrederickAirReport([forecastRow, observedRow, oldHour, stale].join("\n"), noon);
    expect(report?.observations).toHaveLength(1);
    expect(report?.observations[0]).toMatchObject({ aqi: 51, dateObserved: "2026-11-24", hourObserved: 11 });
    expect(report?.forecast?.aqi).toBe(17);
  });

  it("shares one large cold download and caches only parsed regional data across reads", async () => {
    vi.useFakeTimers().setSystemTime(noon);
    const outside = forecastRow.replace("Maryland Piedmont", "Other area") + "\n";
    const nationalFile = outside.repeat(Math.ceil(2_100_000 / outside.length)) + forecastRow + "\n" + observedRow;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(nationalFile)));
    const [first, second] = await Promise.all([getFrederickAirReport(), getFrederickAirReport()]);
    expect(second).toEqual(first);
    expect((await getFrederickAirReport())?.observations[0].aqi).toBe(51);
    expect(fetch).toHaveBeenCalledTimes(1);
    const options = vi.mocked(fetch).mock.calls[0][1];
    expect(options?.cache).toBe("no-store");
    expect(options?.next?.revalidate).toBeUndefined();
    expect(cachedEntries.size).toBe(1);
    const stored = JSON.stringify([...cachedEntries.values()]);
    expect(stored.length).toBeLessThan(1000);
    expect(stored).not.toContain("Other area");
  });

  it("expires observations and selects the new Eastern day's forecast from a retained regional report", async () => {
    const tomorrow = forecastRow.replace("11/24/26", "11/25/26").replace("|17|", "|21|");
    const night = observedRow.replace("11:00", "20:00");
    vi.useFakeTimers().setSystemTime(new Date("2026-11-25T03:59:00Z"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response([forecastRow, tomorrow, night].join("\n"))));
    const evening = await getFrederickAirReport();
    expect(evening?.forecast?.aqi).toBe(17);
    expect(evening?.observations).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-25T05:01:00Z"));
    const afterMidnight = await getFrederickAirReport();
    expect(afterMidnight?.forecast?.aqi).toBe(21);
    expect(afterMidnight?.observations).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed download and does not cache a provider error as an empty report", async () => {
    vi.useFakeTimers().setSystemTime(noon);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("Service unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("not a reporting file"))
      .mockResolvedValueOnce(new Response(observedRow)));
    expect(await getFrederickAirReport()).toBeNull();
    expect(await getFrederickAirReport()).toBeNull();
    expect(cachedEntries.size).toBe(0);
    expect((await getFrederickAirReport())?.observations[0].aqi).toBe(51);
  });

  it("keeps the promoted build offline even with a previously cached report and a configured key", async () => {
    vi.useFakeTimers().setSystemTime(noon);
    const fetcher = vi.fn(async () => new Response(observedRow));
    vi.stubGlobal("fetch", fetcher);
    expect((await getFrederickAirReport())?.observations[0].aqi).toBe(51);
    vi.stubEnv("RADIUS_DATA_MODE", "promoted");
    vi.stubEnv("AIRNOW_API_KEY", "test-key");
    expect(await getFrederickAirReport()).toBeNull();
    expect(await getAirQuality(FREDERICK_CENTER)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("recovers a missing keyed observation from a confirmed public O record", async () => {
    vi.useFakeTimers().setSystemTime(noon);
    process.env.AIRNOW_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) =>
      String(url).startsWith("https://www.airnowapi.org/")
        ? Response.json({ WebServiceError: [] }, { status: 503 })
        : new Response([forecastRow, observedRow].join("\n")),
    ));
    const observations = await getAirQuality(FREDERICK_CENTER);
    expect(observations?.map((item) => item.aqi)).toEqual([51]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses a fresh O record before the deadline when the keyed provider stalls", async () => {
    vi.useFakeTimers().setSystemTime(noon);
    process.env.AIRNOW_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn((url: URL | string, init?: RequestInit) =>
      String(url).startsWith("https://www.airnowapi.org/")
        ? new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))
        : Promise.resolve(new Response(observedRow)),
    ));
    expect((await getAirQuality(FREDERICK_CENTER, { deadlineMs: 50 }))?.[0].aqi).toBe(51);
  });

  it("serves current regional observations at the documented city point only and never substitutes forecasts", async () => {
    vi.useFakeTimers().setSystemTime(noon);
    delete process.env.AIRNOW_API_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(forecastRow)));
    expect(await getAirQuality(FREDERICK_CENTER)).toEqual([]);
    expect(await getAirQuality({ lat: 39.311, lng: -77.626 })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the published observation at the city point without an API key", async () => {
    vi.useFakeTimers().setSystemTime(noon);
    delete process.env.AIRNOW_API_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(observedRow)));
    expect((await getAirQuality(FREDERICK_CENTER))?.[0].aqi).toBe(51);
  });
});
