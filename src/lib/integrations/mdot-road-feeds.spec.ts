import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHART_ROAD_SOURCES,
  cleanChartDmsMessage,
  getChartRoadWeatherFrederickResult,
  normalizeChartHighwayMessages,
  normalizeChartRoadConditions,
  normalizeChartRoadWeather,
  normalizeChartSnowEmergency,
  normalizeChartSpeedSensors,
  normalizeChartTravelTimes,
} from "./mdot-road-feeds";

const NOW = new Date("2026-07-28T16:00:00.000Z");
const RECENT = NOW.getTime() - 2 * 60 * 1_000;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CHART speed and travel-time feeds", () => {
  it("keeps only current, online Frederick sensor zones", () => {
    const rows = normalizeChartSpeedSensors([
      {
        id: "speed-1",
        name: "S710006",
        description: "I-270 at MD 85",
        lat: 39.37959,
        lon: -77.40808,
        lastUpdateTime: RECENT,
        opStatus: "OK",
        commMode: "ONLINE",
        zones: [
          { bearing: 295, direction: "SOUTH", speed: 63 },
          { bearing: 115, direction: "NORTH", speed: -1 },
        ],
      },
      {
        id: "offline",
        lat: 39.4,
        lon: -77.4,
        lastUpdateTime: RECENT,
        opStatus: "COMM_FAILURE",
        commMode: "OFFLINE",
        zones: [{ speed: 50 }],
      },
    ], NOW);

    expect(rows).toEqual([expect.objectContaining({
      id: "speed-1",
      zones: [{ bearing: 295, direction: "south", speedMph: 63 }],
      evidence: "device-observation",
      sourceUrl: CHART_ROAD_SOURCES.speeds,
    })]);
  });

  it("requires DATA_OK, current values, and a Frederick route segment", () => {
    const base = {
      id: "travel-1",
      name: "I-270 North, I-370 to I-70",
      length: 23.126,
      speed: 65,
      travelTimeSecs: 1380,
      trend: "UP",
      statsState: "DATA_OK",
      updateTime: RECENT,
      locations: [
        {
          countyName: "Frederick County",
          direction: "NORTH",
          routeNumber: "270",
          routePrefix: "I",
        },
      ],
    };
    expect(normalizeChartTravelTimes([base], NOW)).toEqual([
      expect.objectContaining({
        id: "travel-1",
        distanceMiles: 23.126,
        averageSpeedMph: 65,
        travelTimeSeconds: 1380,
        trend: "longer",
        roads: ["I-270"],
      }),
    ]);
    expect(normalizeChartTravelTimes([
      { ...base, id: "bad-quality", statsState: "BAD_QUALITY" },
      {
        ...base,
        id: "other-county",
        locations: [{ countyName: "Howard County", routeNumber: "70", routePrefix: "I" }],
      },
    ], NOW)).toEqual([]);
  });
});

describe("CHART DMS and RWIS feeds", () => {
  it("decodes the safe text from CHART's encoded message table", () => {
    expect(cleanChartDmsMessage({
      msgPlain: "",
      msgHTML:
        "&lt;table&gt;&lt;tr&gt;&lt;td&gt;I-270 4 MI 4 MIN&lt;/td&gt;&lt;/tr&gt;" +
        "&lt;tr&gt;&lt;td&gt;USE CAUTION&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;",
    })).toBe("I-270 4 MI 4 MIN · USE CAUTION");
  });

  it("drops blank, failed, stale, and out-of-county signs", () => {
    const base = {
      id: "sign-1",
      description: "I-70 West past MD 144",
      lat: 39.403824,
      lon: -77.34601,
      lastCachedDataUpdateTime: RECENT,
      opStatus: "OK",
      commMode: "ONLINE",
      msgPlain: "I-270 4 MI 4 MIN",
      beaconsEnabled: true,
    };
    expect(normalizeChartHighwayMessages([base], NOW)).toEqual([
      expect.objectContaining({
        id: "sign-1",
        message: "I-270 4 MI 4 MIN",
        beaconsEnabled: true,
        evidence: "device-observation",
      }),
    ]);
    expect(normalizeChartHighwayMessages([
      { ...base, id: "blank", msgPlain: "", msgHTML: "&lt;table&gt;&lt;/table&gt;" },
      { ...base, id: "failed", opStatus: "COMM_FAILURE" },
      { ...base, id: "outside", lat: 39.29, lon: -76.61 },
      { ...base, id: "stale", lastCachedDataUpdateTime: NOW.getTime() - 13 * 60 * 60 * 1_000 },
    ], NOW)).toEqual([]);
  });

  it("normalizes station measurements without deriving a safety verdict", () => {
    const rows = normalizeChartRoadWeather([{
      id: "rwis-1",
      name: "I-70 at South Mountain",
      lat: 39.511963,
      lon: -77.59342,
      lastUpdate: RECENT,
      fullRWIS: true,
      airTemp: "31F",
      dewPoint: "29F",
      pavementTemp: "28F to 30F",
      precipitationType: "Snow",
      relativeHumidity: "92%",
      gustSpeed: "18 MPH",
      visibility: "0.8 miles",
      windDescription: "NW 12 MPH",
    }], NOW);

    expect(rows).toEqual([expect.objectContaining({
      id: "rwis-1",
      airTemperatureF: 31,
      pavementTemperatureF: { low: 28, high: 30 },
      precipitationType: "Snow",
      visibilityMiles: 0.8,
      scope: "at-station",
      evidence: "device-observation",
    })]);
    expect(rows[0]).not.toHaveProperty("safe");
    expect(rows[0]).not.toHaveProperty("roadCondition");
  });
});

describe("CHART area conditions and snow declarations", () => {
  it("labels shop reports as area evidence and ignores deprecated equipment", () => {
    const rows = normalizeChartRoadConditions([{
      id: "shop-1",
      name: "Frederick Shop",
      county: "Frederick",
      lat: 39.414,
      lon: -77.410,
      lastUpdate: RECENT,
      interstate: { description: "Wet", group: 0 },
      primary: { description: "Restricted Lanes", group: 2 },
      secondary: { description: "N/A", group: -1 },
      totalVehicles: 99,
    }], NOW);

    expect(rows).toEqual([expect.objectContaining({
      id: "shop-1",
      conditions: {
        interstate: { description: "Wet", providerGroup: 0 },
        primary: { description: "Restricted Lanes", providerGroup: 2 },
        secondary: null,
      },
      scope: "maintenance-shop-area",
      evidence: "official-area-report",
    })]);
    expect(rows[0]).not.toHaveProperty("totalVehicles");
    expect(rows[0]).not.toHaveProperty("safe");
  });

  it("keeps an active declaration and a recent lift, but drops old lifts", () => {
    const active = {
      id: "snow-active",
      countyId: 11,
      name: "Frederick County",
      timeDeclared: "2026-07-28T12:00:00Z",
      timeLifted: "",
      snowEmergencyExceptionMsg: "MD 85 is excluded.",
    };
    const lifted = {
      ...active,
      id: "snow-lifted",
      timeLifted: "2026-07-28T15:00:00Z",
    };
    expect(normalizeChartSnowEmergency([active, lifted], NOW)).toEqual([
      expect.objectContaining({ id: "snow-active", status: "active", liftedAt: null }),
      expect.objectContaining({ id: "snow-lifted", status: "lifted" }),
    ]);
    expect(normalizeChartSnowEmergency([{
      ...lifted,
      timeDeclared: "2026-07-26T10:00:00Z",
      timeLifted: "2026-07-27T10:00:00Z",
    }], NOW)).toEqual([]);
  });
});

describe("CHART fetch boundary", () => {
  it("distinguishes a valid empty feed from an upstream failure", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ data: [], success: true, totalCount: 0 }), {
        status: 200,
        headers: { Date: "Tue, 28 Jul 2026 16:00:00 GMT" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getChartRoadWeatherFrederickResult({ now: NOW })).resolves.toEqual({
      data: [],
      available: true,
      asOf: "2026-07-28T16:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      CHART_ROAD_SOURCES.weatherStations,
      expect.objectContaining({ cache: "no-store" }),
    );

    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () =>
      new Response("down", { status: 503 })));
    await expect(getChartRoadWeatherFrederickResult({ now: NOW })).resolves.toEqual({
      data: [],
      available: false,
    });
  });

  it("aborts a stalled request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")));
      });
    }));

    const pending = getChartRoadWeatherFrederickResult({ deadlineMs: 50, now: NOW });
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toEqual({ data: [], available: false });
    expect(signal?.aborted).toBe(true);
  });
});
