import { describe, it, expect } from "vitest";
import {
  attentionTileKeys,
  clampPercent,
  emptyMessage,
  filterTiles,
  formatGaugeNumber,
  SITUATION_KEYS,
} from "./format";

describe("formatGaugeNumber", () => {
  it("rounds whole numbers", () => {
    expect(formatGaugeNumber(33.6)).toBe("34");
    expect(formatGaugeNumber(0)).toBe("0");
  });

  it("keeps fixed decimals", () => {
    expect(formatGaugeNumber(2.14, { decimals: 1 })).toBe("2.1");
    expect(formatGaugeNumber(3, { decimals: 1 })).toBe("3.0");
  });

  it("groups thousands when comma is set", () => {
    expect(formatGaugeNumber(1240, { comma: true })).toBe("1,240");
    expect(formatGaugeNumber(999, { comma: true })).toBe("999");
  });

  it("groups thousands with decimals together", () => {
    expect(formatGaugeNumber(1240.5, { comma: true, decimals: 1 })).toBe("1,240.5");
  });

  it("formats mid-animation frames the same way as the rest state", () => {
    // a count-up passes fractional interpolations; whole-number gauges must
    // never flash a decimal.
    expect(formatGaugeNumber(15 * 0.42)).toBe("6");
    expect(formatGaugeNumber(15)).toBe("15");
  });
});

describe("clampPercent", () => {
  it("clamps into 0..100", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(37)).toBe(37);
  });
  it("guards non-finite input to an empty ring", () => {
    expect(clampPercent(NaN)).toBe(0);
    expect(clampPercent(Infinity)).toBe(0);
  });
});

describe("attentionTileKeys", () => {
  it("returns exactly the active situation feeds", () => {
    expect(attentionTileKeys({ alerts: true, power: true })).toEqual(["alerts", "power"]);
  });
  it("is empty on a calm day", () => {
    expect(attentionTileKeys({})).toEqual([]);
    expect(attentionTileKeys({ traffic: false })).toEqual([]);
  });
  it("only ever names the five hero situations", () => {
    const keys = attentionTileKeys({
      alerts: true,
      safety: true,
      traffic: true,
      power: true,
      schools: true,
    });
    expect(keys).toEqual([...SITUATION_KEYS]);
  });
});

describe("filterTiles", () => {
  const tiles = [
    { key: "weather", attention: false },
    { key: "alerts", attention: true },
    { key: "power", attention: true },
    { key: "fixit", attention: false },
  ];

  it("shows everything under all", () => {
    expect(filterTiles(tiles, "all").map((t) => t.key)).toEqual([
      "weather",
      "alerts",
      "power",
      "fixit",
    ]);
  });

  it("resolves needs-attention to exactly the active situations", () => {
    expect(filterTiles(tiles, "attention").map((t) => t.key)).toEqual(["alerts", "power"]);
  });

  it("resolves calm to the complement", () => {
    expect(filterTiles(tiles, "calm").map((t) => t.key)).toEqual(["weather", "fixit"]);
  });

  it("returns empty for needs-attention on a fully calm board", () => {
    const calmBoard = tiles.map((t) => ({ ...t, attention: false }));
    const shown = filterTiles(calmBoard, "attention");
    expect(shown).toHaveLength(0);
    expect(emptyMessage("attention")).toMatch(/good kind of quiet/i);
  });
});
