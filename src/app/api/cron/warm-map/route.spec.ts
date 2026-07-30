import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  chart: vi.fn(),
  fixit: vi.fn(),
  mapillary: vi.fn(),
  trails: vi.fn(),
  transit: vi.fn(),
  muniBounds: vi.fn(),
  countyBounds: vi.fn(),
  water: vi.fn(),
  ev: vi.fn(),
  cemeteries: vi.fn(),
  parkAssets: vi.fn(),
  floodContext: vi.fn(),
  snowRoutes: vi.fn(),
  reports: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/integrations/mdot-chart", () => ({
  getChartIncidentsFrederick: mocks.chart,
}));
vi.mock("@/lib/integrations/seeclickfix", () => ({
  getFixItIssues: mocks.fixit,
}));
vi.mock("@/lib/integrations/mapillary", () => ({
  fetchMapillaryTrash: mocks.mapillary,
}));
vi.mock("@/lib/integrations/fcTrails", () => ({
  getFrederickTrailShapes: mocks.trails,
}));
vi.mock("@/lib/integrations/transitFrederick", () => ({
  getFrederickTransitRouteShapes: mocks.transit,
}));
vi.mock("@/lib/integrations/fcGis", () => ({
  getMunicipalBoundaries: mocks.muniBounds,
  getCountyBoundary: mocks.countyBounds,
}));
vi.mock("@/lib/integrations/usgsWater", () => ({
  getFrederickWaterSites: mocks.water,
}));
vi.mock("@/lib/integrations/evCharging", () => ({
  getEvChargingStations: mocks.ev,
}));
vi.mock("@/lib/integrations/fcCemeteries", () => ({
  getHistoricCemeteries: mocks.cemeteries,
}));
vi.mock("@/lib/integrations/fcParkAssetsPublic", () => ({
  getPublicCountyParkAssets: mocks.parkAssets,
}));
vi.mock("@/lib/integrations/fcFloodRisk", () => ({
  getCountyFloodContext: mocks.floodContext,
}));
vi.mock("@/lib/integrations/fcSnowCommand", () => ({
  getCountySnowRoutes: mocks.snowRoutes,
}));
vi.mock("@/lib/loaders/communityReports", () => ({
  getCommunityReports: mocks.reports,
}));

import {
  GET,
  MAP_FEED_DEADLINE_MS,
  maxDuration,
} from "./route";

const request = () =>
  new Request("https://frederickradius.app/api/cron/warm-map");

describe("GET /api/cron/warm-map", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    for (const warm of [
      mocks.chart,
      mocks.fixit,
      mocks.mapillary,
      mocks.trails,
      mocks.transit,
      mocks.muniBounds,
      mocks.countyBounds,
      mocks.water,
      mocks.ev,
      mocks.cemeteries,
      mocks.parkAssets,
      mocks.floodContext,
      mocks.snowRoutes,
      mocks.reports,
    ]) {
      warm.mockResolvedValue([]);
    }
  });

  it("warms every map cache under its own bounded cron", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(maxDuration).toBe(45);
    expect(response.status).toBe(200);
    expect(mocks.fixit).toHaveBeenCalledWith(30);
    expect(body).toMatchObject({
      ok: true,
      mapFeeds: {
        chart: true,
        fixit: true,
        mapillary: true,
        trails: true,
        transit: true,
        "muni-bounds": true,
        "county-bounds": true,
        water: true,
        ev: true,
        cemeteries: true,
        "park-assets": true,
        "flood-context": true,
        "snow-routes": true,
        reports: true,
      },
      feedDetails: {
        "park-assets": {
          status: "fulfilled",
          count: 0,
          availability: null,
        },
      },
    });
  });

  it("keeps an optional map-source rejection fail-soft and red in its summary", async () => {
    mocks.ev.mockRejectedValue(
      new Error("https://secret.invalid/upstream"),
    );

    const response = await GET(request());
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(bodyText).not.toContain("secret.invalid");
    expect(JSON.parse(bodyText)).toMatchObject({
      ok: false,
      mapFeeds: { ev: false },
    });
  });

  it("stops waiting for a hung optional map source inside its route budget", async () => {
    vi.useFakeTimers();
    mocks.reports.mockImplementation(
      () => new Promise(() => undefined),
    );

    const responsePromise = GET(request());
    await vi.advanceTimersByTimeAsync(MAP_FEED_DEADLINE_MS);
    const response = await responsePromise;
    const body = await response.json();

    expect(MAP_FEED_DEADLINE_MS).toBeLessThan(
      maxDuration * 1_000 - 10_000,
    );
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: false,
      mapFeeds: { reports: false },
    });
  });
});
