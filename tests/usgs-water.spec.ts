import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFrederickWaterSites,
  getGaugeHistory,
  getFrederickWaterSitesWithHistoryResult,
} from "@/lib/integrations/usgsWater";
import { HIGH_VALUE_SOURCE_ENDPOINTS } from "@/lib/quality/feed-health";

// Official OGC features from Nov 24, 2026. The station ID, parameter,
// statistic, unit and observation time are separate provider fields.
const NOW = new Date("2026-11-24T15:55:00Z");
const JUG = "USGS-01643000";
const DICKERSON = "USGS-01643580";
const stations = [
  { id: JUG, geometry: { type: "Point", coordinates: [-77.3660833, 39.4028333] },
    properties: { monitoring_location_name: "MONOCACY RIVER AT JUG BRIDGE NEAR FREDERICK, MD", state_code: "24", county_code: "021" } },
  { id: DICKERSON, geometry: { type: "Point", coordinates: [-77.4357417, 39.2633972] },
    properties: { monitoring_location_name: "MONOCACY RIVER NEAR DICKERSON, MD", state_code: "24", county_code: "021" } },
];
function observation(overrides: Record<string, unknown> = {}) {
  return { type: "Feature", geometry: null, properties: {
    monitoring_location_id: JUG, parameter_code: "00065", statistic_id: "00011",
    unit_of_measure: "ft", time: "2026-11-24T15:30:00+00:00", value: "1.50", ...overrides,
  } };
}
function collection(features: unknown[], next?: string) {
  return Response.json({ type: "FeatureCollection", features, links: next ? [{ rel: "next", href: next }] : [] });
}
function mockFeed(handler: (url: URL) => Response) {
  const fetchMock = vi.fn((input: string) => Promise.resolve(handler(new URL(input))));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const isMetadata = (url: URL) => url.pathname.endsWith("monitoring-locations/items");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("USGS Frederick County observations", () => {
  it("follows the county cursor, joins official names, validates units, and sorts and deduplicates each series", async () => {
    const fetchMock = mockFeed((url) => {
      expect(url.origin).toBe("https://api.waterdata.usgs.gov");
      expect(url.searchParams.get("state_code")).toBe("24");
      expect(url.searchParams.get("county_code")).toBe("021");
      if (isMetadata(url)) {
        expect(url.searchParams.get("monitoring_location_number")).toBe("01643000,01643580");
        return collection(stations);
      }
      expect(url.pathname).toBe("/ogcapi/v1/collections/continuous/items");
      expect(url.searchParams.get("parameter_code")).toBe("00065,00060");
      if (url.searchParams.has("cursor")) return collection([
        observation({ monitoring_location_id: DICKERSON, value: "1.18" }),
        observation({ parameter_code: "00060", unit_of_measure: "ft^3/s", value: "172" }),
        observation(),
        observation({ time: "2026-11-24T14:00:00Z", value: "2.40" }),
      ]);
      const next = new URL(url); next.searchParams.set("cursor", "second");
      return collection([observation()], next.toString());
    });
    const { available, data } = await getFrederickWaterSitesWithHistoryResult("PT6H");
    expect(available).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(data.map(s => s.id)).toEqual(["01643000", "01643580"]);
    expect(data[0]).toMatchObject({
      name: stations[0].properties.monitoring_location_name, river: "MONOCACY RIVER",
      lat: 39.4028333, gageHeightFt: 1.5, streamflowCfs: 172,
      observedAt: "2026-11-24T15:30:00.000Z",
      gageHistory: [{ value: 2.4, at: "2026-11-24T14:00:00.000Z" }, { value: 1.5, at: "2026-11-24T15:30:00.000Z" }],
    });
    expect(data[0].municipality).toBeTruthy();
    expect(data[0].floodStages).toBeDefined();
  });

  it("uses the agency's latest readings collection without attaching history", async () => {
    mockFeed(url => {
      if (isMetadata(url)) return collection(stations);
      expect(url.pathname).toContain("/latest-continuous/items");
      return collection([observation()]);
    });
    const [site] = await getFrederickWaterSites();
    expect(site.gageHeightFt).toBe(1.5);
    expect(site.gageHistory).toBeUndefined();
  });

  it.each([["PT6H", false], ["P1D", false], ["P7D", true]] as const)(
    "keeps observations within %s, including older valid history only when requested", async (period, includeOlder) => {
      mockFeed(url => isMetadata(url) ? collection(stations) : collection([
        observation(), observation({ time: "2026-11-22T15:30:00Z", value: "1.9" }),
        observation({ time: "1990-01-01T00:00:00Z" }), observation({ time: "2026-11-24T16:00:00Z" }),
      ]));
      const { data } = await getFrederickWaterSitesWithHistoryResult(period);
      expect(data[0].gageHistory?.map(r => r.value)).toEqual(includeOlder ? [1.9, 1.5] : [1.5]);
    },
  );

  it("requests only the selected gauge for longer historical ranges and keeps old readings out of current conditions", async () => {
    const fetch = mockFeed((url) => {
      expect(url.searchParams.get("monitoring_location_id")).toBe(JUG);
      expect(url.searchParams.get("county_code")).toBe("021");
      return collection([observation({ value: "7.2", time: "2026-11-21T15:30:00Z" }),
        observation({ monitoring_location_id: DICKERSON, value: "9" })]);
    });
    const history = await getGaugeHistory("01643000", "P7D");
    expect(history).toEqual({ end: NOW.toISOString(), flow: [], height: [{ value: 7.2, at: "2026-11-21T15:30:00.000Z" }] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never revives an old height or flood category with a recent flow measurement", async () => {
    mockFeed(url => isMetadata(url) ? collection(stations) : collection([
      observation({ value: "25", time: "2026-11-24T12:00:00Z" }),
      observation({ parameter_code: "00060", unit_of_measure: "ft^3/s", value: "0" }),
      observation({ value: null }), observation({ value: " " }), observation({ value: "Ice" }),
      observation({ value: "-999999" }), observation({ unit_of_measure: "m" }),
      observation({ parameter_code: "00060", unit_of_measure: "m^3/s" }),
      observation({ statistic_id: "00003" }), observation({ time: "invalid" }),
    ]));
    const { data: [site] } = await getFrederickWaterSitesWithHistoryResult("PT6H");
    expect(site.streamflowCfs).toBe(0);
    expect(site.gageHeightFt).toBeUndefined();
    expect(site.gageHistory).toBeUndefined();
    expect(site.floodStages).toBeUndefined();
  });

  it("requires a real county station with a name and coordinates", async () => {
    mockFeed(url => isMetadata(url) ? collection([
      { ...stations[0], properties: { ...stations[0].properties, county_code: "031" } },
      { ...stations[1], geometry: null },
    ]) : collection([observation(), observation({ monitoring_location_id: DICKERSON })]));
    expect((await getFrederickWaterSitesWithHistoryResult()).data).toEqual([]);
  });

  it("distinguishes a successful empty observation window from a provider failure", async () => {
    const fetchMock = mockFeed(() => collection([]));
    expect(await getFrederickWaterSitesWithHistoryResult()).toEqual({ available: true, data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["invalid payload", "failed next page", "invalid cursor", "failed metadata", "network failure"])(
    "returns an unavailable result after %s instead of publishing partial readings", async failure => {
      mockFeed(url => {
        if (failure === "invalid payload") return Response.json({ error: "service unavailable" });
        if (failure === "network failure") throw new Error("network");
        if (failure === "failed metadata") return isMetadata(url) ? new Response(null, { status: 503 }) : collection([observation()]);
        if (url.searchParams.has("cursor")) return new Response(null, { status: 429 });
        const next = new URL(url);
        if (failure === "invalid cursor") next.host = "example.com";
        next.searchParams.set("cursor", "second");
        return collection([observation()], next.toString());
      });
      expect(await getFrederickWaterSitesWithHistoryResult()).toEqual({ available: false, data: [] });
    },
  );

  it("probes the current USGS county gauge observation format", () => {
    const probe = HIGH_VALUE_SOURCE_ENDPOINTS.find(endpoint => endpoint.sourceId === "usgs_water");
    expect(probe?.url).toContain("/ogcapi/v1/collections/latest-continuous/items");
    expect(probe?.bodyPattern?.test(JSON.stringify({ type: "FeatureCollection", features: [observation()] }))).toBe(true);
    expect(probe?.bodyPattern?.test('{"error":"upstream unavailable"}')).toBe(false);
  });
});
