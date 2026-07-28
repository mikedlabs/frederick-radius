import { describe, expect, it } from "vitest";
import {
  classifyFmhActivity,
  isInFrederickCounty,
  isMarylandStatePoliceCallsign,
  normalizeRotorcraftSnapshot,
  rotorcraftEvidence,
} from "./rotorcraft";
import { FMH_HELIPORT } from "./rotorcraft-public";

const NOW = Date.parse("2026-07-28T14:00:00.000Z");
const opaqueId = (privateKey: string, observedAtMs: number) =>
  `opaque-${new Date(observedAtMs).toISOString().slice(0, 10)}-${privateKey.length}`;

describe("Frederick rotorcraft inference", () => {
  it("uses the real county ring instead of a loose bounding box", () => {
    expect(isInFrederickCounty(-77.4149, 39.4225)).toBe(true);
    expect(isInFrederickCounty(-77.4105, 39.4143)).toBe(true);
    expect(isInFrederickCounty(-77.3, 39.75)).toBe(false);
  });

  it("filters rotorcraft by A7 first and an ICAO type fallback second", () => {
    expect(rotorcraftEvidence({ category: "A7", t: null })).toBe(
      "adsb-category",
    );
    expect(rotorcraftEvidence({ category: null, t: "A139" })).toBe(
      "icao-type",
    );
    expect(rotorcraftEvidence({ category: "A1", t: "C172" })).toBeNull();
  });

  it("identifies Maryland State Police only from its public operator callsign", () => {
    expect(isMarylandStatePoliceCallsign("TRP3")).toBe(true);
    expect(isMarylandStatePoliceCallsign(" TROOPER 3 ")).toBe(true);
    expect(isMarylandStatePoliceCallsign("MDSP3")).toBe(true);
    expect(isMarylandStatePoliceCallsign("N139MD")).toBe(false);
    expect(isMarylandStatePoliceCallsign("TRPLANE")).toBe(false);
  });

  it("labels a low, aligned descent as a possible arrival, never confirmed", () => {
    const result = classifyFmhActivity({
      lat: FMH_HELIPORT.lat - 0.008,
      lng: FMH_HELIPORT.lng,
      altitudeAglFt: 900,
      groundSpeedKt: 95,
      verticalRateFpm: -550,
      trackDeg: 0,
    });

    expect(result.activity).toBe("possible_arrival");
    expect(result.distanceNm).toBeLessThan(1);
  });

  it("labels a low, aligned climb as a possible departure", () => {
    expect(
      classifyFmhActivity({
        lat: FMH_HELIPORT.lat + 0.008,
        lng: FMH_HELIPORT.lng,
        altitudeAglFt: 1_000,
        groundSpeedKt: 80,
        verticalRateFpm: 600,
        trackDeg: 0,
      }).activity,
    ).toBe("possible_departure");
  });

  it("keeps ambiguous proximity at helicopter nearby", () => {
    expect(
      classifyFmhActivity({
        lat: FMH_HELIPORT.lat,
        lng: FMH_HELIPORT.lng + 0.008,
        altitudeAglFt: 1_000,
        groundSpeedKt: 60,
        verticalRateFpm: -500,
        trackDeg: 0,
      }).activity,
    ).toBe("helicopter_nearby");
  });

  it("requires altitude and speed before suggesting an arrival or departure", () => {
    const base = {
      lat: FMH_HELIPORT.lat - 0.008,
      lng: FMH_HELIPORT.lng,
      verticalRateFpm: -550,
      trackDeg: 0,
    };
    expect(
      classifyFmhActivity({
        ...base,
        altitudeAglFt: null,
        groundSpeedKt: 90,
      }).activity,
    ).toBe("helicopter_nearby");
    expect(
      classifyFmhActivity({
        ...base,
        altitudeAglFt: 900,
        groundSpeedKt: null,
      }).activity,
    ).toBe("helicopter_nearby");
  });

  it("reduces a Trooper near FMH to aggregate counts only", () => {
    const result = normalizeRotorcraftSnapshot(
      {
        ac: [
          {
            hex: "abc123",
            flight: "TRP3 ",
            r: "N123PRIVATE",
            t: "A139",
            category: "A7",
            lat: FMH_HELIPORT.lat - 0.008,
            lon: FMH_HELIPORT.lng,
            alt_baro: 1_200,
            gs: 90,
            track: 0,
            baro_rate: -500,
            seen_pos: 2,
          },
        ],
        now: NOW,
      },
      NOW + 1_000,
      opaqueId,
    );

    expect(result).toMatchObject({
      observationCount: 1,
      signals: [],
      trooperAirborneCount: 1,
      fmhActivity: {
        possibleArrivalCount: 1,
        possibleDepartureCount: 0,
        helicopterNearbyCount: 0,
      },
    });
    const publicJson = JSON.stringify(result);
    expect(publicJson).not.toContain("TRP3");
    expect(publicJson).not.toContain("N123PRIVATE");
    expect(publicJson).not.toContain("abc123");
  });

  it("omits explicit ground reports", () => {
    const result = normalizeRotorcraftSnapshot(
      {
        now: NOW,
        ac: [
          {
            hex: "ground1",
            flight: "TRP3",
            category: "A7",
            lat: 39.42,
            lon: -77.41,
            alt_baro: "ground",
            seen_pos: 0,
          },
        ],
      },
      NOW,
      opaqueId,
    );

    expect(result.observationCount).toBe(0);
    expect(result.trooperAirborneCount).toBe(0);
  });

  it("requires positive airborne evidence instead of treating unknown as flying", () => {
    const result = normalizeRotorcraftSnapshot(
      {
        now: NOW,
        ac: [
          {
            hex: "unknown1",
            flight: "TRP3",
            category: "A7",
            lat: 39.42,
            lon: -77.41,
            seen_pos: 0,
          },
        ],
      },
      NOW,
      opaqueId,
    );

    expect(result.observationCount).toBe(0);
    expect(result.signals).toEqual([]);
  });

  it("returns only coarse generic positions and no identifying flight fields", () => {
    const result = normalizeRotorcraftSnapshot(
      {
        now: NOW,
        ac: [
          {
            hex: "generic1",
            flight: "N45TEST",
            r: "N45TEST",
            category: "A7",
            t: "EC35",
            lat: 39.50123,
            lon: -77.40329,
            alt_baro: 2_043,
            gs: 83,
            track: 127,
            baro_rate: 450,
            seen_pos: 1,
          },
        ],
      },
      NOW,
      opaqueId,
    );

    expect(result.observationCount).toBe(1);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({
      lat: 39.5,
      lng: -77.4,
      altitudeFt: 2_000,
      groundSpeedKt: 85,
    });
    expect(result.signals[0]).not.toHaveProperty("publicCallsign");
    expect(result.signals[0]).not.toHaveProperty("isTrooper");
    expect(result.signals[0]).not.toHaveProperty("trackDeg");
    expect(result.signals[0]).not.toHaveProperty("verticalRateFpm");
    expect(result.signals[0]).not.toHaveProperty("fmhActivity");
    const publicJson = JSON.stringify(result);
    expect(publicJson).not.toContain("N45TEST");
    expect(publicJson).not.toContain("generic1");
    expect(publicJson).not.toContain("39.50123");
    expect(publicJson).not.toContain("-77.40329");
  });

  it("reduces non-Trooper FMH proximity to a fixed-heliport aggregate", () => {
    const result = normalizeRotorcraftSnapshot(
      {
        now: NOW,
        ac: [
          {
            hex: "medical1",
            flight: "MEDICAL1",
            category: "A7",
            lat: FMH_HELIPORT.lat,
            lon: FMH_HELIPORT.lng + 0.008,
            alt_baro: 1_500,
            gs: 70,
            track: 0,
            baro_rate: 0,
            seen_pos: 1,
          },
        ],
      },
      NOW,
      opaqueId,
    );

    expect(result.signals).toEqual([]);
    expect(result.fmhActivity.helicopterNearbyCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain("MEDICAL1");
  });

  it("reduces a Trooper away from FMH to airborne status without a marker", () => {
    const result = normalizeRotorcraftSnapshot(
      {
        now: NOW,
        ac: [
          {
            hex: "trooper1",
            flight: "TRP3",
            category: "A7",
            lat: 39.5,
            lon: -77.4,
            alt_baro: 2_000,
            gs: 90,
            seen_pos: 1,
          },
        ],
      },
      NOW,
      opaqueId,
    );

    expect(result.observationCount).toBe(1);
    expect(result.trooperAirborneCount).toBe(1);
    expect(result.signals).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("TRP3");
    expect(JSON.stringify(result)).not.toContain("trooper1");
  });

  it("omits military, PIA, and LADD observations returned by the point feed", () => {
    const result = normalizeRotorcraftSnapshot(
      {
        now: NOW,
        ac: [1, 4, 8].map((dbFlags, index) => ({
          hex: `private${index}`,
          category: "A7",
          lat: 39.42,
          lon: -77.41,
          alt_baro: 1_000,
          seen_pos: 0,
          dbFlags,
        })),
      },
      NOW,
      opaqueId,
    );

    expect(result.observationCount).toBe(0);
    expect(result.signals).toEqual([]);
  });
});
