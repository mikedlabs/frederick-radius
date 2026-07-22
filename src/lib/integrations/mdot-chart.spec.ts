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

  it("rejects an already-cleared incident", () => {
    const cleared = incident({ expected_end: new Date(now.getTime() - 60000).toISOString() }, now);
    expect(qualifiesForToday(cleared, now)).toBe(false);
  });
});
