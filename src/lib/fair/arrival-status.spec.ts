import { describe, expect, it } from "vitest";

import type { ChartIncident } from "@/lib/integrations/mdot-chart";
import {
  MDOT_WZDX_SOURCE_URL,
  type MdotWorkZone,
} from "@/lib/integrations/mdot-wzdx";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { OfficialCivicAlert } from "@/lib/integrations/official-alert-feeds";

import {
  buildFairArrivalNotTodayStatus,
  buildFairArrivalStatus,
  isSelectedFairDateToday,
  type BuildFairArrivalStatusInput,
} from "./arrival-status";

const NOW = "2026-09-18T16:00:00.000Z";

function baseInput(): BuildFairArrivalStatusInput {
  return {
    now: NOW,
    chart: {
      checkedAt: NOW,
      result: { data: [], available: true, asOf: NOW },
    },
    workZones: {
      checkedAt: NOW,
      result: {
        data: [],
        available: true,
        asOf: NOW,
        sourceUrl: MDOT_WZDX_SOURCE_URL,
      },
    },
    weather: {
      checkedAt: NOW,
      result: { alerts: [], available: true, checkedAt: NOW },
    },
    civic: {
      checkedAt: NOW,
      result: {
        alerts: [],
        available: true,
        degraded: false,
        coverageComplete: false,
        coverageNote: "These alert categories are not complete coverage.",
        sourceHealth: [],
      },
    },
  };
}

function chartIncident(
  overrides: Partial<ChartIncident> = {},
): ChartIncident {
  return {
    id: "chart-i70",
    type: "Incident",
    description: "Crash near MD 85",
    county: "Frederick",
    road: "I-70",
    direction: "EB",
    location: "I-70 east near MD 85",
    lng: -77.41,
    lat: 39.4,
    started_at: "2026-09-18T15:45:00.000Z",
    severity: "High",
    lanes_affected: "Right lane closed",
    ...overrides,
  };
}

function workZone(overrides: Partial<MdotWorkZone> = {}): MdotWorkZone {
  return {
    id: "work-md85",
    road: "MD 85",
    roadNames: ["MD 85"],
    description: "Road work south of the I-70 interchange.",
    direction: "northbound",
    status: "active",
    startAt: "2026-09-18T14:00:00.000Z",
    endAt: "2026-09-18T22:00:00.000Z",
    updatedAt: "2026-09-18T15:55:00.000Z",
    geometry: { type: "Point", coordinates: [-77.41, 39.4] },
    lanes: { total: 2, closed: 1, summary: "some-lanes-closed" },
    positionConfidence: "verified",
    sourceUrl: MDOT_WZDX_SOURCE_URL,
    ...overrides,
  };
}

function weatherAlert(overrides: Partial<NwsAlert> = {}): NwsAlert {
  return {
    id: "nws-heat",
    event: "Heat Advisory",
    headline: "Heat Advisory issued for Frederick County",
    description: "Hot conditions are expected.",
    severity: "Moderate",
    urgency: "Expected",
    certainty: "Likely",
    starts_at: "2026-09-18T15:00:00.000Z",
    ends_at: "2026-09-18T23:00:00.000Z",
    area: "Frederick County, MD",
    url: "https://api.weather.gov/alerts/heat",
    ...overrides,
  };
}

function civicAlert(
  overrides: Partial<OfficialCivicAlert> = {},
): OfficialCivicAlert {
  return {
    id: "city-emergency-road",
    kind: "city-emergency",
    title: "East Patrick Street emergency closure",
    summary: "East Patrick Street is closed while crews respond.",
    url: "https://www.cityoffrederickmd.gov/AlertCenter.aspx?AID=1",
    scope: "city",
    state: "active",
    active: true,
    publishedAt: "2026-09-18T15:30:00.000Z",
    occurredAt: null,
    expiresAt: "2026-09-19T15:30:00.000Z",
    confidence: "official",
    provenance: {
      publisher: "City of Frederick",
      authority: "official-government",
      sourceKind: "official-rss",
      sourceUrl:
        "https://www.cityoffrederickmd.gov/RSSFeed.aspx?ModID=63&CID=City-Emergencies-4",
      canonicalUrl:
        "https://www.cityoffrederickmd.gov/AlertCenter.aspx?AID=1",
      retrievedAt: NOW,
      providerUpdatedAt: "2026-09-18T15:30:00.000Z",
      confidence: "official",
    },
    ...overrides,
  };
}

describe("buildFairArrivalStatus", () => {
  it("keeps an unavailable source unknown instead of calling empty feeds clear", () => {
    const input = baseInput();
    input.chart.result = { data: [], available: false };

    const status = buildFairArrivalStatus(input);

    expect(status).toMatchObject({
      state: "partial",
      coverage: "partial",
      signals: [],
    });
    expect(status.summary).toContain("unknown, not an all-clear");
    expect(status.sources.find((source) => source.id === "mdot-chart")?.state)
      .toBe("unavailable");
  });

  it("bounds a successful empty result to the official feeds that were checked", () => {
    const status = buildFairArrivalStatus(baseInput());

    expect(status).toMatchObject({
      state: "no-current-update",
      coverage: "configured-sources-current",
      signals: [],
    });
    expect(status.headline).toContain("feeds Radius checked");
    expect(status.summary).toContain("not an all-clear");

    const serialized = JSON.stringify(status);
    for (const forbiddenKey of [
      '"crowd"',
      '"lotFullness"',
      '"gateWait"',
      '"departurePrediction"',
      '"community"',
      '"reddit"',
    ]) {
      expect(serialized).not.toContain(forbiddenKey);
    }
  });

  it("keeps only relevant, current official arrival signals with evidence", () => {
    const input = baseInput();
    input.chart.result.data = [
      chartIncident(),
      chartIncident({ id: "side-road", road: "Butterfly Lane" }),
    ];
    input.workZones.result.data = [
      workZone(),
      workZone({ id: "outside", road: "US 1", roadNames: ["US 1"] }),
    ];
    input.weather.result.alerts = [weatherAlert()];
    input.civic.result.alerts = [
      civicAlert(),
      civicAlert({
        id: "unrelated-health",
        kind: "health-notice",
        title: "Nutrition classes",
        summary: "Registration is open for Frederick County residents.",
      }),
    ];

    const status = buildFairArrivalStatus(input);

    expect(status.state).toBe("attention");
    expect(status.signals.map((signal) => signal.id)).toEqual(
      expect.arrayContaining([
        "chart:chart-i70",
        "wzdx:work-md85",
        "nws:nws-heat",
        "civic:city-emergency-road",
      ]),
    );
    expect(status.signals.map((signal) => signal.id)).not.toEqual(
      expect.arrayContaining(["chart:side-road", "wzdx:outside", "civic:unrelated-health"]),
    );
    for (const signal of status.signals) {
      expect(signal.evidence).toMatchObject({
        checkedAt: NOW,
        state: expect.stringMatching(/^(?:current|partial)$/),
      });
      expect(signal.evidence.url).toMatch(/^https:\/\//);
    }
  });

  it("suppresses stale official observations and marks their source stale", () => {
    const input = baseInput();
    input.chart.result = {
      data: [chartIncident()],
      available: true,
      asOf: "2026-09-18T15:45:00.000Z",
    };

    const status = buildFairArrivalStatus(input);

    expect(status.signals).toHaveLength(0);
    expect(status.state).toBe("partial");
    expect(status.sources.find((source) => source.id === "mdot-chart")?.state)
      .toBe("stale");
  });

  it("does not turn a healthy empty GTFS result into confirmed service", () => {
    const input = baseInput();
    input.transit = {
      arrivals: {
        checkedAt: NOW,
        result: {
          data: [],
          status: "ok",
          available: true,
          feedTimestamp: Date.parse(NOW) / 1_000,
          receivedAt: Date.parse(NOW),
        },
      },
      alerts: {
        checkedAt: NOW,
        result: {
          data: [],
          status: "ok",
          available: true,
          feedTimestamp: Date.parse(NOW) / 1_000,
          receivedAt: Date.parse(NOW),
        },
      },
    };

    const status = buildFairArrivalStatus(input);

    expect(status.transit).toEqual({
      state: "no-live-arrival",
      message:
        "No live Fair-stop arrival was returned right now. This does not mean service is not running.",
      arrivals: [],
    });
    expect(JSON.stringify(status.transit)).not.toContain("confirmed");
  });

  it("shows only fresh predictions at the reviewed Fair stops", () => {
    const input = baseInput();
    input.transit = {
      arrivals: {
        checkedAt: NOW,
        result: {
          data: [
            {
              stopId: "162918",
              routeId: "9349",
              tripId: "fair-trip",
              arrivalEpoch: Date.parse("2026-09-18T16:08:00.000Z") / 1_000,
            },
            {
              stopId: "somewhere-else",
              routeId: "9349",
              tripId: "other-trip",
              arrivalEpoch: Date.parse("2026-09-18T16:05:00.000Z") / 1_000,
            },
          ],
          status: "ok",
          available: true,
          feedTimestamp: Date.parse(NOW) / 1_000,
          receivedAt: Date.parse(NOW),
        },
      },
      alerts: {
        checkedAt: NOW,
        result: {
          data: [],
          status: "ok",
          available: true,
          feedTimestamp: Date.parse(NOW) / 1_000,
          receivedAt: Date.parse(NOW),
        },
      },
    };

    const status = buildFairArrivalStatus(input);

    expect(status.transit).toMatchObject({
      state: "arrivals",
      arrivals: [
        {
          routeLabel: "15",
          stopLabel: "Fairground Center",
          expectedAt: "2026-09-18T16:08:00.000Z",
          evidence: { state: "current", checkedAt: NOW },
        },
      ],
    });
  });
});

describe("Fair arrival date boundary", () => {
  it("uses Frederick's calendar date around UTC midnight", () => {
    expect(
      isSelectedFairDateToday("2026-09-18", "2026-09-19T01:30:00.000Z"),
    ).toBe(true);
    expect(
      isSelectedFairDateToday("2026-09-19", "2026-09-19T01:30:00.000Z"),
    ).toBe(false);
  });

  it("returns a no-fetch planning state for another Fair day", () => {
    const status = buildFairArrivalNotTodayStatus({
      selectedDate: "2026-09-26",
      now: NOW,
    });

    expect(status).toMatchObject({
      state: "not-today",
      coverage: "not-checked",
      signals: [],
      sources: [],
      transit: null,
    });
    expect(status.headline).toContain("selected Fair day");
  });
});
