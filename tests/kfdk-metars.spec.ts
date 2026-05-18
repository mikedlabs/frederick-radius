import { describe, it, expect } from "vitest";
import { transform } from "../transforms/kfdk_metars";
import type { KfdkMetarsRaw } from "../pipeline/schemas_ts/kfdk_metars";

// Representative fixture shaped like the Aviation Weather Center JSON.
// These are test values, not a recorded real observation.
const older = {
  icaoId: "KFDK",
  obsTime: 1_747_500_000,
  reportTime: "2026-05-17 18:00:00",
  temp: 18,
  dewp: 9,
  wdir: 300,
  wspd: 7,
  visib: 10,
  altim: 1018,
  rawOb: "KFDK 171800Z 30007KT 10SM CLR 18/09 A3008",
  clouds: [{ cover: "CLR", base: null }],
};
const newer = {
  icaoId: "KFDK",
  obsTime: 1_747_503_600,
  reportTime: "2026-05-17 19:00:00",
  temp: 21,
  dewp: 11,
  wdir: "VRB",
  wspd: 5,
  wgst: 14,
  visib: 2,
  altim: 1015,
  wxString: "BR",
  rawOb: "KFDK 171900Z VRB05G14KT 2SM BR BKN007 21/11 A2998",
  clouds: [{ cover: "BKN", base: 700 }],
};

describe("transform(kfdk_metars)", () => {
  it("keeps the single most recent KFDK observation", () => {
    const out = transform([older, newer] as unknown as KfdkMetarsRaw);
    expect(out.format).toBe("json");
    const d = out.data as { observed: string; observation: { temp_c: number } };
    expect(d.observed).toBe("2026-05-17 19:00:00");
    expect(d.observation.temp_c).toBe(21);
  });

  it("derives IFR from low visibility and a low ceiling", () => {
    const out = transform([newer] as unknown as KfdkMetarsRaw);
    const d = out.data as { observation: { flight_category: string } };
    expect(d.observation.flight_category).toBe("IFR");
  });

  it("derives VFR from clear, high visibility", () => {
    const out = transform([older] as unknown as KfdkMetarsRaw);
    const d = out.data as { observation: { flight_category: string } };
    expect(d.observation.flight_category).toBe("VFR");
  });

  it("ignores non-KFDK stations and keeps a string wind direction", () => {
    const out = transform([
      { icaoId: "KBWI", obsTime: 1_747_999_999, temp: 99 },
      newer,
    ] as unknown as KfdkMetarsRaw);
    const d = out.data as { observation: { temp_c: number; wind_dir: string } };
    expect(d.observation.temp_c).toBe(21);
    expect(d.observation.wind_dir).toBe("VRB");
  });

  it("returns a null observation, never a guess, when KFDK is absent", () => {
    const out = transform([
      { icaoId: "KIAD", obsTime: 1, temp: 5 },
    ] as unknown as KfdkMetarsRaw);
    expect(out.data).toMatchObject({ station: "KFDK", observed: null, observation: null });
  });

  it("leaves an unreported field null instead of fabricating it", () => {
    const out = transform([
      { icaoId: "KFDK", obsTime: 2, reportTime: "2026-05-18 00:00:00", temp: 14 },
    ] as unknown as KfdkMetarsRaw);
    const d = out.data as { observation: { dewpoint_c: number | null; flight_category: string | null } };
    expect(d.observation.dewpoint_c).toBeNull();
    expect(d.observation.flight_category).toBeNull();
  });
});
