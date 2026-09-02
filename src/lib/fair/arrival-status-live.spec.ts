import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChartIncidentsFrederickResult: vi.fn(),
  getMdotWorkZonesFrederickResult: vi.fn(),
  getNwsAlertsResult: vi.fn(),
  getOfficialCivicAlertsResult: vi.fn(),
  getStopPredictionsResult: vi.fn(),
  getTransitServiceAlertsResult: vi.fn(),
}));

vi.mock("@/lib/integrations/mdot-chart", () => ({
  getChartIncidentsFrederickResult: mocks.getChartIncidentsFrederickResult,
  chartHeroSentence: vi.fn(() => "A Frederick County road has a reported incident."),
  chartTodayTitle: vi.fn(() => "Traffic incident"),
  qualifiesForToday: vi.fn(() => true),
}));

vi.mock("@/lib/integrations/mdot-wzdx", () => ({
  MDOT_WZDX_SOURCE_URL: "https://filter.ritis.org/wzdx_v4.1/mdot.geojson",
  getMdotWorkZonesFrederickResult: mocks.getMdotWorkZonesFrederickResult,
}));

vi.mock("@/lib/integrations/nws-alerts", () => ({
  getNwsAlertsResult: mocks.getNwsAlertsResult,
}));

vi.mock("@/lib/integrations/official-alert-feeds", () => ({
  getOfficialCivicAlertsResult: mocks.getOfficialCivicAlertsResult,
  isLocallyRelevantCivicAlert: vi.fn(() => true),
}));

vi.mock("@/lib/integrations/transitRealtime", () => ({
  getStopPredictionsResult: mocks.getStopPredictionsResult,
  getTransitServiceAlertsResult: mocks.getTransitServiceAlertsResult,
}));

import { getFairArrivalStatus } from "./arrival-status-live";

const NOW = new Date("2026-09-18T16:00:00.000Z");

describe("getFairArrivalStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getChartIncidentsFrederickResult.mockResolvedValue({
      data: [],
      available: true,
      asOf: NOW.toISOString(),
    });
    mocks.getMdotWorkZonesFrederickResult.mockResolvedValue({
      data: [],
      available: true,
      asOf: NOW.toISOString(),
      sourceUrl: "https://filter.ritis.org/wzdx_v4.1/mdot.geojson",
    });
    mocks.getNwsAlertsResult.mockResolvedValue({
      alerts: [],
      available: true,
      checkedAt: NOW.toISOString(),
    });
    mocks.getOfficialCivicAlertsResult.mockResolvedValue({
      alerts: [],
      available: true,
      degraded: false,
      coverageComplete: false,
      coverageNote: "These alert categories are not complete coverage.",
      sourceHealth: [],
    });
    mocks.getStopPredictionsResult.mockResolvedValue({
      data: [],
      status: "ok",
      available: true,
      feedTimestamp: NOW.getTime() / 1_000,
      receivedAt: NOW.getTime(),
    });
    mocks.getTransitServiceAlertsResult.mockResolvedValue({
      data: [],
      status: "ok",
      available: true,
      feedTimestamp: NOW.getTime() / 1_000,
      receivedAt: NOW.getTime(),
    });
  });

  it("does not call live providers for a selected Fair date that is not today", async () => {
    const status = await getFairArrivalStatus({
      selectedDate: "2026-09-19",
      now: NOW,
    });

    expect(status.state).toBe("not-today");
    expect(mocks.getChartIncidentsFrederickResult).not.toHaveBeenCalled();
    expect(mocks.getMdotWorkZonesFrederickResult).not.toHaveBeenCalled();
    expect(mocks.getNwsAlertsResult).not.toHaveBeenCalled();
    expect(mocks.getOfficialCivicAlertsResult).not.toHaveBeenCalled();
    expect(mocks.getStopPredictionsResult).not.toHaveBeenCalled();
    expect(mocks.getTransitServiceAlertsResult).not.toHaveBeenCalled();
  });

  it("checks base official feeds without starting transit for another mode", async () => {
    const status = await getFairArrivalStatus({
      selectedDate: "2026-09-18",
      now: NOW,
    });

    expect(status.state).toBe("no-current-update");
    expect(mocks.getChartIncidentsFrederickResult).toHaveBeenCalledOnce();
    expect(mocks.getMdotWorkZonesFrederickResult).toHaveBeenCalledOnce();
    expect(mocks.getNwsAlertsResult).toHaveBeenCalledOnce();
    expect(mocks.getOfficialCivicAlertsResult).toHaveBeenCalledOnce();
    expect(mocks.getStopPredictionsResult).not.toHaveBeenCalled();
    expect(mocks.getTransitServiceAlertsResult).not.toHaveBeenCalled();
  });

  it("checks transit only after it is selected and preserves a healthy empty result", async () => {
    const status = await getFairArrivalStatus({
      selectedDate: "2026-09-18",
      includeTransit: true,
      now: NOW,
    });

    expect(mocks.getStopPredictionsResult).toHaveBeenCalledOnce();
    expect(mocks.getTransitServiceAlertsResult).toHaveBeenCalledOnce();
    expect(status.transit).toMatchObject({
      state: "no-live-arrival",
      arrivals: [],
    });
    expect(status.transit?.message).toContain(
      "does not mean service is not running",
    );
  });
});
