import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  askFrederick: vi.fn(),
  approxLocation: vi.fn(),
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
  readJsonBodyWithLimit: vi.fn(),
  meterUsage: vi.fn(),
  getNwsAlertsResult: vi.fn(),
  getAirQuality: vi.fn(),
  getFrederickOutagesResult: vi.fn(),
  getCurrentSituationSnapshot: vi.fn(),
  selectChartIncidentsResult: vi.fn(),
  getFcpsAlertsResult: vi.fn(),
  getCivicPressReleasesResult: vi.fn(),
}));

vi.mock("@/lib/ask/answer", () => ({ askFrederick: mocks.askFrederick }));
vi.mock("@/lib/ip-geo", () => ({ approxLocation: mocks.approxLocation }));
vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
  readJsonBodyWithLimit: mocks.readJsonBodyWithLimit,
}));
vi.mock("@/lib/usage-meter", () => ({ meterUsage: mocks.meterUsage }));
vi.mock("@/lib/integrations/nws-alerts", () => ({ getNwsAlertsResult: mocks.getNwsAlertsResult }));
vi.mock("@/lib/integrations/firstenergy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/firstenergy")>();
  return { ...actual, getFrederickOutagesResult: mocks.getFrederickOutagesResult };
});
vi.mock("@/lib/live/currentSituation", () => ({
  getCurrentSituationSnapshot: mocks.getCurrentSituationSnapshot,
}));
vi.mock("@/lib/live/currentSituationModel", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/live/currentSituationModel")>();
  return {
    ...actual,
    selectChartIncidentsResult: mocks.selectChartIncidentsResult,
  };
});
vi.mock("@/lib/integrations/fcps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/fcps")>();
  return { ...actual, getFcpsAlertsResult: mocks.getFcpsAlertsResult };
});
vi.mock("@/lib/integrations/civic-press", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/civic-press")>();
  return {
    ...actual,
    getCivicPressReleasesResult: mocks.getCivicPressReleasesResult,
  };
});
vi.mock("@/lib/integrations/airnow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/airnow")>();
  return { ...actual, getAirQuality: mocks.getAirQuality };
});
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    // Production schedules this telemetry after the response. Unit tests do
    // not run inside the request scope that Next's `after()` requires.
    after: vi.fn(),
  };
});

import { POST } from "./route";

function request(cookie?: string) {
  return new NextRequest("https://frederickradius.app/api/ask", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://frederickradius.app",
      "x-forwarded-for": "198.51.100.42",
      ...(cookie ? { cookie } : {}),
    },
    body: "{}",
  });
}

describe("/api/ask location policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.readJsonBodyWithLimit.mockResolvedValue({ ok: true, value: { query: "coffee near me" } });
    mocks.approxLocation.mockResolvedValue({
      origin: { lng: -77.6278, lat: 39.3143 },
      status: "available",
    });
    mocks.getNwsAlertsResult.mockResolvedValue({ available: true, alerts: [] });
    mocks.getAirQuality.mockResolvedValue(null);
    mocks.getFrederickOutagesResult.mockResolvedValue({
      available: true,
      asOf: "2026-07-27T13:00:00.000Z",
      data: {
        total_out: 42,
        total_served: 100_000,
        munis: [],
      },
    });
    mocks.getCurrentSituationSnapshot.mockResolvedValue({});
    mocks.selectChartIncidentsResult.mockReturnValue({
      available: true,
      data: [],
    });
    mocks.getFcpsAlertsResult.mockResolvedValue({
      available: true,
      data: [],
    });
    mocks.getCivicPressReleasesResult.mockResolvedValue({
      items: [],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    mocks.askFrederick.mockResolvedValue({
      status: "matches",
      configured: true,
      usedModel: false,
      answer: "Countywide matches.",
      sources: [],
    });
  });

  it("ignores network/IP location and falls back to an explicit countywide context", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.approxLocation).not.toHaveBeenCalled();
    expect(mocks.askFrederick).toHaveBeenCalledWith(
      "coffee near me",
      {
        origin: null,
        municipality: null,
        contextLabel: "Whole county",
        canShowDistance: false,
        fallbackReason: "location-unavailable",
      },
      { taste: undefined },
    );
  });

  it("uses a rounded device fix when the visitor supplied one", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { query: "coffee near me", lat: 39.41437, lng: -77.41062 },
    });

    await POST(request());

    expect(mocks.askFrederick).toHaveBeenCalledWith(
      "coffee near me",
      {
        origin: { lat: 39.414, lng: -77.411 },
        municipality: null,
        contextLabel: "Near you",
        canShowDistance: true,
        fallbackReason: null,
      },
      { taste: undefined },
    );
  });

  it("may rank from the saved home town without presenting it as a precise fix", async () => {
    await POST(request("fr_home_muni=brunswick"));

    expect(mocks.askFrederick).toHaveBeenCalledWith(
      "coffee near me",
      expect.objectContaining({
        origin: expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }),
        municipality: null,
        contextLabel: "Ranked from Brunswick",
        fallbackReason: null,
      }),
      { taste: undefined },
    );
  });

  it("honors an explicit whole-county scope even when device coordinates are present", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { query: "coffee", scope: "county", lat: 39.41437, lng: -77.41062 },
    });

    await POST(request());

    expect(mocks.askFrederick).toHaveBeenCalledWith(
      "coffee",
      expect.objectContaining({ origin: null, contextLabel: "Whole county" }),
      { taste: undefined },
    );
  });

  it("answers a power-outage question from FirstEnergy without catalog or AirNow cards", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { query: "Is my power out?", lat: 39.41437, lng: -77.41062 },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(mocks.getFrederickOutagesResult).toHaveBeenCalledOnce();
    expect(mocks.askFrederick).not.toHaveBeenCalled();
    expect(mocks.getNwsAlertsResult).not.toHaveBeenCalled();
    expect(mocks.getAirQuality).not.toHaveBeenCalled();
    expect(body.answer).toContain("42 customers without power");
    expect(body.answer).toContain("cannot tell whether a specific address is included");
    expect(body.sources.map((source: { name: string }) => source.name)).toEqual([
      "Potomac Edison outage report",
    ]);
    expect(body.sources.map((source: { name: string }) => source.name)).not.toContain(
      "Outdoor conditions not verified",
    );
    expect(body.actions[0]).toMatchObject({
      label: "Open the official outage map",
      href: "https://outages-mdwv.firstenergycorp.com/",
    });
  });

  it("uses the official power handoff when the FirstEnergy feed is unavailable", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { query: "Are there any power outages in Frederick County?" },
    });
    mocks.getFrederickOutagesResult.mockResolvedValue({
      available: false,
      data: { total_out: 0, total_served: 0, munis: [] },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).toContain("couldn’t load Potomac Edison’s live outage report");
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).toMatchObject({
      name: "Potomac Edison outage report",
      reason: "Live feed unavailable",
    });
    expect(mocks.askFrederick).not.toHaveBeenCalled();
  });

  it("answers a road-closure question from MDOT CHART without catalog or AirNow cards", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        query: "Are roads closed near me?",
        lat: 39.41437,
        lng: -77.41062,
      },
    });
    mocks.selectChartIncidentsResult.mockReturnValue({
      available: true,
      data: [{
        id: "chart-1",
        type: "Incident",
        description: "Crash on US 15",
        county: "Frederick",
        road: "US 15",
        direction: "SB",
        location: "US 15 southbound near Rosemont Avenue",
        lng: -77.421,
        lat: 39.426,
        started_at: new Date(Date.now() - 15 * 60_000).toISOString(),
        severity: "High",
        lanes_affected: "Right lane blocked",
      }],
    });

    const response = await POST(request());
    const body = await response.json();

    expect(mocks.getCurrentSituationSnapshot).toHaveBeenCalledOnce();
    expect(mocks.selectChartIncidentsResult).toHaveBeenCalledOnce();
    expect(mocks.askFrederick).not.toHaveBeenCalled();
    expect(mocks.getNwsAlertsResult).not.toHaveBeenCalled();
    expect(mocks.getAirQuality).not.toHaveBeenCalled();
    expect(body.answer).toContain("MDOT CHART currently lists 1 active traffic incident");
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).toMatchObject({
      category: "traffic",
      eyebrow: "MDOT CHART · Live traffic",
    });
    expect(body.sources[0].href).not.toContain("/places/");
  });

  it("answers an FCPS status question from the official operations feed", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { query: "Are Frederick County schools closed?" },
    });
    mocks.getFcpsAlertsResult.mockResolvedValue({
      available: true,
      data: [{
        id: "fcps-1",
        title: "FCPS schools and offices are closed",
        description: "All activities are canceled.",
        status: "closed",
        published_at: new Date().toISOString(),
        url: "https://www.fcps.org/alerts/closed",
      }],
    });

    const response = await POST(request());
    const body = await response.json();

    expect(mocks.getFcpsAlertsResult).toHaveBeenCalledOnce();
    expect(mocks.askFrederick).not.toHaveBeenCalled();
    expect(mocks.getNwsAlertsResult).not.toHaveBeenCalled();
    expect(mocks.getAirQuality).not.toHaveBeenCalled();
    expect(body.answer).toContain("FCPS currently has this operations notice");
    expect(body.sources.map((source: { name: string }) => source.name)).toEqual([
      "FCPS schools and offices are closed",
    ]);
    expect(body.actions[0]).toMatchObject({
      label: "Check FCPS",
      href: "https://www.fcps.org/",
    });
  });

  it("does not invent a reason for nearby police activity or return place cards", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { query: "What is that police activity?" },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(mocks.askFrederick).not.toHaveBeenCalled();
    expect(mocks.getCivicPressReleasesResult).not.toHaveBeenCalled();
    expect(mocks.getNwsAlertsResult).not.toHaveBeenCalled();
    expect(mocks.getAirQuality).not.toHaveBeenCalled();
    expect(body.answer).toContain("cannot identify a nearby police scene");
    expect(body.sources.map((source: { name: string }) => source.name)).toEqual([
      "Frederick Police calls for service",
      "Official police updates",
      "Radius Scanner",
    ]);
    expect(body.sources.every((source: { href: string }) =>
      !source.href.startsWith("/places/")
    )).toBe(true);
  });

  it("answers a boil-water question only from official civic notices", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { query: "Is there a boil water advisory?" },
    });
    mocks.getCivicPressReleasesResult.mockResolvedValue({
      items: [{
        title: "Boil Water Advisory for East Street",
        url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=123",
        source: "City of Frederick",
        sourceShort: "City",
        publishedAt: new Date().toISOString(),
        lane: "advisory",
      }],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(mocks.getCivicPressReleasesResult).toHaveBeenCalledOnce();
    expect(mocks.askFrederick).not.toHaveBeenCalled();
    expect(mocks.getNwsAlertsResult).not.toHaveBeenCalled();
    expect(mocks.getAirQuality).not.toHaveBeenCalled();
    expect(body.answer).toContain("latest official water-related notice");
    expect(body.answer).toContain("whether it is still in effect");
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).toMatchObject({
      name: "Boil Water Advisory for East Street",
      category: "water",
    });
  });

  it("removes an outdoor recommendation during an active severe-weather alert", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({ ok: true, value: { query: "somewhere for kids in the rain" } });
    mocks.askFrederick.mockResolvedValue({
      status: "answered",
      configured: true,
      usedModel: true,
      answer: "Take the kids to Hill Street Skate Park.",
      sources: [{
        slug: "hill-street-skate-park-frederick",
        name: "Hill Street Skate Park",
        category: "park",
        href: "/places/hill-street-skate-park-frederick",
      }],
    });
    mocks.getNwsAlertsResult.mockResolvedValue({ available: true, alerts: [{
      id: "storm-1",
      event: "Severe Thunderstorm Warning",
      headline: "Severe Thunderstorm Warning for Frederick County",
      description: "Frequent lightning is occurring.",
      severity: "Severe",
      urgency: "Immediate",
      certainty: "Observed",
      starts_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      ends_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      area: "Frederick County, MD",
      url: "https://api.weather.gov/alerts/storm-1",
    }] });

    const response = await POST(request());
    const body = await response.json();

    expect(body.answer).toContain("leaving outdoor suggestions out");
    expect(body.answer).not.toContain("Hill Street Skate Park");
    expect(body.sources.map((source: { name: string }) => source.name)).toEqual(["Severe Thunderstorm Warning"]);
  });

  it("removes unclassified outdoor event results during fresh unhealthy AQI", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({ ok: true, value: { query: "find an outdoor concert tonight" } });
    mocks.askFrederick.mockResolvedValue({
      status: "answered",
      configured: true,
      usedModel: true,
      answer: "Go to the creekside concert tonight.",
      sources: [{
        slug: "creekside-concert",
        name: "Creekside concert",
        category: "event",
        href: "/events/creekside-concert",
      }],
      plan: {
        title: "Outdoor music",
        summary: "A concert outside",
        href: "/plan/outdoor-music",
        stops: [{
          order: 1,
          time: "7:00 PM",
          name: "Creekside concert",
          category: "event",
          href: "/events/creekside-concert",
          why: "Live music",
          status: "Scheduled",
        }],
      },
    });
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    mocks.getAirQuality.mockResolvedValue([{
      parameter: "PM2.5",
      aqi: 168,
      category: { id: 4, name: "Unhealthy", color: "#A02929" },
      reportingArea: "Frederick",
      dateObserved: `${part("year")}-${part("month")}-${part("day")}`,
      hourObserved: Number(part("hour")) % 24,
    }]);

    const response = await POST(request());
    const body = await response.json();

    expect(body.answer).toContain("AirNow reports AQI 168, Unhealthy");
    expect(body.answer).not.toContain("creekside concert");
    expect(body.sources.map((source: { name: string }) => source.name)).toEqual(["Air quality · AQI 168"]);
    expect(body.plan).toBeNull();
  });
});
