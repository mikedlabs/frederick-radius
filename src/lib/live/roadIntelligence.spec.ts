import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workZones: vi.fn(),
  speeds: vi.fn(),
  travelTimes: vi.fn(),
  messages: vi.fn(),
  weatherStations: vi.fn(),
  roadConditions: vi.fn(),
  snowEmergency: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (load: () => unknown) => load,
}));

vi.mock("react", () => ({
  cache: (load: () => unknown) => load,
}));

vi.mock("@/lib/integrations/mdot-wzdx", () => ({
  MDOT_WZDX_SOURCE_URL: "https://example.test/work-zones.geojson",
  getMdotWorkZonesFrederickResult: mocks.workZones,
}));

vi.mock("@/lib/integrations/mdot-road-feeds", () => ({
  getChartSpeedSensorsFrederickResult: mocks.speeds,
  getChartTravelTimesFrederickResult: mocks.travelTimes,
  getChartHighwayMessagesFrederickResult: mocks.messages,
  getChartRoadWeatherFrederickResult: mocks.weatherStations,
  getChartRoadConditionsFrederickResult: mocks.roadConditions,
  getChartSnowEmergencyFrederickResult: mocks.snowEmergency,
}));

import { getRoadIntelligenceSnapshot } from "./roadIntelligence";

const unavailable = { data: [], available: false };

describe("road intelligence request boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.workZones.mockReset();
    mocks.speeds.mockReset();
    mocks.travelTimes.mockReset();
    mocks.messages.mockReset();
    mocks.weatherStations.mockReset();
    mocks.roadConditions.mockReset();
    mocks.snowEmergency.mockReset();
    mocks.speeds.mockResolvedValue(unavailable);
    mocks.travelTimes.mockResolvedValue(unavailable);
    mocks.messages.mockResolvedValue(unavailable);
    mocks.weatherStations.mockResolvedValue(unavailable);
    mocks.roadConditions.mockResolvedValue(unavailable);
    mocks.snowEmergency.mockResolvedValue(unavailable);
  });

  it("settles as unknown when a cached source promise never resolves", async () => {
    mocks.workZones.mockReturnValue(new Promise(() => {}));

    const pending = getRoadIntelligenceSnapshot();
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(pending).resolves.toMatchObject({
      summary: {
        status: "unknown",
        coverage: "partial",
        activeCount: 0,
      },
    });
  });
});
