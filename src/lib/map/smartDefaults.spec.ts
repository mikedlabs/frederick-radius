import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { easternMoment, smartMapDefault, type SmartMapSignals } from "./smartDefaults";

const quiet: SmartMapSignals = {
  activeWeatherAlert: false,
  musicTonightCount: 0,
  parkingCount: 0,
  marketsOpenTodayCount: 0,
  roadsTrendingLongerCount: 0,
};

describe("smartMapDefault", () => {
  it("leads with an active weather alert and keeps radar one tap away", () => {
    const out = smartMapDefault(
      { hour: 19, weekday: 5 },
      { ...quiet, activeWeatherAlert: true, musicTonightCount: 8 },
    );
    expect(out?.layers).toEqual([]);
    expect(out?.action).toEqual({
      layer: "radar",
      label: "See radar",
    });
  });

  it("lets the shared air-quality hold outrank an otherwise useful market", () => {
    const out = smartMapDefault(
      { hour: 9, weekday: 6 },
      {
        ...quiet,
        marketsOpenTodayCount: 2,
        outdoorSafetyHold: {
          kind: "air-quality",
          reason: "AirNow reports AQI 164, Unhealthy, for Frederick.",
        },
      },
    );

    expect(out?.reason).toBe(
      "AirNow reports AQI 164, Unhealthy, for Frederick.",
    );
    expect(out?.action).toEqual({
      href: "/pulse",
      label: "See conditions",
    });
  });

  it("uses radar as the immediate action for a severe weather hold", () => {
    const out = smartMapDefault(
      { hour: 18, weekday: 5 },
      {
        ...quiet,
        musicTonightCount: 6,
        outdoorSafetyHold: {
          kind: "weather",
          reason: "Severe Thunderstorm Warning is active for Frederick County.",
        },
      },
    );

    expect(out?.action).toEqual({ layer: "radar", label: "See radar" });
  });

  it("leads Friday evening with tonight's music and the parking answer", () => {
    const out = smartMapDefault(
      { hour: 18, weekday: 5 },
      { ...quiet, musicTonightCount: 6, parkingCount: 5 },
    );
    expect(out?.layers).toEqual(["parking"]);
    expect(out?.action).toEqual({
      href: "/map?music=tonight",
      label: "See tonight's shows",
    });
  });

  it("never suggests music on a night with no shows", () => {
    expect(smartMapDefault({ hour: 19, weekday: 6 }, quiet)).toBeNull();
  });

  it("leads a Saturday morning with an actually-open market", () => {
    const out = smartMapDefault(
      { hour: 9, weekday: 6 },
      { ...quiet, marketsOpenTodayCount: 2 },
    );
    expect(out?.layers).toEqual([]);
    expect(out?.action).toEqual({
      href: "/map?intent=shop&sub=markets",
      label: "Show markets",
    });
  });

  it("shows roads at commute time only when a corridor is actually worse", () => {
    expect(
      smartMapDefault({ hour: 8, weekday: 2 }, quiet),
    ).toBeNull();
    const out = smartMapDefault(
      { hour: 8, weekday: 2 },
      { ...quiet, roadsTrendingLongerCount: 1 },
    );
    expect(out?.layers).toEqual(["roads-now"]);
  });

  it("gives a quiet Tuesday afternoon the clean county", () => {
    expect(smartMapDefault({ hour: 14, weekday: 2 }, quiet)).toBeNull();
  });

  it("always names its reason in a complete sentence", () => {
    const out = smartMapDefault(
      { hour: 18, weekday: 5 },
      { ...quiet, musicTonightCount: 3 },
    );
    expect(out?.reason).toMatch(/^[A-Z].*\.$/);
  });
});

describe("easternMoment", () => {
  it("reads the Eastern wall clock, not UTC", () => {
    // 2026-08-05T02:00Z is 10 PM Eastern on Tuesday Aug 4 (EDT).
    const m = easternMoment(new Date("2026-08-05T02:00:00.000Z"));
    expect(m.hour).toBe(22);
    expect(m.weekday).toBe(2);
  });
});

describe("smart default wiring contracts (map program phase 1)", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("seeds only true layers and never auto-flips a shareable lens", () => {
    const appMap = read("src/components/map/AppMap.tsx");
    // The composite roads-now expands exactly like the `roads` deep link.
    expect(appMap).toContain('seeds.add("civic");');
    expect(appMap).toContain('seeds.add("traffic");');
    expect(appMap).toContain('seeds.add("incidents");');
    // Lens suggestions surface through a shareable action supplied by the
    // selector, never through a fake layer key.
    expect(appMap).toContain('"href" in smartDefault.action');
    expect(appMap).toContain("setShowRadar(true)");
    expect(appMap).not.toContain('seeds.add("music-tonight")');
    expect(appMap).not.toContain('seeds.add("markets")');
    expect(appMap).toContain("!selectionOpen");
    expect(appMap).toContain("!q.trim()");
  });

  it("keeps the suggestion from fossilizing into a stored preference", () => {
    const toggles = read("src/components/map/useMapLayerToggles.ts");
    expect(toggles).toContain("smartSeeded && !userTouchedRef.current");
    // Prefs beat the smart seed key by key: ?? ordering is the contract.
    expect(toggles).toContain('layerPrefs.radar ?? smart.has("radar")');
  });

  it("stays silent whenever the URL already carries a view", () => {
    const browse = read("src/components/map/BrowseMapClient.tsx");
    for (const key of ["\"show\"", "\"t\"", "\"music\"", "\"deals\"", "\"intent\"", "\"q\"", "\"at\""]) {
      expect(browse).toContain(key);
    }
    expect(browse).toContain("explicitStateKeys.some((key) => sp.has(key))");
  });
});
