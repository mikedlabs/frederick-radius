import { describe, expect, it } from "vitest";
import {
  buildDeckKeys,
  dayRangeNote,
  minutesUntil,
  shortGaugeName,
  sparkSeries,
  type DeckInputs,
} from "@/lib/deck/readings";

/**
 * The deck's whole claim is that a lit key is a measured reading and that
 * opening it shows the evidence. These pin the ways that claim breaks: a zero
 * printed for a source that never answered, a live indicator on a feed that
 * is not live, and an empty panel that leaves "nothing to show" and "nothing
 * was checked" looking identical.
 */

const NOW = new Date("2026-07-28T21:00:00Z");

const NOTHING: DeckInputs = {
  buses: null,
  routes: null,
  trains: null,
  traffic: null,
  power: null,
  weather: null,
  water: null,
  schools: null,
  reports: null,
  events: null,
  news: null,
};

/** Gauge readings an hour apart, oldest first, like USGS returns them. */
const readings = (values: number[]) =>
  values.map((value, i) => ({
    value,
    at: new Date(NOW.getTime() - (values.length - 1 - i) * 3_600_000).toISOString(),
  }));

const keyed = (input: Partial<DeckInputs>, now: Date = NOW) => {
  const keys = buildDeckKeys({ ...NOTHING, ...input }, now);
  return Object.fromEntries(keys.map((key) => [key.id, key]));
};

describe("buildDeckKeys", () => {
  it("keeps every key on the board when nothing answers", () => {
    const keys = buildDeckKeys(NOTHING, NOW);
    expect(keys).toHaveLength(10);
    expect(keys.every((key) => key.status === "unavailable")).toBe(true);
    // The unavailable face must never be a number a reader could act on.
    expect(keys.every((key) => key.faces[0].value === "—")).toBe(true);
    // And opening it must say the gap out loud rather than showing nothing.
    expect(keys.every((key) => (key.note ?? "").includes("did not answer"))).toBe(true);
  });

  it("separates a measured zero from a silent source", () => {
    const measured = keyed({ traffic: { available: true, rows: [] } });
    expect(measured.traffic.status).toBe("ok");
    expect(measured.traffic.faces[0].value).toBe("Clear");
    expect(measured.traffic.note).toMatch(/no open incidents/i);

    const silent = keyed({ traffic: { available: false, rows: [] } });
    expect(silent.traffic.status).toBe("unavailable");
    expect(silent.traffic.faces[0].value).toBe("—");
  });

  it("reveals the rows behind a real count", () => {
    const keys = keyed({
      traffic: {
        available: true,
        rows: [
          { lead: "I-70 west", trail: "Incident" },
          { lead: "US-15 north", trail: "Construction" },
        ],
      },
    });
    expect(keys.traffic.faces[0]).toEqual({ value: "2", label: "incidents" });
    expect(keys.traffic.detail).toHaveLength(2);
    expect(keys.traffic.detail[0]).toEqual({ lead: "I-70 west", trail: "Incident" });
    // A key with rows does not also need the calm explanation.
    expect(keys.traffic.note).toBeUndefined();
  });

  it("caps the reveal so one busy feed cannot run down the board", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ lead: `Report ${i}` }));
    expect(keyed({ reports: rows }).reports.detail).toHaveLength(5);
  });

  it("lights amber only on a caution reading", () => {
    expect(keyed({ traffic: { available: true, rows: [] } }).traffic.accent).toBe("var(--app-cool)");
    expect(
      keyed({ traffic: { available: true, rows: [{ lead: "I-70" }] } }).traffic.accent,
    ).toBe("var(--app-amber)");
    expect(keyed({ power: { available: true, out: 0, munis: [] } }).power.accent).toBe(
      "var(--app-cool)",
    );
    expect(
      keyed({ power: { available: true, out: 140, munis: [{ area: "Thurmont", out: 140 }] } })
        .power.accent,
    ).toBe("var(--app-amber)");
  });

  it("ranks outages by size and hides the towns with none", () => {
    const keys = keyed({
      power: {
        available: true,
        out: 160,
        munis: [
          { area: "Frederick", out: 20 },
          { area: "Emmitsburg", out: 0 },
          { area: "Thurmont", out: 140 },
        ],
      },
    });
    expect(keys.power.detail).toEqual([
      { lead: "Thurmont", trail: "140 out" },
      { lead: "Frederick", trail: "20 out" },
    ]);
  });

  it("shows the forecast when the sky is calm, not an empty panel", () => {
    const keys = keyed({
      weather: {
        available: true,
        alerts: [],
        outlook: [{ lead: "Tonight, clear", trail: "68°" }],
      },
    });
    expect(keys.weather.faces[0].value).toBe("Clear");
    expect(keys.weather.detail).toEqual([{ lead: "Tonight, clear", trail: "68°" }]);
  });

  it("shows the alerts themselves when there are any", () => {
    const keys = keyed({
      weather: {
        available: true,
        alerts: ["Flood Watch"],
        outlook: [{ lead: "Tonight, rain", trail: "68°" }],
      },
    });
    expect(keys.weather.faces[0]).toEqual({ value: "1", label: "active alert" });
    expect(keys.weather.detail).toEqual([{ lead: "Flood Watch" }]);
  });

  it("never claims schools are open, only that nothing is posted", () => {
    const keys = keyed({ schools: { available: true, alerts: [] } });
    expect(keys.schools.faces[0]).toEqual({ value: "None", label: "posted" });
    expect(keys.schools.note).toMatch(/out of session looks the same/i);
  });

  it("reserves the live indicator for continuously updating feeds", () => {
    const keys = buildDeckKeys(NOTHING, NOW);
    const live = new Set(keys.filter((key) => key.live).map((key) => key.id));
    expect(live).toEqual(new Set(["buses", "trains", "traffic", "power", "weather", "water"]));
    // A daily or hourly snapshot must not pulse like a GPS feed.
    expect(live.has("news")).toBe(false);
    expect(live.has("events")).toBe(false);
    expect(live.has("reports")).toBe(false);
  });

  it("adds a second face only when a second reading exists", () => {
    const stops = [{ name: "Market & 7th" }];
    expect(keyed({ buses: { available: true, stops }, routes: null }).buses.faces).toHaveLength(1);
    const two = keyed({ buses: { available: true, stops }, routes: 36 });
    expect(two.buses.faces).toHaveLength(2);
    expect(two.buses.faces[1]).toEqual({ value: "36", label: "routes" });
  });

  it("puts buses with a real ETA above ones reporting position only", () => {
    const keys = keyed({
      buses: {
        available: true,
        stops: [
          { name: "No prediction" },
          { name: "Market & 7th", etaEpoch: NOW.getTime() / 1000 + 240 },
        ],
      },
    });
    expect(keys.buses.detail[0]).toMatchObject({ lead: "Market & 7th", trail: "4 min" });
    expect(keys.buses.detail[1].trail).toBeUndefined();
  });

  it("explains a quiet bus feed instead of implying the system is broken", () => {
    const keys = keyed({ buses: { available: true, stops: [] } });
    expect(keys.buses.faces[0]).toEqual({ value: "None", label: "running" });
    expect(keys.buses.note).toMatch(/outside service hours/i);
  });

  it("never leaves a value and label reading as broken grammar", () => {
    // "None trains running" shipped to the dev render once. Every face has to
    // read as a sentence when the value and label are spoken together.
    const quiet = keyed({
      buses: { available: true, stops: [] },
      trains: { available: true, count: 0, labels: [] },
    });
    expect(`${quiet.buses.faces[0].value} ${quiet.buses.faces[0].label}`).toBe("None running");
    expect(`${quiet.trains.faces[0].value} ${quiet.trains.faces[0].label}`).toBe(
      "None on the line",
    );
    // "1 customers out" reached the board once. Counts of one are their own
    // grammatical case everywhere a number sits next to a noun.
    const one = keyed({ power: { available: true, out: 1, munis: [{ area: "Thurmont", out: 1 }] } });
    expect(`${one.power.faces[0].value} ${one.power.faces[0].label}`).toBe("1 customer out");
    const many = keyed({ power: { available: true, out: 9, munis: [{ area: "Thurmont", out: 9 }] } });
    expect(`${many.power.faces[0].value} ${many.power.faces[0].label}`).toBe("9 customers out");
  });

  it("states no reading in terms of posted hours", () => {
    // Verified-hours coverage is effectively zero, so any "open now" reading
    // here would be an instrument reporting a hole in our data.
    const text = JSON.stringify(buildDeckKeys(NOTHING, NOW));
    expect(text).not.toMatch(/open now/i);
  });

  it("turns a USGS survey address into a key-sized label", () => {
    // The nine gauges the county actually reports, verbatim from USGS.
    expect(shortGaugeName("POTOMAC RIVER AT BURKITTSVILLE RD AT BRUNSWICK, MD")).toBe(
      "Potomac at Brunswick",
    );
    expect(shortGaugeName("MONOCACY RIVER AT JUG BRIDGE NEAR FREDERICK, MD")).toBe(
      "Monocacy at Frederick",
    );
    expect(shortGaugeName("MONOCACY RIVER AT BRIDGEPORT, MD")).toBe("Monocacy at Bridgeport");
    expect(shortGaugeName("BENNETT CREEK AT PARK MILLS, MD")).toBe("Bennett at Park Mills");
    expect(shortGaugeName("CATOCTIN CREEK NEAR MIDDLETOWN, MD")).toBe("Catoctin at Middletown");
    expect(shortGaugeName("LINGANORE CREEK AT LINGANORE RD NEAR FREDERICK, MD")).toBe(
      "Linganore at Frederick",
    );
    expect(shortGaugeName("Fishing Creek at Mountaindale, MD")).toBe("Fishing at Mountaindale");
    expect(shortGaugeName("POTOMAC RIVER AT POINT OF ROCKS, MD")).toBe("Potomac at Point Of Rocks");
  });

  it("leaves a gauge name alone when it has no survey segment", () => {
    expect(shortGaugeName("TUSCARORA CREEK")).toBe("Tuscarora Creek");
  });

  it("ranks gauges by stage and names the highest on the closed face", () => {
    const keys = keyed({
      water: [
        { name: "CATOCTIN CREEK NEAR MIDDLETOWN, MD", feet: 1.52 },
        { name: "POTOMAC RIVER AT POINT OF ROCKS, MD", feet: 2.49 },
      ],
    });
    expect(keys.water.faces[0]).toEqual({ value: "2", label: "gauges reporting" });
    expect(keys.water.faces[1]).toEqual({ value: "2.5 ft", label: "Potomac at Point Of Rocks" });
    expect(keys.water.detail[0].trail).toBe("2.5 ft");
  });

  it("draws the sparkline from the gauge named on the face, not an average", () => {
    const keys = keyed({
      water: [
        { name: "CATOCTIN CREEK NEAR MIDDLETOWN, MD", feet: 1.5, history: readings([9, 9, 9]) },
        { name: "POTOMAC RIVER AT POINT OF ROCKS, MD", feet: 2.5, history: readings([1, 2, 3]) },
      ],
    });
    expect(keys.water.faces[1].label).toBe("Potomac at Point Of Rocks");
    expect(keys.water.spark?.map((point) => point.v)).toEqual([1, 2, 3]);
  });

  it("keeps each point's own timestamp, so a scrub readout can say when", () => {
    const keys = keyed({
      water: [{ name: "MONOCACY RIVER AT BRIDGEPORT, MD", feet: 2.1, history: readings([1, 2, 3]) }],
    });
    // USGS skips intervals, so a time inferred from array position would be
    // wrong exactly when the reader is asking "when was that".
    expect(keys.water.spark?.map((point) => point.at)).toEqual([
      "2026-07-28T19:00:00.000Z",
      "2026-07-28T20:00:00.000Z",
      "2026-07-28T21:00:00.000Z",
    ]);
  });

  it("carries a trend per gauge only where the feed supports one", () => {
    const keys = keyed({
      water: [
        { name: "MONOCACY RIVER AT BRIDGEPORT, MD", feet: 2.1, trend: "rising" },
        { name: "BENNETT CREEK AT PARK MILLS, MD", feet: 1.5 },
      ],
    });
    expect(keys.water.detail[0].trend).toBe("rising");
    expect(keys.water.detail[1].trend).toBeUndefined();
  });

  it("gives no key but Creeks a sparkline, because no other feed has history", () => {
    const keys = buildDeckKeys(
      {
        ...NOTHING,
        water: [{ name: "MONOCACY RIVER AT BRIDGEPORT, MD", feet: 2.1, history: readings([1, 2]) }],
        power: { available: true, out: 5, munis: [{ area: "Thurmont", out: 5 }] },
        buses: { available: true, stops: [{ name: "Market & 7th" }] },
      },
      NOW,
    );
    expect(keys.filter((key) => key.spark).map((key) => key.id)).toEqual(["water"]);
  });

  it("hands the raw arrival epoch through so the client can count it down", () => {
    const soon = NOW.getTime() / 1000 + 240;
    const keys = keyed({
      buses: { available: true, stops: [{ name: "Market & 7th", etaEpoch: soon }] },
    });
    expect(keys.buses.detail[0].etaEpoch).toBe(soon);
  });

  it("withholds the epoch when the prediction is already unusable", () => {
    // A stale trip left in the feed carries a passed or far-future arrival.
    // Sending it anyway would let the client tick out a number we rejected.
    const keys = keyed({
      buses: {
        available: true,
        stops: [
          { name: "Passed", etaEpoch: NOW.getTime() / 1000 - 600 },
          { name: "Tomorrow", etaEpoch: NOW.getTime() / 1000 + 9 * 3600 },
        ],
      },
    });
    expect(keys.buses.detail.every((row) => row.etaEpoch === undefined)).toBe(true);
    expect(keys.buses.detail.every((row) => row.trail === undefined)).toBe(true);
  });

  it("carries a source and a destination on every key", () => {
    for (const key of buildDeckKeys(NOTHING, NOW)) {
      expect(key.source.length).toBeGreaterThan(0);
      expect(key.hrefLabel.length).toBeGreaterThan(0);
      expect(key.href.startsWith("/")).toBe(true);
    }
  });
});

describe("sparkSeries", () => {
  it("keeps a short series whole", () => {
    expect(sparkSeries(readings([1, 2, 3]), 24).map((p) => p.v)).toEqual([1, 2, 3]);
  });

  it("thins a full day of gauge readings to a drawable number of points", () => {
    // The real shape: ~94 readings per gauge per day.
    const day = readings(Array.from({ length: 94 }, (_, i) => i));
    const thinned = sparkSeries(day, 24);
    expect(thinned).toHaveLength(24);
    // The line has to end where the number on the face says it does.
    expect(thinned[0].v).toBe(0);
    expect(thinned.at(-1)?.v).toBe(93);
    expect(thinned.at(-1)?.at).toBe(day.at(-1)?.at);
  });

  it("drops readings that are not numbers rather than plotting a hole", () => {
    const bad = [
      { value: 1, at: "2026-07-28T18:00:00.000Z" },
      { value: Number.NaN, at: "2026-07-28T19:00:00.000Z" },
      { value: 3, at: "2026-07-28T20:00:00.000Z" },
    ];
    expect(sparkSeries(bad, 24).map((p) => p.v)).toEqual([1, 3]);
  });

  it("drops a point whose timestamp is unusable, since the scrub reads it", () => {
    const bad = [
      { value: 1, at: "not-a-date" },
      { value: 3, at: "2026-07-28T20:00:00.000Z" },
    ];
    expect(sparkSeries(bad, 24).map((p) => p.v)).toEqual([3]);
  });
});

describe("minutesUntil", () => {
  it("rounds a live ETA to whole minutes", () => {
    expect(minutesUntil(NOW.getTime() / 1000 + 240, NOW)).toBe(4);
  });

  it("drops an ETA that has already passed", () => {
    expect(minutesUntil(NOW.getTime() / 1000 - 60, NOW)).toBeNull();
  });

  it("drops an implausible far-future ETA rather than printing it", () => {
    // A stale trip left in the feed can carry tomorrow's arrival time.
    expect(minutesUntil(NOW.getTime() / 1000 + 9 * 3600, NOW)).toBeNull();
  });

  it("has nothing to say without a prediction", () => {
    expect(minutesUntil(undefined, NOW)).toBeNull();
  });
});

describe("dayRangeNote", () => {
  const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

  it("states the day's low and high, since the line can only be scrubbed", () => {
    expect(
      dayRangeNote(
        [
          { value: 1.2, at: at(6) },
          { value: 2.6, at: at(3) },
          { value: 1.9, at: at(0) },
        ],
        "Monocacy at Frederick",
      ),
    ).toBe("Monocacy at Frederick ran 1.2 to 2.6 ft over the last 24 hours.");
  });

  it("says a flat day held steady rather than printing a false range", () => {
    expect(
      dayRangeNote(
        [
          { value: 1.51, at: at(6) },
          { value: 1.52, at: at(0) },
        ],
        "Bennett at Park Mills",
      ),
    ).toBe("Bennett at Park Mills has held near 1.5 ft for the last 24 hours.");
  });

  it("says nothing when there is not enough history to describe", () => {
    expect(dayRangeNote(undefined, "Catoctin at Middletown")).toBeUndefined();
    expect(dayRangeNote([{ value: 1, at: at(0) }], "Catoctin at Middletown")).toBeUndefined();
  });
});
