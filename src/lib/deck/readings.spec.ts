import { describe, expect, it } from "vitest";
import { buildDeckKeys, shortGaugeName, type DeckInputs } from "@/lib/deck/readings";

/**
 * The deck's whole claim is that a lit key is a measured reading. These pin
 * the two ways that claim breaks: a zero printed for a source that never
 * answered, and a live indicator on a feed that is not live.
 */

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

const keyed = (input: Partial<DeckInputs>) => {
  const keys = buildDeckKeys({ ...NOTHING, ...input });
  return Object.fromEntries(keys.map((key) => [key.id, key]));
};

describe("buildDeckKeys", () => {
  it("keeps every key on the board when nothing answers", () => {
    const keys = buildDeckKeys(NOTHING);
    expect(keys).toHaveLength(10);
    expect(keys.every((key) => key.status === "unavailable")).toBe(true);
    // The unavailable face must never be a number a reader could act on.
    expect(keys.every((key) => key.faces[0].value === "—")).toBe(true);
  });

  it("separates a measured zero from a silent source", () => {
    const measured = keyed({ traffic: { available: true, count: 0 } });
    expect(measured.traffic.status).toBe("ok");
    expect(measured.traffic.faces[0].value).toBe("Clear");

    const silent = keyed({ traffic: { available: false, count: 0 } });
    expect(silent.traffic.status).toBe("unavailable");
    expect(silent.traffic.faces[0].value).toBe("—");
  });

  it("says a real count when there is one", () => {
    const keys = keyed({ traffic: { available: true, count: 3 } });
    expect(keys.traffic.faces[0]).toEqual({ value: "3", label: "incidents" });
  });

  it("lights amber only on a caution reading", () => {
    expect(keyed({ traffic: { available: true, count: 0 } }).traffic.accent).toBe("var(--app-cool)");
    expect(keyed({ traffic: { available: true, count: 2 } }).traffic.accent).toBe("var(--app-amber)");
    expect(keyed({ power: { available: true, out: 0, munis: 28 } }).power.accent).toBe("var(--app-cool)");
    expect(keyed({ power: { available: true, out: 140, munis: 28 } }).power.accent).toBe("var(--app-amber)");
  });

  it("never claims schools are open, only that nothing is posted", () => {
    const keys = keyed({ schools: { available: true, count: 0 } });
    expect(keys.schools.faces[0]).toEqual({ value: "None", label: "posted" });
  });

  it("reserves the live indicator for continuously updating feeds", () => {
    const keys = buildDeckKeys(NOTHING);
    const live = new Set(keys.filter((key) => key.live).map((key) => key.id));
    expect(live).toEqual(new Set(["buses", "trains", "traffic", "power", "weather", "water"]));
    // A daily or hourly snapshot must not pulse like a GPS feed.
    expect(live.has("news")).toBe(false);
    expect(live.has("events")).toBe(false);
    expect(live.has("reports")).toBe(false);
  });

  it("adds a second face only when a second reading exists", () => {
    const one = keyed({ buses: { available: true, count: 4 }, routes: null });
    expect(one.buses.faces).toHaveLength(1);
    const two = keyed({ buses: { available: true, count: 4 }, routes: 36 });
    expect(two.buses.faces).toHaveLength(2);
    expect(two.buses.faces[1]).toEqual({ value: "36", label: "routes" });
  });

  it("names a creek on the water key when a gauge reports a stage", () => {
    const keys = keyed({
      water: { sites: 9, highest: { name: "Monocacy River", reading: "2.4 ft" } },
    });
    expect(keys.water.faces[1]).toEqual({ value: "2.4 ft", label: "Monocacy River" });
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

  it("keeps every gauge label short enough to read on a key", () => {
    const names = [
      "POTOMAC RIVER AT BURKITTSVILLE RD AT BRUNSWICK, MD",
      "MONOCACY RIVER AT MONOCACY BLVD AT FREDERICK, MD",
      "LINGANORE CREEK AT LINGANORE RD NEAR FREDERICK, MD",
    ];
    for (const name of names) expect(shortGaugeName(name).length).toBeLessThanOrEqual(25);
  });

  it("leaves a name alone when it has no survey segment", () => {
    expect(shortGaugeName("TUSCARORA CREEK")).toBe("Tuscarora Creek");
  });

  it("carries a source on every key, so no reading is anonymous", () => {
    for (const key of buildDeckKeys(NOTHING)) {
      expect(key.source.length).toBeGreaterThan(0);
      expect(key.href.startsWith("/")).toBe(true);
    }
  });

  it("never leaves a value and label reading as broken grammar", () => {
    // "None trains running" shipped to the dev render once. Every face has to
    // read as a sentence when the value and label are spoken together.
    const quiet = keyed({
      buses: { available: true, count: 0 },
      trains: { available: true, count: 0 },
    });
    expect(`${quiet.buses.faces[0].value} ${quiet.buses.faces[0].label}`).toBe("None running");
    expect(`${quiet.trains.faces[0].value} ${quiet.trains.faces[0].label}`).toBe("None on the line");
  });

  it("states no reading in terms of posted hours", () => {
    // Verified-hours coverage is effectively zero, so any "open now" reading
    // here would be an instrument reporting a hole in our data.
    const text = JSON.stringify(buildDeckKeys(NOTHING));
    expect(text).not.toMatch(/open now/i);
  });
});
