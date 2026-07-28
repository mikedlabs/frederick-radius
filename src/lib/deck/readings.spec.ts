import { describe, expect, it } from "vitest";
import {
  buildDeckKeys,
  minutesUntil,
  shortGaugeName,
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
    expect(keys.buses.detail[0]).toEqual({ lead: "Market & 7th", trail: "4 min" });
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

  it("carries a source and a destination on every key", () => {
    for (const key of buildDeckKeys(NOTHING, NOW)) {
      expect(key.source.length).toBeGreaterThan(0);
      expect(key.hrefLabel.length).toBeGreaterThan(0);
      expect(key.href.startsWith("/")).toBe(true);
    }
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
