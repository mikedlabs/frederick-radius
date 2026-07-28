import { describe, it, expect, beforeEach } from "vitest";
import { readMapLayerPrefs, writeMapLayerPrefs } from "./mapLayerPrefs";

// No jsdom in this repo — stand up a minimal in-memory window.localStorage so
// the (client-only) helper can be exercised in the node test env.
beforeEach(() => {
  const store = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    },
  };
});

describe("mapLayerPrefs", () => {
  it("round-trips explicit choices", () => {
    writeMapLayerPrefs({
      cats: ["coffee", "arts"],
      amenities: ["restroom"],
      transit: true,
      traffic: true,
      aviation: true,
    });
    const p = readMapLayerPrefs();
    expect(p.cats).toEqual(["coffee", "arts"]);
    expect(p.amenities).toEqual(["restroom"]);
    expect(p.transit).toBe(true);
    expect(p.traffic).toBe(true);
    expect(p.aviation).toBe(true);
  });

  it("returns {} when nothing is stored (clean cold open preserved)", () => {
    expect(readMapLayerPrefs()).toEqual({});
  });

  it("drops false noise now that every layer defaults off", () => {
    writeMapLayerPrefs({
      cats: [],
      amenities: [],
      civic: false,
      transit: false,
      trails: false,
      aerial: false,
      cemeteries: false,
      traffic: false,
      aviation: false,
    });
    expect(readMapLayerPrefs()).toEqual({});
    expect(window.localStorage.getItem("fr:map-layers:v2")).toBeNull();
  });

  it("keeps only the truthy flags", () => {
    writeMapLayerPrefs({
      cats: ["food"],
      civic: false,
      aerial: true,
      cemeteries: true,
      radar: true,
      traffic: true,
      incidents: true,
      aviation: true,
      cameras: true,
    });
    const p = readMapLayerPrefs();
    expect(p).toEqual({
      cats: ["food"],
      aerial: true,
      cemeteries: true,
      radar: true,
      traffic: true,
      incidents: true,
      aviation: true,
      cameras: true,
    });
    expect(p.civic).toBeUndefined();
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem("fr:map-layers:v2", "{not json");
    expect(readMapLayerPrefs()).toEqual({});
  });

  it("migrates legacy choices without restoring auto-seeded Transit", () => {
    window.localStorage.setItem(
      "fr:map-layers:v1",
      JSON.stringify({ transit: true, radar: true, parking: true }),
    );
    expect(readMapLayerPrefs()).toEqual({ radar: true, parking: true });
    expect(window.localStorage.getItem("fr:map-layers:v1")).toBeNull();
    expect(window.localStorage.getItem("fr:map-layers:v2")).toBe(
      '{"parking":true,"radar":true}',
    );
  });
});
