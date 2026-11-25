import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanChartDescription,
  cleanChartLaneStatus,
  dedupeChartIncidents,
  chartDirectionWord,
  chartRoad,
  roadAlias,
  humanizeChartText,
  chartTypeSentence,
  chartHeroSentence,
  chartTodayTitle,
  chartFreshnessTail,
  getChartIncidentsFrederickResult,
  qualifiesForToday,
  type ChartIncident,
} from "./mdot-chart";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Minimal High-severity Incident on a major route, started "now". */
function incident(over: Partial<ChartIncident> = {}, now = new Date("2026-07-20T18:00:00Z")): ChartIncident {
  return {
    id: "x",
    type: "Incident",
    description: "Crash",
    county: "Frederick",
    road: "US 15",
    direction: "NB",
    location: "US 15",
    lng: -77.4,
    lat: 39.4,
    started_at: new Date(now.getTime() - 25 * 60000).toISOString(),
    severity: "High",
    ...over,
  };
}

describe("MDOT CHART normalization", () => {
  it("turns internal enum labels into plain language", () => {
    expect(cleanChartDescription("Action Event @ VOL:Compacted Demand")).toBe("Heavy traffic");
    expect(cleanChartLaneStatus("VOL:Compacted Demand")).toBe("Heavy traffic");
    expect(cleanChartLaneStatus("None")).toBeUndefined();
  });

  it("deduplicates republished copies while keeping the stronger record", () => {
    const base: ChartIncident = {
      id: "old",
      type: "Incident",
      description: "Crash near Exit 48",
      county: "Frederick",
      road: "I-70",
      direction: "Westbound",
      location: "I-70 near Exit 48",
      lng: -77.4,
      lat: 39.4,
      started_at: "2026-07-15T12:00:00Z",
      severity: "Medium",
    };
    const result = dedupeChartIncidents([
      base,
      { ...base, id: "new", severity: "High", started_at: "2026-07-15T12:03:00Z" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("new");
  });
});

describe("MDOT CHART feed availability", () => {
  it("distinguishes a successful empty feed from an upstream failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ data: [], success: true, totalCount: 0 }), { status: 200 }),
      ),
    );
    await expect(getChartIncidentsFrederickResult()).resolves.toEqual({
      data: [],
      available: true,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("upstream unavailable", { status: 503 })),
    );
    await expect(getChartIncidentsFrederickResult()).resolves.toEqual({
      data: [],
      available: false,
    });
  });

  it("marks a changed or malformed response shape unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ success: true, totalCount: 0 }), { status: 200 }),
      ),
    );
    expect((await getChartIncidentsFrederickResult()).available).toBe(false);
  });

  it("keeps a missing provider start time null instead of inventing now", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({
          data: [{
            id: "missing-time",
            county: "Frederick",
            name: "Incident @ US 15",
            incidentType: "Incident",
            lat: 39.4,
            lon: -77.4,
          }],
        }),
      ),
    );

    const result = await getChartIncidentsFrederickResult();
    expect(result.available).toBe(true);
    expect(result.data[0].started_at).toBeNull();
  });

  it("exposes a valid HTTP response time as retrieval metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { Date: "Tue, 28 Jul 2026 16:00:00 GMT" },
        }),
      ),
    );

    await expect(getChartIncidentsFrederickResult()).resolves.toEqual({
      data: [],
      available: true,
      asOf: "2026-07-28T16:00:00.000Z",
    });
  });

  it("lets a slower page cache boundary override only this read", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ data: [], success: true, totalCount: 0 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getChartIncidentsFrederickResult({ revalidateSeconds: 300 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
  });

  it("aborts a stalled feed and marks it unavailable", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }));

    const pending = getChartIncidentsFrederickResult({ deadlineMs: 50 });
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toEqual({ data: [], available: false });
    expect(signal?.aborted).toBe(true);
  });
});

describe("MDOT CHART severity", () => {
  // The clock the reported Pulse page was read at (November 25, 2026).
  const now = Date.parse("2026-11-25T15:40:00Z");
  const hoursAgo = (hours: number) => now - hours * 3_600_000;

  type FeedRow = Record<string, unknown>;

  /** One open Frederick row, shaped like the CHART export feed. */
  function row(over: FeedRow): FeedRow {
    return {
      county: "Frederick",
      incidentType: "Other",
      direction: "East",
      lat: 39.48,
      lon: -77.25,
      lanesStatus: "",
      closed: false,
      trafficAlert: false,
      startDateTime: hoursAgo(1),
      ...over,
    };
  }

  /** The open signal work order CHART listed for Libertytown that morning. */
  const signalWorkOrder = (over: FeedRow = {}) =>
    row({
      id: "signal-md26",
      name: "Action Event @ MD 26 (MAIN ST) @ MD 75 (CHURCH ST) [Traffic Control Signal]",
      startDateTime: hoursAgo(139.7),
      additionalData: {
        actionTypes: [{ actionDescription: "", actionType: "Signal Involved In Crash" }],
      },
      ...over,
    });

  async function severities(rows: FeedRow[]) {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json({ data: rows })));
    const result = await getChartIncidentsFrederickResult();
    expect(result.available).toBe(true);
    return Object.fromEntries(result.data.map((item) => [item.id, item.severity]));
  }

  it("never grades a signal work order High from its action type", async () => {
    await expect(
      severities([
        signalWorkOrder(),
        signalWorkOrder({
          id: "signal-md194",
          name: "Action Event @ MD 194 (WOODSBORO PIKE) @ GLADE BLVD [Traffic Control Signal]",
          lat: 39.47,
          lon: -77.37,
          startDateTime: hoursAgo(339),
        }),
        // A word in the action log is not evidence about the road, with or
        // without the signal tag in the name.
        row({
          id: "action-only",
          name: "Action Event @ MD 355 @ CAMPUS DR",
          lat: 39.38,
          lon: -77.4,
          additionalData: {
            actionTypes: [{ actionType: "Signal Involved In Crash" }],
          },
        }),
      ]),
    ).resolves.toEqual({
      "signal-md26": "Low",
      "signal-md194": "Low",
      "action-only": "Low",
    });
  });

  it("caps a signal work order at Low whatever its name says", async () => {
    await expect(
      severities([
        signalWorkOrder({
          id: "signal-lane-words",
          name: "Action Event @ US 40 (W PATRICK ST) RIGHT LANE @ BAUGHMANS LN [Traffic Control Signal]",
        }),
      ]),
    ).resolves.toEqual({ "signal-lane-words": "Low" });
  });

  it("keeps a crash, a closure and a traffic alert at High", async () => {
    await expect(
      severities([
        row({
          id: "crash-type",
          name: "Incident @ I-70 EAST AT EXIT 54 MD 355",
          incidentType: "Collision, Personal Injury",
          lat: 39.39,
          lon: -77.4,
        }),
        row({
          id: "crash-name",
          name: "Incident @ US 15 NORTH PAST MD 26 OVERTURNED TRACTOR TRAILER",
          lat: 39.45,
          lon: -77.39,
        }),
        row({
          id: "closure",
          name: "Incident @ MD 17 ALL LANES CLOSED AT MD 180",
          lat: 39.33,
          lon: -77.62,
        }),
        row({
          id: "alert",
          name: "Incident @ US 340 WEST AT MD 180",
          trafficAlert: true,
          lat: 39.36,
          lon: -77.5,
        }),
        // CHART raising its own alert outranks the work-order cap.
        signalWorkOrder({ id: "signal-alert", trafficAlert: true }),
      ]),
    ).resolves.toEqual({
      "crash-type": "High",
      "crash-name": "High",
      closure: "High",
      alert: "High",
      "signal-alert": "High",
    });
  });

  it("keeps Medium and Low grades for ordinary rows", async () => {
    await expect(
      severities([
        row({
          id: "disabled",
          name: "Disabled Vehicle Event @ I-270 SOUTH AT MD 80",
          incidentType: "Disabled In Roadway",
          lat: 39.3,
          lon: -77.33,
        }),
        row({
          id: "work-zone",
          name: "Incident @ MD 85 RIGHT LANE WORK ZONE AT ENGLISH MUFFIN WAY",
          lat: 39.36,
          lon: -77.42,
        }),
        row({
          id: "utility",
          name: "Incident @ MD 194 AT DAYSVILLE RD",
          incidentType: "Utility Problem",
          lat: 39.5,
          lon: -77.33,
        }),
      ]),
    ).resolves.toEqual({ disabled: "Medium", "work-zone": "Medium", utility: "Low" });
  });
});

describe("CHART humanization", () => {
  it("decodes direction codes to words", () => {
    expect(chartDirectionWord("SB")).toBe("South");
    expect(chartDirectionWord("(WB/L)")).toBe("West");
    expect(chartDirectionWord("None")).toBe("");
    expect(chartDirectionWord(undefined)).toBe("");
  });

  it("joins road and direction, dropping unknown directions", () => {
    expect(chartRoad({ road: "US 15", direction: "NB" })).toBe("US 15 North");
    expect(chartRoad({ road: "US 15", direction: "None" })).toBe("US 15");
    expect(chartRoad({ road: "", direction: "NB" })).toBe("");
  });

  it("maps known routes to their local street names", () => {
    expect(roadAlias("US 40")).toBe("W Patrick St");
    expect(roadAlias("MD 26")).toBe("Liberty Rd");
    expect(roadAlias("I-70")).toBeUndefined();
  });

  it("expands ramp grammar, lane codes, and strips device tags", () => {
    expect(humanizeChartText("RAMP 8 FR US 15 SB TO US 40 WB")).toBe(
      "the ramp from US 15 South to US 40 West",
    );
    expect(humanizeChartText("Right lane closed (WB/L) [Traffic Control Signal]")).toBe(
      "Right lane closed westbound, left lane",
    );
    expect(humanizeChartText("Crash (NB)")).toBe("Crash northbound");
  });

  it("renders a plain type sentence, never a raw enum", () => {
    expect(chartTypeSentence({ type: "Special", description: "Signal malfunction" })).toBe(
      "A traffic signal issue is reported.",
    );
    expect(chartTypeSentence({ type: "Incident", description: "Two-vehicle collision" })).toBe(
      "A crash is blocking lanes.",
    );
    expect(chartTypeSentence({ type: "Construction", description: "" })).toBe("Road work is under way.");
  });

  it("builds a subject-led hero sentence with the local alias", () => {
    expect(
      chartHeroSentence({ road: "US 40", direction: "WB", type: "Incident", description: "reported incident" }),
    ).toBe("US 40 West (W Patrick St) has a reported incident.");
    expect(
      chartHeroSentence({ road: "I-70", direction: "EB", type: "Incident", description: "crash" }),
    ).toBe("I-70 East has a reported crash.");
  });

  it("drops the alias when CHART names a different street at the spot", () => {
    // MD 26 is Main St in Libertytown, not Liberty Rd.
    expect(
      chartHeroSentence({
        road: "MD 26",
        direction: "East",
        type: "Special",
        description: "MD 26 (MAIN ST) @ MD 75 (CHURCH ST) [Traffic Control Signal]",
      }),
    ).toBe("MD 26 East has a reported signal issue.");
    // CHART agrees with the alias, so the local name still helps.
    expect(
      chartHeroSentence({
        road: "MD 85",
        direction: "North",
        type: "Special",
        description: "MD 85 (BUCKEYSTOWN PIKE) @ ENGLISH MUFFIN WAY [Traffic Control Signal]",
      }),
    ).toBe("MD 85 North (Buckeystown Pike) has a reported signal issue.");
    // A direction or lane code in parentheses is not a street name.
    expect(
      chartHeroSentence({ road: "US 40", direction: "WB", type: "Incident", description: "US 40 (WB/L) AT MD 180 crash" }),
    ).toBe("US 40 West (W Patrick St) has a reported crash.");
    // A street named after a different route says nothing about this one.
    expect(
      chartHeroSentence({ road: "MD 26", direction: "East", type: "Incident", description: "MD 26 AT MD 194 (WOODSBORO PIKE) crash" }),
    ).toBe("MD 26 East (Liberty Rd) has a reported crash.");
  });

  it("builds a short today title", () => {
    expect(chartTodayTitle({ road: "US 15", direction: "NB", type: "Incident", description: "crash" })).toBe(
      "Crash on US 15 North",
    );
  });

  it("shows a clear freshness tail", () => {
    const now = new Date("2026-07-20T18:00:00Z");
    expect(chartFreshnessTail({ started_at: new Date(now.getTime() - 25 * 60000).toISOString() }, now)).toBe(
      "Started 25m ago",
    );
    expect(
      chartFreshnessTail(
        { started_at: "irrelevant", expected_end: new Date(now.getTime() + 60 * 60000).toISOString() },
        now,
      ),
    ).toMatch(/^Clears ~/);
    expect(chartFreshnessTail({ started_at: null }, now)).toBe("Active now");
  });

  it("counts days once a row has been open for 48 hours", () => {
    const now = new Date("2026-11-25T15:40:00Z");
    const startedHoursAgo = (hours: number) =>
      chartFreshnessTail({ started_at: new Date(now.getTime() - hours * 3_600_000).toISOString() }, now);

    expect(startedHoursAgo(3)).toBe("Started 3h ago");
    expect(startedHoursAgo(47)).toBe("Started 47h ago");
    expect(startedHoursAgo(48)).toBe("Started 2 days ago");
    // The two open signal work orders from the reported page.
    expect(startedHoursAgo(139.7)).toBe("Started 5 days ago");
    expect(startedHoursAgo(339)).toBe("Started 14 days ago");
    expect(startedHoursAgo(139.7)).not.toMatch(/\dh ago/);
  });
});

describe("qualifiesForToday", () => {
  const now = new Date("2026-07-20T18:00:00Z");

  it("passes a fresh High-severity incident on a major route", () => {
    expect(qualifiesForToday(incident({}, now), now)).toBe(true);
  });

  it("rejects Medium/Low severity", () => {
    expect(qualifiesForToday(incident({ severity: "Medium" }, now), now)).toBe(false);
  });

  it("rejects Construction/Disabled/Special/Other types", () => {
    expect(qualifiesForToday(incident({ type: "Construction" }, now), now)).toBe(false);
    expect(qualifiesForToday(incident({ type: "Special" }, now), now)).toBe(false);
  });

  it("rejects minor roads", () => {
    expect(qualifiesForToday(incident({ road: "Market St" }, now), now)).toBe(false);
    expect(qualifiesForToday(incident({ road: "" }, now), now)).toBe(false);
  });

  it("rejects stale (>12h) incidents", () => {
    const stale = incident({ started_at: new Date(now.getTime() - 13 * 3600 * 1000).toISOString() }, now);
    expect(qualifiesForToday(stale, now)).toBe(false);
  });

  it("rejects an incident without a provider start time", () => {
    expect(qualifiesForToday(incident({ started_at: null }, now), now)).toBe(false);
  });

  it("rejects an already-cleared incident", () => {
    const cleared = incident({ expected_end: new Date(now.getTime() - 60000).toISOString() }, now);
    expect(qualifiesForToday(cleared, now)).toBe(false);
  });
});
